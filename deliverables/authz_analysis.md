# KeiRouter Authorization Analysis Report

## Executive Summary

KeiRouter implements a **single-operator, local-first** authorization model. The architecture uses two distinct security surfaces: a public API guarded by API key authentication, and a dashboard admin API double-guarded by loopback network restriction plus session cookie authentication. The design is sound for the intended single-user local deployment. However, several findings would become critical vulnerabilities if the system were exposed to a network or extended to multi-tenant use.

**Overall Risk Rating: MEDIUM** (configuration-dependent; defaults are safe)

---

## 1. Route Guard Coverage Analysis

### 1.1 Public API Surface (`/v1/*`)

**Guard:** `s.authMiddleware` (API key authentication)

All public API endpoints are registered inside a `chi.Router` group that applies `s.authMiddleware`:

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` (lines 177-201)

Protected routes:
- `POST /v1/chat/completions` -- `handleOpenAIChat`
- `POST /v1/messages` -- `handleAnthropicMessages`
- `POST /v1/responses` -- `handleOpenAIResponses`
- `POST /v1beta/models/{modelAction}` -- `handleGeminiGenerate`
- `POST /v1/embeddings` -- `handleEmbeddings`
- `POST /v1/images/generations` -- `handleImageGeneration`
- `POST /v1/audio/speech` -- `handleAudioSpeech`
- `POST /v1/audio/transcriptions` -- `handleAudioTranscription`
- `POST /v1/search` -- `handleWebSearch`
- `POST /v1/web/fetch` -- `handleWebFetch`
- `GET /v1/models` -- `handleListModels`
- `GET /v1/models/info` -- `handleModelInfo`
- `GET /v1/models/{kind}` -- `handleListModelsByKind`

**Verdict: SAFE.** Every `/v1/*` route is behind `authMiddleware`. No unprotected API routes exist.

### 1.2 Admin Dashboard API (`/api/*`)

**Guards:** `s.loopbackOnly` + `s.sessionMiddleware`

All admin endpoints are registered inside a `chi.Router` group that applies both guards:

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` (lines 217-221)

```go
r.Route("/api", func(r chi.Router) {
    r.Use(s.loopbackOnly)
    r.Use(s.sessionMiddleware)
    s.mountAdmin(r)
})
```

The `mountAdmin` function registers approximately 45 endpoints covering providers, keys, accounts, chains, budgets, usage, settings, proxy pools, skills, aliases, OAuth, and database export/import.

**Verdict: SAFE** (when `bind_loopback_only: true`, which is the default).

### 1.3 Auth Endpoints (`/api/auth/*`)

**Guard:** `s.loopbackOnly` (partial -- login/logout/status are loopback-only but session-free)

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` (lines 205-212)

```go
r.Route("/api/auth", func(r chi.Router) {
    r.Use(s.loopbackOnly)
    s.mountAuth(r)          // login, logout, status -- no session required
    r.Group(func(pr chi.Router) {
        pr.Use(s.sessionMiddleware)
        s.mountAuthenticatedAuth(pr)  // password change, onboarding -- session required
    })
})
```

The login/logout/status endpoints are intentionally session-free (they are how a session is obtained). They are still loopback-guarded.

**Verdict: SAFE** (appropriate design -- login must be accessible to obtain a session).

### 1.4 Unauthenticated Endpoints

- `GET /healthz` -- Health check, no sensitive data
- `GET /v1` -- Version/status info, no sensitive data
- `GET /metrics` -- Prometheus metrics, loopback-guarded separately

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` (lines 142-174)

**Verdict: SAFE.** No sensitive data exposed on unauthenticated routes.

### 1.5 Static Frontend (`/*`)

The SPA frontend is served via `http.FileServer` with a catch-all fallback to `index.html`. No server-side authorization is applied to static file serving. This is correct -- the frontend is a static SPA that makes API calls authenticated by the browser's session cookie.

**Verdict: SAFE.**

---

## 2. API Key Authentication Deep Dive

### 2.1 Token Extraction

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/middleware.go` (lines 53-64)

Tokens are extracted from two locations:
1. `Authorization: Bearer <token>` header
2. `x-api-key` header

Both are trimmed of whitespace. The `Authorization` header also accepts a raw token without the `Bearer` prefix (line 57-58).

**Minor finding:** Accepting both `Bearer <token>` and raw `<token>` in the Authorization header is slightly more permissive than necessary but not a security issue.

### 2.2 Key Verification

**File:** `/Users/lemonilo/www/keirouter/backend/internal/identity/identity.go` (lines 63-88)

The authentication flow:
1. Compute SHA-256 lookup hash of presented plaintext
2. Find key record by lookup hash (fast index)
3. Check `Disabled` flag -- reject if disabled
4. Verify argon2id hash (constant-time comparison)
5. Best-effort update last-used timestamp

**Verdict: SAFE.** Proper implementation using argon2id + SHA-256 lookup index. No timing side-channels in the critical path.

### 2.3 Key Storage

**File:** `/Users/lemonilo/www/keirouter/backend/internal/store/repo_apikeys.go`

API keys are stored with:
- `key_hash` (argon2id verifier)
- `lookup_hash` (SHA-256 index)
- `display` (masked form, e.g., `kr-****abcd`)
- `scopes` (stored but never read -- see Finding 3)

Plaintext keys are returned exactly once at creation time.

**Verdict: SAFE.** Proper key storage with no plaintext persistence.

---

## 3. Finding: API Key Scopes Field Not Enforced

**Risk: MEDIUM**
**Category: Missing Authorization Check**

### Source-to-Sink Path

1. **Source:** `store.APIKey.Scopes` field is defined and persisted in the database

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/store/models.go` (line 33)
   ```go
   Scopes string
   ```

2. **Flow:** The `Scopes` field is read from the database during authentication

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/store/repo_apikeys.go` (lines 39-40)
   ```go
   SELECT id, tenant_id, project_id, name, key_hash, lookup_hash, display, scopes, disabled, last_used_at, created_at
   FROM api_keys WHERE lookup_hash = ?
   ```

3. **Sink:** The `Scopes` field is returned in the `APIKey` record via `authedKey(r.Context())` but is **never checked** by any middleware or handler

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/handlers.go` (lines 59-87) -- `handleChat` uses `key.ID`, `key.TenantID`, `key.ProjectID` but ignores `key.Scopes`

### Defense Verification

- No middleware checks scopes
- No handler checks scopes
- No pipeline stage checks scopes
- The `identity.Create` method accepts no scopes parameter
- The admin `adminCreateKey` handler accepts no scopes parameter

### Verdict: VULNERABLE (Low severity in current model)

The `Scopes` field exists in the data model and database schema but is dead code. All API keys have full access to all endpoints and operations. In the current single-operator model this is acceptable since the operator controls all keys. If the system evolves to serve multiple consumers, this becomes a significant gap.

---

## 4. Finding: IDOR in Store Layer -- No Tenant Filtering on Get/Delete

**Risk: LOW (current model) / HIGH (multi-tenant)**
**Category: IDOR**

### Source-to-Sink Path

Several store repository methods accept a raw `id` parameter without filtering by tenant:

**File:** `/Users/lemonilo/www/keirouter/backend/internal/store/repo_accounts.go` (lines 43-51)
```go
func (r *AccountRepo) Get(ctx context.Context, id string) (Account, error) {
    q := r.db.rebind(`SELECT ... FROM accounts WHERE id = ?`)
    // No tenant_id filter
}
```

**File:** `/Users/lemonilo/www/keirouter/backend/internal/store/repo_budgets.go` (lines 46-54)
```go
func (r *BudgetRepo) Get(ctx context.Context, id string) (Budget, error) {
    q := r.db.rebind(`SELECT ... FROM budgets WHERE id = ?`)
    // No tenant_id filter
}
```

**File:** `/Users/lemonilo/www/keirouter/backend/internal/store/repo_budgets.go` (lines 132-155)
```go
func (r *ChainRepo) Get(ctx context.Context, id string) (Chain, error) {
    // No tenant_id filter
}
```

**File:** `/Users/lemonilo/www/keirouter/backend/internal/store/repo_pools.go` (lines 37-45)
```go
func (r *ProxyPoolRepo) Get(ctx context.Context, id string) (ProxyPool, error) {
    // No tenant_id filter
}
```

The same pattern applies to `Delete` methods on accounts, chains, budgets, and proxy pools.

### Attack Path (Hypothetical Multi-Tenant)

1. Attacker obtains a valid API key for Tenant A
2. Attacker somehow learns the UUID of an account belonging to Tenant B (e.g., from logs, error messages, or predictable UUIDs)
3. Attacker calls an admin endpoint with Tenant B's resource ID
4. The `Get()` method returns the resource without checking ownership

### Defense Verification

**Mitigating controls:**
- All admin endpoints are double-guarded (loopback + session)
- The admin API hardcodes `adminTenant = store.DefaultTenantID` for all list/create operations
- UUIDs are non-predictable (v4 random)
- The single-operator model means there is only one tenant

### Verdict: SAFE (in current architecture)

The IDOR pattern exists at the store layer, but the gateway layer's double-guard and single-tenant design prevent exploitation. This would become a critical vulnerability if multi-tenant support is added without fixing the store layer.

---

## 5. Finding: Loopback Guard Bypass When Configuration Disabled

**Risk: HIGH (configuration-dependent)**
**Category: Privilege Escalation / Access Control Bypass**

### Source-to-Sink Path

1. **Source:** `bind_loopback_only` configuration defaults to `true`

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/config/config.go` (line 113)
   ```go
   BindLoopbackOnly: true,
   ```

2. **Flow:** The `loopbackOnly` middleware checks this flag

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/middleware.go` (lines 68-85)
   ```go
   func (s *Server) loopbackOnly(next http.Handler) http.Handler {
       return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
           if !s.cfg.Security.BindLoopbackOnly {
               next.ServeHTTP(w, r)
               return  // Bypass: no loopback check
           }
           // ... loopback IP check
       })
   }
   ```

3. **Sink:** When `bind_loopback_only: false`, the admin API is accessible from any network interface, protected only by the session cookie

### Defense Verification

- Default is `true` (safe)
- Documentation warns: "Set false only when the admin API is protected by a reverse proxy or network policy"
- When bypassed, the only remaining defense is `sessionMiddleware` (password-based session)
- The default password is `"keirouter"` (see Finding 6)

### Verdict: VULNERABLE (when misconfigured)

If an operator sets `bind_loopback_only: false` without implementing a reverse proxy or network policy, the entire admin API (including provider credentials, routing config, and database export) becomes accessible from the network. Combined with the default password, this is a complete compromise vector.

---

## 6. Finding: Default Password Seeded on First Run

**Risk: HIGH (when combined with network exposure)**
**Category: Weak Authentication**

### Source-to-Sink Path

1. **Source:** Hardcoded default password

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/auth/auth.go` (line 30)
   ```go
   const DefaultPassword = "keirouter"
   ```

2. **Flow:** On first run, `EnsureDefaults()` hashes and stores this password

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/auth/auth.go` (lines 72-73)
   ```go
   hash, herr := crypto.HashPassword(DefaultPassword)
   // ...
   if serr := s.settings.Set(ctx, keyPasswordHash, hash); serr != nil {
   ```

3. **Sink:** The `UsingDefaultPassword()` check is advisory only -- it does not prevent login

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` (lines 30-55)
   ```go
   func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
       // ... password verification
       ok, err := s.auth.VerifyPassword(r.Context(), body.Password)
       if err != nil || !ok {
           writeError(w, http.StatusUnauthorized, "invalid password")
           return
       }
       // Session issued regardless of whether password is the default
   }
   ```

### Defense Verification

- The `handleLogin` response includes `using_default: true` to inform the UI
- The onboarding flow guides the operator to change the password
- There is no enforcement mechanism (no forced password change, no login block)
- No rate limiting on the login endpoint (see Finding 7)

### Verdict: VULNERABLE (when combined with network exposure)

The default password is well-known and documented. If the admin API is exposed to the network (Finding 5) and the operator has not changed the password, an attacker can log in with `{"password": "keirouter"}` and gain full control of the system.

---

## 7. Finding: No Rate Limiting on Authentication Endpoints

**Risk: MEDIUM**
**Category: Missing Security Control**

### Source-to-Sink Path

1. **Source:** `/api/auth/login` endpoint

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` (lines 30-55)

2. **Flow:** The `handleLogin` function verifies the password and issues a session token. There is no rate limiting, account lockout, or progressive delay.

3. **Sink:** An attacker can attempt unlimited password guesses

### Defense Verification

- No rate limiting middleware is applied to the auth routes
- No lockout mechanism exists in the `auth.Service`
- The `loopbackOnly` guard mitigates this in the default configuration (only localhost can attempt logins)
- The argon2id hashing adds a computational cost per attempt (approximately 100-500ms per hash)

### Verdict: VULNERABLE (low severity due to loopback default)

Without rate limiting, brute-force attacks are possible if the login endpoint is network-accessible. The argon2id hashing provides some natural rate limiting through computational cost, but this is not a substitute for proper rate limiting.

---

## 8. Finding: Session Cookie Missing `Secure` Flag

**Risk: LOW**
**Category: Session Management Weakness**

### Source-to-Sink Path

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` (lines 104-113)
```go
func (s *Server) setSessionCookie(w http.ResponseWriter, token string) {
    http.SetCookie(w, &http.Cookie{
        Name:     sessionCookie,
        Value:    token,
        Path:     "/",
        Expires:  time.Now().Add(s.auth.TTL()),
        HttpOnly: true,
        SameSite: http.SameSiteLaxMode,
    })
}
```

The cookie has `HttpOnly: true` and `SameSite: Lax` but is missing `Secure: true`.

### Defense Verification

- `HttpOnly: true` prevents JavaScript access (XSS mitigation)
- `SameSite: Lax` provides CSRF protection
- `Secure: false` means the cookie is sent over plain HTTP
- The default loopback-only binding means the cookie only traverses localhost

### Verdict: SAFE (in default configuration)

The missing `Secure` flag is not a vulnerability in the default loopback-only configuration. It would become an issue if the admin API is exposed over a reverse proxy without HTTPS termination.

---

## 9. Finding: Session Tokens Cannot Be Individually Revoked

**Risk: LOW**
**Category: Session Management Weakness**

### Source-to-Sink Path

**File:** `/Users/lemonilo/www/keirouter/backend/internal/auth/auth.go` (lines 150-179)

Session tokens are HMAC-signed JWTs with an expiration timestamp. The `VerifySession` method checks the signature and expiration but has no server-side revocation mechanism.

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` (lines 57-66)

The `handleLogout` endpoint only clears the client-side cookie. It does not invalidate the token server-side.

```go
func (s *Server) handleLogout(w http.ResponseWriter, _ *http.Request) {
    http.SetCookie(w, &http.Cookie{
        Name:     sessionCookie,
        Value:    "",
        Path:     "/",
        MaxAge:   -1,
        HttpOnly: true,
        SameSite: http.SameSiteLaxMode,
    })
    writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
```

### Defense Verification

- Sessions have a configurable TTL (default 24 hours)
- Changing the password does not invalidate existing sessions (the signing key persists)
- There is no session blacklist or revocation list

### Verdict: SAFE (low risk in single-operator model)

In a single-operator model, session revocation is less critical since the operator controls all sessions. The 24-hour TTL limits the window of exposure. This would become more important in a multi-user model.

---

## 10. Finding: Database Export Leaks Operational Configuration

**Risk: LOW**
**Category: Information Disclosure**

### Source-to-Sink Path

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` (lines 971-1050)

The `adminExportDatabase` endpoint returns:
- Account metadata (provider, label, auth_kind, priority, proxy_pool_id, metadata JSON)
- Chain definitions (routing rules with provider/model targets)
- Budget configurations (spend limits)
- Proxy pool details (proxy URLs)
- Endpoint and access settings
- Model aliases

Explicitly excluded:
- Account secrets (encrypted credentials -- only metadata is returned)
- API key hashes or plaintext (only names and disabled status)

### Defense Verification

- Double-guarded (loopback + session)
- Secrets are properly excluded from the export
- Account metadata includes `metadata` JSON field which could contain `base_url` and `region` but not API keys

### Verdict: SAFE

The export endpoint is properly guarded and excludes secret material. The configuration data it returns is appropriate for backup/restore purposes. The risk is limited to the information disclosure of provider names and routing rules, which is low-value to an attacker who already has admin access.

---

## 11. Finding: CORS Wildcard Default Configuration

**Risk: MEDIUM**
**Category: Misconfiguration**

### Source-to-Sink Path

**File:** `/Users/lemonilo/www/keirouter/backend/internal/config/config.go` (line 104)
```go
CORSOrigins: []string{"*"},
```

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` (lines 135-139)
```go
r.Use(cors.Handler(cors.Options{
    AllowedOrigins: s.cfg.Server.CORSOrigins,
    AllowedMethods: []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
    AllowedHeaders: []string{"Authorization", "Content-Type", "x-api-key"},
}))
```

### Defense Verification

- The wildcard allows any origin to make cross-origin requests
- The `AllowedHeaders` includes `Authorization` and `x-api-key`, meaning cross-origin requests can include authentication credentials
- The default loopback binding limits the attack surface
- The `SameSite: Lax` cookie setting prevents cross-origin cookie attachment

### Verdict: SAFE (in default loopback configuration)

The CORS wildcard is appropriate for local development where the dashboard SPA may be served from a different port. It would become a vulnerability if the API is exposed to the web, as any website could make authenticated API requests using JavaScript.

---

## 12. Finding: Multi-Tenant Fields Unused in Single-Operator Model

**Risk: INFORMATIONAL**
**Category: Design Note**

### Analysis

The data model includes multi-tenant fields:
- `store.APIKey.TenantID`, `store.APIKey.ProjectID`
- `store.Account.TenantID`
- `store.Chain.TenantID`
- `store.Budget.TenantID`
- `store.UsageRecord.TenantID`, `store.UsageRecord.ProjectID`

However, the admin API hardcodes `adminTenant = store.DefaultTenantID` for all operations:

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` (line 91)
```go
const adminTenant = store.DefaultTenantID
```

The public API surface correctly uses the authenticated key's `TenantID` for scoping (chains, accounts, budgets), but the admin API operates on a single tenant.

### Verdict: INFORMATIONAL

This is by design. The multi-tenant fields are present to support future expansion, but the current system operates as a single-tenant application.

---

## 13. Tenant Isolation in Public API -- Verification

### Analysis

The public API surface properly isolates requests by tenant:

1. **Chain resolution** uses `tenantID` from the authenticated key

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/handlers.go` (line 89)
   ```go
   targets, err := resolveTargets(r.Context(), s.chains, s.aliases, tenantID, req.Model)
   ```

2. **Chain listing** filters by `tenantID`

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/resolve.go` (line 71)
   ```go
   list, err := chains.ListByTenant(ctx, tenantID)
   ```

3. **Account resolution** in the dispatcher filters by `tenantID`

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/dispatch/dispatch.go` (line 103)
   ```go
   accs, err := d.accounts.ListByProvider(ctx, tenantID, target.Provider)
   ```

4. **Budget enforcement** scopes by tenant, project, and API key

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/pipeline/pipeline.go` (lines 263-268)
   ```go
   scope := budget.Scope{
       TenantID:  req.Metadata.TenantID,
       ProjectID: req.Metadata.ProjectID,
       APIKeyID:  req.Metadata.APIKeyID,
   }
   ```

5. **Usage metering** records tenant and project context

   **File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/handlers.go` (lines 81-87)

### Verdict: SAFE

The public API surface provides proper tenant isolation. API keys from different tenants cannot access each other's chains, accounts, or budgets.

---

## 14. Credential Storage -- Verification

### Analysis

Provider credentials use envelope encryption:

1. A master key (auto-generated or configured) encrypts a per-account Data Encryption Key (DEK)
2. The DEK encrypts the actual credentials
3. The vault handles seal/unseal operations

The `adminListAccounts` endpoint explicitly strips secret fields:

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` (lines 296-302)
```go
out = append(out, map[string]any{
    "id": a.ID, "provider": a.Provider, "label": a.Label,
    "auth_kind": a.AuthKind, "priority": a.Priority,
    "disabled": a.Disabled, "created_at": a.CreatedAt,
})
```

### Verdict: SAFE

Credential storage uses proper envelope encryption. API responses never expose secret material.

---

## 15. Password Hashing -- Verification

### Analysis

**File:** `/Users/lemonilo/www/keirouter/backend/internal/auth/auth.go`

- Passwords are hashed with argon2id (via `crypto.HashPassword`)
- The `VerifyPassword` method uses constant-time comparison
- The signing key for session tokens is 32 bytes, auto-generated if not configured

### Verdict: SAFE

Proper password hashing and session token signing implementation.

---

## Summary of Findings

| # | Finding | Risk | Verdict | Evidence |
|---|---------|------|---------|----------|
| 1 | All `/v1/*` routes have auth guard | -- | SAFE | Lines 177-201 of server.go |
| 2 | All `/api/*` routes have double guard | -- | SAFE | Lines 217-221 of server.go |
| 3 | API key Scopes field not enforced | Medium | VULNERABLE | Scopes stored but never checked |
| 4 | IDOR in store layer (no tenant filter on Get/Delete) | Low/High* | SAFE (current) | Store methods accept raw IDs |
| 5 | Loopback guard bypass when config disabled | High | VULNERABLE | middleware.go lines 68-85 |
| 6 | Default password "keirouter" | High | VULNERABLE | auth.go line 30 |
| 7 | No rate limiting on login | Medium | VULNERABLE | No throttle middleware |
| 8 | Session cookie missing Secure flag | Low | SAFE (default) | auth_handlers.go lines 104-113 |
| 9 | No session revocation mechanism | Low | SAFE (single-user) | auth.go lines 150-179 |
| 10 | Database export leaks config | Low | SAFE | admin.go lines 971-1050 |
| 11 | CORS wildcard default | Medium | SAFE (default) | config.go line 104 |
| 12 | Multi-tenant fields unused | Info | INFO | admin.go line 91 |
| 13 | Tenant isolation in public API | -- | SAFE | Multiple files verified |
| 14 | Credential envelope encryption | -- | SAFE | Vault implementation |
| 15 | Password hashing (argon2id) | -- | SAFE | auth.go implementation |

*Finding 4 is Low risk in the current single-operator model but would be High risk in a multi-tenant deployment.

---

## Risk Rating Summary

**Critical:** 0 findings
**High:** 2 findings (Findings 5, 6 -- both configuration-dependent, mitigated by safe defaults)
**Medium:** 3 findings (Findings 3, 7, 11)
**Low:** 3 findings (Findings 4, 8, 9)
**Informational:** 1 finding (Finding 12)

The system's authorization model is appropriate for its stated single-operator, local-first design. The default configuration (loopback binding, default password warning) provides reasonable security for the intended use case. The primary risks arise from misconfiguration: disabling loopback binding without a reverse proxy, and not changing the default password.

---

## Key Files Referenced

- `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` -- Route registration and guards
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/middleware.go` -- `authMiddleware`, `loopbackOnly`
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` -- Login, session management
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` -- Admin API endpoints
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/handlers.go` -- Public API chat handler
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/settings.go` -- Endpoint/access settings
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/insights.go` -- Usage/quota endpoints
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/resolve.go` -- Model/chain resolution
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/models.go` -- Model listing handlers
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/media.go` -- Media endpoint handlers
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/gemini.go` -- Gemini handler
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/oauth.go` -- OAuth flow handlers
- `/Users/lemonilo/www/keirouter/backend/internal/identity/identity.go` -- API key auth service
- `/Users/lemonilo/www/keirouter/backend/internal/auth/auth.go` -- Dashboard auth service
- `/Users/lemonilo/www/keirouter/backend/internal/store/models.go` -- Data models (APIKey, Account, etc.)
- `/Users/lemonilo/www/keirouter/backend/internal/store/repo_apikeys.go` -- API key repository
- `/Users/lemonilo/www/keirouter/backend/internal/store/repo_accounts.go` -- Account repository
- `/Users/lemonilo/www/keirouter/backend/internal/store/repo_budgets.go` -- Budget and chain repositories
- `/Users/lemonilo/www/keirouter/backend/internal/store/repo_pools.go` -- Proxy pool repository
- `/Users/lemonilo/www/keirouter/backend/internal/store/repo_usage.go` -- Usage repository
- `/Users/lemonilo/www/keirouter/backend/internal/dispatch/dispatch.go` -- Request dispatcher
- `/Users/lemonilo/www/keirouter/backend/internal/pipeline/pipeline.go` -- Request pipeline
- `/Users/lemonilo/www/keirouter/backend/internal/core/request.go` -- Core request types
- `/Users/lemonilo/www/keirouter/backend/internal/config/config.go` -- Configuration model
- `/Users/lemonilo/www/keirouter/config.example.yaml` -- Example configuration
