# XSS Vulnerability Analysis Report -- KeiRouter

## Executive Summary

The KeiRouter frontend (React 19 + TypeScript) demonstrates a strong security posture against Cross-Site Scripting (XSS) attacks. After exhaustive source-to-sink tracing across all 28 frontend source files and the backend gateway, **no exploitable XSS vectors were identified**. The application relies on React's built-in JSX auto-escaping as its primary defense, and no raw HTML rendering patterns (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `document.write`) exist in the codebase.

However, several defense-in-depth recommendations are warranted, particularly the absence of Content-Security-Policy headers.

---

## Methodology

Every `.tsx` and `.ts` file under `/Users/lemonilo/www/keirouter/frontend/src/` was analyzed. The backend gateway code under `/Users/lemonilo/www/keirouter/backend/internal/gateway/` was examined for error message handling, SSE streaming, security headers, and authentication middleware. Each data flow was traced from untrusted source through transformation to browser sink.

---

## Finding 1: No Raw HTML Rendering Sinks

**Risk: NONE**

Comprehensive searches for all known XSS sinks returned zero results:

- `dangerouslySetInnerHTML` -- not found in any file
- `innerHTML` assignment -- not found
- `eval()` -- not found
- `new Function()` -- not found
- `document.write()` -- not found

Every data rendering path uses standard JSX expression syntax (`{variable}`), which React automatically escapes to prevent HTML injection.

---

## Finding 2: Error Messages from Backend (Reflected Input)

**Risk: LOW -- SAFE**

**Source:** Backend API error responses via `writeError()` in `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` (lines 253-260). The function serializes error messages as JSON:
```go
func writeError(w http.ResponseWriter, status int, message string) {
    writeJSON(w, status, map[string]any{
        "error": map[string]any{"message": message, ...},
    })
}
```

**Sink chain:**
1. Backend error messages include user-supplied input in some cases (e.g., `"unknown provider: "+providerID` at admin.go line 163, `"unknown provider in step: "+st.Provider` at admin.go line 590)
2. Frontend `api.ts` (line 287-294) extracts `data.error.message` from JSON response
3. Error is thrown as `APIError` and caught by mutation handlers
4. Displayed via `ErrorBanner` component (`ui.tsx` line 170-180): `<p className="...">{message}</p>`
5. Also displayed via Toast component (`Toast.tsx` line 134): `<p className="...">{toast.title}</p>`

**Defense verified:** React JSX auto-escaping. The `{message}` expression in JSX text content context causes React to HTML-encode all special characters. A payload like `<img onerror=alert(1) src=x>` would be rendered as literal text.

**Verdict: SAFE**

---

## Finding 3: `window.open` with Server-Provided URLs

**Risk: LOW -- SAFE**

**Location:** `/Users/lemonilo/www/keirouter/frontend/src/pages/ProviderDetail.tsx` line 748

```typescript
const res = await api.oauthAuthorize(provider.provider, redirectURI);
window.open(res.authorize_url, "_blank", "noopener");
```

**Source:** `res.authorize_url` from the `/api/oauth/{provider}/authorize` endpoint.

**Trace:** The authorize URL is constructed server-side from hardcoded OAuth provider configurations in `/Users/lemonilo/www/keirouter/backend/internal/oauth/providers.go`. These are static constants (e.g., `https://claude.ai/oauth/authorize`, `https://auth.openai.com/oauth/authorize`). The `redirectURI` is hardcoded in the frontend as `"http://localhost:20180/oauth/callback"` (ProviderDetail.tsx line 23).

**Defense verified:**
- URLs originate from server-side hardcoded constants, not user input
- `noopener` flag is passed to `window.open`, preventing `window.opener` access
- The redirect URI is a frontend constant

**Verdict: SAFE**

---

## Finding 4: Dynamic `href` Attributes from Server Data

**Risk: LOW -- SAFE**

Three locations use server-provided URLs in `href` attributes:

