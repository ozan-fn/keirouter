# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.26] — 2026-07-14


### Bug Fixes

- Flush tool calls before finish signal(f6bf42d)
- **usage:** Dynamic calc routing eff. and success rate(d9e2396)
- Prevent double-counting of cached tokens in stats(082d396)
- Use TTFT for latency and add sudo validation for Tailscale install(e90468d)
- Redirect stdin to /dev/tty in install script and update Coolify documentation for compose file pathing(9739464)
- **deploy:** Consolidate compose file to root to fix docker context issues in coolify and CI(f3db53e)
- Correct archive path and refactor Homebrew formula update(4b13b13)
- Homebrew formula share.install syntax(434fab0)
- **kiro:** Prevent malformed CodeWhisperer requests (HTTP 400)(86ed0bb)
- **kiro:** Handle Anthropic tool_result blocks and pass tool schemas through(6943200)
- Increase stream stall timeout and improve Claude tool_choice cloaking(caa42b5)
- **ci:** Skip dorny/paths-filter on tag pushes to avoid exit 128(bf3da01)
- **ci:** Update cliff.toml template for git-cliff v2.x API(9a61325)
- **ci:** Use commit.id with truncate for git-cliff v2.x template(98adeca)
- **store:** Make time SQL portable on Postgres(96e341a)
- **oauth:** Render inline HTML on OAuth callback to unblock Gemini CLI connect(8c256d4)
- **anthropic:** Normalize tool inputs to object values(b6557cb)
- **routing:** Hash context affinity for sticky sessions(af72112)
- **connectors:** Correct command-code validate test and bump to v0.1.18(ba94b89)
- **kiro:** Dedup toolResults by toolUseId to prevent TOOL_DUPLICATE 400(8363c9a)
- **kiro:** Always attach profileArn to chat requests(b5b0e1a)
- Scope reasoning_content injection for Kimi and DeepSeek(8ffd430)
- **normalizer, kiro:** Ensure tool results are synthesized for dangling tool uses(d137f51)
- **app, headroom:** Prevent db use-after-close and compression stampedes(3a489f6)
- **models:** Hide unauthenticated providers(0913c2c)
- **models:** Include dynamic models in discovery(1e0f6b9)
- **store:** Isolate in-memory SQLite per Open() call(0bec690)
- **gateway:** Enforce target access and URL validation(94a15de)
- **gateway:** Harden custom provider delete, disable bound accounts(38f3c60)
- Kimchi and CodeBuddy auth flow improvements(b5cb6bf)
- Handle nested JSON shapes in Codex usage API response(5923665)


### Build

- Add gopsutil for resource sampling(98d9eec)
- Upgrade Go to 1.26.0 and add new indirect dependencies(305486c)
- **deps:** Bump github.com/jackc/pgx/v5 in /backend(229eff3)
- **deps:** Bump github.com/go-chi/chi/v5 in /backend(3d44c6a)
- **deps:** Bump golang.org/x/crypto from 0.31.0 to 0.45.0 in /backend(85e7fd3)
- **deps:** Bump github.com/go-viper/mapstructure/v2 in /backend(cf63802)
- **deps:** Bump github.com/go-chi/chi/v5 in /backend(bc31622)


### CI/CD

- **release:** Specify main branch(6eefc93)
- Add Docker publish workflow and update release with changelog generation(58fc2a4)
- **release:** Add Windows support with PowerShell installer(e1dafa4)


### Documentation

- Document capabilities, token saving, and OAuth connections(db7d0f7)
- Add design spec for wiring up existing features(8debd7b)
- Add AGENTS.md memory context(7a28b01)
- Restructure and expand deployment documentation for VPS and Coolify(dbffa78)
- Add new features and expand OAuth support(ae13850)
- Update CHANGELOG.md for v0.1.11(d7075df)
- Update CHANGELOG.md and VERSION for v0.1.13(8083cb9)
- Update CHANGELOG.md and VERSION for v0.1.14(6e4fe08)
- Update CHANGELOG.md and VERSION for v0.1.15(9bc5daf)
- Update CHANGELOG.md and VERSION for v0.1.16(d852b0f)
- Update CHANGELOG.md and VERSION for v0.1.17(f630fc4)
- Update CHANGELOG.md and VERSION for v0.1.18(d8ff373)
- Update CHANGELOG.md and VERSION for v0.1.19(c03fa01)
- Update CHANGELOG.md and VERSION for v0.1.20(11f18ea)
- Update CHANGELOG.md and VERSION for v0.1.21(06aee67)
- Update CHANGELOG.md and VERSION for v0.1.22(98ab251)
- Update CHANGELOG.md and VERSION for v0.1.23(18b6804)
- Update CHANGELOG.md and VERSION for v0.1.24(cacae48)
- Update CHANGELOG.md and VERSION for v0.1.25(e323040)


