## Test Structure Comparison

### Upstream Test Structure

Upstream uses CommonJS (`.cjs`) integration tests that run against a live server:

| Test File                           | Purpose                                | Tests |
| ----------------------------------- | -------------------------------------- | ----- |
| `test-thinking-signatures.cjs`      | Validate thinking signature generation | 3     |
| `test-multiturn-thinking-tools.cjs` | Multi-turn tool conversations          | 4     |
| `test-multiturn-streaming.cjs`      | Streaming multi-turn                   | 4     |
| `test-interleaved-thinking.cjs`     | Interleaved thinking blocks            | 2     |
| `test-images.cjs`                   | Image/document support                 | 5     |
| `test-caching-streaming.cjs`        | Prompt caching                         | 3     |
| `test-cross-model-thinking.cjs`     | Cross-model thinking compatibility     | 4     |
| `test-schema-sanitizer.cjs`         | Schema sanitizer unit tests            | 10    |
| `test-empty-response-retry.cjs`     | Empty response retry mechanism         | 3     |
| `test-oauth-no-browser.cjs`         | OAuth no-browser flow                  | 2     |
| `frontend/test-frontend-*.cjs` (×5) | WebUI frontend tests                   | ~20   |
| **Total**                           |                                        | ~60   |

### Our Test Structure

We use Vitest with comprehensive test types:

| Category  | Location          | Tests | Purpose                               |
| --------- | ----------------- | ----- | ------------------------------------- |
| Unit      | `tests/unit/`     | ~800  | Individual functions, mocked deps     |
| Fuzz      | `tests/fuzz/`     | ~50   | Random input, edge cases (fast-check) |
| Contract  | `tests/contract/` | ~100  | API schema validation                 |
| Snapshot  | `tests/snapshot/` | ~30   | Detect unintended format changes      |
| Golden    | `tests/golden/`   | ~20   | Known good request/response pairs     |
| Chaos     | `tests/chaos/`    | ~50   | Network failures, malformed responses |
| Load      | `tests/load/`     | ~10   | Concurrent handling, stress testing   |
| Security  | `tests/security/` | ~100  | Input sanitization, token handling    |
| Type      | `tests/types/`    | ~50   | Exported types correctness            |
| Benchmark | `tests/bench/`    | ~20   | Performance regression                |
| **Total** |                   | 1,767 |                                       |

### Test Coverage Comparison

| Aspect                | Upstream       | Us                              |
| --------------------- | -------------- | ------------------------------- |
| Test framework        | Node.js assert | Vitest + fast-check             |
| Unit tests            | 10             | ~800                            |
| Integration tests     | 50             | 50 (same structure, TypeScript) |
| Frontend tests        | 20             | N/A (TUI tested differently)    |
| Property-based (fuzz) | None           | ~50                             |
| Chaos/fault injection | None           | ~50                             |
| Type tests            | N/A            | ~50                             |
| Coverage threshold    | None           | 80% (unit), 50% (fuzz/chaos)    |
| CI integration        | Unknown        | GitHub Actions                  |

### Integration Test Parity

| Test File                       | Upstream | Us  | Notes                         |
| ------------------------------- | -------- | --- | ----------------------------- |
| `test-thinking-signatures.cjs`  | ✅       | ✅  | ✅ Identical                  |
| `test-multiturn-thinking-*.cjs` | ✅       | ✅  | ✅ Identical (both streaming) |
| `test-interleaved-thinking.cjs` | ✅       | ✅  | ✅ Identical                  |
| `test-images.cjs`               | ✅       | ✅  | ✅ Identical                  |
| `test-caching-streaming.cjs`    | ✅       | ✅  | ✅ Identical                  |
| `test-cross-model-thinking.cjs` | ✅       | ✅  | ✅ Identical                  |
| `test-oauth-no-browser.cjs`     | ✅       | ✅  | ✅ Identical                  |
| `test-schema-sanitizer.cjs`     | ✅       | ❌  | Unit tests cover this         |
| `test-empty-response-retry.cjs` | ✅       | ❌  | Unit tests cover this         |
| `http-client.cjs` (helper)      | ✅       | ✅  | ✅ Identical                  |
| `test-models.cjs` (helper)      | ✅       | ✅  | ✅ Identical                  |
| Frontend tests (5 files)        | ✅       | ❌  | Not applicable (we have TUI)  |

**Summary**: 9/11 integration tests match. 2 missing tests are covered by unit tests.

---

## Utility Module Comparison

### Retry Utilities (`utils/retry.js`)

Upstream has a dedicated retry module we **don't have** (we inline retry logic):

| Function                | Upstream | Us  | Notes                                |
| ----------------------- | -------- | --- | ------------------------------------ |
| `calculateBackoff()`    | ✅       | ❌  | Exponential backoff with jitter      |
| `retryWithBackoff()`    | ✅       | ❌  | Generic retry wrapper                |
| `isRetryableError()`    | ✅       | ❌  | Check if error can be retried        |
| `isNonRetryableError()` | ✅       | ❌  | Check if error should NOT be retried |

**Assessment**: We inline retry logic in handlers. Consider extracting to utility for consistency.

### Helper Functions (`utils/helpers.js`)

| Function             | Upstream | Us  | Notes                |
| -------------------- | -------- | --- | -------------------- |
| `formatDuration()`   | ✅       | ✅  | ✅ Match             |
| `sleep()`            | ✅       | ✅  | ✅ Match             |
| `isNetworkError()`   | ✅       | ✅  | ✅ Match             |
| `isAuthError()`      | ✅       | ✅  | ✅ Match             |
| `isRateLimitError()` | ✅       | ✅  | ✅ Match             |
| `fetchWithTimeout()` | ❌       | ✅  | **We added this** ✅ |

**Our Extra**: `fetchWithTimeout()` - AbortController-based timeout for fetch calls.

### Error Classes (`errors.js` / `errors.ts`)

| Error Class          | Upstream | Us  | Notes                          |
| -------------------- | -------- | --- | ------------------------------ |
| `AntigravityError`   | ✅       | ✅  | Same structure                 |
| `RateLimitError`     | ✅       | ✅  | Same structure                 |
| `AuthError`          | ✅       | ✅  | Same structure                 |
| `NoAccountsError`    | ✅       | ✅  | Same structure                 |
| `MaxRetriesError`    | ✅       | ✅  | Same structure                 |
| `ApiError`           | ✅       | ✅  | Same structure                 |
| `EmptyResponseError` | ✅       | ✅  | Same structure                 |
| `NativeModuleError`  | ✅       | ❌  | Not needed (no native modules) |
| `ErrorMetadata` type | ❌       | ✅  | **We added TypeScript types**  |

### Rate Limit Parser (`cloudcode/rate-limit-parser.js`)

| Function           | Upstream | Us  | Notes    |
| ------------------ | -------- | --- | -------- |
| `parseResetTime()` | ✅       | ✅  | ✅ Match |

Both implementations parse:

- `Retry-After` header (seconds or HTTP date)
- `x-ratelimit-reset` header (Unix timestamp)
- `x-ratelimit-reset-after` header
- `quotaResetDelay` from error body
- `quotaResetTimeStamp` from error body
- Duration strings (`1h23m45s`)
- ISO timestamps

### Fallback Configuration (`fallback-config.js`)

| Function                  | Upstream | Us  | Notes                           |
| ------------------------- | -------- | --- | ------------------------------- |
| `getFallbackModel()`      | ✅       | ✅  | ✅ Match                        |
| `hasFallback()`           | ✅       | ✅  | ✅ Match                        |
| `is5xxError()`            | ❌       | ✅  | **We added this** ✅            |
| `shouldAttemptFallback()` | ❌       | ✅  | **We added this** ✅            |
| `FallbackDecision` type   | ❌       | ✅  | **Discriminated union type** ✅ |

**Our Extra**: `fallback-utils.ts` provides type-safe fallback decision logic with discriminated unions.

### Usage Stats (`modules/usage-stats.js`)

Upstream has usage tracking we don't replicate (we use SQLite + burn rate instead):

| Feature             | Upstream                | Us                       |
| ------------------- | ----------------------- | ------------------------ |
| Usage tracking      | JSON file per hour      | SQLite quota snapshots   |
| Storage location    | `usage-history.json`    | `quota-snapshots.db`     |
| Data structure      | Hierarchical by model   | By account + model       |
| Analytics           | Request counts per hour | Burn rate calculation    |
| API endpoint        | `/api/stats/history`    | N/A (TUI shows directly) |
| Middleware tracking | Express middleware      | N/A (not needed for TUI) |
| Auto-pruning        | 30-day retention        | SQLite handles this      |

**Assessment**: We chose SQLite-based quota storage with burn rate calculation over JSON file history. Different approach, similar goal.

### Message Handlers (`cloudcode/message-handler.js`, `streaming-handler.js`)

Both implementations share the same core logic:

| Feature                       | Upstream | Us  | Notes                |
| ----------------------------- | -------- | --- | -------------------- |
| Sticky account selection      | ✅       | ✅  | ✅ Match             |
| Endpoint failover             | ✅       | ✅  | ✅ Match             |
| Rate limit handling           | ✅       | ✅  | ✅ Match             |
| Empty response retry          | ✅       | ✅  | ✅ Match             |
| 5xx error handling            | ✅       | ✅  | ✅ Match             |
| Network error handling        | ✅       | ✅  | ✅ Match             |
| Fallback model support        | ✅       | ✅  | ✅ Match             |
| Optimistic reset              | ✅       | ✅  | ✅ Match             |
| `emitEmptyResponseFallback()` | ✅       | ✅  | ✅ Match             |
| Typed interfaces              | ❌       | ✅  | **TypeScript types** |

### Session Manager (`cloudcode/session-manager.js`)

| Function            | Upstream | Us  | Notes    |
| ------------------- | -------- | --- | -------- |
| `deriveSessionId()` | ✅       | ✅  | ✅ Match |

Both implementations:

- Hash first user message with SHA256
- Return first 32 hex characters
- Fall back to random UUID if no user message

### Request Builder (`cloudcode/request-builder.js`)

| Feature                                | Upstream       | Us                     |
| -------------------------------------- | -------------- | ---------------------- |
| `buildCloudCodeRequest()`              | ✅             | ✅ (extended)          |
| `buildHeaders()`                       | ✅             | ✅                     |
| System instruction injection           | Fixed identity | **Configurable modes** |
| `AG_INJECT_IDENTITY` env var           | ❌             | ✅ `full/short/none`   |
| `shouldInjectIdentity()`               | ❌             | ✅ (model-specific)    |
| `injectAntigravitySystemInstruction()` | Inline         | ✅ (extracted)         |
| `CloudCodeRequest` interface           | ❌             | ✅                     |
| `RequestHeaders` interface             | ❌             | ✅                     |

**Our Extras**:

- Configurable identity modes (`full`, `short`, `none`) via `AG_INJECT_IDENTITY`
- Only inject identity for claude and gemini-3-pro (CLIProxyAPI v6.6.89 behavior)
- TypeScript interfaces for request and header types
- Full identity (~300 tokens) vs short identity (~50 tokens) option

### Configuration (`config.js`)

| Feature               | Upstream                                  | Us                      |
| --------------------- | ----------------------------------------- | ----------------------- |
| Config file location  | `~/.config/antigravity-proxy/config.json` | Same                    |
| Local config fallback | `./config.json`                           | Same                    |
| Environment overrides | `WEBUI_PASSWORD`, `DEBUG`                 | Same + more             |
| `getPublicConfig()`   | ✅                                        | N/A (TUI uses settings) |
| `saveConfig()`        | ✅                                        | N/A (TUI uses settings) |
| Default cooldown      | 60000ms (1 min)                           | 10000ms (10 sec)        |

