# TUI Application Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform ag-cl from a CLI tool into a TUI application with minimal dashboard, command palette, and modal system.

**Architecture:** Ink (React for CLI) renders a Dashboard component as the root. CommandPalette overlays on Ctrl+P with fuzzy search. Modals overlay for actions. State managed via React hooks connecting to existing modules.

**Tech Stack:** Ink 5.x, ink-text-input, fuzzysort, existing Express server, existing account-manager and quota modules.

---

## Phase 1: Core Infrastructure

### Task 1: Install TUI Dependencies

**Files:**

- Modify: `package.json`

**Step 1: Install Ink and related packages**

Run:

```bash
npm install ink@^5.0.0 ink-text-input@^6.0.0 ink-spinner@^5.0.0 fuzzysort@^3.0.0
npm install -D @types/fuzzysort
```

**Step 2: Verify installation**

Run: `npm ls ink`
Expected: Shows ink@5.x.x installed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add TUI dependencies (ink, fuzzysort)"
```

---

### Task 2: Create TUI Directory Structure

**Files:**

- Create: `src/tui/app.tsx`
- Create: `src/tui/components/index.ts`
- Create: `src/tui/hooks/index.ts`
- Create: `src/tui/types.ts`

**Step 1: Create TUI types**

Create `src/tui/types.ts`:

```typescript
/**
 * TUI Type Definitions
 */

/** Server running state */
export interface ServerState {
  running: boolean;
  port: number;
}

/** Aggregated capacity for a model family */
export interface AggregatedCapacity {
  family: "claude" | "gemini";
  totalPercentage: number;
  accountCount: number;
  status: "burning" | "stable" | "recovering" | "exhausted" | "calculating";
  hoursToExhaustion: number | null;
}

/** UI modal state */
export interface ModalState {
  type: "none" | "command-palette" | "add-account" | "remove-account" | "logs" | "settings";
}

/** Command for command palette */
export interface Command {
  id: string;
  label: string;
  category: "server" | "accounts" | "view" | "settings";
  action: () => void | Promise<void>;
}
```

**Step 2: Create component barrel export**

Create `src/tui/components/index.ts`:

```typescript
/**
 * TUI Components barrel export
 */

// Components will be exported here as they are created
export {};
```

**Step 3: Create hooks barrel export**

Create `src/tui/hooks/index.ts`:

```typescript
/**
 * TUI Hooks barrel export
 */

// Hooks will be exported here as they are created
export {};
```

**Step 4: Create minimal app entry**

Create `src/tui/app.tsx`:

```typescript
/**
 * TUI Application Entry Point
 */

import React from "react";
import { render, Text } from "ink";

function App(): React.ReactElement {
  return <Text>ag-cl TUI - Loading...</Text>;
}

export function startTUI(): void {
  render(<App />);
}
```

**Step 5: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add src/tui/
git commit -m "feat(tui): add directory structure and types"
```

---

### Task 3: Create TUI Entry Point in CLI

**Files:**

- Modify: `src/cli/index.ts`
- Create: `tests/unit/tui/app.test.tsx`

**Step 1: Write test for TUI launch**

Create `tests/unit/tui/app.test.tsx`:

```typescript
/**
 * TUI App Tests
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";

// We'll test the App component once it's more complete
// For now, verify ink-testing-library works
describe("TUI App", () => {
  it("renders text with ink-testing-library", () => {
    const { lastFrame } = render(<Text>Test</Text>);
    expect(lastFrame()).toContain("Test");
  });
});
```

**Step 2: Install ink-testing-library**

Run: `npm install -D ink-testing-library`

**Step 3: Run test to verify setup**

Run: `npm test -- tests/unit/tui/app.test.tsx --no-coverage`
Expected: PASS

**Step 4: Modify CLI to launch TUI by default**

Modify `src/cli/index.ts`, change the default command from "start" to a new TUI command:

Find:

```typescript
// Start command (default)
program.command("start", { isDefault: true });
```

Replace with:

```typescript
// TUI command (default) - launches interactive dashboard
program
  .command("tui", { isDefault: true })
  .description("Launch interactive TUI dashboard")
  .action(async () => {
    const { startTUI } = await import("../tui/app.js");
    startTUI();
  });

// Start command - headless server mode
program.command("start");
```

**Step 5: Verify build**

Run: `npm run build`
Expected: No errors

**Step 6: Commit**

```bash
git add src/cli/index.ts tests/unit/tui/ package.json package-lock.json
git commit -m "feat(tui): add TUI entry point to CLI"
```

---

## Phase 2: Dashboard Component

### Task 4: Create CapacityBar Component

**Files:**

- Create: `src/tui/components/CapacityBar.tsx`
- Create: `tests/unit/tui/components/CapacityBar.test.tsx`

**Step 1: Write failing test**

Create `tests/unit/tui/components/CapacityBar.test.tsx`:

