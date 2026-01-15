## Feature Gap Analysis

### Features We Implemented (From Upstream)

| Feature                     | Upstream Source           | Our Implementation                     | Status      |
| --------------------------- | ------------------------- | -------------------------------------- | ----------- |
| Schema uppercase conversion | PR #83                    | `schema-sanitizer.ts` Phase 5          | ✅ Complete |
| OAuth timeout               | Issue #68                 | `fetchWithTimeout()` helper            | ✅ Complete |
| Optimistic 429 reset        | PR #72                    | `selection.ts` + buffer delay          | ✅ Complete |
| Daily endpoint fix          | commit 5f6ce1b            | `constants.ts`                         | ✅ Complete |
| Enum stringification        | Issue #70                 | `schema-sanitizer.ts` Phase 4b         | ✅ Complete |
| System prompt filtering     | Issue #76, commit 4c5236d | `request-builder.ts` [ignore] tags     | ✅ Complete |
| 5xx fallback                | PR #90                    | `fallback-utils.ts` + handlers         | ✅ Complete |
| Empty response retry        | PR #64                    | `streaming-handler.ts`                 | ✅ Complete |
| Quota reset trigger         | PR #44                    | `/trigger-reset` endpoint              | ✅ Complete |
| --no-browser OAuth          | PR #50                    | `npm run accounts:add -- --no-browser` | ✅ Complete |

### Features We Have That Upstream Lacks

| Feature                  | Our Implementation                | Notes                |
| ------------------------ | --------------------------------- | -------------------- |
| TypeScript codebase      | Full TypeScript                   | Type safety          |
| Comprehensive test suite | Unit, fuzz, contract, chaos, etc. | 1,767 tests          |
| SQLite quota snapshots   | `quota-storage.ts`                | Persistent storage   |
| Burn rate calculation    | `burn-rate.ts`                    | Usage analytics      |
| TUI interface            | React/Ink                         | Alternative to WebUI |
| Discriminated unions     | `FallbackDecision` type           | Better type safety   |

### Features Upstream Has That We Skip

| Feature                          | Reason                      |
| -------------------------------- | --------------------------- |
| Web UI Dashboard                 | We have TUI alternative     |
| Alpine.js + TailwindCSS frontend | Not needed                  |
| Native module auto-rebuild       | Not applicable (TypeScript) |
| Usage history JSON               | We use SQLite               |
| NativeModuleError class          | Not applicable (TypeScript) |

---

## Code Structure Comparison

### Known Bugs & Workarounds