**Key Difference**: We use 10-second cooldown (Issue #57 fix) while upstream defaults to 60 seconds.

### Claude Config (`utils/claude-config.js`)

Upstream has Claude CLI settings management (WebUI feature) that we skip:

| Function                | Upstream | Us  | Notes                 |
| ----------------------- | -------- | --- | --------------------- |
| `getClaudeConfigPath()` | ✅       | ❌  | Not needed (no WebUI) |
| `readClaudeConfig()`    | ✅       | ❌  | Not needed (no WebUI) |
| `updateClaudeConfig()`  | ✅       | ❌  | Not needed (no WebUI) |
| `deepMerge()`           | ✅       | ❌  | Internal helper       |

**Assessment**: We don't need these since we don't have WebUI's Claude CLI config editor.

---

## Format Module Deep Comparison

### Request Converter (`format/request-converter.ts`)

| Feature                        | Upstream           | Us                       | Notes          |
| ------------------------------ | ------------------ | ------------------------ | -------------- |
| `convertAnthropicToGoogle()`   | ✅                 | ✅                       | ✅ Match       |
| System instruction handling    | ✅                 | ✅                       | ✅ Match       |
| Interleaved thinking hint      | ✅                 | ✅                       | ✅ Match       |
| Thinking recovery (Gemini)     | ✅                 | ✅                       | ✅ Match       |
| Cross-model recovery (Claude)  | ✅                 | ✅                       | ✅ Match       |
| Empty parts placeholder        | ✅ (`.`)           | ✅ (`.`)                 | ✅ Match       |
| Unsigned thinking block filter | ✅                 | ✅                       | ✅ Match       |
| Claude thinking config         | `include_thoughts` | Same                     | ✅ Match       |
| Gemini thinking config         | `includeThoughts`  | Same                     | ✅ Match       |
| `thinking_budget` validation   | ✅                 | ✅                       | ✅ Match       |
| Tool schema sanitization       | `sanitizeSchema()` | Same                     | ✅ Match       |
| Tool schema cleaning           | `cleanSchema()`    | `cleanSchemaForGemini()` | Same logic     |
| Gemini max_tokens cap          | 16384              | 16384                    | ✅ Match       |
| TypeScript interfaces          | ❌                 | ✅                       | We added types |

### Response Converter (`format/response-converter.ts`)

| Feature                      | Upstream          | Us   | Notes          |
| ---------------------------- | ----------------- | ---- | -------------- |
| `convertGoogleToAnthropic()` | ✅                | ✅   | ✅ Match       |
| Response wrapper unwrap      | ✅                | ✅   | ✅ Match       |
| Thinking block conversion    | ✅                | ✅   | ✅ Match       |
| Tool use conversion          | ✅                | ✅   | ✅ Match       |
| `thoughtSignature` handling  | ✅                | ✅   | ✅ Match       |
| Stop reason determination    | ✅                | ✅   | ✅ Match       |
| Usage metadata extraction    | ✅                | ✅   | ✅ Match       |
| Cache token calculation      | `prompt - cached` | Same | ✅ Match       |
| Tool ID generation           | `toolu_xxx`       | Same | ✅ Match       |
| TypeScript interfaces        | ❌                | ✅   | We added types |

### Content Converter (`format/content-converter.ts`)

| Feature                          | Upstream | Us  | Notes    |
| -------------------------------- | -------- | --- | -------- |
| `convertRole()`                  | ✅       | ✅  | ✅ Match |
| `convertContentToParts()`        | ✅       | ✅  | ✅ Match |
| Text block handling              | ✅       | ✅  | ✅ Match |
| Image base64 handling            | ✅       | ✅  | ✅ Match |
| Image URL handling               | ✅       | ✅  | ✅ Match |
| Document (PDF) handling          | ✅       | ✅  | ✅ Match |
| `tool_use` conversion            | ✅       | ✅  | ✅ Match |
| `tool_result` conversion         | ✅       | ✅  | ✅ Match |
| Thinking block signature check   | ✅       | ✅  | ✅ Match |
| Cross-model signature filter     | ✅       | ✅  | ✅ Match |
| Claude ID field inclusion        | ✅       | ✅  | ✅ Match |
| Gemini thoughtSignature          | ✅       | ✅  | ✅ Match |
| Image extraction from results    | ✅       | ✅  | ✅ Match |
| `GEMINI_SKIP_SIGNATURE` fallback | ✅       | ✅  | ✅ Match |

---

## CloudCode Module Deep Comparison

### Model API (`cloudcode/model-api.js` vs `quota-api.ts`)

| Feature                  | Upstream              | Us                   | Notes                 |
| ------------------------ | --------------------- | -------------------- | --------------------- |
| `listModels()`           | ✅                    | ✅                   | ✅ Match              |
| `fetchAvailableModels()` | ✅                    | ✅                   | ✅ Match              |
| `getModelQuotas()`       | ✅                    | ✅                   | ✅ Match              |
| `getSubscriptionTier()`  | ✅                    | `fetchAccountTier()` | Same logic            |
| `isSupportedModel()`     | Inline check          | Same inline          | ✅ Match              |
| Tier normalization       | `toLowerCase()` check | `normalizeTier()`    | We extracted function |
| Model pool grouping      | N/A                   | ✅ `groupByPool()`   | **We added this** ✅  |
| `fetchAccountCapacity()` | N/A                   | ✅                   | **We added this** ✅  |
| `AccountCapacity` type   | N/A                   | ✅                   | **We added this** ✅  |
| `ModelPoolInfo` type     | N/A                   | ✅                   | **We added this** ✅  |
| `ModelQuotaInfo` type    | N/A                   | ✅                   | **We added this** ✅  |

**Our Extras**:

- `groupByPool()` - Groups models by quota pool (Claude, Gemini Pro, Gemini Flash)
- `findEarliestReset()` - Finds earliest reset time across models
- `fetchAccountCapacity()` - Combines tier + quota fetching with pool grouping
- TypeScript interfaces for all quota types

### SSE Parser (`cloudcode/sse-parser.ts`)

| Feature                       | Upstream | Us  | Notes                            |
| ----------------------------- | -------- | --- | -------------------------------- |
| `parseThinkingSSEResponse()`  | ✅       | ✅  | ✅ Match                         |
| Accumulate thinking text      | ✅       | ✅  | ✅ Match                         |
| Accumulate thinking signature | ✅       | ✅  | ✅ Match                         |
| Accumulate text               | ✅       | ✅  | ✅ Match                         |
| Handle functionCall           | ✅       | ✅  | ✅ Match                         |
| `flushThinking()` helper      | ✅       | ✅  | ✅ Match                         |
| `flushText()` helper          | ✅       | ✅  | ✅ Match                         |
| Debug logging                 | ✅       | ✅  | ✅ Match                         |
| TypeScript interfaces         | ❌       | ✅  | `ParsedPart`, `ReadableResponse` |

### Database Module (`auth/database.ts`)

| Feature                          | Upstream                  | Us   | Notes                               |
| -------------------------------- | ------------------------- | ---- | ----------------------------------- |
| `getAuthStatus()`                | ✅                        | ✅   | ✅ Match                            |
| `isDatabaseAccessible()`         | ✅                        | ✅   | ✅ Match                            |
| SQLite query                     | ItemTable                 | Same | ✅ Match                            |
| Error handling                   | Custom messages           | Same | ✅ Match                            |
| Auto-rebuild on version mismatch | ✅ `loadDatabaseModule()` | ❌   | Upstream adds native module rebuild |
| `NativeModuleError` support      | ✅                        | ❌   | Not needed (simpler approach)       |
| TypeScript `AuthData` interface  | ❌                        | ✅   | **We added type**                   |

**Key Difference**: Upstream has elaborate auto-rebuild logic for native module version mismatches (`isModuleVersionError()`, `attemptAutoRebuild()`, `clearRequireCache()`). We don't need this since:

1. TypeScript build process handles this
2. Our `better-sqlite3` import is direct, not lazy-loaded
3. We don't support the auto-rebuild workflow (users run `npm rebuild` manually)

### Token Extractor (`auth/token-extractor.ts`)

| Feature                 | Upstream                          | Us   | Notes              |
| ----------------------- | --------------------------------- | ---- | ------------------ |
| `getToken()`            | ✅                                | ✅   | ✅ Match           |
| `forceRefresh()`        | ✅                                | ✅   | ✅ Match           |
| Token caching           | `cachedToken`, `tokenExtractedAt` | Same | ✅ Match           |
| `needsRefresh()` check  | ✅                                | ✅   | ✅ Match           |
| DB extraction (primary) | ✅                                | ✅   | ✅ Match           |
| HTML page fallback      | ✅                                | ✅   | ✅ Match           |
| TypeScript types        | ❌                                | ✅   | **We added types** |

---

## Server Entry Point Comparison

### Server.ts vs server.js

| Feature                   | Upstream                       | Us                     | Notes             |
| ------------------------- | ------------------------------ | ---------------------- | ----------------- |
| Express setup             | ✅                             | ✅                     | ✅ Match          |
| CORS middleware           | ✅                             | ✅                     | ✅ Match          |
| JSON body limit           | `REQUEST_BODY_LIMIT`           | Same                   | ✅ Match          |
| Account manager init      | `ensureInitialized()`          | Same                   | ✅ Match          |
| Race condition protection | `initPromise`                  | Same                   | ✅ Match          |
| Error parsing             | `parseError()`                 | Same                   | ✅ Match          |
| Request logging           | Skip batch unless debug        | Same                   | ✅ Match          |
| Health endpoint           | `/health`                      | Same                   | ✅ Match          |
| Account limits endpoint   | `/account-limits`              | Same                   | ✅ Match          |
| Token refresh endpoint    | `/refresh-token`               | Same                   | ✅ Match          |
| Models endpoint           | `/v1/models`                   | Same                   | ✅ Match          |
| Count tokens stub         | `/v1/messages/count_tokens`    | Same                   | ✅ Match          |
| Messages endpoint         | `/v1/messages`                 | Same                   | ✅ Match          |
| Streaming headers         | 4 headers                      | Same                   | ✅ Match          |
| Optimistic retry          | Reset if all rate-limited      | Same                   | ✅ Match          |
| 404 handler               | Catch-all                      | Same                   | ✅ Match          |
| WebUI mounting            | `mountWebUI()`                 | ❌                     | We have TUI       |
| Usage stats middleware    | `usageStats.setupMiddleware()` | ❌                     | We use SQLite     |
| Model mapping             | `config.modelMapping`          | ❌                     | Not implemented   |
| Quota reset endpoint      | ❌                             | `/trigger-reset`       | **We added** ✅   |
| Group reset times         | ❌                             | `getGroupResetTimes()` | **We added** ✅   |
| TypeScript interfaces     | ❌                             | ✅                     | All types defined |

**Key Differences**:

1. **We have `/trigger-reset` endpoint** they don't:
   - Triggers quota reset for quota groups
   - Uses `triggerQuotaResetApi()` with minimal API calls
   - Also clears local rate limit flags

2. **We have `getGroupResetTimes()`** they don't:
   - Returns per-group reset times (Claude, Gemini Pro, Gemini Flash)
   - Used in `/account-limits` JSON response

3. **We skip WebUI** (have TUI instead):
   - No `mountWebUI()` call
   - No `usageStats` middleware
   - No model mapping config

4. **TypeScript type safety**:
   - All interfaces defined: `AccountWithRateLimits`, `ModelQuota`, `ParsedError`
   - Request body types: `MessagesRequestBody`
   - `FlushableResponse` for streaming

### Index.ts vs index.js

| Feature                | Upstream            | Us                    | Notes            |
| ---------------------- | ------------------- | --------------------- | ---------------- |
| Debug mode parsing     | `--debug` arg       | Same                  | ✅ Match         |
| Fallback mode parsing  | `--fallback` arg    | Same                  | ✅ Match         |
| Logger initialization  | `logger.setDebug()` | `LoggerConfig`        | Different API    |
| Port configuration     | `process.env.PORT`  | Same                  | ✅ Match         |
| Startup banner         | ASCII box art       | CLI with clear output | Different style  |
| Endpoint documentation | Inline in banner    | Separate file         | We use CLAUDE.md |

---

## CLI Module Comparison

### Upstream CLI (`src/cli/accounts.js`)

Upstream has a single monolithic CLI file with all account commands. We have a modular structure with separate files per command.

| Command  | Upstream                                | Our Implementation                    | Notes              |
| -------- | --------------------------------------- | ------------------------------------- | ------------------ |
| `add`    | `addAccount()`, `addAccountNoBrowser()` | `src/cli/commands/accounts-add.ts`    | Same functionality |
| `list`   | `listAccounts()`                        | `src/cli/commands/accounts-list.ts`   | Same functionality |
| `remove` | `interactiveRemove()`                   | `src/cli/commands/accounts-remove.ts` | Same functionality |
| `clear`  | `clearAccounts()`                       | `src/cli/commands/accounts-clear.ts`  | Same functionality |
| `verify` | `verifyAccounts()`                      | `src/cli/commands/accounts-verify.ts` | Same functionality |
| `help`   | Inline usage text                       | Commander.js built-in                 | Better CLI UX      |

### CLI Structure Differences

| Aspect            | Upstream                | Us                                    |
| ----------------- | ----------------------- | ------------------------------------- |
| Framework         | Raw `readline/promises` | `@clack/prompts` + Commander.js       |
| File organization | Single file (509 lines) | Modular (12 files, 2,494 lines total) |
| Browser opening   | `child_process.exec()`  | `open` npm package                    |
| Server check      | Raw `net.Socket`        | `isServerRunning()` utility           |
| UI feedback       | Console.log with emojis | `@clack/prompts` spinners/logs        |
| Auth method       | OAuth only (inline)     | OAuth + refresh token option          |
| `--no-browser`    | ✅                      | ✅                                    |
| `--refresh-token` | ❌                      | ✅ **We added this**                  |
| REFRESH_TOKEN env | ❌                      | ✅ **We added this**                  |

### Our CLI File Structure

| File                          | Lines | Purpose                           |
| ----------------------------- | ----- | --------------------------------- |
| `cli/index.ts`                | 272   | Commander.js main entry           |
| `cli/ui.ts`                   | 195   | UI helpers, spinners, prompts     |
| `cli/utils.ts`                | 38    | `isServerRunning()`, utilities    |
| `cli/capacity-renderer.ts`    | 690   | Colored quota display with charts |
| `commands/init.ts`            | 277   | Interactive setup wizard          |
| `commands/accounts-list.ts`   | 251   | List accounts with capacity info  |
| `commands/accounts-add.ts`    | 218   | OAuth + refresh token flows       |
| `commands/accounts-verify.ts` | 152   | Token verification                |
| `commands/accounts-remove.ts` | 117   | Interactive removal               |
| `commands/trigger-reset.ts`   | 111   | Quota reset command               |
| `commands/accounts-clear.ts`  | 87    | Clear all accounts                |
| `commands/start.ts`           | 86    | Server start with flags           |

### Functions Unique to Us

| Function                   | Location                    | Purpose                                   |
| -------------------------- | --------------------------- | ----------------------------------------- |
| `validateRefreshToken()`   | `auth/oauth.ts`             | Validate refresh token without OAuth flow |
| `isServerRunning()`        | `cli/utils.ts`              | Port check utility                        |
| `handleRefreshTokenFlow()` | `commands/accounts-add.ts`  | Refresh token auth flow                   |
| `triggerResetCommand()`    | `commands/trigger-reset.ts` | Quota reset CLI command                   |
| `startCommand()`           | `commands/start.ts`         | Server start with flags                   |
| `initCommand()`            | `commands/init.ts`          | Interactive setup wizard                  |

---

## Error Classes Comparison

### All Error Classes

| Error Class          | Upstream | Us  | Notes                          |
| -------------------- | -------- | --- | ------------------------------ |
| `AntigravityError`   | ✅       | ✅  | Base class, identical          |
| `RateLimitError`     | ✅       | ✅  | Identical structure            |
| `AuthError`          | ✅       | ✅  | Identical structure            |
| `NoAccountsError`    | ✅       | ✅  | Identical structure            |
| `MaxRetriesError`    | ✅       | ✅  | Identical structure            |
| `ApiError`           | ✅       | ✅  | Identical structure            |
| `EmptyResponseError` | ✅       | ✅  | Identical structure            |
| `NativeModuleError`  | ✅       | ❌  | Not needed (no native modules) |
| `ErrorMetadata` type | ❌       | ✅  | **We added TypeScript type**   |

### Helper Functions

| Function                 | Upstream | Us  | Notes    |
| ------------------------ | -------- | --- | -------- |
| `isRateLimitError()`     | ✅       | ✅  | ✅ Match |
| `isAuthError()`          | ✅       | ✅  | ✅ Match |
| `isEmptyResponseError()` | ✅       | ✅  | ✅ Match |

---

## Retry Module Comparison

Upstream has a dedicated `utils/retry.js` module we **don't have**. We inline retry logic in handlers.

### Upstream Retry Functions

| Function                | Description                          | Our Status             |
| ----------------------- | ------------------------------------ | ---------------------- |
| `calculateBackoff()`    | Exponential backoff with ±25% jitter | Inline in handlers     |
| `retryWithBackoff()`    | Generic async retry wrapper          | Inline in handlers     |
| `isRetryableError()`    | Check if error can be retried        | `is5xxError()` similar |
| `isNonRetryableError()` | Check if error should NOT be retried | Not implemented        |

### Backoff Algorithm (Upstream)

```javascript
// Exponential: baseMs * 2^attempt
const exponential = baseMs * Math.pow(2, attempt);
// Cap at max
const capped = Math.min(exponential, maxMs);
// Add random jitter (±25%)
const jitter = capped * 0.25 * (Math.random() * 2 - 1);
return Math.floor(capped + jitter);
```

**Assessment**: We handle retries inline in `streaming-handler.ts` and `message-handler.ts`. Could extract to utility for consistency, but current approach works.

### Retry Module Deep Dive

Upstream's `utils/retry.js` (162 lines) provides a complete retry framework:

**`calculateBackoff(attempt, baseMs = 1000, maxMs = 30000)`**

```javascript
// Exponential: baseMs * 2^attempt (e.g., 1s, 2s, 4s, 8s, 16s)
// Cap at maxMs (30s)
// Add ±25% jitter to prevent thundering herd
```

**`retryWithBackoff(fn, options)`**

Options:

- `maxAttempts` (default: 5)
- `baseMs` (default: 1000)
- `maxMs` (default: 30000)
- `shouldRetry(error, attempt)` callback
- `onRetry(error, attempt, backoffMs)` callback

**`isRetryableError(error)`**

Returns `true` for:

- Network errors: `econnrefused`, `econnreset`, `etimedout`, `fetch failed`
- 5xx errors: `500`, `502`, `503`, `504`
- Rate limits: `429`, `rate limit`

**`isNonRetryableError(error)`**

Returns `true` for:

- Auth errors: `401`, `403`, `unauthorized`, `forbidden`
- Client errors: `400`, `bad request`
- Not found: `404`, `not found`

**Our Approach vs Upstream**:

| Aspect               | Upstream                              | Us                                 |
| -------------------- | ------------------------------------- | ---------------------------------- |
| Backoff calculation  | Dedicated function with jitter        | Simple exponential (500ms \* 2^n)  |
| Retry wrapper        | Generic `retryWithBackoff()`          | Inline while loops                 |
| Error classification | `isRetryableError()` checks 10+ cases | `is5xxError()` checks 5xx only     |
| Callback support     | `shouldRetry`, `onRetry` callbacks    | Hardcoded logic                    |
| Max delay cap        | Configurable `maxMs`                  | No cap (uses fixed delays)         |
| Jitter               | ±25% random variation                 | None (fixed delays)                |
| TypeScript           | ❌                                    | ✅ Full type safety                |
| Fallback decision    | Inline check                          | `shouldAttemptFallback()` function |

**Potential Improvement**: Could extract a `calculateBackoff()` utility function and add jitter for better thundering herd prevention.

---

## Message Handlers Deep Comparison

### streaming-handler.ts vs streaming-handler.js

| Feature                    | Upstream                     | Us                            | Notes                    |
| -------------------------- | ---------------------------- | ----------------------------- | ------------------------ |
| Lines of code              | 347                          | 333                           | Slightly shorter         |
| Sticky account selection   | ✅                           | ✅                            | ✅ Match                 |
| Buffer delay after wait    | `sleep(500)` inline          | `RATE_LIMIT_BUFFER_MS`        | We extracted constant    |
| Optimistic reset           | `resetAllRateLimits()`       | `optimisticReset(modelId)`    | We use model-specific    |
| 5xx error tracking         | Inline check                 | `all5xxErrors` flag           | **We added tracking** ✅ |
| 5xx fallback on exhaustion | ❌                           | `shouldAttemptFallback()`     | **We added this** ✅     |
| Retry delay                | `sleep(1000)` inline         | `RETRY_DELAY_MS`              | We extracted constant    |
| Empty response retry       | `MAX_EMPTY_RESPONSE_RETRIES` | `MAX_EMPTY_RETRIES`           | Same logic               |
| Backoff on empty retry     | `500 * 2^n`                  | None (immediate retry)        | Upstream more gradual    |
| emitEmptyResponseFallback  | ✅                           | ✅                            | ✅ Match                 |
| TypeScript interfaces      | ❌                           | ✅ `RateLimitErrorInfo`, etc. | **Type safety** ✅       |
| `is5xxError()` function    | ❌                           | ✅                            | **We added this** ✅     |
| Import from fallback-utils | ❌                           | ✅                            | **We modularized** ✅    |

### message-handler.ts vs message-handler.js

| Feature                    | Upstream                 | Us                                   | Notes                    |
| -------------------------- | ------------------------ | ------------------------------------ | ------------------------ |
| Lines of code              | 233                      | 289                                  | We have more types       |
| Thinking model detection   | `isThinkingModel(model)` | Same                                 | ✅ Match                 |
| SSE for thinking           | ✅                       | ✅                                   | ✅ Match                 |
| JSON for non-thinking      | ✅                       | ✅                                   | ✅ Match                 |
| 5xx error tracking         | Inline check             | `all5xxErrors` flag                  | **We added tracking** ✅ |
| 5xx fallback on exhaustion | ❌                       | `shouldAttemptFallback()`            | **We added this** ✅     |
| TypeScript interfaces      | ❌                       | `Account`, `AccountManagerInterface` | **Type safety** ✅       |
| Re-export types            | ❌                       | `export type { AnthropicResponse }`  | **We added** ✅          |
| Response body null check   | ❌                       | ✅ `if (!response.body)`             | **We added safety** ✅   |

### Shared Handler Logic

Both implementations follow the same core retry flow:

```
1. Calculate maxAttempts = max(MAX_RETRIES, accountCount + 1)
2. For each attempt:
   a. Pick sticky account (wait if needed)
   b. If all rate-limited: wait for reset + buffer, try optimistic reset
   c. If no account: attempt fallback model or throw
   d. Get token/project for account
   e. Try each endpoint (DAILY → PROD failover)
   f. Handle 401 (clear cache), 429 (mark rate-limited), 5xx (wait and retry)
   g. On success: return/yield response
   h. On account failure: continue to next account
3. If all attempts exhausted: try 5xx fallback or throw
```

### Key Improvements We Made

1. **5xx Fallback on Exhaustion**: When all retries fail with 5xx errors only, attempt fallback model
2. **Model-Specific Optimistic Reset**: `optimisticReset(modelId)` instead of `resetAllRateLimits()`
3. **Extracted Constants**: `RATE_LIMIT_BUFFER_MS`, `RETRY_DELAY_MS` for clarity
4. **TypeScript Interfaces**: Full type safety for `Account`, `AccountManagerInterface`, `RateLimitErrorInfo`
5. **Fallback Utils Module**: `is5xxError()`, `shouldAttemptFallback()` extracted to dedicated module
6. **Response Body Safety**: Explicit null checks for `response.body`

---

## Storage Module Comparison

### `loadAccounts()` Function

| Feature                 | Upstream                | Us                 |
| ----------------------- | ----------------------- | ------------------ |
| Async file access       | ✅                      | ✅                 |
| `enabled` field default | `acc.enabled !== false` | Same               |
| Reset invalid flag      | ✅                      | ✅                 |
| Model rate limits init  | ✅                      | ✅                 |
| Subscription tracking   | `subscription` object   | ❌ Not implemented |
| Quota tracking          | `quota` object          | ❌ (we use SQLite) |
| TypeScript types        | ❌                      | ✅                 |

### Upstream Subscription/Quota Fields

Upstream stores per-account subscription and quota data in accounts.json:

```javascript
subscription: acc.subscription || { tier: 'unknown', projectId: null, detectedAt: null },
quota: acc.quota || { models: {}, lastChecked: null }
```

**Our Approach**: We use SQLite (`quota-snapshots.db`) for quota storage instead of JSON.

### `saveAccounts()` Function

| Feature               | Upstream | Us                    |
| --------------------- | -------- | --------------------- |
| Directory creation    | ✅       | ✅                    |
| Persist enabled state | ✅       | ❌ Not in our version |
| Persist subscription  | ✅       | ❌ (SQLite instead)   |
| Persist quota         | ✅       | ❌ (SQLite instead)   |
| TypeScript types      | ❌       | ✅                    |

---

## Rate Limit Parser Comparison

Both implementations are **functionally identical**:

### Parsing Formats Supported

| Format                           | Upstream | Us  | Notes    |
| -------------------------------- | -------- | --- | -------- |
| `Retry-After` header (seconds)   | ✅       | ✅  | ✅ Match |
| `Retry-After` header (HTTP date) | ✅       | ✅  | ✅ Match |
| `x-ratelimit-reset` (Unix ts)    | ✅       | ✅  | ✅ Match |
| `x-ratelimit-reset-after` (s)    | ✅       | ✅  | ✅ Match |
| `quotaResetDelay` (ms/s)         | ✅       | ✅  | ✅ Match |
| `quotaResetTimeStamp` (ISO)      | ✅       | ✅  | ✅ Match |
| `retry-after-ms` (ms)            | ✅       | ✅  | ✅ Match |
| Duration strings (`1h23m45s`)    | ✅       | ✅  | ✅ Match |
| ISO timestamp                    | ✅       | ✅  | ✅ Match |
| Sanity check (min 2s buffer)     | ✅       | ✅  | ✅ Match |

### TypeScript Additions

| Type           | Purpose                        |
| -------------- | ------------------------------ |
| `HeadersLike`  | Interface for headers access   |
| `ResponseLike` | Interface for Response objects |

---

## Helpers Module Comparison

### Shared Functions

| Function             | Upstream | Us  | Notes             |
| -------------------- | -------- | --- | ----------------- |
| `formatDuration()`   | ✅       | ✅  | ✅ Match          |
| `sleep()`            | ✅       | ✅  | ✅ Match          |
| `isNetworkError()`   | ✅       | ✅  | ✅ Match          |
| `isAuthError()`      | ✅       | ✅  | ✅ Match          |
| `isRateLimitError()` | ✅       | ✅  | ✅ Match          |
| `fetchWithTimeout()` | ❌       | ✅  | **We added this** |

### `fetchWithTimeout()` Implementation

```typescript
export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Used in 7 OAuth/credential functions to prevent hanging on slow networks.

---

## Usage Stats Module (Upstream Only)

Upstream has `modules/usage-stats.js` for tracking request counts per model/hour. We use SQLite-based quota storage instead.

### Upstream Implementation

| Function                        | Description                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `setupMiddleware(app)`          | Express middleware to track POST requests to `/v1/messages` and `/v1/chat/completions` |
| `setupRoutes(app)`              | Adds `GET /api/stats/history` endpoint                                                 |
| `track(modelId)`                | Increment request count for model in current hour bucket                               |
| `getFamily(modelId)`            | Extract model family (claude/gemini/other)                                             |
| `getShortName(modelId, family)` | Remove family prefix from model name                                                   |
| `getHistory()`                  | Return sorted history data                                                             |
| `load()`                        | Load history from JSON file                                                            |
| `save()`                        | Persist history to JSON file                                                           |
| `prune()`                       | Remove data older than 30 days                                                         |

### Storage Format

Upstream uses JSON file (`~/.config/antigravity-proxy/usage-history.json`):

```javascript
{
  "2026-01-11T08:00:00.000Z": {
    "claude": { "sonnet-4-5": 5, "_subtotal": 5 },
    "gemini": { "3-flash": 10, "_subtotal": 10 },
    "_total": 15
  }
}
```

### Our Alternative

We use SQLite-based quota storage (`quota-storage.ts`) with burn rate calculation:

| Our Feature            | Description                                  |
| ---------------------- | -------------------------------------------- |
| `saveQuotaSnapshot()`  | Store quota snapshot with timestamp          |
| `getRecentSnapshots()` | Retrieve snapshots for burn rate calculation |
| `calculateBurnRate()`  | Compute tokens/hour consumption rate         |
| SQLite database        | `~/.config/ag-cl/quota-snapshots.db`         |

**Assessment**: Different approach, same goal (usage analytics). We chose SQLite for better querying and type safety.

---

## Entry Point Comparison (index.js vs index.ts)

### Upstream index.js

| Feature              | Implementation                          | Notes                  |
| -------------------- | --------------------------------------- | ---------------------- |
| Debug mode           | `--debug` arg or `DEBUG=true` env       | Same                   |
| Fallback mode        | `--fallback` arg or `FALLBACK=true` env | Same                   |
| Logger init          | `logger.setDebug(isDebug)`              | Different API          |
| Port config          | `process.env.PORT \|\| DEFAULT_PORT`    | Same                   |
| Startup banner       | ASCII box art with endpoints            | We use simpler output  |
| Config dir display   | Shows `~/.antigravity-claude-proxy`     | We show different path |
| Console clear        | `console.clear()` on start              | We don't clear         |
| Export fallback flag | `FALLBACK_ENABLED` export               | We use env var check   |

### Our index.ts

| Feature           | Implementation                           | Notes           |
| ----------------- | ---------------------------------------- | --------------- |
| CLI parsing       | Commander.js with structured options     | More structured |
| Log level         | `--log-level` option (6 levels)          | More granular   |
| Log file          | `--log-file` option                      | We added        |
| JSON logs         | `--json-logs` option                     | We added        |
| Silent mode       | `--silent` option                        | We added        |
| Auto-refresh      | `--auto-refresh` or `AUTO_REFRESH` env   | We added        |
| Trigger reset     | `--trigger-reset` or `TRIGGER_RESET` env | We added        |
| Max empty retries | `--max-empty-retries` option             | We added        |

### Features We Added (Upstream Lacks)

| Feature               | Description                                       |
| --------------------- | ------------------------------------------------- |
| `--log-level`         | 6 log levels (silent/error/warn/info/debug/trace) |
| `--log-file`          | Log to file for debugging                         |
| `--json-logs`         | JSON output for log parsing                       |
| `--silent`            | Suppress all output except errors                 |
| `--auto-refresh`      | Auto-refresh quota every 5 hours                  |
| `--trigger-reset`     | Reset quotas on startup                           |
| `--max-empty-retries` | Configure empty response retries                  |

---

## Constants Comparison (Deep Dive)

### Shared Constants (Matching)

| Constant                        | Upstream                                    | Us                   | Notes         |
| ------------------------------- | ------------------------------------------- | -------------------- | ------------- |
| `ANTIGRAVITY_ENDPOINT_DAILY`    | `https://daily-cloudcode-pa.googleapis.com` | Same                 | ✅ Match      |
| `ANTIGRAVITY_ENDPOINT_PROD`     | `https://cloudcode-pa.googleapis.com`       | Same                 | ✅ Match      |
| `DEFAULT_PROJECT_ID`            | `rising-fact-p41fc`                         | Same                 | ✅ Match      |
| `TOKEN_REFRESH_INTERVAL_MS`     | 5 min                                       | 5 min                | ✅ Match      |
| `REQUEST_BODY_LIMIT`            | `50mb`                                      | `50mb`               | ✅ Match      |
| `ANTIGRAVITY_AUTH_PORT`         | 9092                                        | 9092                 | ✅ Match      |
| `DEFAULT_PORT`                  | 8080                                        | 8080                 | ✅ Match      |
| `DEFAULT_COOLDOWN_MS`           | 10s (config)                                | 10s                  | ✅ Match      |
| `MAX_RETRIES`                   | 5                                           | 5                    | ✅ Match      |
| `MAX_EMPTY_RESPONSE_RETRIES`    | 2                                           | 2 (env configurable) | We add config |
| `MAX_ACCOUNTS`                  | 10                                          | 10                   | ✅ Match      |
| `MAX_WAIT_BEFORE_ERROR_MS`      | 120000                                      | 120000               | ✅ Match      |
| `MIN_SIGNATURE_LENGTH`          | 50                                          | 50                   | ✅ Match      |
| `GEMINI_MAX_OUTPUT_TOKENS`      | 16384                                       | 16384                | ✅ Match      |
| `GEMINI_SKIP_SIGNATURE`         | sentinel                                    | Same                 | ✅ Match      |
| `GEMINI_SIGNATURE_CACHE_TTL_MS` | 2 hours                                     | 2 hours              | ✅ Match      |
| `OAUTH_CONFIG`                  | Full config object                          | Same                 | ✅ Match      |
| `MODEL_FALLBACK_MAP`            | 6 mappings                                  | Same                 | ✅ Match      |

### Constants We Added (Upstream Lacks)

| Constant                         | Value    | Purpose                        |
| -------------------------------- | -------- | ------------------------------ |
| `RATE_LIMIT_BUFFER_MS`           | 500      | Buffer after rate limit wait   |
| `RETRY_DELAY_MS`                 | 1000     | Pause between retries          |
| `OAUTH_FETCH_TIMEOUT_MS`         | 15000    | Prevent hanging OAuth calls    |
| `AUTO_REFRESH_INTERVAL_MS`       | 5 hours  | Auto-refresh quota period      |
| `AUTO_REFRESH_CHECK_INTERVAL_MS` | 5 min    | Clock-aligned check interval   |
| `MAX_EMPTY_RETRIES_LIMIT`        | 10       | Upper bound for retries config |
| `DEFAULT_SCHEDULING_MODE`        | `sticky` | Default account selection      |
| `VALID_SCHEDULING_MODES`         | 4 modes  | Type-safe mode list            |

### Constants Upstream Has (We Skip)

| Constant                         | Reason                               |
| -------------------------------- | ------------------------------------ |
| `USAGE_HISTORY_PATH`             | We use SQLite instead                |
| `ANTIGRAVITY_SYSTEM_INSTRUCTION` | We have configurable injection modes |

### Functions Comparison

| Function                 | Upstream | Us  | Notes                                 |
| ------------------------ | -------- | --- | ------------------------------------- |
| `getAntigravityDbPath()` | ✅       | ✅  | ✅ Match (platform detection)         |
| `getPlatformUserAgent()` | ✅       | ✅  | ✅ Match                              |
| `getModelFamily()`       | ✅       | ✅  | ✅ Match (returns `ModelFamily` type) |
| `isThinkingModel()`      | ✅       | ✅  | ✅ Match                              |

### TypeScript Types (We Added)

| Type              | Purpose                             |
| ----------------- | ----------------------------------- |
| `ModelFamily`     | `"claude" \| "gemini" \| "unknown"` |
| `OAuthConfigType` | Typed OAuth configuration interface |
| `SchedulingMode`  | Account selection mode type         |

---

## Test Helpers Comparison

### Upstream Test Helpers (`tests/helpers/`)

| File              | Purpose                | Functions                                                                                   |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `http-client.cjs` | HTTP request utilities | `streamRequest()`, `makeRequest()`, `analyzeContent()`, `analyzeEvents()`, `extractUsage()` |
| `test-models.cjs` | Model configuration    | `getTestModels()`, `getThinkingModels()`, `familySupportsThinking()`, `getModelConfig()`    |

### Our Test Helpers (`tests/helpers/`)

| File                      | Purpose             | Functions                                                                                                                                           |
| ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mocks.ts`                | Mock factories      | `createMockResponse()`, `createMockStream()`, `createMockStreamResponse()`, `createMockLogger()`, `createMockFetch()`, `createMockAccountManager()` |
| `factories.ts`            | Test data factories | Request/response factory functions                                                                                                                  |
| `fixtures.ts`             | Static test data    | Fixture constants                                                                                                                                   |
| `snapshot-normalizers.ts` | Snapshot formatting | Normalize dynamic values for snapshots                                                                                                              |
| `time-constants.ts`       | Time constants      | Test timing values                                                                                                                                  |

### Key Differences

| Aspect           | Upstream                              | Us                           |
| ---------------- | ------------------------------------- | ---------------------------- |
| HTTP client      | Raw Node.js `http.request()`          | Vitest mocks + fetch mocking |
| SSE parsing      | Manual in `streamRequest()`           | Via `createMockStream()`     |
| Content analysis | `analyzeContent()`, `analyzeEvents()` | Unit test assertions         |
| Model config     | `test-models.cjs`                     | Constants in test files      |
| Mock types       | N/A (JavaScript)                      | Full TypeScript interfaces   |
| Account mocking  | N/A                                   | `createMockAccountManager()` |
| Logger mocking   | N/A                                   | `createMockLogger()`         |

### Upstream `analyzeContent()` Function

```javascript
function analyzeContent(content) {
    return {
        thinking: content.filter(b => b.type === 'thinking'),
        toolUse: content.filter(b => b.type === 'tool_use'),
        text: content.filter(b => b.type === 'text'),
        hasThinking: thinking.length > 0,
        hasToolUse: toolUse.length > 0,
        hasText: text.length > 0,
        thinkingHasSignature: /* signature check */,
        toolUseHasSignature: /* signature check */,
        hasSignature: /* combined check */
    };
}
```

**Assessment**: We use Vitest assertions directly instead of helper functions. Both approaches work, ours is more idiomatic for Vitest.

---

## Module Index Files Comparison

Both projects use barrel exports (index.js/ts) for clean module boundaries.

### Format Module Index

| Export                              | Upstream               | Us   | Notes    |
| ----------------------------------- | ---------------------- | ---- | -------- |
| `convertAnthropicToGoogle`          | ✅                     | ✅   | ✅ Match |
| `convertGoogleToAnthropic`          | ✅                     | ✅   | ✅ Match |
| Re-export from `request-converter`  | ✅                     | ✅   | ✅ Match |
| Re-export from `response-converter` | ✅                     | ✅   | ✅ Match |
| Re-export from `content-converter`  | ✅                     | ✅   | ✅ Match |
| Re-export from `schema-sanitizer`   | ✅                     | ✅   | ✅ Match |
| Re-export from `thinking-utils`     | ✅                     | ✅   | ✅ Match |
| Default export                      | Object with converters | Same | ✅ Match |

### CloudCode Module Index

| Export                 | Upstream                  | Us   | Notes        |
| ---------------------- | ------------------------- | ---- | ------------ |
| `sendMessage`          | ✅                        | ✅   | ✅ Match     |
| `sendMessageStream`    | ✅                        | ✅   | ✅ Match     |
| `listModels`           | ✅                        | ✅   | ✅ Match     |
| `fetchAvailableModels` | ✅                        | ✅   | ✅ Match     |
| `getModelQuotas`       | ✅                        | ✅   | ✅ Match     |
| `getSubscriptionTier`  | ✅                        | ✅   | ✅ Match     |
| `fetchAccountCapacity` | ❌                        | ✅   | **We added** |
| `groupByPool`          | ❌                        | ✅   | **We added** |
| `findEarliestReset`    | ❌                        | ✅   | **We added** |
| Default export         | Object with API functions | Same | ✅ Match     |

---

## AccountManager Class Comparison

Both implementations use the same class structure with private fields and the same method signatures.

### Class Structure

| Aspect                | Upstream                           | Us              | Notes    |
| --------------------- | ---------------------------------- | --------------- | -------- |
| Private fields syntax | `#accounts`, `#currentIndex`       | Same            | ✅ Match |
| Caching strategy      | `Map<email, {token, extractedAt}>` | Same with types | ✅ Match |
| Initialization guard  | `#initialized` flag                | Same            | ✅ Match |
| Config path           | Constructor parameter              | Same            | ✅ Match |

### Methods Comparison

| Method                                      | Upstream | Us  | Notes        |
| ------------------------------------------- | -------- | --- | ------------ |
| `initialize()`                              | ✅       | ✅  | ✅ Match     |
| `reload()`                                  | ✅       | ✅  | ✅ Match     |
| `getAccountCount()`                         | ✅       | ✅  | ✅ Match     |
| `isAllRateLimited(modelId?)`                | ✅       | ✅  | ✅ Match     |
| `getAvailableAccounts(modelId?)`            | ✅       | ✅  | ✅ Match     |
| `getInvalidAccounts()`                      | ✅       | ✅  | ✅ Match     |
| `clearExpiredLimits()`                      | ✅       | ✅  | ✅ Match     |
| `resetAllRateLimits()`                      | ✅       | ✅  | ✅ Match     |
| `pickNext(modelId?)`                        | ✅       | ✅  | ✅ Match     |
| `getCurrentStickyAccount(modelId?)`         | ✅       | ✅  | ✅ Match     |
| `shouldWaitForCurrentAccount(modelId?)`     | ✅       | ✅  | ✅ Match     |
| `pickStickyAccount(modelId?)`               | ✅       | ✅  | ✅ Match     |
| `markRateLimited(email, resetMs, modelId?)` | ✅       | ✅  | ✅ Match     |
| `markInvalid(email, reason)`                | ✅       | ✅  | ✅ Match     |
| `getMinWaitTimeMs(modelId?)`                | ✅       | ✅  | ✅ Match     |
| `getTokenForAccount(account)`               | ✅       | ✅  | ✅ Match     |
| `getProjectForAccount(account, token)`      | ✅       | ✅  | ✅ Match     |
| `clearProjectCache(email?)`                 | ✅       | ✅  | ✅ Match     |
| `clearTokenCache(email?)`                   | ✅       | ✅  | ✅ Match     |
| `saveToDisk()`                              | ✅       | ✅  | ✅ Match     |
| `getStatus()`                               | ✅       | ✅  | ✅ Match     |
| `getSettings()`                             | ✅       | ✅  | ✅ Match     |
| `getAllAccounts()`                          | ✅       | ✅  | ✅ Match     |
| `pickByMode(modelId, mode?)`                | ❌       | ✅  | **We added** |
| `optimisticReset(modelId)`                  | ❌       | ✅  | **We added** |
| `triggerQuotaReset(group?)`                 | ❌       | ✅  | **We added** |
| `getSchedulingMode()`                       | ❌       | ✅  | **We added** |
| `setSchedulingMode(mode)`                   | ❌       | ✅  | **We added** |

### Features We Added

| Feature               | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `pickByMode()`        | Dispatch to scheduling mode (sticky/round-robin/refresh-priority/drain-highest) |
| `optimisticReset()`   | Clear rate limits for model after buffer wait fails                             |
| `triggerQuotaReset()` | Trigger quota reset for quota groups                                            |
| Scheduling modes      | 4 modes: sticky, refresh-priority, drain-highest, round-robin                   |
| TypeScript interfaces | `Account`, `AccountSettings`, `TokenCacheEntry`, `AccountStatus`, etc.          |

### TypeScript Types We Added

```typescript
export interface Account {
  email: string;
  refreshToken?: string;
  projectId?: string;
  source: "oauth" | "refresh-token" | "database";
  enabled?: boolean;
  isInvalid?: boolean;
  invalidReason?: string | null;
  modelRateLimits?: Record<string, ModelRateLimit>;
  lastUsed?: string | null;
  addedAt?: string;
}

export interface TokenCacheEntry {
  token: string;
  extractedAt: number;
}

export type SchedulingMode = "sticky" | "refresh-priority" | "drain-highest" | "round-robin";
```

---

## Native Module Helper (Upstream Only)

Upstream has `utils/native-module-helper.js` for auto-rebuilding native modules. We **don't need this** since we use TypeScript.

| Function                 | Description                            |
| ------------------------ | -------------------------------------- |
| `isModuleVersionError()` | Check if error is NODE_MODULE_VERSION  |
| `extractModulePath()`    | Extract .node file path from error     |
| `findPackageRoot()`      | Walk up to find package.json           |
| `rebuildModule()`        | Run `npm rebuild` in package directory |
| `attemptAutoRebuild()`   | Full auto-rebuild workflow             |
| `clearRequireCache()`    | Clear module from require cache        |

**Why We Skip**: TypeScript compilation handles module compatibility. Our `better-sqlite3` import is direct, not lazy-loaded. Users run `npm rebuild` manually if needed.

---

## Claude Config Utility (Upstream Only)

Upstream has `utils/claude-config.js` for WebUI's Claude CLI settings editor. We **skip this** since we don't have WebUI.

| Function                | Description                              |
| ----------------------- | ---------------------------------------- |
| `getClaudeConfigPath()` | Returns `~/.claude/settings.json` path   |
| `readClaudeConfig()`    | Read config, handle missing/invalid JSON |
| `updateClaudeConfig()`  | Deep merge updates into existing config  |
| `deepMerge()`           | Recursive object merge helper            |

**Why We Skip**: We have TUI instead of WebUI. Users manually configure Claude CLI.

---

## Logger Module Comparison

### Architecture Differences

| Aspect          | Upstream                          | Us                                      |
| --------------- | --------------------------------- | --------------------------------------- |
| Library         | Custom class + ANSI codes         | Pino + pino-pretty                      |
| Singleton       | Exported `logger` instance        | `getLogger()` function                  |
| Log levels      | info, success, warn, error, debug | silent, error, warn, info, debug, trace |
| History         | In-memory array (max 1000)        | Not implemented                         |
| Event emitter   | ✅ `emit('log', entry)`           | ❌ Not needed                           |
| TUI mode        | ❌ Not implemented                | ✅ Writes to buffer                     |
| Pretty printing | Custom ANSI colors                | pino-pretty transport                   |
| JSON output     | ❌                                | ✅ Native Pino feature                  |

### Upstream Logger Features We Skip

| Feature           | Upstream                     | Why We Skip               |
| ----------------- | ---------------------------- | ------------------------- |
| Log history       | `getHistory()` returns array | Not needed (no WebUI SSE) |
| Event emission    | `on('log', callback)`        | Not needed (no WebUI SSE) |
| `success()` level | Green-colored success logs   | Use `info()` instead      |
| `header()` method | Section header formatting    | Not needed                |

### Our Logger Additions

| Feature               | Description                       |
| --------------------- | --------------------------------- |
| `initLogger()`        | Configure logger with options     |
| `setLogLevel()`       | Dynamic level changes             |
| `isLoggerInTuiMode()` | Check if using TUI destination    |
| `tuiDestination`      | Write to buffer for TUI rendering |
| `LogLevel` type       | TypeScript type for log levels    |

---

## Fallback Config Comparison

### Shared Functions (Identical)

| Function             | Upstream                     | Us      |
| -------------------- | ---------------------------- | ------- |
| `getFallbackModel()` | Returns fallback or null     | ✅ Same |
| `hasFallback()`      | Checks if model has fallback | ✅ Same |

### Our Extensions

| Function/Type             | Description                              |
| ------------------------- | ---------------------------------------- |
| `shouldAttemptFallback()` | Decision logic for 5xx fallback          |
| `is5xxError()`            | Check if error is 5xx server error       |
| `FallbackDecision`        | Discriminated union type for type safety |

### `FallbackDecision` Type

```typescript
export type FallbackDecision = { shouldFallback: false; fallbackModel: null } | { shouldFallback: true; fallbackModel: string };
```

Provides type-safe fallback decisions in message handlers.

---

## Config Module Comparison

### Upstream Config Features

| Feature               | Upstream                                  | Us                      |
| --------------------- | ----------------------------------------- | ----------------------- |
| Config file location  | `~/.config/antigravity-proxy/config.json` | Environment + constants |
| Local config fallback | `./config.json`                           | Not implemented         |
| `getPublicConfig()`   | Returns copy of config                    | Not implemented         |
| `saveConfig()`        | Write updates to file                     | Not implemented         |
| Environment overrides | WEBUI_PASSWORD, DEBUG                     | Various env vars        |

### Upstream Default Config

```javascript
const DEFAULT_CONFIG = {
  webuiPassword: "",
  debug: false,
  logLevel: "info",
  maxRetries: 5,
  retryBaseMs: 1000,
  retryMaxMs: 30000,
  persistTokenCache: false,
  defaultCooldownMs: 60000, // Note: We use 10000 (10s)
  maxWaitBeforeErrorMs: 120000,
  modelMapping: {},
};
```

**Key Difference**: Upstream uses 60s cooldown by default; we use 10s (Issue #57 fix).

### Why We Skip Config Module

1. **No WebUI**: No need for `webuiPassword`, `modelMapping`, or dynamic config changes
2. **Constants file**: We define settings in `constants.ts`
3. **Environment variables**: We prefer env vars for configuration
4. **TypeScript types**: Better type safety with explicit constants

---

## Logger Module Deep Comparison

### Architecture Differences

| Aspect          | Upstream                          | Us                                      |
| --------------- | --------------------------------- | --------------------------------------- |
| Library         | Custom class + ANSI codes         | Pino + pino-pretty                      |
| Singleton       | Exported `logger` instance        | `getLogger()` function                  |
| Lines of code   | 146                               | 93                                      |
| Log levels      | info, success, warn, error, debug | silent, error, warn, info, debug, trace |
| History         | In-memory array (max 1000)        | Not implemented                         |
| Event emitter   | ✅ `emit('log', entry)`           | ❌ Not needed                           |
| TUI mode        | ❌ Not implemented                | ✅ Writes to buffer                     |
| Pretty printing | Custom ANSI colors                | pino-pretty transport                   |
| JSON output     | ❌                                | ✅ Native Pino feature                  |

### Upstream Logger Implementation

```javascript
class Logger extends EventEmitter {
  constructor() {
    super();
    this.isDebugEnabled = false;
    this.history = [];
    this.maxHistory = 1000;
  }

  // Methods: setDebug(), getTimestamp(), getHistory(), print()
  // Levels: info(), success(), warn(), error(), debug(), log(), header()
}

export const logger = new Logger();
```

**Upstream-Only Features**:

| Feature          | Purpose                                 |
| ---------------- | --------------------------------------- |
| `getHistory()`   | Returns array of last 1000 log entries  |
| `emit('log', e)` | EventEmitter for log streaming to WebUI |
| `success()`      | Green-colored success logs              |
| `header()`       | Section header formatting               |

### Our Logger Implementation

```typescript
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

export interface LoggerOptions {
  level?: LogLevel;
  tuiMode?: boolean;
  tuiDestination?: DestinationStream;
}

// Functions: createLogger(), isLoggerInTuiMode(), initLogger(), getLogger(), setLogLevel()
```

**Our Additions**:

| Feature               | Purpose                                |
| --------------------- | -------------------------------------- |
| `initLogger(options)` | Configure logger with level, TUI mode  |
| `setLogLevel(level)`  | Dynamic level changes at runtime       |
| `isLoggerInTuiMode()` | Check if using TUI destination         |
| `tuiDestination`      | Write to buffer for TUI rendering      |
| `LogLevel` type       | TypeScript type for 6 log levels       |
| `LoggerOptions`       | TypeScript interface for configuration |
| `trace` level         | More verbose than debug                |
| `silent` level        | Suppress all output                    |

### Why Different Approaches

| Consideration       | Upstream Choice              | Our Choice                 |
| ------------------- | ---------------------------- | -------------------------- |
| WebUI SSE streaming | Needs EventEmitter + history | Not needed (have TUI)      |
| Performance         | Custom implementation        | Pino (high-performance)    |
| Pretty output       | Manual ANSI codes            | pino-pretty transport      |
| JSON logs           | Not supported                | Native Pino feature        |
| TUI integration     | Not needed                   | Custom destination stream  |
| Type safety         | JSDoc comments               | Full TypeScript interfaces |

---

## Helpers Module Deep Comparison

### Shared Functions (Identical Logic)

| Function             | Upstream Lines | Our Lines | Notes          |
| -------------------- | -------------- | --------- | -------------- |
| `formatDuration(ms)` | 13             | 13        | ✅ Identical   |
| `sleep(ms)`          | 3              | 3         | ✅ Identical   |
| `isNetworkError()`   | 10             | 4         | ✅ Same checks |
| `isAuthError()`      | 8              | 4         | ✅ Same checks |
| `isRateLimitError()` | 7              | 4         | ✅ Same checks |

### Our Addition: `fetchWithTimeout()`

```typescript
export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Used in 7 OAuth/credential functions**:

1. `exchangeCode()` - Token exchange
2. `refreshAccessToken()` - Token refresh
3. `getUserEmail()` - User info endpoint
4. `discoverProjectId()` - Project discovery
5. `getTokenForAccount()` - Token fetch
6. `getProjectForAccount()` - Project fetch
7. `validateRefreshToken()` - Token validation

**Timeout value**: `OAUTH_FETCH_TIMEOUT_MS = 15000` (15 seconds)

### Why We Added Timeout

**Problem** (Issue #68): First request after idle period hangs indefinitely.

**Root Cause**: OAuth fetch calls have no timeout. After token cache expires (5 min), refresh call can hang forever on slow networks.

**Solution**: Added `fetchWithTimeout()` with AbortController to all OAuth calls.

---

## Native Module Helper (Upstream Only)

Upstream has `utils/native-module-helper.js` (163 lines) for auto-rebuilding native modules. We **don't need this** since we use TypeScript.

### Functions

| Function                 | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `isModuleVersionError()` | Check if error is NODE_MODULE_VERSION      |
| `extractModulePath()`    | Extract .node file path from error message |
| `findPackageRoot()`      | Walk up to find package.json               |
| `rebuildModule()`        | Run `npm rebuild` in package directory     |
| `attemptAutoRebuild()`   | Full auto-rebuild workflow                 |
| `clearRequireCache()`    | Clear module from require cache            |

### How It Works

```javascript
export function isModuleVersionError(error) {
  const message = error?.message || "";
  return message.includes("NODE_MODULE_VERSION") && message.includes("was compiled against a different Node.js version");
}

export function attemptAutoRebuild(error) {
  const nodePath = extractModulePath(error); // 1. Find .node file
  const packagePath = findPackageRoot(nodePath); // 2. Find package root
  return rebuildModule(packagePath); // 3. Run npm rebuild
}
```

### Why We Skip This

| Reason                         | Explanation                                |
| ------------------------------ | ------------------------------------------ |
| TypeScript compilation         | Build process handles module compatibility |
| Direct `better-sqlite3` import | No lazy loading needed                     |
| Simpler error handling         | Users run `npm rebuild` manually if needed |
| No `NativeModuleError` class   | Not needed in TypeScript codebase          |

---

## Claude Config Utility (Upstream Only)

Upstream has `utils/claude-config.js` (112 lines) for WebUI's Claude CLI settings editor. We **skip this** since we don't have WebUI.

### Functions

| Function                | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `getClaudeConfigPath()` | Returns `~/.claude/settings.json` path   |
| `readClaudeConfig()`    | Read config, handle missing/invalid JSON |
| `updateClaudeConfig()`  | Deep merge updates into existing config  |
| `deepMerge()`           | Recursive object merge helper            |

### Config Path

```javascript
export function getClaudeConfigPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}
```

### How It's Used (WebUI Only)

```javascript
// POST /api/claude/config route
app.post("/api/claude/config", async (req, res) => {
  const updates = req.body;
  await updateClaudeConfig(updates);
  res.json({ success: true });
});
```

### Why We Skip This

| Reason                 | Explanation                                |
| ---------------------- | ------------------------------------------ |
| No WebUI               | No web-based Claude CLI config editor      |
| Manual config          | Users edit Claude CLI settings directly    |
| TUI alternative        | Our TUI doesn't modify Claude CLI settings |
| Different architecture | We use environment variables, not files    |

---

## Fallback Config Deep Comparison

### Upstream Implementation (`fallback-config.js` - 30 lines)

```javascript
export function getFallbackModel(model) {
  return MODEL_FALLBACK_MAP[model] || null;
}

export function hasFallback(model) {
  return model in MODEL_FALLBACK_MAP;
}
```

### Our Implementation (`fallback-config.ts` + `fallback-utils.ts`)

We split into two files for separation of concerns:

**`fallback-config.ts`** - Re-exports from constants (same as upstream)
**`fallback-utils.ts`** - Added 5xx detection and fallback decision logic

### Functions Comparison

| Function                  | Upstream | Us  | Notes                      |
| ------------------------- | -------- | --- | -------------------------- |
| `getFallbackModel(model)` | ✅       | ✅  | ✅ Identical               |
| `hasFallback(model)`      | ✅       | ✅  | ✅ Identical               |
| `shouldAttemptFallback()` | ❌       | ✅  | **We added this** ✅       |
| `is5xxError()`            | ❌       | ✅  | **We added this** ✅       |
| `FallbackDecision` type   | ❌       | ✅  | **Discriminated union** ✅ |

### Our `shouldAttemptFallback()` Function

```typescript
export type FallbackDecision = { shouldFallback: false; fallbackModel: null } | { shouldFallback: true; fallbackModel: string };

export function shouldAttemptFallback(model: string, all5xxErrors: boolean, fallbackEnabled: boolean): FallbackDecision {
  if (!all5xxErrors || !fallbackEnabled) {
    return { shouldFallback: false, fallbackModel: null };
  }
  const fallbackModel = getFallbackModel(model);
  if (!fallbackModel) {
    return { shouldFallback: false, fallbackModel: null };
  }
  return { shouldFallback: true, fallbackModel };
}
```

### Our `is5xxError()` Function

```typescript
export function is5xxError(err: Error): boolean {
  const msg = err.message;
  // Match 5xx status codes with word boundaries to avoid false positives
  return /\b5\d{2}\b/.test(msg) || msg.includes("API error 5");
}
```

**Why Word Boundaries**: Avoids false positives like "port 5000" being matched as 500.

### Why We Added These

**Problem** (PR #90): When all retries are exhausted with 5xx server errors, requests fail completely even when an alternate model family might be available.

**Solution**:

- Track whether all failures were 5xx errors
- On exhaustion, attempt fallback to configured alternate model
- Discriminated union provides type-safe decision handling

---

## Session Manager Deep Comparison

### Core Logic (Identical)

Both implementations use the exact same algorithm:

| Feature                 | Upstream | Us  | Notes              |
| ----------------------- | -------- | --- | ------------------ |
| `deriveSessionId()`     | ✅       | ✅  | ✅ Same logic      |
| Find first user message | ✅       | ✅  | ✅ Same logic      |
| SHA256 hash (32 chars)  | ✅       | ✅  | ✅ Same logic      |
| Random UUID fallback    | ✅       | ✅  | ✅ Same logic      |
| TypeScript types        | ❌       | ✅  | We added types     |
| Type predicate filter   | ❌       | ✅  | TypeScript feature |

### Algorithm

```typescript
export function deriveSessionId(anthropicRequest: AnthropicRequest): string {
  const messages = anthropicRequest.messages ?? [];

  for (const msg of messages) {
    if (msg.role === "user") {
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter(/* text blocks only */)
          .map((block) => block.text)
          .join("\n");
      }
      if (content) {
        const hash = crypto.createHash("sha256").update(content).digest("hex");
        return hash.substring(0, 32);
      }
    }
  }
  return crypto.randomUUID();
}
```

### Why Session IDs Matter

Session IDs enable **prompt caching** in Cloud Code:

- Cache is scoped to session + organization
- Same conversation = same session ID = reuse cached context
- First user message hash ensures stability across turns

---

## Credentials Module Deep Comparison

### Functions Comparison

| Function                 | Upstream           | Us                                                              | Notes                |
| ------------------------ | ------------------ | --------------------------------------------------------------- | -------------------- |
| `getTokenForAccount()`   | Uses raw `fetch()` | Uses `fetchWithTimeout()` (indirectly via `refreshAccessToken`) | **Timeout added** ✅ |
| `getProjectForAccount()` | Uses raw `fetch()` | Uses `fetchWithTimeout()`                                       | **Timeout added** ✅ |
| `discoverProject()`      | Uses raw `fetch()` | Uses `fetchWithTimeout()`                                       | **Timeout added** ✅ |
| `clearProjectCache()`    | ✅                 | ✅                                                              | ✅ Identical         |
| `clearTokenCache()`      | ✅                 | ✅                                                              | ✅ Identical         |
| Network error handling   | `isNetworkError()` | Same                                                            | ✅ Identical         |
| TypeScript types         | ❌                 | `Account`, `TokenCacheEntry`, etc.                              | **Type safety** ✅   |

### Key Difference: `fetchWithTimeout()`

**Upstream `discoverProject()`**:

```javascript
const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({ ... })
});
```

**Our `discoverProject()`**:

```typescript
const response = await fetchWithTimeout(
    `${endpoint}/v1internal:loadCodeAssist`,
    {
        method: "POST",
        headers: { ... },
        body: JSON.stringify({ ... }),
    },
    OAUTH_FETCH_TIMEOUT_MS,  // 15 seconds timeout
);
```

### TypeScript Types We Added

```typescript
export interface Account {
  email: string;
  refreshToken?: string;
  projectId?: string;
  source: "oauth" | "refresh-token" | "database" | "manual";
  apiKey?: string;
  dbPath?: string;
  enabled?: boolean;
  isInvalid?: boolean;
  invalidReason?: string | null;
  modelRateLimits?: Record<string, ModelRateLimit>;
  lastUsed?: string | null;
  addedAt?: string;
}