```typescript
/**
 * CapacityBar Component Tests
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { CapacityBar } from "../../../../src/tui/components/CapacityBar.js";

describe("CapacityBar", () => {
  it("renders family name and percentage", () => {
    const { lastFrame } = render(
      <CapacityBar
        family="claude"
        percentage={75}
        status="stable"
        hoursToExhaustion={null}
      />
    );

    const output = lastFrame();
    expect(output).toContain("Claude");
    expect(output).toContain("75%");
  });

  it("shows time to exhaustion when burning", () => {
    const { lastFrame } = render(
      <CapacityBar
        family="claude"
        percentage={50}
        status="burning"
        hoursToExhaustion={4.5}
      />
    );

    const output = lastFrame();
    expect(output).toContain("~4h 30m");
  });

  it("shows stable when not burning", () => {
    const { lastFrame } = render(
      <CapacityBar
        family="gemini"
        percentage={100}
        status="stable"
        hoursToExhaustion={null}
      />
    );

    const output = lastFrame();
    expect(output).toContain("stable");
  });

  it("renders progress bar characters", () => {
    const { lastFrame } = render(
      <CapacityBar
        family="claude"
        percentage={50}
        status="stable"
        hoursToExhaustion={null}
      />
    );

    const output = lastFrame();
    // Should contain filled and empty bar characters
    expect(output).toMatch(/[█▓░]/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/components/CapacityBar.test.tsx --no-coverage`
Expected: FAIL with "Cannot find module"

**Step 3: Implement CapacityBar**

Create `src/tui/components/CapacityBar.tsx`:

```typescript
/**
 * CapacityBar Component
 *
 * Displays a progress bar for model family capacity.
 */

import React from "react";
import { Box, Text } from "ink";

interface CapacityBarProps {
  family: "claude" | "gemini";
  percentage: number;
  status: "burning" | "stable" | "recovering" | "exhausted" | "calculating";
  hoursToExhaustion: number | null;
}

const BAR_WIDTH = 20;

function formatExhaustionTime(hours: number): string {
  if (hours >= 1) {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    if (minutes > 0) {
      return `~${wholeHours}h ${minutes}m`;
    }
    return `~${wholeHours}h`;
  }
  return `~${Math.round(hours * 60)}m`;
}

function getStatusText(status: string, hoursToExhaustion: number | null): string {
  if (status === "burning" && hoursToExhaustion !== null) {
    return formatExhaustionTime(hoursToExhaustion);
  }
  return status;
}

function getStatusColor(status: string, percentage: number): string {
  if (status === "exhausted" || percentage < 20) return "red";
  if (status === "burning" || percentage < 50) return "yellow";
  return "green";
}

export function CapacityBar({ family, percentage, status, hoursToExhaustion }: CapacityBarProps): React.ReactElement {
  const filledCount = Math.round((percentage / 100) * BAR_WIDTH);
  const emptyCount = BAR_WIDTH - filledCount;

  const filled = "█".repeat(Math.min(filledCount, BAR_WIDTH));
  const empty = "░".repeat(Math.max(0, emptyCount));

  const familyName = family.charAt(0).toUpperCase() + family.slice(1);
  const statusText = getStatusText(status, hoursToExhaustion);
  const color = getStatusColor(status, percentage);

  return (
    <Box>
      <Text>  </Text>
      <Text>{familyName.padEnd(8)}</Text>
      <Text color={color}>[{filled}{empty}]</Text>
      <Text>  </Text>
      <Text>{String(percentage).padStart(3)}%</Text>
      <Text>  </Text>
      <Text dimColor>{statusText}</Text>
    </Box>
  );
}
```

**Step 4: Export from barrel**

Update `src/tui/components/index.ts`:

```typescript
/**
 * TUI Components barrel export
 */

export { CapacityBar } from "./CapacityBar.js";
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/components/CapacityBar.test.tsx --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tui/components/ tests/unit/tui/components/
git commit -m "feat(tui): add CapacityBar component"
```

---

### Task 5: Create StatusIndicator Component

**Files:**

- Create: `src/tui/components/StatusIndicator.tsx`
- Create: `tests/unit/tui/components/StatusIndicator.test.tsx`

**Step 1: Write failing test**

Create `tests/unit/tui/components/StatusIndicator.test.tsx`:

```typescript
/**
 * StatusIndicator Component Tests
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { StatusIndicator } from "../../../../src/tui/components/StatusIndicator.js";

describe("StatusIndicator", () => {
  it("shows running state with port", () => {
    const { lastFrame } = render(
      <StatusIndicator running={true} port={8080} />
    );

    const output = lastFrame();
    expect(output).toContain("8080");
    expect(output).toContain("●");
  });

  it("shows stopped state", () => {
    const { lastFrame } = render(
      <StatusIndicator running={false} port={8080} />
    );

    const output = lastFrame();
    expect(output).toContain("stopped");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/components/StatusIndicator.test.tsx --no-coverage`
