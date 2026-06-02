# KeiRouter Authentication & Session Security Analysis

## 1. DASHBOARD LOGIN FLOW

### 1.1 Default Password -- VULNERABLE (High)

**Source:** Hardcoded constant in `/Users/lemonilo/www/keirouter/backend/internal/auth/auth.go`, line 31:
```go
const DefaultPassword = "keirouter"
```

**Flow:** On first startup, `EnsureDefaults()` (line 61) hashes this password with argon2id and persists it to the settings store. The login handler at `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` line 30 verifies against this stored hash.

**Sink:** The frontend at `/Users/lemonilo/www/keirouter/frontend/src/components/AuthGate.tsx` line 88 literally tells the user the default password in the UI:
```tsx
First run? The default password is <code className="font-mono">keirouter</code>.
```

**Defense verification:**
- The onboarding flow (AuthGate.tsx line 95) does prompt the user to change the password and has a minimum 6-character requirement (auth.go line 117).
- However, the user can click "Keep default for now" (AuthGate.tsx line 149), which marks onboarding as complete without changing the password.
- There is no enforcement mechanism that forces the password to be changed. The `UsingDefaultPassword()` check only shows a UI nudge; it never blocks access.
- There is no account lockout or forced password rotation policy.

**Verdict: VULNERABLE.** Any attacker who knows the default password (publicly documented in the UI and code) can log in if the operator skips onboarding. Risk: **High**.

### 1.2 No Rate Limiting on Login -- VULNERABLE (High)

**Source:** The login handler at `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` line 30.

**Flow:** The `POST /api/auth/login` endpoint has no middleware for rate limiting, account lockout, or progressive delays. A search for "rate" across the entire backend yielded zero rate-limiting implementations.

**Defense verification:**
- Password verification uses argon2id (crypto/password.go delegates to crypto/apikey.go line 75-88), which is computationally expensive (64 MiB memory, 4 iterations, 4 threads). This provides ~64ms per attempt on commodity hardware.
- However, there is no IP-based or session-based rate limiting, no CAPTCHA, no account lockout after N failures, and no progressive delay.
- With the default password being publicly known, brute force is not even necessary. But even with a custom password, an attacker can attempt ~15 passwords/second per connection.

**Verdict: VULNERABLE.** No brute-force protection exists. The argon2id cost parameter provides some defense but is insufficient alone. Risk: **High**.

### 1.3 Session Token Generation -- SAFE with caveats

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/auth/auth.go` lines 144-188.

**Flow:**
1. `IssueSession()` (line 151) creates a JSON payload `{"sub":"dashboard","exp":<unix_timestamp>}`.
2. Base64url-encodes the payload as `body`.
3. Computes `HMAC-SHA256(signing_key, body)` and appends as `body.signature`.
4. The signing key is 32 bytes from `crypto/rand` (line 96), persisted in the settings store (line 99).

**Defense verification:**
- HMAC-SHA256 with a 256-bit key is cryptographically strong.
- The signing key is generated from `crypto/rand` (line 96) -- good entropy.
- `hmac.Equal()` (line 167) is used for constant-time signature comparison -- prevents timing attacks.
- Token expiry is checked (line 178): `time.Now().Unix() < p.Exp`.
- The signing key persists across restarts via the settings store (tested in auth_test.go line 95).

**Caveats:**
- The `Sub` field is always `"dashboard"` -- there is no user identifier. This is acceptable for a single-operator model but means sessions cannot be individually revoked.
- There is no server-side session store or revocation mechanism. Once a token is issued, it remains valid until expiry.

**Verdict: SAFE** for the intended single-operator model. Risk: **Low**.

### 1.4 Session Cookie Configuration -- VULNERABLE (Medium)

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` lines 104-113.

**Flow:** `setSessionCookie()` sets the `kr_session` cookie with:
- `HttpOnly: true` -- prevents JavaScript access (good)
- `SameSite: Lax` -- prevents most CSRF (acceptable)
- No `Secure` flag -- cookie will be sent over plain HTTP

**Defense verification:**
- HttpOnly is set, preventing XSS-based cookie theft.
- SameSite=Lax prevents CSRF for POST requests from cross-origin sites.
- The `Secure` flag is **missing**. If the dashboard is accessed over HTTP (which is the default for localhost), the cookie could be intercepted via network sniffing or MITM on non-localhost deployments.
- The logout handler (line 57) also lacks the `Secure` flag.

**Verdict: VULNERABLE.** Missing `Secure` flag on session cookie. Risk: **Medium** (mitigated by default loopback-only binding, but dangerous when `bind_loopback_only: false`).