export interface TokenCacheEntry {
  token: string;
  extractedAt: number;
}

export type OnInvalidCallback = (email: string, reason: string) => void;
export type OnSaveCallback = () => Promise<void>;
```

### Additional Response Type

```typescript
interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id: string };
}
```

---

## Selection Module Deep Comparison

### selection.ts vs selection.js

| Aspect         | Upstream                  | Us                                   | Notes                                  |
| -------------- | ------------------------- | ------------------------------------ | -------------------------------------- |
| Lines of code  | 202                       | 480                                  | We added scheduling modes              |
| Core functions | 4                         | 10                                   | We added 6 new functions               |
| TypeScript     | ❌                        | ✅ Full types                        | Type safety                            |
| Module state   | `stickyAccountEmail` only | + `lastPickedIndex` + quota state    | Round-robin and refresh-priority state |
| Callbacks      | `onSave` only             | + `onSave` + quota state integration | Auto-refresh support                   |

### Shared Functions (All Match Exactly)

| Function                        | Upstream | Us  | Notes    |
| ------------------------------- | -------- | --- | -------- |
| `pickNext()`                    | ✅       | ✅  | ✅ Match |
| `getCurrentStickyAccount()`     | ✅       | ✅  | ✅ Match |
| `shouldWaitForCurrentAccount()` | ✅       | ✅  | ✅ Match |
| `pickStickyAccount()`           | ✅       | ✅  | ✅ Match |

### Functions We Added (Upstream Lacks)

| Function                | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `optimisticReset()`     | Clear rate limits for model after buffer wait fails (Issue #72 enhancement)     |
| `pickByMode()`          | Dispatch to scheduling mode (sticky/round-robin/refresh-priority/drain-highest) |
| `pickRefreshPriority()` | Sort by earliest quota reset time, pick first available                         |
| `pickDrainHighest()`    | Sort by highest quota percentage, drain most-full accounts first                |
| `pickRoundRobin()`      | Module-level index rotation across accounts                                     |
| `pickSticky()`          | Simplified sticky logic for `pickByMode()` dispatcher                           |

### `pickByMode()` Function

```typescript
export function pickByMode(accounts: Account[], modelId: string, mode: SchedulingMode = DEFAULT_SCHEDULING_MODE, onSave?: () => Promise<void>): Account | null;
```

Dispatches to appropriate picker based on mode:

| Mode               | Implementation                   | Use Case                             |
| ------------------ | -------------------------------- | ------------------------------------ |
| `sticky`           | `pickSticky()` + mark `lastUsed` | Default - stay with one account      |
| `refresh-priority` | Sort by `resetAt`, pick first    | Use accounts closest to quota reset  |
| `drain-highest`    | Sort by quota %, pick highest    | Even out quota usage across accounts |
| `round-robin`      | `lastPickedIndex++` modulo count | Equal distribution                   |

### `optimisticReset()` Function

```typescript
export function optimisticReset(accounts: Account[], modelId: string): number;
```

Called after rate limit buffer wait (500ms) fails. Clears expired model-specific rate limits and returns count of accounts freed. This is an enhancement over upstream's `resetAllRateLimits()` which clears all limits globally.

### Quota State Integration

We integrate with the auto-refresh scheduler's quota state:

```typescript
// In pickRefreshPriority() and pickDrainHighest()
import { getQuotaState } from "../cloudcode/auto-refresh-scheduler.js";

