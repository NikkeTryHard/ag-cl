# TUI Auto-Refresh App Lifecycle Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix auto-refresh to run when TUI is open (app lifecycle), not when embedded server is started (server lifecycle).

**Architecture:** Move auto-refresh integration from `useServerState` hook to `App.tsx` component, create dedicated `useAutoRefresh` hook, enable immediate toggle effect.

**Tech Stack:** TypeScript, React/Ink, Vitest

**Research Summary:** No upstream or related project has this feature. Upstream PR #44 recommends cron for scheduling. Antigravity-Manager's "auto-refresh" is for fetching display data (read), not triggering quota reset (write). Our implementation is unique.

---

## Problem Statement

Current implementation has these issues:

1. **Wrong lifecycle binding:** Auto-refresh only starts when server starts (`s` key), stops when server stops
2. **Users who don't start server never get auto-refresh:** Many users open TUI just to monitor
3. **Setting change requires restart:** Toggling setting doesn't take immediate effect
4. **Confusing UX:** "Auto Refresh" setting does nothing until you press `s`

## Solution

Tie auto-refresh to **TUI app lifecycle**:

- Start when TUI opens (if enabled in settings)
- Stop when TUI closes
- Toggle takes effect immediately (start/stop scheduler on setting change)

---

## Task 1: Create useAutoRefresh Hook

**Files:**

- Create: `src/tui/hooks/useAutoRefresh.ts`

**Step 1: Create the hook**

```typescript
/**
 * useAutoRefresh Hook
 *
 * Manages the auto-refresh scheduler lifecycle based on settings.
 * Starts/stops the scheduler when the setting changes or on mount/unmount.
 */

import { useEffect, useRef, useCallback } from "react";
import { getAutoRefreshEnabled } from "../../settings/defaults.js";
import type { AccountSettings } from "../../account-manager/types.js";

export interface UseAutoRefreshOptions {
  /** Current settings object */
  settings: AccountSettings;
  /** Whether running in demo mode (skip actual scheduler) */
  demoMode?: boolean;
}

export interface UseAutoRefreshResult {
  /** Whether auto-refresh is currently running */
  isRunning: boolean;
  /** Manually start auto-refresh */
  start: () => Promise<void>;
  /** Manually stop auto-refresh */
  stop: () => void;
}

export function useAutoRefresh(options: UseAutoRefreshOptions): UseAutoRefreshResult {
  const { settings, demoMode = false } = options;
  const isRunningRef = useRef(false);

  const start = useCallback(async () => {
    if (demoMode || isRunningRef.current) return;

    const { startAutoRefresh, isAutoRefreshRunning } = await import("../../cloudcode/auto-refresh-scheduler.js");

    if (!isAutoRefreshRunning()) {
      await startAutoRefresh();
      isRunningRef.current = true;
    }
  }, [demoMode]);

  const stop = useCallback(() => {
    if (demoMode) return;

    void import("../../cloudcode/auto-refresh-scheduler.js").then(({ stopAutoRefresh, isAutoRefreshRunning }) => {
      if (isAutoRefreshRunning()) {
        stopAutoRefresh();
        isRunningRef.current = false;
      }
    });
  }, [demoMode]);

  // Start/stop based on setting changes
  useEffect(() => {
    const enabled = getAutoRefreshEnabled(settings);

    if (enabled) {
      void start();
    } else {
      stop();
    }

    // Cleanup on unmount
    return () => {
      stop();
    };
  }, [settings.autoRefreshEnabled, start, stop]);

  return {
    isRunning: isRunningRef.current,
    start,
    stop,
  };
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/tui/hooks/useAutoRefresh.ts
git commit -m "feat(tui): add useAutoRefresh hook for app-lifecycle auto-refresh"
```

---

## Task 2: Integrate useAutoRefresh into App.tsx

**Files:**

- Modify: `src/tui/app.tsx`

**Step 1: Import the hook**

Add import at top with other hook imports:

```typescript
import { useAutoRefresh } from "./hooks/useAutoRefresh.js";
```

**Step 2: Use the hook in App component**

Add after the `useSettings` hook call (around line 54):

```typescript
// Auto-refresh scheduler (tied to app lifecycle, not server)
useAutoRefresh({ settings, demoMode });
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/tui/app.tsx
git commit -m "feat(tui): integrate auto-refresh with app lifecycle"
```

---

## Task 3: Remove Auto-Refresh from useServerState

**Files:**

- Modify: `src/tui/hooks/useServerState.ts`

**Step 1: Remove auto-refresh import**

Remove `getAutoRefreshEnabled` from the imports line.

**Step 2: Remove auto-refresh from start() function**

Remove lines 105-110:

```typescript
// Start auto-refresh scheduler if enabled  <-- DELETE
const autoRefreshEnabled = getAutoRefreshEnabled(settings);  <-- DELETE
if (autoRefreshEnabled) {  <-- DELETE
  const { startAutoRefresh } = await import("../../cloudcode/auto-refresh-scheduler.js");  <-- DELETE
  void startAutoRefresh();  <-- DELETE
}  <-- DELETE
```

**Step 3: Remove auto-refresh from stop() function**

Remove lines 120-124:

```typescript
// Stop auto-refresh scheduler  <-- DELETE
const { stopAutoRefresh, isAutoRefreshRunning } = await import("../../cloudcode/auto-refresh-scheduler.js");  <-- DELETE
if (isAutoRefreshRunning()) {  <-- DELETE
  stopAutoRefresh();  <-- DELETE
}  <-- DELETE
```

**Step 4: Remove auto-refresh from cleanup useEffect**

Remove lines 154-159:

```typescript
// Stop auto-refresh on unmount  <-- DELETE
void import("../../cloudcode/auto-refresh-scheduler.js").then(({ stopAutoRefresh, isAutoRefreshRunning }) => {  <-- DELETE
  if (isAutoRefreshRunning()) {  <-- DELETE
    stopAutoRefresh();  <-- DELETE
  }  <-- DELETE
});  <-- DELETE
```