### 1.5 Logout / Session Invalidation -- VULNERABLE (Low)

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` lines 57-67.

**Flow:** `handleLogout` simply clears the cookie by setting `MaxAge: -1`. It does not invalidate the token server-side.

**Defense verification:**
- Since session tokens are self-contained HMAC-signed JWTs with no server-side store, there is no way to revoke a specific token.
- A stolen token remains valid until its 24-hour expiry.
- There is no "invalidate all sessions" endpoint.

**Verdict: VULNERABLE.** No server-side session revocation. Risk: **Low** (acceptable for single-operator local tool, but a concern if exposed externally).

---

## 2. API KEY AUTHENTICATION FLOW

### 2.1 API Key Generation -- SAFE

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/crypto/apikey.go` lines 53-72.

**Flow:**
1. `GenerateAPIKey()` reads 24 bytes from `crypto/rand` (line 55).
2. Encodes as base64url, prepends `kr_` prefix.
3. Hashes with argon2id (64 MiB, 1 iteration, 4 threads, 32-byte output, 16-byte salt).
4. Creates a SHA-256 lookup hash for fast database indexing.

**Defense verification:**
- 24 bytes of entropy = 192 bits of randomness. This is cryptographically strong.
- The key is shown exactly once at creation time and never stored in plaintext.
- The argon2id parameters are reasonable for interactive verification.
- SHA-256 lookup hash enables O(1) database lookup without scanning all hashes.

**Verdict: SAFE.** Risk: **None**.

### 2.2 API Key Authentication -- SAFE

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/identity/identity.go` lines 63-88.

**Flow:**
1. `Authenticate()` computes `LookupHash(plaintext)` = SHA-256 of the presented key.
2. Looks up the candidate row by SHA-256 hash (store/repo_apikeys.go line 37).
3. Checks if the key is disabled (line 77).
4. Verifies the full argon2id hash with `crypto.VerifyAPIKey()` using `subtle.ConstantTimeCompare` (crypto/apikey.go line 98).
5. Updates `last_used_at` timestamp (best-effort).

**Defense verification:**
- The two-phase lookup (SHA-256 index then argon2id verify) is the correct pattern: fast lookup, slow verify.
- `subtle.ConstantTimeCompare` prevents timing side-channels on the argon2 comparison.
- Disabled keys are rejected before the expensive argon2 verification.
- No rate limiting on API key authentication either, but the argon2id cost (~64ms) provides inherent throttling.

**Verdict: SAFE.** Risk: **None** (well-implemented password hashing pattern).

### 2.3 API Key Extraction -- SAFE

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/middleware.go` lines 53-64.

**Flow:** `extractToken()` checks `Authorization: Bearer <key>` first, then `x-api-key` header. Both are trimmed of whitespace.

**Defense verification:**
- Standard Bearer token extraction.
- Does not leak timing information about which header was checked.
- No query parameter support (good -- prevents URL logging of secrets).

**Verdict: SAFE.** Risk: **None**.

---

## 3. OAUTH FLOWS

### 3.1 PKCE Implementation -- SAFE

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/oauth/oauth.go` lines 46-61.

**Flow:**
1. `GeneratePKCE()` generates a verifier from `crypto/rand` with configurable entropy (default 32 bytes = 256 bits, xAI uses 96 bytes).
2. Computes challenge as `BASE64URL(SHA256(verifier))` -- correct S256 method.
3. Generates a separate 32-byte random `state` value for CSRF protection.
4. The authorize URL (flow.go line 20) includes `code_challenge` and `code_challenge_method=S256`.

**Defense verification:**
- Verifier entropy is sufficient (32 bytes = 256 bits minimum).
- S256 challenge method is correctly implemented (SHA-256 then base64url).
- State is independently generated from a strong random source.
- The verifier is sent to the token endpoint during exchange (flow.go line 53).
- Test at oauth_test.go line 10 verifies the challenge matches `SHA256(verifier)`.

**Verdict: SAFE.** Risk: **None**.

### 3.2 State/Nonce Verification in OAuth -- SAFE

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/oauth.go` lines 53-99 (authorize), 104-143 (exchange).

**Flow:**
1. `oauthAuthorize` (line 53): generates PKCE + state, stores session in `oauthSessions` keyed by state.
2. `oauthExchange` (line 104): receives `code` and `state` from the client.
3. Looks up the session by `state` (line 125): `s.oauthSessions.Get(body.State)`.
4. Validates the provider matches (line 126): `sess.Provider != provider`.
5. Exchanges the code with the stored verifier (line 131).
6. Deletes the session after use (line 136) -- prevents replay.