function pickRefreshPriority(...): Account | null {
  const quotaState = getQuotaState();
  // Sort accounts by their model's reset time
  const sortedWithReset = available.map(acc => ({
    account: acc,
    resetAt: findEarliestResetForModel(quotaState, acc.email, modelId)
  }));
  sortedWithReset.sort((a, b) => (a.resetAt ?? Infinity) - (b.resetAt ?? Infinity));
  // ...
}
```

### TypeScript Types We Added

```typescript
export type SchedulingMode = "sticky" | "refresh-priority" | "drain-highest" | "round-robin";

export const VALID_SCHEDULING_MODES: readonly SchedulingMode[] = ["sticky", "refresh-priority", "drain-highest", "round-robin"];

export const DEFAULT_SCHEDULING_MODE: SchedulingMode = "sticky";
```

---

## Rate Limits Module Deep Comparison

### rate-limits.ts vs rate-limits.js

| Aspect              | Upstream | Us                   | Notes                        |
| ------------------- | -------- | -------------------- | ---------------------------- |
| Lines of code       | 203      | 254                  | We added quota group reset   |
| Core functions      | 8        | 9                    | We added `triggerQuotaReset` |
| TypeScript          | ❌       | ✅ Full types        | Type safety                  |
| Quota group support | ❌       | ✅ Group-based reset | `QuotaGroupKey` type         |

### Shared Functions (All Match Exactly)

| Function                 | Upstream | Us  | Notes    |
| ------------------------ | -------- | --- | -------- |
| `isAllRateLimited()`     | ✅       | ✅  | ✅ Match |
| `getAvailableAccounts()` | ✅       | ✅  | ✅ Match |
| `getInvalidAccounts()`   | ✅       | ✅  | ✅ Match |
| `clearExpiredLimits()`   | ✅       | ✅  | ✅ Match |
| `resetAllRateLimits()`   | ✅       | ✅  | ✅ Match |
| `markRateLimited()`      | ✅       | ✅  | ✅ Match |
| `markInvalid()`          | ✅       | ✅  | ✅ Match |
| `getMinWaitTimeMs()`     | ✅       | ✅  | ✅ Match |

### Function We Added: `triggerQuotaReset()`

```typescript
export interface QuotaResetResult {
  accountsAffected: number;
  limitsCleared: number;
  groups: string[];
}

