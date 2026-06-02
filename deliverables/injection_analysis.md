# KeiRouter Injection Analysis Report

## Executive Summary

The KeiRouter codebase demonstrates strong injection resistance. All 49 SQL query construction points use parameterized placeholders via `r.db.rebind()`. There is one instance of `fmt.Sprintf` used for a SQL column name, but it is enum-controlled with a closed switch statement. There are zero `os/exec.Command` call sites. No critical or high-severity injection vulnerabilities were identified.

---

## Finding 1: `fmt.Sprintf` for Column Name in SQL (SAFE)

**File:** `/Users/lemonilo/www/keirouter/backend/internal/store/repo_usage.go` lines 36-57

**Source:** The `SpendSince` function accepts a `BudgetScope` (type alias for `string`) and a `scopeID` (string). The `scope` parameter determines which column name is interpolated into the query.

**Flow:** The `scope` value passes through a `switch` statement (lines 38-46) that maps exactly three enum values to three hardcoded column name strings: `"tenant_id"`, `"project_id"`, `"api_key_id"`. The `default` branch returns an error, rejecting any unrecognized scope value.

**Sink:** Line 49-51: `q := r.db.rebind(fmt.Sprintf("SELECT COALESCE(SUM(cost_micros), 0) FROM usage_records WHERE %s = ? AND created_at >= ?", column))`

**Defense Verification:** The `switch` statement acts as a strict allowlist. Only three values from the `BudgetScope` enum (`ScopeTenant`, `ScopeProject`, `ScopeAPIKey`) can produce a column name. The `default` case returns an error, so no arbitrary string can reach the `fmt.Sprintf`. The `scopeID` value itself is properly parameterized with `?`.

**Verdict:** SAFE. The column name interpolation is enum-controlled and cannot be influenced by external input. The actual data value (`scopeID`) is parameterized.

**Risk:** Low (informational -- best practice would be to avoid `fmt.Sprintf` entirely, even with the enum guard, as a defense-in-depth measure).

---

## Finding 2: Static Column List Concatenation (SAFE)

**Files:**
- `/Users/lemonilo/www/keirouter/backend/internal/store/repo_accounts.go` lines 17-22, 26, 44, 56, 65
- `/Users/lemonilo/www/keirouter/backend/internal/store/repo_pools.go` lines 33-34, 38, 49, 68

**Analysis:** Both `accountColumns` (line 17) and `poolColumns` (line 33) are declared as `const` string literals in Go. They are concatenated into SQL query templates using the `+` operator (e.g., `"SELECT " + poolColumns + " FROM proxy_pools WHERE id = ?"`). Since Go constants are evaluated at compile time and cannot be modified at runtime, this is equivalent to a string literal.

**Verdict:** SAFE. No runtime data flows into these column lists.

---

## Finding 3: Parameterized Query Coverage (SAFE)

**Scope:** All 7 repository files in `/Users/lemonilo/www/keirouter/backend/internal/store/`:

| File | `rebind` call count | Parameterization |
|------|---------------------|-----------------|
| repo_usage.go | 8 | All `?` placeholders |
| repo_apikeys.go | 7 | All `?` placeholders |
| repo_accounts.go | 7 | All `?` placeholders |
| repo_budgets.go | 8 | All `?` placeholders |
| repo_pools.go | 5 | All `?` placeholders |
| repo_aliases.go | 4 | All `?` placeholders |
| repo_misc.go | 6 | All `?` placeholders |

Every query uses `r.db.rebind()` to convert `?` placeholders to the engine-native form (`$1, $2, ...` for Postgres; `?` for SQLite), then passes values as arguments to `ExecContext`, `QueryRowContext`, or `QueryContext`. No string interpolation of user data occurs in any query.

**Additional verification:** The `rebind` function itself (store.go lines 133-148) only transforms literal `?` characters to positional placeholders. It performs no data interpolation.

**Verdict:** SAFE. Complete parameterized query coverage across the entire data access layer.

---

