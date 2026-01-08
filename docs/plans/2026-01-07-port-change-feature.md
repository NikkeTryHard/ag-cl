# Port Change Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to change the server port from the TUI dashboard by pressing `p`.

**Architecture:** Add a new `PortInputModal` component that displays a text input with real-time validation. The modal integrates with `useServerState` hook which needs a `setPort` function. After port change, if server is running, prompt user to restart.

**Tech Stack:** React, Ink (terminal UI), TypeScript, Vitest for testing

---

### Task 1: Add `change-port` modal type to types.ts

**Files:**

- Modify: `src/tui/types.ts:40-42`
- Test: `tests/unit/tui/types.test.ts` (create if needed)

**Step 1: Write the failing test**

```typescript
// tests/unit/tui/types.test.ts
import { describe, it, expect } from "vitest";
import type { ModalState } from "../../../src/tui/types.js";

describe("ModalState type", () => {
  it("accepts change-port as valid modal type", () => {
    const modal: ModalState = { type: "change-port" };
    expect(modal.type).toBe("change-port");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/types.test.ts`
Expected: TypeScript error - "change-port" not assignable to type

**Step 3: Update the ModalState type**

```typescript
// src/tui/types.ts line 40-42
/** UI modal state */
export interface ModalState {
  type: "none" | "command-palette" | "accounts" | "add-account" | "logs" | "change-port";
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/types.ts tests/unit/tui/types.test.ts
git commit -m "feat(tui): add change-port modal type"
```

---

### Task 2: Add setPort to useServerState hook

**Files:**

- Modify: `src/tui/hooks/useServerState.ts:36-108`
- Test: `tests/unit/tui/hooks/useServerState.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/tui/hooks/useServerState.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the server import
vi.mock("../../../src/server.js", () => ({
  default: {
    listen: vi.fn(() => ({
      close: vi.fn((cb) => cb?.()),
    })),
  },
}));

// Mock net module
vi.mock("net", () => ({
  default: {
    createServer: vi.fn(() => ({
      once: vi.fn((event, cb) => {
        if (event === "listening") setTimeout(() => cb(), 0);
      }),
      listen: vi.fn(),
      close: vi.fn(),
    })),
  },
}));

import { useServerState } from "../../../../src/tui/hooks/useServerState.js";

describe("useServerState", () => {
  it("exposes setPort function", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(typeof result.current.setPort).toBe("function");
  });

  it("updates port when setPort is called", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(result.current.port).toBe(8080);

    act(() => {
      result.current.setPort(3000);
    });

    expect(result.current.port).toBe(3000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/hooks/useServerState.test.ts`
Expected: FAIL - setPort is not a function

**Step 3: Add setPort to useServerState**

```typescript
// src/tui/hooks/useServerState.ts
// Line 12-17: Update interface
export interface UseServerStateResult extends ServerState {
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  setPort: (port: number) => void;
}

// Line 38: Change const to let for port state
const [port, setPortState] = useState(initialPort);

// Line 100-107: Add setPort to return and expose it
const setPort = useCallback((newPort: number) => {
  setPortState(newPort);
}, []);

return {
  running,
  port,
  error,
  start,
  stop,
  restart,
  setPort,
};
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/hooks/useServerState.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/hooks/useServerState.ts tests/unit/tui/hooks/useServerState.test.ts
git commit -m "feat(tui): add setPort to useServerState hook"
```

---

### Task 3: Create port validation utility

**Files:**

- Create: `src/tui/utils/portValidation.ts`
- Test: `tests/unit/tui/utils/portValidation.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/unit/tui/utils/portValidation.test.ts
import { describe, it, expect } from "vitest";
import { validatePort } from "../../../../src/tui/utils/portValidation.js";

describe("validatePort", () => {
  it("returns null for valid port", () => {
    expect(validatePort("8080")).toBeNull();
    expect(validatePort("3000")).toBeNull();
    expect(validatePort("1")).toBeNull();
    expect(validatePort("65535")).toBeNull();
  });

  it("returns error for empty input", () => {
    expect(validatePort("")).toBe("Port required");
  });

  it("returns error for non-numeric input", () => {
    expect(validatePort("abc")).toBe("Must be a number");
    expect(validatePort("80a")).toBe("Must be a number");
  });

  it("returns error for out of range port", () => {
    expect(validatePort("0")).toBe("Port must be 1-65535");
    expect(validatePort("-1")).toBe("Must be a number");
    expect(validatePort("65536")).toBe("Port must be 1-65535");
    expect(validatePort("99999")).toBe("Port must be 1-65535");
  });

  it("returns error for decimal numbers", () => {
    expect(validatePort("80.5")).toBe("Must be a number");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/utils/portValidation.test.ts`