export function triggerQuotaReset(accounts: Account[], group: QuotaGroupKey | "all"): QuotaResetResult;
```

Triggers quota reset for specific quota groups:

| Group         | Models Affected                                     |
| ------------- | --------------------------------------------------- |
| `claude`      | claude-sonnet-4-5, claude-opus-4-5-thinking, etc.   |
| `geminiPro`   | gemini-3-pro-high, gemini-3-pro-low, gemini-2.5-pro |
| `geminiFlash` | gemini-3-flash, gemini-2.5-flash                    |
| `all`         | All models in all groups                            |

Implementation:

```typescript
export function triggerQuotaReset(accounts: Account[], group: QuotaGroupKey | "all"): QuotaResetResult {
  const result: QuotaResetResult = { accountsAffected: 0, limitsCleared: 0, groups: [] };

  const groupsToReset = group === "all" ? (Object.keys(QUOTA_GROUPS) as QuotaGroupKey[]) : [group];

  result.groups = groupsToReset;

  for (const acc of accounts) {
    if (!acc.modelRateLimits) continue;
    let affected = false;

    for (const modelId of Object.keys(acc.modelRateLimits)) {
      if (isModelInGroups(modelId, groupsToReset)) {
        delete acc.modelRateLimits[modelId];
        result.limitsCleared++;
        affected = true;
      }
    }

    if (affected) result.accountsAffected++;
  }

  return result;
}
```

### Quota Group Constants

```typescript
export type QuotaGroupKey = "claude" | "geminiPro" | "geminiFlash";

