# Share Mode UX Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add share mode hints to Dashboard and show "Starting tunnel..." feedback during connection.

**Architecture:** Minimal changes - add hotkeys to existing row, add status text above hotkeys.

**Tech Stack:** React/Ink, TypeScript

---

## Task 1: Add Share Hotkeys to Dashboard

**Files:**

- Modify: `src/tui/components/Dashboard.tsx`

**Step 1: Add shareMode prop to DashboardProps**

```typescript
interface DashboardProps {
  // ... existing props
  shareMode?: "normal" | "host" | "client";
  shareStarting?: boolean;
}
```

**Step 2: Update Dashboard function signature**

```typescript
export function Dashboard({ version, serverState, claudeCapacity, geminiCapacity, accountCount, refreshing, autoRefreshRunning, lastAutoRefresh, shareMode = "normal", shareStarting = false }: DashboardProps): React.ReactElement {
```

**Step 3: Add share status text above hotkeys**

Before the hotkey hints Box (around line 108), add:

```typescript
{/* Share mode status */}
{shareStarting && (
  <Box marginTop={1}>
    <Text color="yellow">Starting tunnel...</Text>
  </Box>
)}
{shareMode === "host" && !shareStarting && (
  <Box marginTop={1}>
    <Text color="green">Sharing active</Text>
    <Text dimColor> - [D] to stop</Text>
  </Box>
)}
{shareMode === "client" && (
  <Box marginTop={1}>
    <Text color="blue">Connected to remote</Text>
    <Text dimColor> - [D] to disconnect</Text>
  </Box>
)}
```

**Step 4: Add share hotkeys to the hotkey row**

After `[?] help`, add share hints (only in normal mode):

```typescript
{shareMode === "normal" && (
  <>
    <Text dimColor> | </Text>
    <Text color="magenta">[S]</Text>
    <Text dimColor>hare </Text>
    <Text color="magenta">[C]</Text>
    <Text dimColor>onnect</Text>
  </>
)}
```

**Step 5: Commit**

```bash
git add src/tui/components/Dashboard.tsx
git commit -m "feat(tui): add share mode hotkeys and status to dashboard

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Pass Share State to Dashboard

**Files:**

- Modify: `src/tui/app.tsx`

**Step 1: Add shareStarting state**

After the copiedFeedback state:

```typescript
const [shareStarting, setShareStarting] = useState(false);
```

**Step 2: Update S key handler to set starting state**

```typescript
if (input === "S") {
  if (shareState.mode === "host") {
    shareState.stopSharing();
  } else if (shareState.mode === "normal" && serverState.running) {
    setShareStarting(true);
    shareState.startSharing();
  }
  return;
}
```

**Step 3: Clear shareStarting when tunnel URL arrives**

Add useEffect to watch for tunnel URL:

```typescript
useEffect(() => {
  if (shareState.hostState.tunnelUrl) {
    setShareStarting(false);
  }
}, [shareState.hostState.tunnelUrl]);
```

**Step 4: Also clear on error or stop**

```typescript
useEffect(() => {
  if (shareState.mode === "normal") {
    setShareStarting(false);
  }
}, [shareState.mode]);
```

**Step 5: Pass props to Dashboard**

Update the Dashboard component call:

```typescript
<Dashboard
  version={VERSION}
  serverState={serverState}
  claudeCapacity={claudeCapacity}
  geminiCapacity={geminiCapacity}
  accountCount={accountCount}
  refreshing={refreshing}
  autoRefreshRunning={autoRefreshState.isRunning}
  lastAutoRefresh={autoRefreshState.lastRefreshTime}
  shareMode={shareState.mode}
  shareStarting={shareStarting}
/>
```

**Step 6: Commit**

```bash
git add src/tui/app.tsx
git commit -m "feat(tui): pass share state to dashboard for status display

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Run Verification

**Step 1: Run lint**

```bash
npm run lint
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

**Step 3: Run tests**

```bash
npm test -- --no-coverage
```

---

## Summary

| Task | Description                                              |
| ---- | -------------------------------------------------------- |
| 1    | Add share hotkeys and status text to Dashboard component |
| 2    | Pass share state from app.tsx to Dashboard               |
| 3    | Verification                                             |

**Total commits:** 2