**4a. KiroConnectModal.tsx line 262:**
```tsx
<a href={dc.verification_uri_complete || dc.verification_uri}
   target="_blank" rel="noopener noreferrer">
```
Source: AWS SSO OIDC device code response from `/api/kiro/device-start`. URLs are from AWS OIDC endpoints, constructed server-side.

**4b. ProviderDetail.tsx line 863:**
```tsx
<a href={dc.verification_uri_complete || dc.verification_uri}
   target="_blank" rel="noopener noreferrer">
```
Same pattern for OAuth device code flows. URLs come from upstream OAuth providers.

**4c. MediaProviderDetail.tsx line 111:**
```tsx
<a href={provider.api_key_url} target="_blank" rel="noopener">
```
Source: Provider catalog data. The `api_key_url` field is a static string from the backend catalog (e.g., `https://console.anthropic.com/settings/keys`).

**Defense verified:**
- React JSX auto-escapes attribute values (prevents attribute breakout)
- All links include `rel="noopener noreferrer"` or `rel="noopener"`
- URLs originate from server-side constants or trusted upstream OAuth providers

**Verdict: SAFE**

---

## Finding 5: Dynamic `src` Attributes for Provider Icons

**Risk: LOW -- SAFE**

Multiple pages render provider icons using server-provided paths:

- `/Users/lemonilo/www/keirouter/frontend/src/pages/Providers.tsx` line 173: `src={p.icon}`
- `/Users/lemonilo/www/keirouter/frontend/src/pages/ProviderDetail.tsx` line 960: `src={p.icon}`
- `/Users/lemonilo/www/keirouter/frontend/src/pages/MediaProviderDetail.tsx` line 217: `src={p.icon}`
- `/Users/lemonilo/www/keirouter/frontend/src/pages/CLITools.tsx` line 99: `src={meta.image}`
- `/Users/lemonilo/www/keirouter/frontend/src/pages/CLIToolDetail.tsx` line 338: `src={meta.image}`

**Trace:** The backend constructs icon paths as `"/providers/" + p.ID + ".png"` (admin.go line 120). These are relative paths to server-hosted static images. CLI tool images are hardcoded in the frontend (`toolMeta` records).

**Defense verified:**
- Icon paths are server-controlled, derived from provider IDs
- All `<img>` tags include `onError` handlers that fall back to text-based initial icons
- React JSX auto-escapes `src` attribute values
- Even a hypothetical malicious path would only load an image, not execute scripts

**Verdict: SAFE**

---

## Finding 6: SSE Event Parsing and Console Log Rendering

**Risk: LOW -- SAFE**

**Location:** `/Users/lemonilo/www/keirouter/frontend/src/pages/ConsoleLog.tsx`

**Source-to-sink trace:**
1. `new EventSource("/api/console/stream")` establishes SSE connection (line 29)
2. `JSON.parse(e.data)` parses SSE messages (line 34)
3. Log lines stored in React state: `setLogs((prev) => [...prev, msg.line])` (line 40)
4. Rendered via: `{logs.map((line, i) => <div key={i}>{colorLine(line)}</div>)}` (line 112)
5. `colorLine()` returns `<span className={color}>{line}</span>` (line 19)

**Defense verified:**
- The `{line}` expression inside `<span>` is JSX text content -- React auto-escapes
- The `color` variable is derived from a hardcoded `LOG_LEVEL_COLORS` map keyed by log level tags, not from user input
- The SSE endpoint is protected by loopback-only middleware + session authentication (server.go lines 217-221)
- Backend SSE data is JSON-serialized via `json.Marshal` (admin.go line 935), which handles special characters

**Verdict: SAFE**

---

## Finding 7: JSON.stringify Rendering in Test Cards

**Risk: LOW -- SAFE**

**Location:** `/Users/lemonilo/www/keirouter/frontend/src/pages/MediaProviderDetail.tsx` lines 301, 509, 557, 605

```tsx
<pre className="...">{JSON.stringify(result, null, 2).slice(0, 2000)}</pre>
```

**Defense verified:**
- `JSON.stringify` produces a string where all special characters are properly escaped
- The string is rendered as JSX text content inside `<pre>`, auto-escaped by React
- The `.slice(0, 2000)` limits output size