export const QUOTA_GROUPS: Record<QuotaGroupKey, readonly string[]> = {
  claude: ["claude-sonnet-4-5", "claude-opus-4-5-thinking", "claude-sonnet-4-5-thinking"],
  geminiPro: ["gemini-3-pro-high", "gemini-3-pro-low", "gemini-2.5-pro"],
  geminiFlash: ["gemini-3-flash", "gemini-2.5-flash"],
};
```

### TypeScript Types We Added

```typescript
export interface ModelRateLimit {
  resetAt: number; // Unix timestamp when limit expires
  limitedAt: number; // Unix timestamp when limit was set
  reason?: string; // Optional reason for rate limit
}

export interface Account {
  // ... other fields
  modelRateLimits?: Record<string, ModelRateLimit>;
}

export interface QuotaResetResult {
  accountsAffected: number;
  limitsCleared: number;
  groups: string[];
}
```

---

## Signature Cache Module Deep Comparison

### signature-cache.ts vs signature-cache.js

| Aspect         | Upstream   | Us                         | Notes                   |
| -------------- | ---------- | -------------------------- | ----------------------- |
| Lines of code  | 115        | 134                        | We added testing helper |
| Core functions | 6          | 7                          | We added test reset     |
| TypeScript     | ❌         | ✅ Full types              | Type safety             |
| Cache types    | Plain Maps | Typed Maps with interfaces | `SignatureCacheEntry`   |

### Shared Functions (All Match Exactly)

| Function                     | Upstream | Us  | Notes    |
| ---------------------------- | -------- | --- | -------- |
| `cacheSignature()`           | ✅       | ✅  | ✅ Match |
| `getCachedSignature()`       | ✅       | ✅  | ✅ Match |
| `cleanupCache()`             | ✅       | ✅  | ✅ Match |
| `getCacheSize()`             | ✅       | ✅  | ✅ Match |
| `cacheThinkingSignature()`   | ✅       | ✅  | ✅ Match |
| `getCachedSignatureFamily()` | ✅       | ✅  | ✅ Match |
| `getThinkingCacheSize()`     | ✅       | ✅  | ✅ Match |

### Function We Added

```typescript
/**
 * Reset all caches - FOR TESTING ONLY
 * @internal
 */
