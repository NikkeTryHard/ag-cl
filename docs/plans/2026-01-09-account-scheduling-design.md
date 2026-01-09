# Account Scheduling Feature Design

**Created:** 2026-01-09
**Updated:** 2026-01-09
**Status:** Blocked - Requires prerequisite fixes

---

## Prerequisites (Must Fix First)

> ⚠️ **BLOCKING**: The following issues must be resolved before implementing scheduling modes.
> See: `docs/plans/2026-01-09-auto-refresh-investigation.md` for full details.

### 1. Quota Pool Mismatch (CRITICAL)

**Problem:** `quota-groups.ts` defines 3 pools but `quota-api.ts` only returns 2.

| Defined     | Tracked                  | Issue                  |
| ----------- | ------------------------ | ---------------------- |
| claude      | claudePool ✅            | OK                     |
| geminiPro   | geminiPool (COMBINED) ❌ | Pro + Flash averaged   |
| geminiFlash | (missing) ❌             | Not tracked separately |

**Fix Required:**

- Split `geminiPool` → `geminiProPool` + `geminiFlashPool`
- Update `AccountRefreshState` to track 3 pools
- Update TUI and CLI to display 3 pools

### 2. Stale Timer Detection (HIGH)

**Problem:** Cannot distinguish active timer from stale (previous cycle) timer.

**Fix Required:**

- Store `fetchedAt` timestamp with each `resetTime`
- Compare consecutive values to detect if timer is ticking
- If resetTime hasn't decreased → timer is stale

### 3. Clock-Aligned Refresh (ENHANCEMENT)

**Current:** 10-minute interval from startup
**Proposed:** 5-minute interval aligned to clock (:00, :05, :10, etc.)

---

## Overview

Add configurable account scheduling modes to control how accounts are selected for requests. This enables different strategies for quota utilization across multiple accounts.

## Motivation

Currently, the proxy uses "sticky" selection: stay on one account until rate-limited, then failover. This causes:

- Sequential account exhaustion (A exhausts → B exhausts → C exhausts)
- Staggered reset timers (A resets at T+5h, B at T+6h, C at T+7h)
- Suboptimal quota utilization when accounts could be recycled faster

## Scheduling Modes

| Mode               | Description                                    | Best For                             |
| ------------------ | ---------------------------------------------- | ------------------------------------ |
| `sticky`           | Stay on current account until rate-limited     | Cache hits, current default          |
| `refresh-priority` | Pick account with soonest `resetTime`          | Recycling refreshed accounts quickly |
| `drain-highest`    | Pick account with highest quota % (100% first) | Synchronized exhaustion/reset        |
| `round-robin`      | Simple rotation through available accounts     | Even distribution                    |

### Mode Details

#### sticky (default)

```
Current behavior:
1. Use current account
2. If rate-limited and wait < 2min: wait
3. Else: failover to next available
```

#### refresh-priority

```
1. Get cached quota states from auto-refresh scheduler
2. Sort accounts by resetTime ascending (soonest first)
3. Fresh accounts (no resetTime) sorted last
4. Pick first available (not rate-limited, not invalid)
```

#### drain-highest

```
1. Get cached quota states from auto-refresh scheduler
2. Sort accounts by quota % descending (100% → 0%)
3. Pick first available
4. Effect: Fresh accounts used first → all timers start → synchronized resets
```

#### round-robin

```
1. Maintain rotating index
2. Pick next available account from index
3. Advance index after each selection
```

## Configuration

### Settings (accounts.json)

```json
{
  "settings": {
    "schedulingMode": "sticky",
    "stickyMaxWaitMs": 120000
  }
}
```

### CLI Flag

```bash
npm start -- --scheduling drain-highest
```

### Environment Variable

```bash
SCHEDULING_MODE=refresh-priority npm start
```

### Priority

CLI flag > env var > settings.json > default (`sticky`)

### Hot Reload