### Features

- KeiRouter backend MVP (Go gateway, routing, token saving, security)(d99520e)
- KeiRouter dashboard (React + Vite + Tailwind)(0252529)
- Dashboard auth, first-run onboarding, and Makefile(c62c8e3)
- Observability, semantic cache, embeddings, Gemini codec, CLI auto-config(b484d46)
- **connectors:** Add Claude cloaking and expand provider support(884c7b9)
- Wire model aliases into routing resolution(1b1485f)
- Add reference skills section to Skills page(2469a48)
- Implement CLI-tool auto-config for 11 coding tools(481684a)
- Wire proxy-pool routing into outbound HTTP(e867ca9)
- Fix backend gaps — proxy injection, static serving, root handler(51d483a)
- Implement Xiaomi MiMo, Kiro flows, and provider detail UI(550494d)
- Add available models section to provider detail page(ce786eb)
- Add admin API routes, console log streaming, and enhanced UI(5498fea)
- Add security infrastructure, caching layer, rate limiting, and UI overhaul(f9927f2)
- Add model pricing and support new AI models(022b4c4)
- Add time-to-first-token (TTFT) tracking and implement stream stall detection in the pipeline(dc4a3b9)
- Add credit-based quota display for Kiro and usage_type differentiation per provider(e4e1c65)
- Add Xiaomi MiMo provider pricing and integrate token-saving telemetry into pipeline metrics and database schema(ded0bb3)
- Add usage tracking hub and raw streaming support(7a91492)
- **connectors:** Add SumoPod provider and live model discovery(3481fe7)
- Add SavingsCard with image export(14cac90)
- **budget:** Add token limit support alongside USD limits(100681c)
- Add exact match option to capability detection rules(72a5fc4)
- **ui:** Update role label to AI Bender, add formatted token input and model selector(cfefef6)
- Implement chain fallback models, optimize Redis caching via pipelines, improve SSE hub performance, and add secondary UI palette.(d00fa85)
- Add connector tests and frontend form updates(e383488)
- **xai:** Accept 403 forbidden as valid validation response(51202be)
- Add model search and pagination to ProviderDetail and update documentation with project banners(6f4de9a)
- Add TokenSavingsBreakdown component and support for skipping provider validation(0b8a327)
- Add Docker deployment support and CI validation(5f2b24e)
- Add reservation to prevent budget race condition(dcee360)
- Add portal key usage endpoint and time zone handling(6580ad5)
- Add key-specific usage summaries(ba879a5)
- **gateway:** Add SSRF protection and enhance proxy tests(5ca2efe)
- **ui:** Improve dark mode support across components(07d5404)
- **frontend:** Add pending props and export TailscaleTunnel(131e6c0)
- Add automated release workflow with Homebrew support(7f801d7)
- Add build-time version information(906462c)
- **providers:** Add search and improve filter layout(3aaf9ff)
- Add runtime timeout notifier(158453e)
- Serve dual-stack loopback and estimate token usage(c304d7c)
- **update:** Add GitHub release update checker(211efae)
- **crypto:** Add passphrase-based portable secrets for cross-machine backup(cd964f8)
- Add codex provider models and version fallback(667e24a)
- **kiro:** Flatten tool interactions when client sends no tools(a5ca043)
- **connectors:** Add Kiro model pricing estimates(c93d6a3)
- **chains:** Allow custom model ids in SearchableSelect(ba1efe6)
- **connectors:** Add web-cookie and media TTS providers to catalog(c48e735)
- Add debug logging and cooldown retry(d1b569c)
- Add OAuth token refresh to admin validation(cbc17f0)
- **store:** Add resource_samples migration(63f63af)
- Add OAuth keepalive and cooldown sweeper for reliability(2a024ac)
- **connectors:** Add credential validation to provider connectors(53b82e1)
- **provider-detail:** Add bulk connection test for accounts(c3abc2c)
- **budget:** Implement in-memory caching for budget definitions(cc56ac0)
- Add customizable branding settings(2d30578)
- Add tabbed settings page with hash-based navigation(c7cd32a)
- Add new model pricing and provider-specific request rendering(4e4037b)
- **gateway:** Add color palette to branding settings(495ed54)
- **frontend:** Add Qoder device-code connection modal(4083889)
- **ui:** Improve deprecated provider display with warning and notice(5340199)
- **auth:** Add short-lived cache for API key authentication(8e1d15e)
- **security:** Add allow_private_base_url to permit self-hosted LLMs(c279082)
- **changelog:** Add ChangelogMarkdown component and integrate changelog display(2c3e9d8)
- **auth:** Add OAuth token refresh failure handling and reconnect flag(a2b6ee8)
- **qoder:** Add Qoder connector with COSY signing and SSE chat support(9b6bb27)
- **guardrails:** Add PII redaction & prompt-injection guardrails(d1b2bf8)
- **endpoints:** Add CredentialNotice component and enhance UI for API keys management(ebe94de)
- **connectors:** Add no-auth MiMo Free provider support(b92a18d)
- **dev:** Add pretty startup logs and colored commands(25a30bb)
- **limits:** Add per-key rate limiting controls(c36897b)
- **rate-limits:** Implement per-key rate limiting and update settings UI(e973979)
- Implement streaming outbound guardrails, real-time audit log hub, and automated data retention policy.(8c6a097)
- **caveman:** Add wenyan levels and tighten prompts(0b0e46f)
- **commandcode:** Expose provider and add request metadata(5541cc8)
- **commandcode:** Support CLI token import and validation(0e72e38)
- **transform:** Echo reasoning_content for DeepSeek thinking mode(79de6f5)
- **connectors:** Add DeepSeek v4 models and pricing(e213a49)
- Add user-defined custom providers and models(b97618e)
- **admin:** Expose base URL for custom providers in admin UI(eb7e2fa)
- **transform, normalizer:** Add tool choice normalization and deduplication(cf7d4b2)
- **headroom, ponytail:** Add token compression and savings tracking(8433615)
- **cli:** Add subcommand interface with start, bootstrap, status, and version(5511534)
- **validation:** Add authenticated chat probe for credential verification(d5a5a24)
- **provider-detail:** Replace native confirm dialog with modal for bulk account deletion(e0b6176)
- **usage-analytics:** Add daily and model breakdown to key usage endpoint(4a1404c)
- **gateway:** Add latency-based chain strategy ordering(5e2a8e1)
- **core,gateway,pipeline,transform:** Add token estimation and usage synthesis for streaming responses(948c11d)
- **gateway,provider-detail:** Add provider filtering to quota usage endpoint(0a9cc69)
- **capability:** Add modality stripping for custom providers(5e3e0f8)
- **capability:** Split hard vs strippable caps for dispatch guard(84e6cb9)
- **streaming:** Add support for providers requiring streaming requests(58a4fda)
- **antigravity:** Add model aliases, fallback chains, and catalog(e6c1c5e)
- **opencode:** Add KeiRouter plugin(8b8525e)
- **cloudflare:** Enhance Cloudflare integration with dedicated model source and improved UI instructions(8e37e25)
- **health:** Add provider health dashboard with telemetry and probes(c0bcf78)
- **admin:** Import foreign router configs(c2a6d56)
- Enhance router compatibility with new health and routing checks, and improve UI components(e51a29c)
- Revamp provider toolbar and fix custom provider icons(25f7c75)
- Kiro opus/sonnet 5 models, dash version tolerance, claude thinking budget reconciliation(f004f0b)
- Add NVIDIA models, MiniMax-M3, developer role support, gemini tool index fix(efd24df)
- Display Codex usage API errors in UI for debugging(2a469cf)
- **admin:** Update codex usage parsing for percentage-based wham endpoint(276481d)
- Enhance Codex credit handling with redeem request ID and improve UI feedback(2c4df2f)
- **slimmer:** Add AgentRouter provider and enhance source code filtering(919eb80)
- **thinking:** Support both think tag variants(ae6b234)