Expected: FAIL

**Step 3: Implement StatusIndicator**

Create `src/tui/components/StatusIndicator.tsx`:

```typescript
/**
 * StatusIndicator Component
 *
 * Shows server running status with colored indicator.
 */

import React from "react";
import { Text } from "ink";

interface StatusIndicatorProps {
  running: boolean;
  port: number;
}

export function StatusIndicator({ running, port }: StatusIndicatorProps): React.ReactElement {
  if (running) {
    return (
      <Text>
        <Text color="green">●</Text>
        <Text> :{port}</Text>
      </Text>
    );
  }

  return <Text dimColor>stopped</Text>;
}
```

**Step 4: Export from barrel**

Update `src/tui/components/index.ts`:

```typescript
/**
 * TUI Components barrel export
 */

export { CapacityBar } from "./CapacityBar.js";
export { StatusIndicator } from "./StatusIndicator.js";
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/components/StatusIndicator.test.tsx --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tui/components/ tests/unit/tui/components/
git commit -m "feat(tui): add StatusIndicator component"
```

---

### Task 6: Create Dashboard Component

**Files:**

- Create: `src/tui/components/Dashboard.tsx`
- Create: `tests/unit/tui/components/Dashboard.test.tsx`

**Step 1: Write failing test**

Create `tests/unit/tui/components/Dashboard.test.tsx`:

```typescript
/**
 * Dashboard Component Tests
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Dashboard } from "../../../../src/tui/components/Dashboard.js";

describe("Dashboard", () => {
  it("renders header with version", () => {
    const { lastFrame } = render(
      <Dashboard
        version="1.0.0"
        serverState={{ running: true, port: 8080 }}
        claudeCapacity={{ family: "claude", totalPercentage: 100, accountCount: 2, status: "stable", hoursToExhaustion: null }}
        geminiCapacity={{ family: "gemini", totalPercentage: 200, accountCount: 2, status: "stable", hoursToExhaustion: null }}
        accountCount={2}
      />
    );

    const output = lastFrame();
    expect(output).toContain("ag-cl");
    expect(output).toContain("1.0.0");
  });

  it("renders server status", () => {
    const { lastFrame } = render(
      <Dashboard
        version="1.0.0"
        serverState={{ running: true, port: 8080 }}
        claudeCapacity={{ family: "claude", totalPercentage: 100, accountCount: 2, status: "stable", hoursToExhaustion: null }}
        geminiCapacity={{ family: "gemini", totalPercentage: 200, accountCount: 2, status: "stable", hoursToExhaustion: null }}
        accountCount={2}
      />
    );

    const output = lastFrame();
    expect(output).toContain("8080");
  });

  it("renders both capacity bars", () => {
    const { lastFrame } = render(
      <Dashboard
        version="1.0.0"
        serverState={{ running: false, port: 8080 }}
        claudeCapacity={{ family: "claude", totalPercentage: 75, accountCount: 2, status: "burning", hoursToExhaustion: 5 }}
        geminiCapacity={{ family: "gemini", totalPercentage: 150, accountCount: 2, status: "stable", hoursToExhaustion: null }}
        accountCount={2}
      />
    );

    const output = lastFrame();
    expect(output).toContain("Claude");
    expect(output).toContain("Gemini");
  });

  it("renders account count", () => {
    const { lastFrame } = render(
      <Dashboard
        version="1.0.0"
        serverState={{ running: true, port: 8080 }}
        claudeCapacity={{ family: "claude", totalPercentage: 100, accountCount: 5, status: "stable", hoursToExhaustion: null }}
        geminiCapacity={{ family: "gemini", totalPercentage: 100, accountCount: 5, status: "stable", hoursToExhaustion: null }}
        accountCount={5}
      />
    );

    const output = lastFrame();
    expect(output).toContain("5");
    expect(output).toContain("account");
  });

  it("renders hotkey hints", () => {
    const { lastFrame } = render(
      <Dashboard
        version="1.0.0"
        serverState={{ running: true, port: 8080 }}
        claudeCapacity={{ family: "claude", totalPercentage: 100, accountCount: 1, status: "stable", hoursToExhaustion: null }}
        geminiCapacity={{ family: "gemini", totalPercentage: 100, accountCount: 1, status: "stable", hoursToExhaustion: null }}
        accountCount={1}
      />
    );

    const output = lastFrame();
    expect(output).toContain("[a]");
    expect(output).toContain("[q]");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/components/Dashboard.test.tsx --no-coverage`
Expected: FAIL

**Step 3: Implement Dashboard**

Create `src/tui/components/Dashboard.tsx`:

```typescript
/**
 * Dashboard Component
 *
 * Main TUI view showing server status, capacity bars, and hotkey hints.
 */

import React from "react";
import { Box, Text } from "ink";
import { CapacityBar } from "./CapacityBar.js";
import { StatusIndicator } from "./StatusIndicator.js";
import type { ServerState, AggregatedCapacity } from "../types.js";

interface DashboardProps {
  version: string;
  serverState: ServerState;
  claudeCapacity: AggregatedCapacity;
  geminiCapacity: AggregatedCapacity;
  accountCount: number;
}

export function Dashboard({
  version,
  serverState,
  claudeCapacity,
  geminiCapacity,
  accountCount,
}: DashboardProps): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold>ag-cl v{version}</Text>
        <StatusIndicator running={serverState.running} port={serverState.port} />
      </Box>

      {/* Spacer */}
      <Text> </Text>

      {/* Capacity Bars */}
      <CapacityBar
        family={claudeCapacity.family}
        percentage={claudeCapacity.totalPercentage}
        status={claudeCapacity.status}
        hoursToExhaustion={claudeCapacity.hoursToExhaustion}
      />
      <CapacityBar
        family={geminiCapacity.family}
        percentage={geminiCapacity.totalPercentage}
        status={geminiCapacity.status}
        hoursToExhaustion={geminiCapacity.hoursToExhaustion}
      />

      {/* Spacer */}
      <Text> </Text>

      {/* Account count */}
      <Text dimColor>
        {"  "}{accountCount} account{accountCount !== 1 ? "s" : ""}
      </Text>

      {/* Spacer */}
      <Text> </Text>

      {/* Hotkey hints */}
      <Box>
        <Text dimColor>  [a]ccounts  [s]erver  [l]ogs  [q]uit</Text>
      </Box>
    </Box>
  );
}
```

**Step 4: Export from barrel**

Update `src/tui/components/index.ts`:

```typescript
/**
 * TUI Components barrel export
 */

export { CapacityBar } from "./CapacityBar.js";
export { StatusIndicator } from "./StatusIndicator.js";
export { Dashboard } from "./Dashboard.js";
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/components/Dashboard.test.tsx --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tui/components/ tests/unit/tui/components/
git commit -m "feat(tui): add Dashboard component"
```

---

## Phase 3: State Hooks

### Task 7: Create useCapacity Hook

**Files:**

- Create: `src/tui/hooks/useCapacity.ts`
- Create: `tests/unit/tui/hooks/useCapacity.test.ts`

**Step 1: Write failing test**

Create `tests/unit/tui/hooks/useCapacity.test.ts`:

```typescript
/**
 * useCapacity Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCapacity } from "../../../../src/tui/hooks/useCapacity.js";

// Mock the dependencies
vi.mock("../../../../src/account-manager/storage.js", () => ({
  loadAccounts: vi.fn().mockResolvedValue({
    accounts: [{ email: "test@example.com", source: "oauth", refreshToken: "token" }],
    settings: {},
    activeIndex: 0,
  }),
}));

vi.mock("../../../../src/auth/oauth.js", () => ({
  refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: "access", expiresIn: 3600 }),
}));

vi.mock("../../../../src/cloudcode/quota-api.js", () => ({
  fetchAccountCapacity: vi.fn().mockResolvedValue({
    email: "test@example.com",
    tier: "PRO",
    claudePool: { models: [], aggregatedPercentage: 75, earliestReset: null },
    geminiPool: { models: [], aggregatedPercentage: 100, earliestReset: null },
    projectId: null,
    lastUpdated: Date.now(),
    isForbidden: false,
  }),
}));

vi.mock("../../../../src/cloudcode/burn-rate.js", () => ({
  calculateBurnRate: vi.fn().mockReturnValue({
    ratePerHour: null,
    hoursToExhaustion: null,
    status: "stable",
  }),
}));

describe("useCapacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    const { result } = renderHook(() => useCapacity());
    expect(result.current.loading).toBe(true);
  });

  it("returns aggregated capacity after loading", async () => {
    const { result } = renderHook(() => useCapacity());

    // Wait for async loading
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.claudeCapacity.totalPercentage).toBe(75);
    expect(result.current.geminiCapacity.totalPercentage).toBe(100);
    expect(result.current.accountCount).toBe(1);
  });

  it("provides refresh function", async () => {
    const { result } = renderHook(() => useCapacity());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.refresh).toBe("function");
  });
});
```

**Step 2: Install testing-library/react**

Run: `npm install -D @testing-library/react`

**Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/hooks/useCapacity.test.ts --no-coverage`
Expected: FAIL

**Step 4: Implement useCapacity**

Create `src/tui/hooks/useCapacity.ts`:

```typescript
/**
 * useCapacity Hook
 *
 * Fetches and aggregates capacity data from all accounts.
 */