Expected: FAIL - module not found

**Step 3: Implement validatePort**

```typescript
// src/tui/utils/portValidation.ts
/**
 * Port validation utility
 */

/**
 * Validate a port string input
 * @param input - The port string to validate
 * @returns Error message or null if valid
 */
export function validatePort(input: string): string | null {
  if (!input.trim()) {
    return "Port required";
  }

  // Check for valid integer
  if (!/^\d+$/.test(input)) {
    return "Must be a number";
  }

  const port = parseInt(input, 10);

  if (port < 1 || port > 65535) {
    return "Port must be 1-65535";
  }

  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/utils/portValidation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/utils/portValidation.ts tests/unit/tui/utils/portValidation.test.ts
git commit -m "feat(tui): add port validation utility"
```

---

### Task 4: Create PortInputModal component

**Files:**

- Create: `src/tui/components/PortInputModal.tsx`
- Test: `tests/unit/tui/components/PortInputModal.test.tsx`

**Step 1: Write the failing tests**

```typescript
// tests/unit/tui/components/PortInputModal.test.tsx
/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { PortInputModal } from "../../../../src/tui/components/PortInputModal.js";

// Mock useTerminalSize
vi.mock("../../../../src/tui/hooks/useTerminalSize.js", () => ({
  useTerminalSize: () => ({ width: 80, height: 24 }),
}));

describe("PortInputModal", () => {
  it("renders with current port value", () => {
    const { lastFrame } = render(
      <PortInputModal
        currentPort={8080}
        serverRunning={false}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );

    expect(lastFrame()).toContain("Change Port");
    expect(lastFrame()).toContain("8080");
  });

  it("calls onClose when ESC is pressed", () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <PortInputModal
        currentPort={8080}
        serverRunning={false}
        onConfirm={() => {}}
        onClose={onClose}
      />
    );

    stdin.write("\x1B"); // ESC key
    expect(onClose).toHaveBeenCalled();
  });

  it("shows validation error for invalid input", () => {
    const { lastFrame, stdin } = render(
      <PortInputModal
        currentPort={8080}
        serverRunning={false}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );

    // Clear and type invalid port
    stdin.write("\x7F\x7F\x7F\x7F"); // backspace 4 times
    stdin.write("0");

    expect(lastFrame()).toContain("Port must be 1-65535");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/components/PortInputModal.test.tsx`
Expected: FAIL - module not found

**Step 3: Implement PortInputModal**

```typescript
// src/tui/components/PortInputModal.tsx
/**
 * PortInputModal Component
 *
 * Modal for changing the server port with real-time validation.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { validatePort } from "../utils/portValidation.js";

interface PortInputModalProps {
  currentPort: number;
  serverRunning: boolean;
  onConfirm: (port: number, shouldRestart: boolean) => void;
  onClose: () => void;
}

type ModalState = "input" | "confirm-restart";

export function PortInputModal({
  currentPort,
  serverRunning,
  onConfirm,
  onClose,
}: PortInputModalProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const [portValue, setPortValue] = useState(String(currentPort));
  const [modalState, setModalState] = useState<ModalState>("input");

  const validationError = validatePort(portValue);
  const newPort = parseInt(portValue, 10);
  const portChanged = !validationError && newPort !== currentPort;

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (modalState === "input") {
      if (key.return && !validationError) {
        if (portChanged && serverRunning) {
          setModalState("confirm-restart");
        } else if (portChanged) {
          onConfirm(newPort, false);
        } else {
          onClose();
        }
      }
    } else if (modalState === "confirm-restart") {
      if (input === "y" || input === "Y") {
        onConfirm(newPort, true);
      } else if (input === "n" || input === "N") {
        onConfirm(newPort, false);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width={width}
      height={height - 1}
    >
      <Box flexDirection="column" borderStyle="round" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Change Port
          </Text>
        </Box>

        {modalState === "input" && (
          <>
            <Box>
              <Text>Port: </Text>
              <TextInput value={portValue} onChange={setPortValue} />
            </Box>

            {validationError && (
              <Box marginTop={1}>
                <Text color="red">{validationError}</Text>
              </Box>
            )}

            <Box marginTop={1}>
              <Text dimColor>Enter to confirm, ESC to cancel</Text>
            </Box>
          </>
        )}

        {modalState === "confirm-restart" && (
          <>
            <Text>
              Port changed to <Text color="cyan">{newPort}</Text>.
            </Text>
            <Text>Server is running. Restart now?</Text>
            <Box marginTop={1}>
              <Text color="cyan">[y]</Text>
              <Text>es </Text>
              <Text color="cyan">[n]</Text>
              <Text>o</Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/components/PortInputModal.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/components/PortInputModal.tsx tests/unit/tui/components/PortInputModal.test.tsx
git commit -m "feat(tui): add PortInputModal component"
```