Changes to settings.json take effect on next request without server restart.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AccountManager                        │
│  - getSchedulingMode(): reads from settings             │
│  - pickAccount(modelId): delegates to pickByMode()      │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌─────────────────┐    ┌──────────────────────────┐
│  selection.ts   │◄───│ auto-refresh-scheduler   │
│  pickByMode()   │    │ getAccountRefreshStates()│
│  - sticky       │    │ (cached quota data)      │
│  - refresh-pri  │    └──────────────────────────┘
│  - drain-high   │
│  - round-robin  │
└─────────────────┘
```

## Data Flow

1. **Request arrives** → AccountManager.pickAccount(modelId)
2. **Get mode** from settings (hot-reloaded)
3. **Get quota states** from auto-refresh scheduler (cached, updated every 10min)
4. **If no quota data**: trigger auto-refresh first, then proceed
5. **Call pickByMode()** with mode, accounts, quotaStates
6. **Log selection** with verbose details (mode, quota %, resetTime)
7. **Return account** for request

## Quota Data Source

Uses cached data from auto-refresh scheduler (after prerequisite fixes):

| Field                   | Source                   | Update Frequency |
| ----------------------- | ------------------------ | ---------------- |
| `claudePercentage`      | `fetchAccountCapacity()` | Every 5 min      |
| `geminiProPercentage`   | `fetchAccountCapacity()` | Every 5 min      |
| `geminiFlashPercentage` | `fetchAccountCapacity()` | Every 5 min      |
| `claudeResetTime`       | `fetchAccountCapacity()` | Every 5 min      |
| `geminiProResetTime`    | `fetchAccountCapacity()` | Every 5 min      |
| `geminiFlashResetTime`  | `fetchAccountCapacity()` | Every 5 min      |
| `fetchedAt`             | Local timestamp          | Every 5 min      |

**No API calls per-request** - selection uses cached data only.

**Stale Timer Detection:**

- Compare `resetTime` across consecutive fetches
- If time remaining hasn't decreased → timer is stale (not ticking)
- Stale + 100% quota → needs trigger to start fresh timer

## Files to Modify

| File                                      | Changes                                           |
| ----------------------------------------- | ------------------------------------------------- |
| `src/account-manager/types.ts`            | Add `SchedulingMode` type to `AccountSettings`    |
| `src/account-manager/selection.ts`        | Add `pickByMode()` and mode-specific selectors    |
| `src/account-manager/index.ts`            | Add `getSchedulingMode()`, update `pickAccount()` |
| `src/constants.ts`                        | Add `DEFAULT_SCHEDULING_MODE`                     |
| `src/cli/index.ts`                        | Add `--scheduling` flag                           |
| `src/cloudcode/auto-refresh-scheduler.ts` | Expose quota states Map for external access       |
| `src/tui/components/SettingsModal.tsx`    | Add scheduling mode selector                      |

## Logging

Verbose logging for all selection decisions:

```
[AccountManager] Mode: drain-highest | Selected: user@example.com | Quota: 85% | ResetTime: 2026-01-09T15:30:00Z
```

## Testing

| Test Type   | Coverage                                       |
| ----------- | ---------------------------------------------- |
| Unit        | Each mode selector function                    |
| Unit        | Mode priority (CLI > env > settings > default) |
| Unit        | Hot reload behavior                            |
| Integration | End-to-end with multiple accounts              |

## Edge Cases

| Case                      | Behavior                                    |
| ------------------------- | ------------------------------------------- |
| No quota data yet         | Trigger auto-refresh first, then select     |
| All accounts rate-limited | Wait for shortest reset (existing behavior) |
| Single account            | Mode irrelevant, use that account           |
| All accounts at 0%        | Use account with soonest resetTime          |

## Future Enhancements

- Per-model scheduling modes (different mode for Claude vs Gemini)
- Weighted accounts (some accounts have higher priority)
- Time-based mode switching (different mode during peak hours)

---

## Decisions Log

| Question               | Decision                              |
| ---------------------- | ------------------------------------- |
| Default mode           | `sticky` (preserves current behavior) |
| No quota data fallback | Auto-refresh first, then proceed      |
| TUI support            | Yes, in settings modal                |
| Logging verbosity      | Verbose (mode, quota %, resetTime)    |
| Hot reload             | Yes, changes apply on next request    |