import { useState, useEffect, useCallback } from "react";
import { ACCOUNT_CONFIG_PATH } from "../../constants.js";
import { loadAccounts } from "../../account-manager/storage.js";
import { refreshAccessToken } from "../../auth/oauth.js";
import { fetchAccountCapacity, type AccountCapacity } from "../../cloudcode/quota-api.js";
import { calculateBurnRate, type BurnRateInfo } from "../../cloudcode/burn-rate.js";
import type { AggregatedCapacity } from "../types.js";

interface UseCapacityResult {
  loading: boolean;
  error: string | null;
  claudeCapacity: AggregatedCapacity;
  geminiCapacity: AggregatedCapacity;
  accountCount: number;
  refresh: () => Promise<void>;
}

const defaultCapacity: AggregatedCapacity = {
  family: "claude",
  totalPercentage: 0,
  accountCount: 0,
  status: "calculating",
  hoursToExhaustion: null,
};

export function useCapacity(): UseCapacityResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claudeCapacity, setClaudeCapacity] = useState<AggregatedCapacity>({ ...defaultCapacity, family: "claude" });
  const [geminiCapacity, setGeminiCapacity] = useState<AggregatedCapacity>({ ...defaultCapacity, family: "gemini" });
  const [accountCount, setAccountCount] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { accounts } = await loadAccounts(ACCOUNT_CONFIG_PATH);
      const oauthAccounts = accounts.filter((a) => a.source === "oauth" && a.refreshToken);

      setAccountCount(oauthAccounts.length);

      if (oauthAccounts.length === 0) {
        setClaudeCapacity({ ...defaultCapacity, family: "claude" });
        setGeminiCapacity({ ...defaultCapacity, family: "gemini" });
        setLoading(false);
        return;
      }

      let totalClaude = 0;
      let totalGemini = 0;
      let claudeBurnRates: BurnRateInfo[] = [];
      let geminiBurnRates: BurnRateInfo[] = [];

      for (const account of oauthAccounts) {
        try {
          const { accessToken } = await refreshAccessToken(account.refreshToken!);
          const capacity = await fetchAccountCapacity(accessToken, account.email);

          totalClaude += capacity.claudePool.aggregatedPercentage;
          totalGemini += capacity.geminiPool.aggregatedPercentage;

          claudeBurnRates.push(calculateBurnRate(account.email, "claude", capacity.claudePool.aggregatedPercentage, capacity.claudePool.earliestReset));
          geminiBurnRates.push(calculateBurnRate(account.email, "gemini", capacity.geminiPool.aggregatedPercentage, capacity.geminiPool.earliestReset));
        } catch {
          // Skip failed accounts
        }
      }

      // Determine overall status from burn rates
      const getOverallStatus = (rates: BurnRateInfo[]): AggregatedCapacity["status"] => {
        if (rates.some((r) => r.status === "exhausted")) return "exhausted";
        if (rates.some((r) => r.status === "burning")) return "burning";
        if (rates.some((r) => r.status === "recovering")) return "recovering";
        if (rates.every((r) => r.status === "stable")) return "stable";
        return "calculating";
      };

      // Calculate combined hours to exhaustion
      const getHoursToExhaustion = (rates: BurnRateInfo[], totalPct: number): number | null => {
        const burningRates = rates.filter((r) => r.status === "burning" && r.ratePerHour && r.ratePerHour > 0);
        if (burningRates.length === 0) return null;
        const totalRate = burningRates.reduce((sum, r) => sum + (r.ratePerHour ?? 0), 0);
        return totalPct / totalRate;
      };

      setClaudeCapacity({
        family: "claude",
        totalPercentage: totalClaude,
        accountCount: oauthAccounts.length,
        status: getOverallStatus(claudeBurnRates),
        hoursToExhaustion: getHoursToExhaustion(claudeBurnRates, totalClaude),
      });

      setGeminiCapacity({
        family: "gemini",
        totalPercentage: totalGemini,
        accountCount: oauthAccounts.length,
        status: getOverallStatus(geminiBurnRates),
        hoursToExhaustion: getHoursToExhaustion(geminiBurnRates, totalGemini),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    loading,
    error,
    claudeCapacity,
    geminiCapacity,
    accountCount,
    refresh,
  };
}
```

**Step 5: Export from barrel**

Update `src/tui/hooks/index.ts`:

```typescript
/**
 * TUI Hooks barrel export
 */

export { useCapacity } from "./useCapacity.js";
```

**Step 6: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/hooks/useCapacity.test.ts --no-coverage`
Expected: PASS

**Step 7: Commit**

```bash
git add src/tui/hooks/ tests/unit/tui/hooks/
git commit -m "feat(tui): add useCapacity hook"
```

---

### Task 8: Create useServerState Hook

**Files:**

- Create: `src/tui/hooks/useServerState.ts`
- Create: `tests/unit/tui/hooks/useServerState.test.ts`

**Step 1: Write failing test**

Create `tests/unit/tui/hooks/useServerState.test.ts`:

```typescript
/**
 * useServerState Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useServerState } from "../../../../src/tui/hooks/useServerState.js";

describe("useServerState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stopped state by default", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(result.current.running).toBe(false);
    expect(result.current.port).toBe(8080);
  });

  it("provides start function", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(typeof result.current.start).toBe("function");
  });

  it("provides stop function", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(typeof result.current.stop).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/hooks/useServerState.test.ts --no-coverage`
Expected: FAIL

**Step 3: Implement useServerState**

Create `src/tui/hooks/useServerState.ts`:

```typescript
/**
 * useServerState Hook
 *
 * Manages the proxy server lifecycle from within the TUI.
 */

import { useState, useCallback, useRef } from "react";
import type { Server } from "http";
import type { ServerState } from "../types.js";

interface UseServerStateResult extends ServerState {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
}

export function useServerState(initialPort: number): UseServerStateResult {
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState(initialPort);
  const serverRef = useRef<Server | null>(null);

  const start = useCallback(async () => {
    if (running) return;

    try {
      // Dynamically import to avoid circular deps
      const { createServer } = await import("../../server.js");
      const server = await createServer({ port });
      serverRef.current = server;
      setRunning(true);
    } catch (err) {
      console.error("Failed to start server:", (err as Error).message);
    }
  }, [running, port]);

  const stop = useCallback(async () => {
    if (!running || !serverRef.current) return;

    return new Promise<void>((resolve) => {
      serverRef.current!.close(() => {
        serverRef.current = null;
        setRunning(false);
        resolve();
      });
    });
  }, [running]);

  const restart = useCallback(async () => {
    await stop();
    await start();
  }, [stop, start]);

  return {
    running,
    port,
    start,
    stop,
    restart,
  };
}
```

**Step 4: Export from barrel**

Update `src/tui/hooks/index.ts`:

```typescript
/**
 * TUI Hooks barrel export
 */

export { useCapacity } from "./useCapacity.js";
export { useServerState } from "./useServerState.js";
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/hooks/useServerState.test.ts --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tui/hooks/ tests/unit/tui/hooks/
git commit -m "feat(tui): add useServerState hook"
```

---

## Phase 4: Command Palette

### Task 9: Create CommandPalette Component

**Files:**

- Create: `src/tui/components/CommandPalette.tsx`
- Create: `tests/unit/tui/components/CommandPalette.test.tsx`

**Step 1: Write failing test**

Create `tests/unit/tui/components/CommandPalette.test.tsx`:

```typescript
/**
 * CommandPalette Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { CommandPalette } from "../../../../src/tui/components/CommandPalette.js";
import type { Command } from "../../../../src/tui/types.js";

describe("CommandPalette", () => {
  const mockCommands: Command[] = [
    { id: "start", label: "Start Server", category: "server", action: vi.fn() },
    { id: "add-oauth", label: "Add Account (OAuth)", category: "accounts", action: vi.fn() },
    { id: "logs", label: "Server Logs", category: "view", action: vi.fn() },
  ];

  it("renders command list", () => {
    const { lastFrame } = render(
      <CommandPalette
        commands={mockCommands}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const output = lastFrame();
    expect(output).toContain("Start Server");
    expect(output).toContain("Add Account");
  });

  it("shows search input", () => {
    const { lastFrame } = render(
      <CommandPalette
        commands={mockCommands}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const output = lastFrame();
    // Should have a search/filter area
    expect(output).toContain(">");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/components/CommandPalette.test.tsx --no-coverage`
Expected: FAIL

**Step 3: Implement CommandPalette**

Create `src/tui/components/CommandPalette.tsx`:

```typescript
/**
 * CommandPalette Component
 *
 * Fuzzy-searchable command list overlay.
 */

import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import fuzzysort from "fuzzysort";
import type { Command } from "../types.js";

interface CommandPaletteProps {
  commands: Command[];
  onSelect: (command: Command) => void;
  onClose: () => void;
}

export function CommandPalette({ commands, onSelect, onClose }: CommandPaletteProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const results = fuzzysort.go(query, commands, {
      key: "label",
      threshold: -10000,
    });

    return results.map(r => r.obj);
  }, [query, commands]);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(i => Math.min(filteredCommands.length - 1, i + 1));
      return;
    }

    if (key.return && filteredCommands.length > 0) {
      onSelect(filteredCommands[selectedIndex]);
      return;
    }
  });

  // Reset selection when filter changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Box>
        <Text color="cyan">&gt; </Text>
        <TextInput value={query} onChange={setQuery} placeholder="Search commands..." />
      </Box>

      <Text> </Text>

      {filteredCommands.slice(0, 10).map((cmd, index) => (
        <Box key={cmd.id}>
          <Text color={index === selectedIndex ? "cyan" : undefined} inverse={index === selectedIndex}>
            {index === selectedIndex ? " > " : "   "}
            {cmd.label}
          </Text>
          <Text dimColor> ({cmd.category})</Text>
        </Box>
      ))}

      {filteredCommands.length === 0 && (
        <Text dimColor>No matching commands</Text>
      )}

      <Text> </Text>
      <Text dimColor>↑↓ navigate  ⏎ select  ESC close</Text>
    </Box>
  );
}
```