**Step 5: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/tui/hooks/useServerState.ts
git commit -m "refactor(tui): remove auto-refresh from server lifecycle"
```

---

## Task 4: Update useServerState Tests

**Files:**

- Modify: `tests/unit/tui/hooks/useServerState.test.ts`

**Step 1: Remove auto-refresh mock**

Remove lines 12-17:

```typescript
// Mock auto-refresh-scheduler  <-- DELETE
vi.mock("../../../../src/cloudcode/auto-refresh-scheduler.js", () => ({  <-- DELETE
  startAutoRefresh: vi.fn().mockResolvedValue(undefined),  <-- DELETE
  stopAutoRefresh: vi.fn(),  <-- DELETE
  isAutoRefreshRunning: vi.fn().mockReturnValue(false),  <-- DELETE
}));  <-- DELETE
```

**Step 2: Remove auto-refresh integration tests**

Remove the entire `describe("auto-refresh integration", ...)` block.

**Step 3: Remove autoRefreshEnabled from full settings test**

In the "accepts all settings options without error" test, remove `autoRefreshEnabled: true`.

**Step 4: Run tests**

Run: `npm test -- tests/unit/tui/hooks/useServerState.test.ts`
Expected: All tests pass (15 tests, down from 18)

**Step 5: Commit**

```bash
git add tests/unit/tui/hooks/useServerState.test.ts
git commit -m "test(tui): remove auto-refresh tests from useServerState"
```

---

## Task 5: Add Tests for useAutoRefresh Hook

**Files:**

- Create: `tests/unit/tui/hooks/useAutoRefresh.test.ts`

**Step 1: Create test file**

```typescript
/**
 * Tests for useAutoRefresh hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoRefresh } from "../../../../src/tui/hooks/useAutoRefresh.js";
import type { AccountSettings } from "../../../../src/account-manager/types.js";

// Mock auto-refresh-scheduler
vi.mock("../../../../src/cloudcode/auto-refresh-scheduler.js", () => ({
  startAutoRefresh: vi.fn().mockResolvedValue(undefined),
  stopAutoRefresh: vi.fn(),
  isAutoRefreshRunning: vi.fn().mockReturnValue(false),
}));

describe("useAutoRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("on mount", () => {
    it("starts scheduler when autoRefreshEnabled is true", async () => {
      const { startAutoRefresh } = await import("../../../../src/cloudcode/auto-refresh-scheduler.js");

      const settings: AccountSettings = { autoRefreshEnabled: true };
      renderHook(() => useAutoRefresh({ settings }));

      // Wait for async effect
      await vi.waitFor(() => {
        expect(startAutoRefresh).toHaveBeenCalled();
      });
    });

    it("does not start scheduler when autoRefreshEnabled is false", async () => {
      const { startAutoRefresh } = await import("../../../../src/cloudcode/auto-refresh-scheduler.js");
      vi.mocked(startAutoRefresh).mockClear();

      const settings: AccountSettings = { autoRefreshEnabled: false };
      renderHook(() => useAutoRefresh({ settings }));

      // Give time for any async operations
      await new Promise((r) => setTimeout(r, 50));

      expect(startAutoRefresh).not.toHaveBeenCalled();
    });

    it("does not start scheduler in demo mode", async () => {
      const { startAutoRefresh } = await import("../../../../src/cloudcode/auto-refresh-scheduler.js");
      vi.mocked(startAutoRefresh).mockClear();

      const settings: AccountSettings = { autoRefreshEnabled: true };
      renderHook(() => useAutoRefresh({ settings, demoMode: true }));

      await new Promise((r) => setTimeout(r, 50));

      expect(startAutoRefresh).not.toHaveBeenCalled();
    });
  });

  describe("on setting change", () => {
    it("starts scheduler when setting changes from false to true", async () => {
      const { startAutoRefresh } = await import("../../../../src/cloudcode/auto-refresh-scheduler.js");

      const settings: AccountSettings = { autoRefreshEnabled: false };
      const { rerender } = renderHook(({ settings }) => useAutoRefresh({ settings }), { initialProps: { settings } });

      vi.mocked(startAutoRefresh).mockClear();

      // Change setting to enabled
      rerender({ settings: { autoRefreshEnabled: true } });

      await vi.waitFor(() => {
        expect(startAutoRefresh).toHaveBeenCalled();
      });
    });

    it("stops scheduler when setting changes from true to false", async () => {
      const { stopAutoRefresh, isAutoRefreshRunning } = await import("../../../../src/cloudcode/auto-refresh-scheduler.js");
      vi.mocked(isAutoRefreshRunning).mockReturnValue(true);

      const settings: AccountSettings = { autoRefreshEnabled: true };
      const { rerender } = renderHook(({ settings }) => useAutoRefresh({ settings }), { initialProps: { settings } });

      vi.mocked(stopAutoRefresh).mockClear();

      // Change setting to disabled
      rerender({ settings: { autoRefreshEnabled: false } });

      await vi.waitFor(() => {
        expect(stopAutoRefresh).toHaveBeenCalled();
      });
    });
  });

  describe("on unmount", () => {
    it("stops scheduler on unmount", async () => {
      const { stopAutoRefresh, isAutoRefreshRunning } = await import("../../../../src/cloudcode/auto-refresh-scheduler.js");
      vi.mocked(isAutoRefreshRunning).mockReturnValue(true);

      const settings: AccountSettings = { autoRefreshEnabled: true };
      const { unmount } = renderHook(() => useAutoRefresh({ settings }));

      vi.mocked(stopAutoRefresh).mockClear();

      unmount();

      await vi.waitFor(() => {
        expect(stopAutoRefresh).toHaveBeenCalled();
      });
    });
  });

  describe("manual control", () => {
    it("provides start function", async () => {
      const settings: AccountSettings = { autoRefreshEnabled: false };
      const { result } = renderHook(() => useAutoRefresh({ settings }));

      expect(result.current.start).toBeDefined();
      expect(typeof result.current.start).toBe("function");
    });

    it("provides stop function", async () => {
      const settings: AccountSettings = { autoRefreshEnabled: false };
      const { result } = renderHook(() => useAutoRefresh({ settings }));

      expect(result.current.stop).toBeDefined();
      expect(typeof result.current.stop).toBe("function");
    });
  });
});
```

**Step 2: Run tests**

Run: `npm test -- tests/unit/tui/hooks/useAutoRefresh.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/unit/tui/hooks/useAutoRefresh.test.ts
git commit -m "test(tui): add tests for useAutoRefresh hook"
```

---

## Task 6: Manual Verification

**Step 1: Build and start TUI**

```bash
npm run build
npm run tui
```

**Step 2: Enable Auto Refresh**

Press `o` to open Settings, navigate to "Auto Refresh", press Enter to toggle `[on]`

**Step 3: Verify auto-refresh starts immediately**

Check terminal for `[AutoRefresh] Starting auto-refresh scheduler` message.
This should appear WITHOUT pressing `s` to start server.

**Step 4: Toggle setting off**

Navigate to "Auto Refresh", press Enter to toggle `[off]`
Verify `[AutoRefresh] Scheduler stopped` message appears immediately.

**Step 5: Exit TUI**

Press `q` to quit.
Verify scheduler stops on exit.

---

## Summary

| Task | Description                 | Files                                         |
| ---- | --------------------------- | --------------------------------------------- |
| 1    | Create useAutoRefresh hook  | `src/tui/hooks/useAutoRefresh.ts`             |
| 2    | Integrate with App.tsx      | `src/tui/app.tsx`                             |
| 3    | Remove from useServerState  | `src/tui/hooks/useServerState.ts`             |
| 4    | Update useServerState tests | `tests/unit/tui/hooks/useServerState.test.ts` |
| 5    | Add useAutoRefresh tests    | `tests/unit/tui/hooks/useAutoRefresh.test.ts` |
| 6    | Manual verification         | N/A                                           |

**Estimated commits:** 5

## Behavior Change

| Before                                       | After                                           |
| -------------------------------------------- | ----------------------------------------------- |
| Auto-refresh starts when server starts (`s`) | Auto-refresh starts when TUI opens (if enabled) |
| Auto-refresh stops when server stops         | Auto-refresh stops when TUI closes              |
| Setting change requires server restart       | Setting change takes effect immediately         |
| Must press `s` for feature to work           | Works immediately on TUI launch                 |