**Verdict: SAFE**

---

## Finding 8: Database Import (JSON.parse of User File)

**Risk: LOW -- SAFE**

**Location:** `/Users/lemonilo/www/keirouter/frontend/src/pages/Settings.tsx` lines 374-376

```typescript
const raw = await file.text();
const payload = JSON.parse(raw);
const result = await api.importDatabase(payload);
```

**Defense verified:**
- The parsed JSON is sent to the backend API as a request body, not rendered in the DOM
- The import result is displayed as a simple count: `"${result.imported} items imported."`
- The backend validates and processes imported data (admin.go lines 1052-1177)
- No HTML rendering of imported content

**Verdict: SAFE**

---

## Finding 9: URL Parameter Construction

**Risk: LOW -- SAFE**

**Location:** `/Users/lemonilo/www/keirouter/frontend/src/lib/api.ts` line 363

```typescript
cliTools: (model?: string) =>
  request<CLIToolsResponse>("GET", model ? `/cli-tools?model=${encodeURIComponent(model)}` : "/cli-tools"),
```

And line 351:
```typescript
usage: (period: string) => request<UsageSummary>("GET", `/usage?period=${period}`),
```

**Defense verified:**
- `encodeURIComponent` is used for the `model` parameter
- The `period` parameter comes from a controlled set of UI options ("today", "week", "month"), not freeform input
- URLs are used in `fetch()` calls, not rendered as HTML links

**Verdict: SAFE**

---

## Finding 10: Third-Party Component Usage

**Risk: LOW -- SAFE**

The application uses these third-party React libraries:
- `recharts` -- charting library (BarChart, AreaChart, etc.)
- `@xyflow/react` -- React Flow for topology visualization
- `lucide-react` -- icon library
- `@tanstack/react-query` -- data fetching

**Defense verified:**
- All third-party components receive data through React props, which are auto-escaped
- React Flow custom nodes (`ProviderNode`, `RouterNode` in Usage.tsx) render data via JSX expressions
- No third-party component accepts raw HTML strings

**Verdict: SAFE**

---

## Finding 11: Missing Security Headers (Defense Gap)

**Risk: MEDIUM -- Informational/Hardening**

The backend server at `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` does NOT set the following security headers:

- **Content-Security-Policy (CSP)** -- Not set. A CSP would provide a defense-in-depth layer against XSS by restricting script sources.
- **X-Content-Type-Options** -- Not set. Should be `nosniff` to prevent MIME-type sniffing.
- **X-Frame-Options** -- Not set. Should be `DENY` to prevent clickjacking.
- **Strict-Transport-Security** -- Not set. Relevant if served over HTTPS.
- **X-XSS-Protection** -- Not set (deprecated but still useful for older browsers).

**Mitigating factors:**
- The admin API is protected by loopback-only access restriction (middleware.go line 68-84)
- The admin API requires session-based authentication with HttpOnly cookies (auth_handlers.go line 119-127)
- Session cookies use `SameSite: Lax` mode (auth_handlers.go line 112)
- CORS is configured with explicit allowed origins (server.go line 135-139)

**Recommendation:** Add CSP headers, particularly `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;` to the static file serving and API responses.

---

## Finding 12: Authentication and Access Control

**Risk: NONE -- Strong**

The backend implements a layered defense:
1. **Loopback-only middleware** (middleware.go line 68): Restricts admin endpoints to localhost when `BindLoopbackOnly` is configured
2. **Session middleware** (auth_handlers.go line 119): Requires valid `kr_session` cookie for all `/api` routes
3. **Auth middleware** (middleware.go line 28): Validates API keys for the OpenAI-compatible proxy surface
4. **HttpOnly cookies** (auth_handlers.go lines 104-113): Session cookies are HttpOnly, preventing JavaScript access
5. **SameSite=Lax** (auth_handlers.go line 112): Provides CSRF protection

---

## Summary Table