**Step 4: Export from barrel**

Update `src/tui/components/index.ts`:

```typescript
/**
 * TUI Components barrel export
 */

export { CapacityBar } from "./CapacityBar.js";
export { StatusIndicator } from "./StatusIndicator.js";
export { Dashboard } from "./Dashboard.js";
export { CommandPalette } from "./CommandPalette.js";
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/components/CommandPalette.test.tsx --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tui/components/ tests/unit/tui/components/
git commit -m "feat(tui): add CommandPalette component with fuzzy search"
```

---

### Task 10: Create useCommands Hook

**Files:**

- Create: `src/tui/hooks/useCommands.ts`
- Create: `tests/unit/tui/hooks/useCommands.test.ts`

**Step 1: Write failing test**

Create `tests/unit/tui/hooks/useCommands.test.ts`:

```typescript
/**
 * useCommands Hook Tests
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCommands } from "../../../../src/tui/hooks/useCommands.js";

describe("useCommands", () => {
  it("returns array of commands", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current.length).toBeGreaterThan(0);
  });

  it("includes server commands", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const serverCommands = result.current.filter((c) => c.category === "server");
    expect(serverCommands.length).toBeGreaterThan(0);
  });

  it("includes account commands", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const accountCommands = result.current.filter((c) => c.category === "accounts");
    expect(accountCommands.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/hooks/useCommands.test.ts --no-coverage`
Expected: FAIL

**Step 3: Implement useCommands**

Create `src/tui/hooks/useCommands.ts`:

```typescript
/**
 * useCommands Hook
 *
 * Returns the list of commands available in the command palette.
 */

import { useMemo } from "react";
import type { Command, ModalState } from "../types.js";

interface UseCommandsOptions {
  serverControls: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    restart: () => Promise<void>;
  };
  modalControls: {
    open: (type: ModalState["type"]) => void;
    close: () => void;
  };
  refreshCapacity: () => Promise<void>;
}

export function useCommands({ serverControls, modalControls, refreshCapacity }: UseCommandsOptions): Command[] {
  return useMemo(
    () => [
      // Server commands
      {
        id: "start-server",
        label: "Start Server",
        category: "server" as const,
        action: serverControls.start,
      },
      {
        id: "stop-server",
        label: "Stop Server",
        category: "server" as const,
        action: serverControls.stop,
      },
      {
        id: "restart-server",
        label: "Restart Server",
        category: "server" as const,
        action: serverControls.restart,
      },

      // Account commands
      {
        id: "add-account-oauth",
        label: "Add Account (OAuth)",
        category: "accounts" as const,
        action: () => modalControls.open("add-account"),
      },
      {
        id: "remove-account",
        label: "Remove Account",
        category: "accounts" as const,
        action: () => modalControls.open("remove-account"),
      },
      {
        id: "refresh-capacity",
        label: "Refresh Capacity",
        category: "accounts" as const,
        action: refreshCapacity,
      },

      // View commands
      {
        id: "view-logs",
        label: "Server Logs",
        category: "view" as const,
        action: () => modalControls.open("logs"),
      },

      // Settings commands
      {
        id: "settings",
        label: "Settings",
        category: "settings" as const,
        action: () => modalControls.open("settings"),
      },
    ],
    [serverControls, modalControls, refreshCapacity],
  );
}
```

**Step 4: Export from barrel**

Update `src/tui/hooks/index.ts`:

```typescript
/**
 * TUI Hooks barrel export
 */

export { useCapacity } from "./useCapacity.js";
export { useServerState } from "./useServerState.js";
export { useCommands } from "./useCommands.js";
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/hooks/useCommands.test.ts --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tui/hooks/ tests/unit/tui/hooks/
git commit -m "feat(tui): add useCommands hook for command palette"
```

---

## Phase 5: Integration

### Task 11: Wire Up App Component

**Files:**

- Modify: `src/tui/app.tsx`
- Modify: `tests/unit/tui/app.test.tsx`

**Step 1: Update app test**

Update `tests/unit/tui/app.test.tsx`:

```typescript
/**
 * TUI App Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";

// Mock hooks
vi.mock("../../../src/tui/hooks/useCapacity.js", () => ({
  useCapacity: () => ({
    loading: false,
    error: null,
    claudeCapacity: { family: "claude", totalPercentage: 100, accountCount: 1, status: "stable", hoursToExhaustion: null },
    geminiCapacity: { family: "gemini", totalPercentage: 100, accountCount: 1, status: "stable", hoursToExhaustion: null },
    accountCount: 1,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../../src/tui/hooks/useServerState.js", () => ({
  useServerState: () => ({
    running: false,
    port: 8080,
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
  }),
}));

describe("TUI App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders text with ink-testing-library", () => {
    const { lastFrame } = render(<Text>Test</Text>);
    expect(lastFrame()).toContain("Test");
  });
});
```