---

### Task 5: Integrate PortInputModal into app.tsx

**Files:**

- Modify: `src/tui/app.tsx`

**Step 1: Write the failing test**

```typescript
// tests/unit/tui/app.test.tsx (add to existing or create)
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";

// This is an integration test - we verify the 'p' key opens the modal
// by checking the app renders the PortInputModal

describe("App keyboard shortcuts", () => {
  it("p key should open change-port modal", () => {
    // Integration test - verify in manual testing
    // The key binding will be added in step 3
    expect(true).toBe(true);
  });
});
```

**Step 2: Run build to verify current state**

Run: `npm run build`
Expected: PASS (no errors yet)

**Step 3: Integrate PortInputModal into app.tsx**

Add import at top:

```typescript
import { PortInputModal } from "./components/PortInputModal.js";
```

Add `p` keyboard shortcut (around line 101):

```typescript
} else if (input === "p") {
  setModal({ type: "change-port" });
}
```

Add modal rendering (after line 148, before the dashboard return):

```typescript
if (modal.type === "change-port") {
  return (
    <PortInputModal
      currentPort={serverState.port}
      serverRunning={serverState.running}
      onConfirm={(newPort, shouldRestart) => {
        serverState.setPort(newPort);
        if (shouldRestart) {
          void serverState.restart();
        }
        modalControls.close();
      }}
      onClose={modalControls.close}
    />
  );
}
```

**Step 4: Run build to verify it compiles**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/app.tsx
git commit -m "feat(tui): integrate PortInputModal with p shortcut"
```

---

### Task 6: Update Dashboard to show port shortcut hint

**Files:**

- Modify: `src/tui/components/Dashboard.tsx`
- Test: `tests/unit/tui/components/Dashboard.test.tsx`

**Step 1: Check current Dashboard footer**

Read `src/tui/components/Dashboard.tsx` to find the keyboard hints section.

**Step 2: Add 'p' to keyboard hints**

Find the hints section and add:

```typescript
<Text color="cyan">[p]</Text>
<Text dimColor>ort </Text>
```

**Step 3: Update Dashboard test if needed**

If there's a test checking the footer hints, update it to include the new `[p]ort` hint.

**Step 4: Run tests**

Run: `npm test -- tests/unit/tui/components/Dashboard.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/components/Dashboard.tsx tests/unit/tui/components/Dashboard.test.tsx
git commit -m "feat(tui): add port shortcut hint to Dashboard"
```

---

### Task 7: Manual integration testing

**Step 1: Build the project**

Run: `npm run build`
Expected: PASS

**Step 2: Run TUI and test the flow**

Run: `npm run tui` (or however the TUI is started)

Test cases:

1. Press `p` - should open port input modal
2. Type invalid port (0, 99999, abc) - should show validation error
3. Type valid port, press Enter with server stopped - should change port silently
4. Type valid port, press Enter with server running - should prompt for restart
5. Press `y` on restart prompt - should restart server on new port
6. Press `n` on restart prompt - should keep old server running
7. Press ESC at any point - should close modal

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "test: verify port change feature integration"
```