### Refactor

- **ui:** Redesign StatCard and clean up Usage page(de3b771)
- **ui:** Adjust modal buttons and disable Tailscale tunnel(1d19d52)
- Remove unused Zap import from Layout.tsx(5c3668c)
- Remove unused imports and dead code(ea8e723)
- Batch budget spend queries and switch to fastjson(ff5bd3f)
- **caveman:** Reframe injection as native style directive(473dbdf)
- **capability:** Replace heuristic matrix with profile-driven resolution(55f68c7)
- Remove reasoning and structured output from hard capabilities(3561837)


### Testing

- Add rate limit verification script(3d12a86)
- Add unit tests for budget, crypto, proxy, qoder, and version(40493e6)
- **gateway,tunnel:** Add unit tests for console, targets, timeouts, and tunnel packages(f2349ac)
- **fastjson,identity,ponytail,vault:** Add unit tests for multiple packages(bd7b2a5)
- **connectors:** Add live model discovery tests and optimize provider models(d576dd8)


<!-- generated by git-cliff -->
## [0.1.25] — 2026-07-08


### Bug Fixes

- **gateway:** Enforce target access and URL validation(94a15de)
- **gateway:** Harden custom provider delete, disable bound accounts(38f3c60)
- Kimchi and CodeBuddy auth flow improvements(b5cb6bf)
- Handle nested JSON shapes in Codex usage API response(5923665)


