# TUI Application Design

## Overview

Transform ag-cl from a command-line tool into a Terminal User Interface (TUI) application for maximum UX with zero command memorization.

## Design Decisions

| Decision         | Choice                   | Rationale                                       |
| ---------------- | ------------------------ | ----------------------------------------------- |
| Primary View     | Minimal Dashboard        | Glanceable status, no noise                     |
| Command Access   | Command Palette (Ctrl+P) | Discoverable, fuzzy-searchable                  |
| Action Display   | Modal Overlays           | Keep dashboard visible during actions           |
| Refresh Strategy | Smart Refresh            | Auto-update when server active, quiet when idle |
| TUI Library      | Ink + ink-ui             | React patterns, component model, good DX        |

## Dashboard Layout

```
ag-cl v1.0.3                              [running :8080]

  Claude  [██████████████░░░░░░]  280%  ~4h 32m until exhausted
  Gemini  [████████████████████]  400%  stable

  14 accounts

  [a]ccounts  [s]erver  [l]ogs  [q]uit
```

### Dashboard Elements

1. **Header**: App name, version, server status indicator
2. **Capacity Bars**: One per model family (Claude, Gemini)
   - Aggregated percentage across all accounts
   - Time to exhaustion or "stable" status
3. **Account Count**: Total configured accounts
4. **Hotkey Hints**: Quick actions without opening palette

## Command Palette

Activated via `Ctrl+P`. Fuzzy-searchable list of all actions.

### Commands

| Command              | Description                       |
| -------------------- | --------------------------------- |
| **Server**           |                                   |
| Start Server         | Start proxy on configured port    |
| Stop Server          | Stop running proxy                |
| Restart Server       | Restart proxy                     |
| Change Port          | Set server port                   |
| **Accounts**         |                                   |
| Add Account (OAuth)  | Browser-based login               |
| Add Account (Token)  | Paste refresh token               |
| Remove Account       | Select account to remove          |
| Verify All Accounts  | Check all tokens are valid        |
| Clear All Accounts   | Remove everything                 |
| **View**             |                                   |
| Account Details      | Expand to see per-model breakdown |
| Server Logs          | Show live request logs            |
| **Settings**         |                                   |
| Toggle Fallback Mode | Enable/disable model fallback     |
| Set Log Level        | silent/error/warn/info/debug      |

## Modal System

Actions that need dedicated UI run in modal overlays on top of the dashboard.

```
┌─────────────────────────────────────────────┐
│  ag-cl v1.0.3              [running :8080]  │
│                                             │
│  ┌─── Add Account ───────────────────────┐  │
│  │                                       │  │
│  │   Opening browser for OAuth...        │  │
│  │   Waiting for authentication...       │  │
│  │                                       │  │
│  │   [ESC] Cancel                        │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [Ctrl+P] commands                          │
└─────────────────────────────────────────────┘
```

- Dashboard stays visible but dimmed
- ESC closes modal and returns to dashboard
- Modal captures all input while open

## Smart Refresh

Capacity data updates based on server activity:

- **Server running + receiving requests**: Poll every 30 seconds
- **Server running + idle**: Poll every 2 minutes
- **Server stopped**: No polling (manual refresh with `r`)

This minimizes API calls while keeping data current when it matters.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        TUI Application                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Dashboard  │  │  Command    │  │  Modal System       │  │
│  │  Component  │  │  Palette    │  │  (Add Account, etc) │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                       State Manager                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Server   │  │ Accounts │  │ Capacity │  │ UI State    │  │
│  │ State    │  │ State    │  │ Cache    │  │ (modals,etc)│  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Existing Core Modules                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Server   │  │ Account  │  │ Quota    │  │ Burn Rate   │  │
│  │ (Express)│  │ Manager  │  │ API      │  │ Calculator  │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

- TUI is a new layer on top of existing modules (no rewrite)
- Existing CLI remains functional for scripting/CI
- State manager coordinates between server, accounts, and UI
- Components are testable in isolation

## File Structure

```
src/
├── tui/
│   ├── app.tsx                 # Root Ink app
│   ├── components/
│   │   ├── Dashboard.tsx       # Main dashboard view
│   │   ├── CommandPalette.tsx  # Ctrl+P fuzzy finder
│   │   ├── Modal.tsx           # Modal container
│   │   ├── CapacityBar.tsx     # Progress bar component
│   │   └── StatusIndicator.tsx # Server status dot
│   ├── screens/
│   │   ├── AddAccountOAuth.tsx # OAuth flow screen
│   │   ├── AddAccountToken.tsx # Token input screen
│   │   ├── RemoveAccount.tsx   # Account selection
│   │   ├── ServerLogs.tsx      # Live log viewer
│   │   ├── AccountDetails.tsx  # Per-account breakdown
│   │   └── Settings.tsx        # Settings panel
│   ├── hooks/
│   │   ├── useServerState.ts   # Server running/stopped
│   │   ├── useCapacity.ts      # Aggregated capacity data
│   │   ├── useSmartRefresh.ts  # Polling logic
│   │   ├── useCommands.ts      # Command palette actions
│   │   └── useModal.ts         # Modal open/close state
│   └── state/
│       ├── store.ts            # Central state store
│       └── types.ts            # State type definitions
├── cli/                        # Existing CLI (unchanged)
└── ...                         # Other existing modules
```

## Dependencies

New dependencies required:

```json
{
  "ink": "^5.0.0",
  "ink-text-input": "^6.0.0",
  "ink-select-input": "^6.0.0",
  "ink-spinner": "^5.0.0",
  "fuzzysort": "^3.0.0"
}
```

## Entry Points

- `ag-cl` (no args) - Launches TUI dashboard
- `ag-cl --headless` or `ag-cl start` - Starts server without TUI (for scripts/CI)
- `ag-cl accounts list --json` - Existing CLI for scripting

## Testing Strategy

- Unit tests for each component (Ink's test renderer)
- Unit tests for hooks (isolated from UI)
- Integration tests for command flows
- Snapshot tests for UI consistency

## Implementation Order

1. Core infrastructure (Ink setup, state store)
2. Dashboard component (static first)
3. Capacity hooks (connect to existing modules)
4. Command palette (fuzzy search)
5. Modal system
6. Individual screens (Add Account, Logs, etc.)
7. Smart refresh
8. Polish and edge cases
