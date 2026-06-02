# API Security Analysis -- KeiRouter

**Project:** KeiRouter (LLM API Gateway/Router)
**Root:** /Users/lemonilo/www/keirouter
**Date:** 2026-06-02

---

## Executive Summary

KeiRouter implements a well-designed REST API with strong security foundations. The codebase demonstrates defense-in-depth with parameterized queries, envelope encryption, and proper authentication middleware. However, **zero rate limiting** across all endpoints and several configuration-dependent vulnerabilities represent the primary risks.

### API Security Summary

| Category | Endpoints | Critical | High | Medium | Low |
|----------|-----------|----------|------|--------|-----|
| REST API | 81 | 0 | 4 | 6 | 5 |
| GraphQL | 0 | N/A | N/A | N/A | N/A |
| WebSocket | 0 | N/A | N/A | N/A | N/A |
| OAuth | 10 | 0 | 1 | 2 | 1 |
| **Total** | **91** | **0** | **5** | **8** | **6** |

---

## Language/Framework Detected

- **Primary:** Go 1.24 / Chi Router v5
- **API Types:** REST API (no GraphQL, WebSocket, or gRPC)
- **Database:** PostgreSQL (pgx), SQLite
- **Frontend:** React 19 + TypeScript

---

## OWASP API Security Top 10 Analysis

### API1: Broken Object Level Authorization (BOLA)

**Risk: LOW (current model) / HIGH (if multi-tenant)**

**Finding:** All admin endpoints that accept resource IDs (`{id}` path parameter) perform operations by ID without checking resource ownership. The store layer's `Get`, `Update`, `Delete`, and `SetDisabled` methods all use `WHERE id = ?` without `tenant_id` filtering.

**Affected Endpoints (15 total):**
- `PATCH /api/keys/{id}` - No tenant filter
- `DELETE /api/keys/{id}` - No tenant filter
- `PATCH /api/accounts/{id}` - No tenant filter
- `DELETE /api/accounts/{id}` - No tenant filter
- `POST /api/accounts/{id}/test` - No tenant filter
- `GET /api/accounts/{id}/quota` - No tenant filter
- `PATCH /api/chains/{id}` - No tenant filter
- `DELETE /api/chains/{id}` - No tenant filter
- `DELETE /api/budgets/{id}` - No tenant filter
- `PATCH /api/proxy-pools/{id}` - No tenant filter
- `DELETE /api/proxy-pools/{id}` - No tenant filter
- `POST /api/proxy-pools/{id}/test` - No tenant filter
- `POST /api/skills/{id}` - No tenant filter
- `DELETE /api/skills/{id}` - No tenant filter
- `DELETE /api/models/alias` - No tenant filter

**Mitigating Controls:**
- All admin endpoints are double-guarded (loopback + session cookie)
- Single-operator model with hardcoded `adminTenant = "default"`
- UUIDs are v4 random (122 bits entropy, not predictable)
- The `/v1/*` API surface IS properly tenant-scoped

**Verdict:** SAFE in current architecture. Would become HIGH if multi-tenant is added.

---

### API2: Broken Authentication

**Risk: HIGH**

**Findings:**

| # | Finding | Severity | File |
|---|---------|----------|------|
| 1 | Default password `keirouter` with no enforcement to change | High | auth.go:30 |
| 2 | No rate limiting on login endpoint | High | auth_handlers.go:30 |
| 3 | No MFA implementation | Medium | N/A |
| 4 | Missing `Secure` flag on session cookie | Medium | auth_handlers.go:104-113 |
| 5 | No server-side session revocation | Low | auth.go:150-179 |

**Positive Findings:**
- API key authentication uses argon2id + SHA-256 lookup (proper implementation)
- Session tokens use HMAC-SHA256 with 256-bit key
- OAuth PKCE (S256) properly implemented with 256-bit verifier
- OAuth state verification with server-side storage, single-use, 10-min TTL

---

### API3: Broken Object Property Level Authorization (Mass Assignment)

**Risk: NONE**

**Finding:** The codebase is well-protected against mass assignment:

1. **`DisallowUnknownFields()`** prevents injection of unexpected JSON keys
2. **Inline body structs** - every handler defines minimal anonymous structs
3. **Handler-level field selection** - PATCH endpoints use pointer fields
4. **Server-generated identifiers** - IDs, TenantID, CreatedAt always set server-side

**No critical or high-severity mass assignment vulnerabilities found.**

---

### API4: Unrestricted Resource Consumption

**Risk: HIGH**

**Finding:** Zero rate limiting on any endpoint.