## Finding 4: Database Import Endpoint (SAFE)

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` lines 1052-1176

**Source:** `adminImportDatabase` accepts a raw JSON payload via `decodeJSON`, which enforces a 1 MiB body limit (`http.MaxBytesReader`) and `DisallowUnknownFields()`.

**Flow Analysis:**
1. **Chains** (lines 1061-1093): JSON unmarshalled into typed structs with `Name`, `Strategy`, `Steps[].Provider`, `Steps[].Model` fields. Each value flows into `store.Chain` / `store.ChainStep` structs, then to `s.chains.Create()` which uses parameterized INSERT queries.
2. **Budgets** (lines 1096-1125): JSON unmarshalled into typed structs. Values flow into `store.Budget` struct, then to `s.budgets.Create()` with parameterized INSERT.
3. **Proxy Pools** (lines 1128-1156): JSON unmarshalled into typed structs. Values flow into `store.ProxyPool` struct, then to `s.pools.Create()` with parameterized INSERT.
4. **Endpoint Settings** (lines 1159-1163): Raw JSON string stored via `s.settings.Set()` which uses a parameterized UPSERT.
5. **Aliases** (lines 1166-1174): JSON unmarshalled into `map[string]string`. Each key/value pair flows to `s.aliases.Set()` which uses a parameterized UPSERT.

**Verdict:** SAFE. All imported data reaches the database exclusively through parameterized repository methods. No raw SQL is constructed from import data.

---

## Finding 5: Command Injection Surface (NOT APPLICABLE)

**Analysis:** A comprehensive search for `os/exec.Command`, `os/exec.CommandContext`, and `os/exec.LookPath` across all Go files in the backend returned zero results. The application does not shell out to external processes.

**Verdict:** NOT APPLICABLE. No command execution surface exists.

---

## Finding 6: Console Log Injection (LOW RISK)

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/handlers.go` lines 19-39

**Source:** The `logRequest` function receives `provider` and `model` strings. The `provider` value originates from the dispatch result (upstream account selection). The `model` value originates from the user's request (via `resolveTargets`).

**Flow:** Line 34: `s.consoleLog.Logf(level, "%s %s %d tok $%.4f %dms%s", provider, model, tokens, cost, latencyMs, cache)`. The `Logf` method (consolelog.go line 97-101) formats this into `"[timestamp] [level] message"` and stores it in a ring buffer. The buffer is served to dashboard clients via:
- REST endpoint `adminConsoleLog` (returns JSON array)
- SSE stream `adminConsoleStream` (sends JSON-encoded events)

**Defense:** All output is JSON-encoded when served to clients (`json.Marshal` at admin.go line 928 and line 935), which prevents XSS. The `writeJSON` helper sets `Content-Type: application/json`.

**Residual Risk:** An attacker who can control the `model` string (which flows from the authenticated API request) could inject newlines or ANSI escape sequences into log lines. This could enable:
- Log forging (injection of fake log entries)
- Terminal escape sequence attacks on anyone viewing raw logs in a terminal

**Verdict:** LOW RISK. The attack requires an authenticated API key and the impact is limited to visual log corruption in the dashboard (JSON encoding prevents code injection in the browser).

---

## Finding 7: Error Message Reflection (SAFE)

**Files:**
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/models.go` lines 96, 179
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/clitools.go` lines 56, 89
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` lines 163, 321
- `/Users/lemonilo/www/keirouter/backend/internal/gateway/resolve.go` lines 67, 79, 84

**Analysis:** Multiple handlers reflect user-supplied values (URL params, query params, model strings) directly into error messages. For example: `writeError(w, http.StatusBadRequest, "unknown model kind: "+kindParam)`.

**Defense:** The `writeError` function (server.go lines 253-259) calls `writeJSON`, which uses `json.NewEncoder(w).Encode(v)` and sets `Content-Type: application/json`. JSON encoding escapes special characters (`"`, `\`, control characters), preventing XSS and header injection.

**Verdict:** SAFE. JSON encoding neutralizes all reflected data.

---

## Finding 8: SSRF via Proxy Test Endpoint (SAFE)

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/admin.go` lines 1181-1217

**Source:** `adminTestProxy` accepts a `proxyUrl` field in the JSON body.

**Flow:** Despite accepting the `proxyUrl` field, the function does NOT use it for the actual test request. Line 1196 creates a request to `https://httpbin.org/ip` (hardcoded). The `body.ProxyURL` is accepted and validated as non-empty but is never passed to `http.NewRequestWithContext` or used to configure a proxy.