**Defense verification:**
- State is cryptographically random (32 bytes from `crypto/rand`).
- State-to-session mapping is stored server-side in an in-memory `SessionStore`.
- The session store has a 10-minute TTL (session.go line 34) -- limits the window for state replay.
- Sessions are deleted after successful exchange -- single use.
- Provider binding prevents cross-provider state confusion.
- The `SessionStore.gcLocked()` method (session.go line 80) cleans up expired entries.

**Verdict: SAFE.** Risk: **None**.

### 3.3 Device Code Flow -- SAFE

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/oauth.go` lines 148-229.

**Flow:**
1. `oauthDeviceCode` starts the flow, stores the session keyed by device code.
2. `oauthPoll` validates the session exists and matches the provider.
3. On success, the session is deleted and tokens are persisted.
4. On terminal errors (expired/denied), the session is also deleted.

**Defense verification:**
- Session TTL (10 minutes) limits the polling window.
- Provider binding prevents cross-provider confusion.
- Session cleanup on completion and on errors.
- Kiro device-code flow (kiro.go) follows the same pattern with additional client credential storage.

**Verdict: SAFE.** Risk: **None**.

### 3.4 OAuth Token Storage -- SAFE

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/vault/vault.go`.

**Flow:**
1. `Seal()` encrypts access tokens, refresh tokens with envelope encryption (AES-256-GCM + per-secret DEK wrapped by master key).
2. `Open()` decrypts just-in-time for upstream calls.
3. The master key is either configured externally or auto-generated to `~/.keirouter/master.key` with 0600 permissions (app.go line 221).

**Defense verification:**
- AES-256-GCM provides authenticated encryption.
- Per-secret DEKs mean compromising one secret doesn't compromise others.
- The master key file has 0600 permissions (owner read/write only).
- Metadata (base_url, region, etc.) is stored in plaintext JSON, which is acceptable as it is non-secret.

**Verdict: SAFE.** Risk: **None**.

---

## 4. CROSS-CUTTING CONCERNS

### 4.1 No MFA Implementation -- VULNERABLE (Medium)

**Analysis:** There is no multi-factor authentication for the dashboard. The entire dashboard security relies on a single password.

**Defense verification:**
- Single-password authentication with no second factor.
- No TOTP, WebAuthn, or hardware key support.
- The `/api/auth/status` endpoint (auth_handlers.go line 69) exposes whether the user is authenticated and whether they are using the default password -- this is information disclosure but limited to booleans.

**Verdict: VULNERABLE.** No MFA for dashboard access. Risk: **Medium** (mitigated by loopback-only default binding).

### 4.2 Session Token Self-Contained (No Revocation) -- VULNERABLE (Low)

**Analysis:** Session tokens are self-contained HMAC-signed payloads with no server-side session store. There is no mechanism to:
- Revoke individual sessions
- Revoke all sessions (e.g., after password change)
- List active sessions
- Detect token theft

**Evidence:** After `handleChangePassword` (auth_handlers.go line 81), existing sessions remain valid because the signing key is not rotated.

**Verdict: VULNERABLE.** Password change does not invalidate existing sessions. Risk: **Low**.

### 4.3 CORS Configuration -- VULNERABLE (Medium)

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` lines 135-139.

```go
r.Use(cors.Handler(cors.Options{
    AllowedOrigins: s.cfg.Server.CORSOrigins,
    AllowedMethods: []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
    AllowedHeaders: []string{"Authorization", "Content-Type", "x-api-key"},
}))
```

The default CORS origin is `*` (config.go line 101). This allows any website to make authenticated requests to the API if the browser has session cookies. Combined with `SameSite=Lax` on the session cookie, this is partially mitigated (Lax blocks cross-origin POST), but GET requests to `/api/auth/status` and other read endpoints are still vulnerable.

**Verdict: VULNERABLE.** Wildcard CORS with session cookies. Risk: **Medium** (mitigated by SameSite=Lax on POST, but GET endpoints leak info).

### 4.4 Input Validation -- SAFE

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` lines 1249-1261.

**Flow:** `decodeJSON()` uses `http.MaxBytesReader` (1 MiB limit) and `dec.DisallowUnknownFields()` to reject unexpected JSON fields.

**Defense verification:**
- Body size limited to 1 MiB.
- Unknown fields are rejected.
- Individual handlers validate required fields.

**Verdict: SAFE.** Risk: **None**.