| Endpoint Category | Rate Limit | Risk |
|-------------------|------------|------|
| Login (`POST /api/auth/login`) | NONE | Brute force |
| API key auth (`/v1/*`) | NONE | Key enumeration |
| Account test (`POST /api/accounts/{id}/test`) | NONE | Resource exhaustion |
| Database export (`GET /api/settings/database`) | NONE | Data exfiltration |
| SSE streaming (`GET /api/console/stream`) | NONE | Connection exhaustion |

**Evidence of Absence:**
- No rate limiting library in `go.mod`
- No rate limiting middleware in router setup
- No per-handler throttling logic
- No configuration for rate limits

---

### API5: Broken Function Level Authorization

**Risk: LOW**

**Finding:** All admin endpoints are properly guarded by `loopbackOnly` + `sessionMiddleware`. No admin functions are accessible to unauthenticated users.

**Positive Findings:**
- `/v1/*` routes have `authMiddleware`
- `/api/*` routes have `loopbackOnly` + `sessionMiddleware`
- `/api/auth/*` routes have `loopbackOnly` (login/logout/status are session-free by design)
- `/metrics` is loopback-guarded separately

---

### API6: Unrestricted Access to Sensitive Business Flows

**Risk: LOW**

**Finding:** The application is a local-first tool with loopback-only binding by default. Automated abuse is limited by:
- Loopback-only access restriction
- Session cookie requirement for admin operations
- API key requirement for proxy operations

---

### API7: Server Side Request Forgery (SSRF)

**Risk: CRITICAL**

**Finding:** Zero SSRF defenses across the entire codebase.

| Vector | Severity | Access |
|--------|----------|--------|
| Account `base_url` | Critical | Admin dashboard |
| Web Fetch `url` | Critical | Any API key |
| Vertex SA `token_uri` | High | Admin dashboard |
| Proxy Pool `proxy_url` | High | Admin dashboard |
| Relay URL | High | Admin dashboard |
| Qwen `resource_url` | Medium | Admin dashboard |
| OAuth `redirect_uri` | Medium | Admin dashboard |
| Jina URL concatenation | Medium | Any API key |

**Missing Defenses:**
- No URL scheme validation
- No private IP blocking
- No DNS rebinding protection
- No cloud metadata blocking
- No URL allowlist
- No response size limits

---

### API8: Security Misconfiguration

**Risk: MEDIUM**

**Findings:**

| # | Finding | Severity | File |
|---|---------|----------|------|
| 1 | CORS defaults to `*` | Medium | config.go:104 |
| 2 | Missing security headers (CSP, X-Frame-Options, etc.) | Medium | server.go |
| 3 | Version string exposed on `/v1` endpoint | Low | server.go:150 |
| 4 | Endpoint list exposed on `/v1` endpoint | Low | server.go:148-165 |
| 5 | `using_default` boolean on auth status | Low | auth_handlers.go:76 |

---

### API9: Improper Inventory Management

**Risk: LOW**

**Finding:** All API endpoints are properly documented in the codebase. No shadow APIs or deprecated endpoints detected.

**Positive Findings:**
- Clear route registration in `server.go`
- All endpoints have corresponding handlers
- No unused or dead routes detected

---

### API10: Unsafe Consumption of APIs

**Risk: MEDIUM**

**Finding:** The application consumes 15+ external APIs (AI providers, search services, OAuth providers) without validation.

**Issues:**
- Raw `err.Error()` passed to clients in ~40+ locations
- Upstream HTTP body leakage in OAuth/token exchange errors
- Filesystem path leakage in CLI tool operations
- Database/internal error leakage in admin operations

---

## Rate Limiting Status

| Endpoint | Limit | Status |
|----------|-------|--------|
| POST /api/auth/login | None | **VULNERABLE** |
| POST /api/auth/password | None | **VULNERABLE** |
| POST /v1/chat/completions | None | **VULNERABLE** |
| POST /v1/messages | None | **VULNERABLE** |
| POST /v1/responses | None | **VULNERABLE** |
| POST /v1/embeddings | None | **VULNERABLE** |
| POST /v1/images/generations | None | **VULNERABLE** |
| POST /v1/audio/speech | None | **VULNERABLE** |
| POST /v1/audio/transcriptions | None | **VULNERABLE** |
| POST /v1/search | None | **VULNERABLE** |
| POST /v1/web/fetch | None | **VULNERABLE** |
| GET /v1/models | None | **VULNERABLE** |
| POST /api/accounts/{id}/test | None | **VULNERABLE** |
| POST /api/validate-key | None | **VULNERABLE** |
| GET /api/settings/database | None | **VULNERABLE** |
| POST /api/settings/database | None | **VULNERABLE** |
| POST /api/settings/proxy-test | None | **VULNERABLE** |
| POST /api/proxy-pools/{id}/test | None | **VULNERABLE** |
| GET /api/accounts/{id}/quota | None | **VULNERABLE** |
| GET /api/quota | None | **VULNERABLE** |
| GET /api/console/stream | None | **VULNERABLE** |