| Bug                          | Upstream Status               | Our Status             | Workaround                       |
| ---------------------------- | ----------------------------- | ---------------------- | -------------------------------- |
| stopReason override (PR #96) | Fixed in commit 325acdb       | **IMPLEMENTED** ✅     | Initialize `stopReason = null`   |
| Image interleaving (PR #79)  | Closed without fix            | Same bug likely exists | Avoid multiple images in results |
| Tool concurrency (Issue #91) | Open                          | Monitoring             | Use sequential tool calls        |
| 403 PERMISSION_DENIED (#80)  | Account-specific              | N/A                    | Contact Google support           |
| Cross-model signature (#42)  | Closed (manual fix suggested) | **IMPLEMENTED** ✅     | `stripInvalidThinkingBlocks()`   |

### File Structure

| Upstream (JavaScript)              | Our Project (TypeScript)           | Notes               |
| ---------------------------------- | ---------------------------------- | ------------------- |
| `src/cloudcode/sse-streamer.js`    | `src/cloudcode/sse-streamer.ts`    | Same structure      |
| `src/cloudcode/session-manager.js` | `src/cloudcode/session-manager.ts` | Same logic          |
| `src/format/signature-cache.js`    | `src/format/signature-cache.ts`    | Same API            |
| `src/format/schema-sanitizer.js`   | `src/format/schema-sanitizer.ts`   | Same phases         |
| `src/format/thinking-utils.js`     | `src/format/thinking-utils.ts`     | Same functions      |
| `src/errors.js`                    | `src/errors.ts`                    | Same error classes  |
| `src/fallback-config.js`           | `src/cloudcode/fallback-utils.ts`  | Different approach  |
| `src/webui/index.js`               | N/A                                | We have TUI instead |

### Error Classes Comparison

| Error Class          | Upstream | Us  | Notes                          |
| -------------------- | -------- | --- | ------------------------------ |
| `AntigravityError`   | ✅       | ✅  | Base class                     |
| `RateLimitError`     | ✅       | ✅  | Same structure                 |
| `AuthError`          | ✅       | ✅  | Same structure                 |
| `NoAccountsError`    | ✅       | ✅  | Same structure                 |
| `MaxRetriesError`    | ✅       | ✅  | Same structure                 |
| `ApiError`           | ✅       | ✅  | Same structure                 |
| `EmptyResponseError` | ✅       | ✅  | Same structure                 |
| `NativeModuleError`  | ✅       | ❌  | Not needed (no native modules) |

### Key Functions Comparison

| Function                       | Upstream | Us  | Notes              |
| ------------------------------ | -------- | --- | ------------------ |
| `deriveSessionId()`            | ✅       | ✅  | Same logic         |
| `cacheSignature()`             | ✅       | ✅  | Same API           |
| `getCachedSignature()`         | ✅       | ✅  | Same API           |
| `cacheThinkingSignature()`     | ✅       | ✅  | Same API           |
| `getCachedSignatureFamily()`   | ✅       | ✅  | Same API           |
| `stripInvalidThinkingBlocks()` | ✅       | ✅  | Same logic         |
| `closeToolLoopForThinking()`   | ✅       | ✅  | Same logic         |
| `parseResetTime()`             | ✅       | ✅  | Same parsing logic |
| `isRateLimitError()`           | ✅       | ✅  | Same detection     |
| `isAuthError()`                | ✅       | ✅  | Same detection     |
| `isEmptyResponseError()`       | ✅       | ✅  | Same detection     |

### Constants Comparison

| Constant                     | Upstream        | Us                   | Notes                    |
| ---------------------------- | --------------- | -------------------- | ------------------------ |
| `DEFAULT_COOLDOWN_MS`        | 10s (config)    | 10s                  | ✅ Match                 |
| `MAX_RETRIES`                | 5 (config)      | 5                    | ✅ Match                 |
| `MAX_EMPTY_RESPONSE_RETRIES` | 2               | 2 (env configurable) | ✅ Match (we add config) |
| `MAX_WAIT_BEFORE_ERROR_MS`   | 120000 (config) | 120000               | ✅ Match                 |
| `TOKEN_REFRESH_INTERVAL_MS`  | 5min (config)   | 5min                 | ✅ Match                 |
| `GEMINI_SIGNATURE_CACHE_TTL` | 2 hours         | 2 hours              | ✅ Match                 |
| `MIN_SIGNATURE_LENGTH`       | 50              | 50                   | ✅ Match                 |
| `GEMINI_MAX_OUTPUT_TOKENS`   | 16384           | 16384                | ✅ Match                 |
| `RATE_LIMIT_BUFFER_MS`       | N/A             | 500                  | We added this            |
| `RETRY_DELAY_MS`             | N/A             | 1000                 | We extracted constant    |
| `OAUTH_FETCH_TIMEOUT_MS`     | N/A             | 15000                | We added timeout         |
| `AUTO_REFRESH_INTERVAL_MS`   | N/A             | 5 hours              | We added auto-refresh    |

### Features Unique to Us

| Feature                    | Implementation              | Notes                          |
| -------------------------- | --------------------------- | ------------------------------ |
| Scheduling modes           | `VALID_SCHEDULING_MODES`    | sticky, refresh-priority, etc. |
| SQLite quota storage       | `quota-storage.ts`          | Persistent snapshots           |
| Burn rate calculation      | `burn-rate.ts`              | Usage analytics                |
| TUI interface              | React/Ink                   | Alternative to WebUI           |
| TypeScript types           | Full type safety            | Better DX                      |
| Comprehensive test suite   | 1,767 tests                 | Unit, fuzz, contract, etc.     |
| Discriminated unions       | `FallbackDecision` type     | Type-safe decisions            |
| Configurable empty retries | `MAX_EMPTY_RETRIES` env var | Flexibility                    |

---