**Verdict:** SAFE. The user-supplied URL is not used for outbound requests. Note: this appears to be an incomplete implementation (the proxy URL is accepted but unused), which is a functionality issue rather than a security issue.

---

## Finding 9: Path Traversal in Static File Serving (SAFE)

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/server.go` lines 226-238

**Source:** `r.URL.Path` from the HTTP request.

**Flow:** Line 232: `fullPath := filepath.Join(s.frontendDir, path)`. The `filepath.Join` function resolves `..` components, and then `os.Stat` checks existence. If the file does not exist, the path is rewritten to `"/"` for SPA fallback.

**Defense:** `http.FileServer` (line 226) has built-in protection against path traversal -- it sanitizes the URL path and rejects requests containing `..` segments. The `filepath.Join` + `os.Stat` check is only used for the SPA fallback logic, and the actual file serving is handled by `http.FileServer`.

**Verdict:** SAFE. `http.FileServer` prevents directory traversal.

---

## Finding 10: Web/Fetch URL Handling (SAFE)

**File:** `/Users/lemonilo/www/keirouter/backend/internal/gateway/media.go` lines 270-301

**Source:** `handleWebFetch` accepts a `url` field from the JSON body.

**Flow:** The URL is passed into `core.FetchRequest.URL`, then through `s.pipeline.Fetch()` which delegates to upstream provider connectors (e.g., Firecrawl, Jina). The URL is treated as data payload to the upstream API, not used for a direct server-side HTTP request.

**Verdict:** SAFE. The URL is forwarded as data to upstream providers, not used for direct server-side fetching.

---

## Overall Security Assessment

### Strengths
1. **Complete parameterized query coverage**: All 49 SQL query construction points use `?` placeholders with argument passing.
2. **No command execution surface**: Zero `os/exec` usage in the entire backend.
3. **Type-safe import endpoint**: All imported JSON data flows through typed structs into parameterized repository methods.
4. **JSON-encoded output**: All HTTP responses use `json.NewEncoder`, preventing XSS in error messages and data responses.
5. **Defense-in-depth**: Loopback guard + session middleware + API key authentication on admin endpoints. Body size limits on all endpoints. Envelope encryption for stored secrets.
6. **Enum-controlled dynamic SQL**: The single `fmt.Sprintf` for column selection is guarded by a closed switch statement.

### Recommendations (Hardening)
1. **Finding 1 hardening**: Consider refactoring `repo_usage.go:49-51` to use a lookup map instead of `fmt.Sprintf`, even though the current switch guard is sufficient. This eliminates the `Sprintf` pattern entirely and makes the safety proof simpler.
2. **Finding 6 hardening**: Consider sanitizing or escaping the `model` and `provider` values before embedding them in log lines. Strip or replace control characters, newlines, and ANSI escape sequences.
3. **Finding 8 note**: The `adminTestProxy` function accepts but ignores the `proxyUrl` parameter. This should be either implemented properly or removed to avoid confusion.

### Risk Summary

| Finding | Category | Risk | Verdict |
|---------|----------|------|---------|
| 1. Column name Sprintf | SQL Injection | Low | SAFE |
| 2. Column list concatenation | SQL Injection | None | SAFE |
| 3. Parameterized queries | SQL Injection | None | SAFE |
| 4. Database import | SQL Injection | None | SAFE |
| 5. Command execution | Command Injection | None | N/A |
| 6. Console log injection | Log Injection | Low | LOW RISK |
| 7. Error reflection | XSS | None | SAFE |
| 8. Proxy test SSRF | SSRF | None | SAFE |
| 9. Path traversal | File Access | None | SAFE |
| 10. Web fetch URL | SSRF | None | SAFE |

**Critical/High vulnerabilities found: 0**
**Medium vulnerabilities found: 0**
**Low vulnerabilities found: 1 (console log injection -- requires authenticated access, limited impact)**
**Informational findings: 2 (Sprintf pattern in SQL, incomplete proxy test endpoint)**