**Step 2: Update app component**

Update `src/tui/app.tsx`:

```typescript
/**
 * TUI Application Entry Point
 */

import React, { useState, useCallback } from "react";
import { render, useApp, useInput, Box, Text } from "ink";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Dashboard } from "./components/Dashboard.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { useCapacity } from "./hooks/useCapacity.js";
import { useServerState } from "./hooks/useServerState.js";
import { useCommands } from "./hooks/useCommands.js";
import type { ModalState, Command } from "./types.js";
import { DEFAULT_PORT } from "../constants.js";

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version: string };
const VERSION = packageJson.version;

function App(): React.ReactElement {
  const { exit } = useApp();
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  // Hooks
  const serverState = useServerState(DEFAULT_PORT);
  const { loading, claudeCapacity, geminiCapacity, accountCount, refresh } = useCapacity();

  // Modal controls
  const modalControls = {
    open: useCallback((type: ModalState["type"]) => setModal({ type }), []),
    close: useCallback(() => setModal({ type: "none" }), []),
  };

  // Commands
  const commands = useCommands({
    serverControls: {
      start: serverState.start,
      stop: serverState.stop,
      restart: serverState.restart,
    },
    modalControls,
    refreshCapacity: refresh,
  });

  // Handle command selection
  const handleSelectCommand = useCallback((command: Command) => {
    modalControls.close();
    command.action();
  }, [modalControls]);

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+P opens command palette
    if (input === "p" && key.ctrl) {
      setModal({ type: "command-palette" });
      return;
    }

    // q quits (when no modal open)
    if (input === "q" && modal.type === "none") {
      exit();
      return;
    }

    // Quick shortcuts when no modal open
    if (modal.type === "none") {
      if (input === "a") {
        setModal({ type: "add-account" });
      } else if (input === "s") {
        if (serverState.running) {
          serverState.stop();
        } else {
          serverState.start();
        }
      } else if (input === "l") {
        setModal({ type: "logs" });
      } else if (input === "r") {
        refresh();
      }
    }
  });

  // Loading state
  if (loading) {
    return (
      <Box padding={1}>
        <Text>Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Dashboard is always visible */}
      <Dashboard
        version={VERSION}
        serverState={serverState}
        claudeCapacity={claudeCapacity}
        geminiCapacity={geminiCapacity}
        accountCount={accountCount}
      />

      {/* Command palette overlay */}
      {modal.type === "command-palette" && (
        <Box position="absolute" marginTop={2} marginLeft={2}>
          <CommandPalette
            commands={commands}
            onSelect={handleSelectCommand}
            onClose={modalControls.close}
          />
        </Box>
      )}

      {/* Placeholder for other modals */}
      {modal.type === "add-account" && (
        <Box borderStyle="round" padding={1}>
          <Text>Add Account modal (TODO)</Text>
          <Text dimColor> Press ESC to close</Text>
        </Box>
      )}

      {modal.type === "logs" && (
        <Box borderStyle="round" padding={1}>
          <Text>Server Logs modal (TODO)</Text>
          <Text dimColor> Press ESC to close</Text>
        </Box>
      )}
    </Box>
  );
}

export function startTUI(): void {
  render(<App />);
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: No errors

**Step 4: Verify tests pass**

Run: `npm test -- tests/unit/tui/ --no-coverage`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/tui/ tests/unit/tui/
git commit -m "feat(tui): wire up App component with Dashboard and CommandPalette"
```

---

### Task 12: Final Integration Test

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Manual verification**

Run: `npm run build && node dist/tui/app.js`
Expected: TUI launches and shows dashboard

**Step 3: Commit any final fixes**

If any fixes needed, commit them.

**Step 4: Final commit**

```bash
git add .
git commit -m "feat(tui): complete TUI MVP with dashboard and command palette"
```

---

## Summary

This plan implements the TUI MVP with:

1. **Phase 1**: Core infrastructure (deps, types, structure)
2. **Phase 2**: Dashboard components (CapacityBar, StatusIndicator, Dashboard)
3. **Phase 3**: State hooks (useCapacity, useServerState)
4. **Phase 4**: Command palette (CommandPalette, useCommands)
5. **Phase 5**: Integration (wire up App, final testing)

Total: 12 tasks, each with TDD approach (test first, implement, verify, commit).

## Future Work (Not in this plan)

- Modal screens (Add Account, Remove Account, Settings)
- Smart refresh hook
- Server logs viewer
- Settings persistence
- Error boundaries