export function _resetCacheForTesting(): void {
  signatureCache.clear();
  thinkingSignatureCache.clear();
}
```

### TypeScript Interfaces We Added

```typescript
interface SignatureCacheEntry {
  signature: string;
  timestamp: number;
}

interface ThinkingSignatureCacheEntry {
  modelFamily: ModelFamily;
  timestamp: number;
}

const signatureCache = new Map<string, SignatureCacheEntry>();
const thinkingSignatureCache = new Map<string, ThinkingSignatureCacheEntry>();
```

---

## Token Extractor Module Deep Comparison

### token-extractor.ts vs token-extractor.js

| Aspect         | Upstream                  | Us                 | Notes                  |
| -------------- | ------------------------- | ------------------ | ---------------------- |
| Lines of code  | 118                       | 114                | Similar size           |
| Core functions | 5                         | 5                  | Same function count    |
| TypeScript     | ❌                        | ✅ Full types      | Type safety            |
| Default export | Object with named exports | Named exports only | Different export style |

### Shared Functions (All Match Exactly)

| Function              | Upstream | Us  | Notes    |
| --------------------- | -------- | --- | -------- |
| `extractChatParams()` | ✅       | ✅  | ✅ Match |
| `getTokenData()`      | ✅       | ✅  | ✅ Match |
| `needsRefresh()`      | ✅       | ✅  | ✅ Match |
| `getToken()`          | ✅       | ✅  | ✅ Match |
| `forceRefresh()`      | ✅       | ✅  | ✅ Match |

### TypeScript Interfaces We Added

```typescript
interface ChatParams {
  apiKey?: string;
  [key: string]: unknown;
}
```

### Export Style Difference

**Upstream:**

```javascript
export default {
  getToken,
  forceRefresh,
};
```

**Us:**

```typescript
// Named exports only - no default export
export async function getToken(): Promise<string> { ... }
export async function forceRefresh(): Promise<string> { ... }
```

---

## Request Builder Module Deep Comparison

### request-builder.ts vs request-builder.js

| Aspect             | Upstream            | Us                        | Notes                          |
| ------------------ | ------------------- | ------------------------- | ------------------------------ |
| Lines of code      | 94                  | 197                       | We added configurable identity |
| Core functions     | 2                   | 4                         | We added 2 helper functions    |
| TypeScript         | ❌                  | ✅ Full types             | Type safety                    |
| Identity injection | Single fixed string | Configurable modes        | `AG_INJECT_IDENTITY` env var   |
| Model filtering    | ❌ All models       | ✅ Only claude/gemini-pro | CLIProxyAPI v6.6.89 behavior   |

### Shared Functions

| Function                  | Upstream | Us  | Notes                        |
| ------------------------- | -------- | --- | ---------------------------- |
| `buildCloudCodeRequest()` | ✅       | ✅  | Same core logic, we enhanced |
| `buildHeaders()`          | ✅       | ✅  | ✅ Match                     |

### Functions We Added

| Function                               | Purpose                                          |
| -------------------------------------- | ------------------------------------------------ |
| `shouldInjectIdentity()`               | Check if model should have identity injection    |
| `injectAntigravitySystemInstruction()` | Extracted injection logic with configurable mode |

### Configurable Identity Injection

We added the `AG_INJECT_IDENTITY` environment variable with three modes:

| Mode    | Description                                          |
| ------- | ---------------------------------------------------- |
| `full`  | Full identity (~300 tokens) - default                |
| `short` | Shortened identity (~50 tokens) for token efficiency |
| `none`  | Disable injection (may cause 429 errors)             |

### Model Filtering (CLIProxyAPI v6.6.89 Behavior)

```typescript
function shouldInjectIdentity(model: string): boolean {
  const modelLower = model.toLowerCase();
  return modelLower.includes("claude") || modelLower.includes("gemini-3-pro");
}
```

Only injects identity for:

- `claude` models (all variants)
- `gemini-3-pro` models (gemini-3-pro-high, gemini-3-pro-low)

NOT injected for:

- `gemini-3-flash` models
- Other models

### TypeScript Interfaces We Added

```typescript
interface CloudCodeGoogleRequest extends GoogleRequest {
  sessionId?: string;
}