### Documentation

- Update CHANGELOG.md and VERSION for v0.1.24(cacae48)


### Features

- **health:** Add provider health dashboard with telemetry and probes(c0bcf78)
- **admin:** Import foreign router configs(c2a6d56)
- Enhance router compatibility with new health and routing checks, and improve UI components(e51a29c)
- Revamp provider toolbar and fix custom provider icons(25f7c75)
- Kiro opus/sonnet 5 models, dash version tolerance, claude thinking budget reconciliation(f004f0b)
- Add NVIDIA models, MiniMax-M3, developer role support, gemini tool index fix(efd24df)
- Display Codex usage API errors in UI for debugging(2a469cf)
- **admin:** Update codex usage parsing for percentage-based wham endpoint(276481d)
- Enhance Codex credit handling with redeem request ID and improve UI feedback(2c4df2f)


<!-- generated by git-cliff -->
## [0.1.24] — 2026-07-04


### Bug Fixes

- **models:** Hide unauthenticated providers(0913c2c)
- **models:** Include dynamic models in discovery(1e0f6b9)
- **store:** Isolate in-memory SQLite per Open() call(0bec690)


### Documentation

- Update CHANGELOG.md and VERSION for v0.1.23(18b6804)


### Features

- **capability:** Add modality stripping for custom providers(5e3e0f8)
- **capability:** Split hard vs strippable caps for dispatch guard(84e6cb9)
- **streaming:** Add support for providers requiring streaming requests(58a4fda)
- **antigravity:** Add model aliases, fallback chains, and catalog(e6c1c5e)
- **opencode:** Add KeiRouter plugin(8b8525e)
- **cloudflare:** Enhance Cloudflare integration with dedicated model source and improved UI instructions(8e37e25)


<!-- generated by git-cliff -->
## [0.1.23] — 2026-07-01


### Documentation

- Update CHANGELOG.md and VERSION for v0.1.22(98ab251)


### Features

- **gateway:** Add latency-based chain strategy ordering(5e2a8e1)
- **core,gateway,pipeline,transform:** Add token estimation and usage synthesis for streaming responses(948c11d)
- **gateway,provider-detail:** Add provider filtering to quota usage endpoint(0a9cc69)


### Testing

- Add unit tests for budget, crypto, proxy, qoder, and version(40493e6)
- **gateway,tunnel:** Add unit tests for console, targets, timeouts, and tunnel packages(f2349ac)
- **fastjson,identity,ponytail,vault:** Add unit tests for multiple packages(bd7b2a5)
- **connectors:** Add live model discovery tests and optimize provider models(d576dd8)


<!-- generated by git-cliff -->
## [0.1.22] — 2026-07-01


### Documentation

- Update CHANGELOG.md and VERSION for v0.1.20(11f18ea)
- Update CHANGELOG.md and VERSION for v0.1.21(06aee67)


### Features

- **provider-detail:** Replace native confirm dialog with modal for bulk account deletion(e0b6176)
- **usage-analytics:** Add daily and model breakdown to key usage endpoint(4a1404c)


<!-- generated by git-cliff -->
## [0.1.21] — 2026-06-30


### Features

- **validation:** Add authenticated chat probe for credential verification(d5a5a24)


<!-- generated by git-cliff -->
## [0.1.21] — 2026-06-30


### Features

- **validation:** Add authenticated chat probe for credential verification(d5a5a24)


<!-- generated by git-cliff -->
## [0.1.19] — 2026-06-30


### Bug Fixes

- **kiro:** Dedup toolResults by toolUseId to prevent TOOL_DUPLICATE 400(8363c9a)
- **kiro:** Always attach profileArn to chat requests(b5b0e1a)
- Scope reasoning_content injection for Kimi and DeepSeek(8ffd430)
- **normalizer, kiro:** Ensure tool results are synthesized for dangling tool uses(d137f51)
- **app, headroom:** Prevent db use-after-close and compression stampedes(3a489f6)