---

## CORS Configuration

| Origin | Credentials | Methods | Headers | Status |
|--------|-------------|---------|---------|--------|
| `*` (default) | N/A | GET, POST, PATCH, PUT, DELETE, OPTIONS | Authorization, Content-Type, x-api-key | **MEDIUM RISK** |

**Mitigating Factor:** SameSite=Lax on session cookies prevents cross-origin cookie attachment for POST requests.

---

## Response Data Exposure

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| 1 | Database export includes account `metadata` with Kiro SSO client secrets | Medium | admin.go:983 |
| 2 | Raw `err.Error()` passed to clients in ~40+ locations | Medium | Multiple files |
| 3 | Version string and endpoint list exposed | Low | server.go:148-165 |
| 4 | `using_default` boolean reveals default password status | Low | auth_handlers.go:76 |
| 5 | Proxy pool listing exposes `proxy_url` (may contain credentials) | Low-Medium | insights.go:341 |
| 6 | `X-KeiRouter-Provider` / `X-KeiRouter-Model` headers | Low | handlers.go:133-134 |

**Positive Findings:**
- API key hashes never exposed
- Account encrypted blobs never exposed
- Password hashes never returned from any endpoint
- `vault.Open()` results used only transiently

---

## Recommendations (Priority Order)

### Critical Priority

1. **Implement SSRF protections:**
   - URL scheme validation (allow only `http://`, `https://`)
   - Private IP blocking (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
   - Cloud metadata blocking (169.254.169.254, metadata.google.internal)
   - Response size limits (`io.LimitReader`)

### High Priority

2. **Add rate limiting to authentication endpoints:**
   - Per-IP rate limiting on `POST /api/auth/login` (5 attempts/minute)
   - Per-IP rate limiting on 401 responses from API key auth
   - Account lockout after N failed attempts

3. **Add rate limiting to expensive operations:**
   - Per-session throttling on account test, proxy test, database export
   - SSE connection limits

4. **Set `Secure` flag on session cookies**

5. **Add security headers:**
   - `Content-Security-Policy: default-src 'self'`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`

### Medium Priority

6. **Sanitize error messages:**
   - Replace raw `err.Error()` with generic error messages
   - Log detailed errors server-side only
   - Never expose filesystem paths or database internals

7. **Validate `base_url` on account creation:**
   - URL allowlist for known providers
   - Block custom providers without explicit approval

8. **Restrict database export metadata:**
   - Strip Kiro SSO client secrets from export
   - Consider removing `metadata` from export entirely

9. **Implement session revocation:**
   - Server-side session store
   - Session invalidation on password change

### Low Priority

10. **Remove version string from `/v1` endpoint**
11. **Pin GitHub Actions to SHA**
12. **Add security scanning to CI (gosec, trivy)**

---

## Key Files Referenced

- `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` -- Route setup, middleware
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` -- Admin endpoints
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/middleware.go` -- Auth middleware
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` -- Session management
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/handlers.go` -- Chat handlers
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/insights.go` -- Proxy pools, skills
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/settings.go` -- Settings endpoints
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/oauth.go` -- OAuth flows
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/kiro.go` -- Kiro SSO
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/clitools.go` -- CLI tools
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/media.go` -- Media endpoints
- `/Users/lemonilo/www/keirouter/backend/internal/connectors/httpclient.go` -- HTTP client
- `/Users/lemonilo/www/keirouter/backend/internal/connectors/web.go` -- Web fetch/search
- `/Users/lemonilo/www/keirouter/backend/internal/connectors/vertex_auth.go` -- Vertex auth
- `/Users/lemonilo/www/keirouter/backend/internal/auth/auth.go` -- Dashboard auth
- `/Users/lemonilo/www/keirouter/backend/internal/identity/identity.go` -- API key auth
- `/Users/lemonilo/www/keirouter/backend/internal/store/repo_*.go` -- Data repositories
- `/Users/lemonilo/www/keirouter/backend/internal/config/config.go` -- Configuration
- `/Users/lemonilo/www/keirouter/frontend/src/lib/api.ts` -- Frontend API client