### 4.5 Loopback-Only Binding -- SAFE (with caveat)

**Source:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/middleware.go` lines 68-84.

**Flow:** `loopbackOnly` middleware rejects non-loopback connections when `bind_loopback_only` is true (default).

**Defense verification:**
- Default config has `bind_loopback_only: true` (config.go line 113).
- The middleware correctly checks `ip.IsLoopback()`.
- All dashboard auth endpoints are wrapped with `loopbackOnly` (server.go line 206).
- The admin API is also wrapped (server.go line 217).

**Caveat:** When `bind_loopback_only` is set to `false` (for external access), all the other vulnerabilities (no rate limiting, no MFA, missing Secure flag, wildcard CORS) become significantly more dangerous.

**Verdict: SAFE** in default configuration. Risk escalates to **High** when loopback-only is disabled.

---

## 5. FINDINGS SUMMARY

| # | Finding | Risk | Verdict |
|---|---------|------|---------|
| 1 | Hardcoded default password `keirouter` with no enforcement to change it | High | VULNERABLE |
| 2 | No rate limiting on login endpoint | High | VULNERABLE |
| 3 | Missing `Secure` flag on session cookie | Medium | VULNERABLE |
| 4 | No MFA implementation | Medium | VULNERABLE |
| 5 | Wildcard CORS (`*`) default with session cookies | Medium | VULNERABLE |
| 6 | No server-side session revocation (password change does not invalidate sessions) | Low | VULNERABLE |
| 7 | Self-contained session tokens with no revocation mechanism | Low | VULNERABLE |
| 8 | HMAC-SHA256 session token generation with 256-bit key | N/A | SAFE |
| 9 | argon2id password hashing (64 MiB, constant-time compare) | N/A | SAFE |
| 10 | API key generation (192-bit entropy, argon2id + SHA-256 lookup) | N/A | SAFE |
| 11 | API key authentication (two-phase lookup, constant-time verify) | N/A | SAFE |
| 12 | OAuth PKCE (S256, 256-bit verifier, proper challenge computation) | N/A | SAFE |
| 13 | OAuth state verification (server-side storage, single-use, 10-min TTL) | N/A | SAFE |
| 14 | OAuth device code flow (session binding, cleanup on completion/error) | N/A | SAFE |
| 15 | Envelope encryption for stored credentials (AES-256-GCM, per-secret DEK) | N/A | SAFE |
| 16 | Input validation (1 MiB body limit, unknown field rejection) | N/A | SAFE |
| 17 | Loopback-only binding (default on, properly implemented) | N/A | SAFE |

---

## 6. KEY SOURCE FILES

- `/Users/lemonilo/www/keirouter/backend/internal/auth/auth.go` -- Dashboard password + session token logic
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` -- Login/logout/session cookie handlers
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/middleware.go` -- API key auth middleware, loopback guard
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/oauth.go` -- OAuth authorize/exchange/device-code endpoints
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/kiro.go` -- Kiro-specific OAuth flows
- `/Users/lemonilo/www/keirouter/backend/internal/crypto/apikey.go` -- API key generation, argon2id hashing
- `/Users/lemonilo/www/keirouter/backend/internal/crypto/password.go` -- Password hashing (delegates to apikey.go)
- `/Users/lemonilo/www/keirouter/backend/internal/crypto/envelope.go` -- AES-256-GCM envelope encryption
- `/Users/lemonilo/www/keirouter/backend/internal/identity/identity.go` -- API key lifecycle and authentication
- `/Users/lemonilo/www/keirouter/backend/internal/oauth/oauth.go` -- PKCE generation, state generation
- `/Users/lemonilo/www/keirouter/backend/internal/oauth/flow.go` -- OAuth token exchange, device code polling
- `/Users/lemonilo/www/keirouter/backend/internal/oauth/session.go` -- In-memory OAuth session store
- `/Users/lemonilo/www/keirouter/backend/internal/oauth/manager.go` -- Token refresh manager
- `/Users/lemonilo/www/keirouter/backend/internal/oauth/providers.go` -- OAuth provider configurations
- `/Users/lemonilo/www/keirouter/backend/internal/config/config.go` -- Application configuration
- `/Users/lemonilo/www/keirouter/backend/internal/vault/vault.go` -- Credential sealing/opening
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` -- Route wiring, CORS config
- `/Users/lemonilo/www/keirouter/frontend/src/components/AuthGate.tsx` -- Frontend login/onboarding UI
- `/Users/lemonilo/www/keirouter/frontend/src/lib/api.ts` -- Frontend API client