| # | Finding | Source | Sink | Defense | Verdict | Risk |
|---|---------|--------|------|---------|---------|------|
| 1 | No raw HTML sinks | N/A | N/A | N/A | N/A | NONE |
| 2 | Error messages | API response | JSX text | React auto-escape | SAFE | LOW |
| 3 | window.open | OAuth authorize_url | window.open | Hardcoded URLs + noopener | SAFE | LOW |
| 4 | Dynamic href | Server device codes | anchor href | React escape + noopener | SAFE | LOW |
| 5 | Dynamic img src | Provider catalog | img src | Server-controlled paths + onError | SAFE | LOW |
| 6 | SSE console logs | EventSource stream | JSX text | React auto-escape + loopback auth | SAFE | LOW |
| 7 | JSON.stringify | API response | pre text | JSON.stringify + React escape | SAFE | LOW |
| 8 | JSON import | User file upload | API request body | Not rendered in DOM | SAFE | LOW |
| 9 | URL params | User input | fetch() URL | encodeURIComponent | SAFE | LOW |
| 10 | Third-party components | Various | React props | React auto-escape | SAFE | LOW |
| 11 | Missing CSP headers | N/A | N/A | None | GAP | MEDIUM |
| 12 | Auth/access control | N/A | N/A | Loopback + session + HttpOnly | STRONG | NONE |

---

## Key Files Analyzed

**Frontend (28 files):**
- `/Users/lemonilo/www/keirouter/frontend/src/lib/api.ts` -- API client, error extraction
- `/Users/lemonilo/www/keirouter/frontend/src/components/ui.tsx` -- ErrorBanner, ErrorCard
- `/Users/lemonilo/www/keirouter/frontend/src/components/Toast.tsx` -- Toast notification system
- `/Users/lemonilo/www/keirouter/frontend/src/components/AuthGate.tsx` -- Login/onboarding
- `/Users/lemonilo/www/keirouter/frontend/src/components/KiroConnectModal.tsx` -- Kiro OAuth flow
- `/Users/lemonilo/www/keirouter/frontend/src/pages/ConsoleLog.tsx` -- SSE event rendering
- `/Users/lemonilo/www/keirouter/frontend/src/pages/ProviderDetail.tsx` -- OAuth flows, window.open
- `/Users/lemonilo/www/keirouter/frontend/src/pages/MediaProviderDetail.tsx` -- Test cards, JSON rendering
- `/Users/lemonilo/www/keirouter/frontend/src/pages/Settings.tsx` -- Database import/export
- `/Users/lemonilo/www/keirouter/frontend/src/pages/Usage.tsx` -- React Flow topology
- `/Users/lemonilo/www/keirouter/frontend/src/pages/Providers.tsx` -- Provider icons
- `/Users/lemonilo/www/keirouter/frontend/src/pages/CLITools.tsx` -- CLI tool icons
- `/Users/lemonilo/www/keirouter/frontend/src/pages/CLIToolDetail.tsx` -- Config snippets
- All remaining page files (Chains, Keys, Budgets, Endpoints, Quota, ProxyPools, Skills)

**Backend (security-relevant files):**
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` -- Route setup, middleware, response helpers
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` -- Admin API handlers, error messages, SSE stream
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/auth_handlers.go` -- Session management, cookies
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/middleware.go` -- Auth middleware, loopback guard
- `/Users/lemonilo/www/keirouter/backend/internal/oauth/providers.go` -- OAuth provider constants

---

## Recommendations

1. **Add Content-Security-Policy header** -- The most impactful hardening measure. Configure `script-src 'self'` to prevent inline script execution even if an XSS vector is discovered in the future.

2. **Add X-Content-Type-Options: nosniff** -- Prevents browsers from MIME-type sniffing responses.

3. **Add X-Frame-Options: DENY** -- Prevents the dashboard from being embedded in iframes (clickjacking protection).

4. **Consider Trusted Types** -- For future-proofing, implementing Trusted Types API would provide an additional layer of DOM XSS protection.

5. **URL validation for `window.open`** -- While the current OAuth authorize URLs are server-generated constants, adding an explicit allowlist check before calling `window.open` would be a defense-in-depth measure against future code changes that might introduce user-controlled URLs.