export interface CloudCodeRequest {
  project: string;
  model: string;
  request: CloudCodeGoogleRequest;
  userAgent: string;
  requestId: string;
  requestType: string;
}

export interface RequestHeaders {
  Authorization: string;
  "Content-Type": string;
  "User-Agent"?: string;
  "X-Goog-Api-Client"?: string;
  "Client-Metadata"?: string;
  "anthropic-beta"?: string;
  Accept?: string;
  [key: string]: string | undefined;
}
```

### Upstream vs Our Identity Text

**Upstream** (single fixed string):

```javascript
const ANTIGRAVITY_SYSTEM_INSTRUCTION = `You are Antigravity...`;
```

**Us** (two configurable options):

```typescript
const ANTIGRAVITY_IDENTITY_FULL = `<identity>
You are Antigravity, a powerful agentic AI coding assistant...
</identity>
<tool_calling>...</tool_calling>
<communication_style>...</communication_style>`;

const ANTIGRAVITY_IDENTITY_SHORT = `You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.You are pair programming with a USER to solve their coding task.**Absolute paths only****Proactiveness**`;
```

---

## Storage Module Deep Comparison

### storage.ts vs storage.js

| Aspect             | Upstream              | Us                 | Notes         |
| ------------------ | --------------------- | ------------------ | ------------- |
| Lines of code      | 137                   | ~100               | Simplified    |
| Subscription field | `subscription` object | ❌ Not implemented | We use SQLite |
| Quota field        | `quota` object        | ❌ Not implemented | We use SQLite |
| TypeScript         | ❌                    | ✅ Full types      | Type safety   |

### Shared Functions

| Function         | Upstream | Us  | Notes         |
| ---------------- | -------- | --- | ------------- |
| `loadAccounts()` | ✅       | ✅  | ✅ Same logic |
| `saveAccounts()` | ✅       | ✅  | ✅ Same logic |
| `getConfigDir()` | ✅       | ✅  | ✅ Same logic |

### Upstream Fields We Skip

```javascript
// Upstream stores in accounts.json:
subscription: acc.subscription || { tier: 'unknown', projectId: null, detectedAt: null },
quota: acc.quota || { models: {}, lastChecked: null }
```

**Our Approach**: We use SQLite (`quota-snapshots.db`) for quota storage:

| Aspect        | Upstream              | Us                          |
| ------------- | --------------------- | --------------------------- |
| Quota storage | JSON in accounts.json | SQLite `quota-snapshots.db` |
| Analytics     | Per-hour counts       | Burn rate calculation       |
| Persistence   | File-based            | SQLite transactions         |
| Querying      | Load entire file      | SQL queries                 |

---

## Complete Module Comparison Summary

### All 34 Upstream Modules Analyzed

The following table summarizes our investigation of all 34 JavaScript files in the upstream `src/` directory against our TypeScript equivalents:

| Module                    | Upstream Lines | Our Lines | Match Status           | Key Differences                   |
| ------------------------- | -------------- | --------- | ---------------------- | --------------------------------- |
| **Account Manager**       |                |           |                        |                                   |
| `credentials.js`          | 186            | ~200      | ✅ All functions match | We added `fetchWithTimeout()`     |
| `index.js`                | 319            | ~350      | ✅ All methods match   | We added 5 methods for scheduling |
| `rate-limits.js`          | 202            | 254       | ✅ All functions match | We added `triggerQuotaReset()`    |
| `selection.js`            | 201            | 480       | ✅ All functions match | We added 6 scheduling functions   |
| `storage.js`              | 136            | ~100      | ✅ All functions match | We use SQLite vs JSON             |
| **Auth**                  |                |           |                        |                                   |
| `database.js`             | 169            | ~80       | ✅ Match               | We skip native module rebuild     |
| `oauth.js`                | 399            | 522       | ✅ All functions match | We added `validateRefreshToken()` |
| `token-extractor.js`      | 117            | 114       | ✅ All functions match | Named exports only                |
| **CloudCode**             |                |           |                        |                                   |
| `index.js`                | 29             | ~40       | ✅ Match               | We added 3 exports                |
| `message-handler.js`      | 232            | 289       | ✅ Match               | We added 5xx fallback tracking    |
| `model-api.js`            | 184            | ~250      | ✅ Match               | We added pool grouping            |
| `rate-limit-parser.js`    | 181            | ~180      | ✅ Identical           | TypeScript types added            |
| `request-builder.js`      | 93             | 197       | ✅ Match               | Configurable identity injection   |
| `session-manager.js`      | 47             | ~50       | ✅ Identical           | TypeScript types added            |
| `sse-parser.js`           | 116            | ~120      | ✅ Identical           | TypeScript types added            |
| `sse-streamer.js`         | 260            | ~280      | ✅ Match               | stopReason fix implemented        |
| `streaming-handler.js`    | 346            | 333       | ✅ Match               | We added 5xx fallback             |
| **Format**                |                |           |                        |                                   |
| `content-converter.js`    | 187            | ~200      | ✅ Identical           | TypeScript types added            |
| `index.js`                | 20             | ~25       | ✅ Identical           | Same exports                      |
| `request-converter.js`    | 237            | ~250      | ✅ Identical           | TypeScript types added            |
| `response-converter.js`   | 110            | ~120      | ✅ Identical           | TypeScript types added            |
| `schema-sanitizer.js`     | 673            | ~700      | ✅ All 5 phases match  | TypeScript types added            |
| `signature-cache.js`      | 114            | 134       | ✅ All functions match | We added test helper              |
| `thinking-utils.js`       | 542            | ~550      | ✅ Identical           | TypeScript types added            |
| **Utils**                 |                |           |                        |                                   |
| `claude-config.js`        | 111            | N/A       | ⏭️ Skipped             | WebUI-only feature                |
| `helpers.js`              | 80             | ~100      | ✅ Match               | We added `fetchWithTimeout()`     |
| `logger.js`               | 145            | 93        | 🔄 Different           | Pino vs custom class              |
| `native-module-helper.js` | 162            | N/A       | ⏭️ Skipped             | Not needed in TypeScript          |
| `retry.js`                | 161            | N/A       | ⏭️ Skipped             | Inline retry logic                |
| **Top-Level**             |                |           |                        |                                   |
| `config.js`               | 85             | N/A       | ⏭️ Skipped             | We use constants.ts               |
| `constants.js`            | 196            | ~250      | ✅ Match               | We added more constants           |
| `errors.js`               | 203            | ~200      | ✅ Match               | Skip `NativeModuleError`          |
| `fallback-config.js`      | 29             | ~80       | ✅ Match               | We added utilities                |
| `index.js`                | 107            | 83        | 🔄 Different           | Simpler banner style              |
| `server.js`               | 761            | ~800      | ✅ Match               | We added `/trigger-reset`         |
| **CLI**                   |                |           |                        |                                   |
| `cli/accounts.js`         | 509            | 12 files  | 🔄 Different           | Modular structure                 |
| **Modules**               |                |           |                        |                                   |
| `modules/usage-stats.js`  | 205            | N/A       | ⏭️ Skipped             | We use SQLite                     |
| **WebUI**                 |                |           |                        |                                   |
| `webui/index.js`          | 598            | N/A       | ⏭️ Skipped             | We have TUI                       |

### Summary Statistics

| Category                 | Count | Percentage |
| ------------------------ | ----- | ---------- |
| ✅ Matching or enhanced  | 28    | 82%        |
| 🔄 Different approach    | 3     | 9%         |
| ⏭️ Intentionally skipped | 6     | 18%        |

### Functions We Added (Upstream Lacks)

| Function                  | Module             | Purpose                             |
| ------------------------- | ------------------ | ----------------------------------- |
| `fetchWithTimeout()`      | helpers.ts         | Prevent hanging OAuth calls         |
| `validateRefreshToken()`  | oauth.ts           | Add accounts via refresh token      |
| `optimisticReset()`       | selection.ts       | Clear rate limits after buffer wait |
| `pickByMode()`            | selection.ts       | Dispatch to scheduling mode         |
| `pickRefreshPriority()`   | selection.ts       | Sort by quota reset time            |
| `pickDrainHighest()`      | selection.ts       | Sort by quota percentage            |
| `pickRoundRobin()`        | selection.ts       | Rotate across accounts              |
| `triggerQuotaReset()`     | rate-limits.ts     | Group-based quota reset             |
| `shouldAttemptFallback()` | fallback-utils.ts  | Type-safe 5xx fallback decision     |
| `is5xxError()`            | fallback-utils.ts  | Detect 5xx server errors            |
| `groupByPool()`           | quota-api.ts       | Group models by quota pool          |
| `findEarliestReset()`     | quota-api.ts       | Find earliest reset time            |
| `fetchAccountCapacity()`  | quota-api.ts       | Combined tier + quota fetch         |
| `shouldInjectIdentity()`  | request-builder.ts | Model filtering for identity        |
| `_resetCacheForTesting()` | signature-cache.ts | Test helper                         |

### Features We Have (Upstream Lacks)

| Feature               | Implementation          | Benefit                   |
| --------------------- | ----------------------- | ------------------------- |
| TypeScript            | Full codebase           | Type safety, better DX    |
| Scheduling modes      | 4 modes                 | Flexible account rotation |
| SQLite quota storage  | quota-storage.ts        | Persistent, queryable     |
| Burn rate calculation | burn-rate.ts            | Usage analytics           |
| TUI interface         | React/Ink               | Terminal UI alternative   |
| Discriminated unions  | FallbackDecision        | Type-safe decisions       |
| OAuth timeout         | 15s via AbortController | Prevent hanging           |
| Refresh token auth    | --refresh-token flag    | Headless account adding   |
| Configurable identity | AG_INJECT_IDENTITY env  | 3 injection modes         |
| 5xx fallback tracking | all5xxErrors flag       | Smart model fallback      |
| Comprehensive tests   | 1,767 tests             | 10 test categories        |

### Features We Skip (Upstream Has)

| Feature                    | Reason                    |
| -------------------------- | ------------------------- |
| WebUI Dashboard            | We have TUI               |
| Native module rebuild      | Not needed in TypeScript  |
| Usage stats middleware     | We use SQLite             |
| Config file persistence    | We use constants.ts       |
| Claude CLI config editor   | Not needed                |
| Log history (1000 entries) | Not needed (no WebUI SSE) |

---