### Build

- **deps:** Bump github.com/go-chi/chi/v5 in /backend(bc31622)


### CI/CD

- **release:** Add Windows support with PowerShell installer(e1dafa4)


### Documentation

- Update CHANGELOG.md and VERSION for v0.1.18(d8ff373)


### Features

- **transform:** Echo reasoning_content for DeepSeek thinking mode(79de6f5)
- **connectors:** Add DeepSeek v4 models and pricing(e213a49)
- Add user-defined custom providers and models(b97618e)
- **admin:** Expose base URL for custom providers in admin UI(eb7e2fa)
- **transform, normalizer:** Add tool choice normalization and deduplication(cf7d4b2)
- **headroom, ponytail:** Add token compression and savings tracking(8433615)
- **cli:** Add subcommand interface with start, bootstrap, status, and version(5511534)


### Refactor

- **caveman:** Reframe injection as native style directive(473dbdf)
- **capability:** Replace heuristic matrix with profile-driven resolution(55f68c7)
- Remove reasoning and structured output from hard capabilities(3561837)


<!-- generated by git-cliff -->
## [0.1.18] — 2026-06-16


### Bug Fixes

- **connectors:** Correct command-code validate test and bump to v0.1.18(ba94b89)


### Documentation

- Update CHANGELOG.md and VERSION for v0.1.17(f630fc4)


<!-- generated by git-cliff -->
## [0.1.17] — 2026-06-16


### Bug Fixes

- **routing:** Hash context affinity for sticky sessions(af72112)


### Documentation

- Update CHANGELOG.md and VERSION for v0.1.16(d852b0f)


### Features

- **commandcode:** Expose provider and add request metadata(5541cc8)
- **commandcode:** Support CLI token import and validation(0e72e38)


<!-- generated by git-cliff -->
## [0.1.16] — 2026-06-16


### Documentation

- Update CHANGELOG.md and VERSION for v0.1.15(9bc5daf)


### Features

- Implement streaming outbound guardrails, real-time audit log hub, and automated data retention policy.(8c6a097)
- **caveman:** Add wenyan levels and tighten prompts(0b0e46f)


<!-- generated by git-cliff -->
## [0.1.15] — 2026-06-15


### Bug Fixes

- **oauth:** Render inline HTML on OAuth callback to unblock Gemini CLI connect(8c256d4)
- **anthropic:** Normalize tool inputs to object values(b6557cb)


### Build

- **deps:** Bump github.com/jackc/pgx/v5 in /backend(229eff3)
- **deps:** Bump github.com/go-chi/chi/v5 in /backend(3d44c6a)
- **deps:** Bump golang.org/x/crypto from 0.31.0 to 0.45.0 in /backend(85e7fd3)
- **deps:** Bump github.com/go-viper/mapstructure/v2 in /backend(cf63802)


### Documentation

- Update CHANGELOG.md and VERSION for v0.1.14(6e4fe08)


### Features

- **guardrails:** Add PII redaction & prompt-injection guardrails(d1b2bf8)
- **endpoints:** Add CredentialNotice component and enhance UI for API keys management(ebe94de)
- **connectors:** Add no-auth MiMo Free provider support(b92a18d)
- **dev:** Add pretty startup logs and colored commands(25a30bb)
- **limits:** Add per-key rate limiting controls(c36897b)
- **rate-limits:** Implement per-key rate limiting and update settings UI(e973979)


### Testing

- Add rate limit verification script(3d12a86)


<!-- generated by git-cliff -->
## [0.1.14] — 2026-06-11


### Bug Fixes

- **store:** Make time SQL portable on Postgres(96e341a)


### Documentation

- Update CHANGELOG.md for v0.1.11(d7075df)
- Update CHANGELOG.md and VERSION for v0.1.13(8083cb9)


### Features

- **changelog:** Add ChangelogMarkdown component and integrate changelog display(2c3e9d8)
- **auth:** Add OAuth token refresh failure handling and reconnect flag(a2b6ee8)
- **qoder:** Add Qoder connector with COSY signing and SSE chat support(9b6bb27)


<!-- generated by git-cliff -->
## [0.1.13] — 2026-06-11


### Bug Fixes

- **ci:** Use commit.id with truncate for git-cliff v2.x template(98adeca)


<!-- generated by git-cliff -->
## [0.1.11] — 2026-06-11


### Bug Fixes

- **ci:** Update cliff.toml template for git-cliff v2.x API(9a61325)


<!-- generated by git-cliff -->
