## New Open PRs

### PR #101: WebUI Comprehensive Enhancements (NEW - OPEN)

**Status**: Open, not merged yet

**Problem**: WebUI needs improved responsive design, better quota display logic, and navigation state persistence.

**Key Changes**:

1. **Weighted Priority System for Quota Display**:
   - Shows "Best Available" model quota based on tier (Opus > Sonnet > Pro > Flash)
   - Prevents misleading values (e.g., showing 100% Flash while Opus is exhausted)
   - Shows 0% when high-tier is exhausted instead of falling back to full low-tier

2. **Responsive Design**:
   - Collapsible sidebar with backdrop overlay for mobile
   - Auto-sync logic for sidebar (closes on mobile resize, opens on desktop)
   - 5-column grid on desktop, 2-column on mobile

3. **Navigation & State**:
   - Hash-based routing to persist tab state on reload
   - Local storage caching with TTL expiration
   - Sortable tables (Name, Family, Quota)

4. **Bug Fixes**:
   - Removed ~600 lines of duplicated HTML causing `ReferenceError`
   - Enhanced chart memory leak prevention
   - Improved model identification logic

**Files Changed**: 13 files (660 additions, 249 deletions)

**Our Assessment**: WebUI only - not applicable to us (we have TUI).

---

### PR #99: Restore Default Claude CLI (NEW - OPEN)

**Status**: Open, not merged yet

**Problem**: Users need a way to toggle between proxied and direct Claude API without manual config editing.

**Solution**:

- New `POST /api/claude/config/restore` endpoint
- New `replaceClaudeConfig()` function (overwrites vs merge)
- "Restore Default" button in WebUI settings
- Removes proxy env vars: `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`, etc.

**Our Assessment**: WebUI only - not applicable to us (we have TUI).

---

## Changelog

### 2026-01-11 (Final Investigation Summary)

**Files Compared**: 40+ source files across all modules
**Feature Parity**: ✅ Complete - all critical features match

**Unique to ag-cl** (not in upstream):
| Category | Count | Key Items |
|----------|-------|-----------|
| Modules | 7 | quota-api, quota-storage, burn-rate, fallback-utils, quota-groups, auto-refresh-scheduler, quota-reset-trigger |
| Functions | 8+ | `optimisticReset()`, `pickByMode()`, `pickRefreshPriority()`, `triggerQuotaReset()`, `validateRefreshToken()`, `fetchWithTimeout()` |
| Constants | 9 | `AUTO_REFRESH_INTERVAL_MS`, `RATE_LIMIT_BUFFER_MS`, `VALID_SCHEDULING_MODES`, etc. |
| CLI Commands | 2 | `init` (setup wizard), `trigger-reset` (quota reset) |
| TypeScript types | 400+ lines | `types.ts`, interfaces across all modules |
| Tests | 1,616 cases | Unit, fuzz, contract, chaos, security, load (vs ~50 in upstream) |

**Unique to Upstream** (intentionally skipped):
| Feature | Reason |
|---------|--------|
| WebUI Dashboard (6,464 lines) | We have TUI alternative |
| Native module auto-rebuild | Not needed for TypeScript |
| Usage history JSON | We use SQLite snapshots |
| `async-mutex` dependency | Listed but unused |

**Adoption Candidates** (low priority):

1. ±25% jitter in backoff (`retry.js`)
2. Log history with EventEmitter (`logger.js`)
3. Proactive token refresh (from closed PR #95)
4. Error sanitization (from closed PR #95)

**Key Commits Analyzed**:

- `325acdb` - stopReason fix ✅ (implemented, tested)
- `1045ebe` - PR #99 merge (WebUI only)
- `5879022` - Health check optimization (WebUI only)

### 2026-01-11 (v2.0.1 Release)

- **stopReason Bug Fixed** (commit 325acdb): `stopReason = null` + `&& !stopReason` check
- Test added: `preserves tool_use stop_reason when finishReason is STOP`
- PR #94 merged (WebUI health checks - not applicable)
- PR #99 merged (WebUI restore default - not applicable)

### 2026-01-10 (Deep Investigation)

- Analyzed 50+ closed issues for patterns
- Added Known Limitations: WebSearch, Skills, Images in tool_result, Bans, Proto errors
- Added Community Insights: VPN location, 1M context, export workarounds
- Documented Historical Merged PRs (#1-#55)
- Added Constants Comparison (all values match)
- Confirmed implementations: 5xx fallback, schema uppercase, OAuth timeout, optimistic reset

### 2026-01-10 (PR Analysis)

- PR #96: stopReason fix closed → maintainer fixed directly in 325acdb
- PR #95: Security features closed without merge (patterns documented for reference)
- PR #79: Image interleaving bug closed without fix (monitoring)
- Issue #91: Tool concurrency 400 errors (suspected causes documented)
- Issue #68: First request hang (IMPLEMENTED via optimistic reset)

### 2026-01-07

- Initial report generation

---
---

