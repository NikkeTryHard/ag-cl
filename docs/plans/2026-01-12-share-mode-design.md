# Share Mode Design

## Overview

Add a "Share Mode" feature to ag-cl that allows users to share their quota dashboard with friends via Cloudflare quick tunnels or local network, with configurable visibility and API key authentication.

## Core Concepts

### Three TUI Modes

```
┌────────────────────────────────────────────────────────────┐
│                   API KEY LAYER (optional)                 │
│                 Enable/disable in any mode                 │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  NORMAL            CLOUDFLARE HOST      CLOUDFLARE CLIENT  │
│  Local proxy       Normal + sharing     View remote server │
│  (default)         ├─ Tunnel URL        ├─ Their quotas    │
│                    ├─ Client tracking   └─ Read-only       │
│                    └─ Usage history     (local proxy       │
│                                          paused)           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Mode Transitions

| Keybind | Action                         |
| ------- | ------------------------------ |
| `S`     | Toggle sharing (↔ host mode)   |
| `C`     | Connect to URL (→ client mode) |
| `D`     | Disconnect (→ normal mode)     |

### CLI Flags

```bash
ag-cl --share                    # Start in host mode
ag-cl --connect <url>            # Start in client mode
ag-cl --api-key <key>            # Set/provide API key
ag-cl --no-auth                  # Disable API key requirement
```

## Architecture

### Data Flow

```
HOST SIDE                              CLIENT SIDE
┌─────────────────┐                    ┌─────────────────┐
│     ag-cl TUI   │                    │     ag-cl TUI   │
│     [S] Share   │                    │     [C] Connect │
│         │       │                    │         │       │
│         ▼       │                    │         ▼       │
│  ┌───────────┐  │                    │  Enter URL +    │
│  │cloudflared│  │◄───────────────────│  API key +      │
│  └─────┬─────┘  │    HTTP polling    │  nickname       │
│        │        │                    │         │       │
│        ▼        │────────────────────►         ▼       │
│  Random URL     │    Quota data      │  Display host's │
│  (copy w/ key)  │    (filtered)      │  quotas (r/o)   │
│        │        │                    │                 │
│        ▼        │                    │                 │
│  Track clients  │                    │                 │
│  + log usage    │                    │                 │
└─────────────────┘                    └─────────────────┘
```

### Host Endpoints

| Endpoint          | Method | Description                          |
| ----------------- | ------ | ------------------------------------ |
| `/share/quota`    | GET    | Filtered quota info per visibility   |
| `/share/status`   | GET    | Connection health check              |
| `/share/register` | POST   | Client registration (key + nickname) |

### Client Polling

- Configurable interval (default 10s)
- Auto-reconnect with exponential backoff on failure
- Status shown in TUI header during reconnect attempts

## Authentication

### API Key Modes

1. **Single key mode**: One shared key for all friends
2. **Per-friend keys**: Unique key per friend, individually revokable

### Key + Nickname

- API key required for authentication
- Nickname optional, for display purposes on host's client list

### Applies to All Modes

API key auth is a universal layer that can be enabled/disabled regardless of normal, host, or client mode.

## Host Configuration

```json
// ~/.config/ag-cl/share-config.json
{
  "auth": {
    "enabled": true,
    "mode": "single",
    "masterKey": "generated-uuid",
    "friendKeys": [{ "key": "abc123", "nickname": "bob", "revoked": false }]
  },
  "visibility": {
    "showAccountEmails": false,
    "showIndividualAccounts": true,
    "showModelBreakdown": true,
    "showBurnRate": false
  },
  "limits": {
    "maxClients": 5,
    "pollIntervalSeconds": 10
  },
  "persistence": {
    "resumeOnRestart": false
  }
}
```

All settings editable via TUI settings panel (keybind access).

## Usage Tracking

### Three Layers

1. **Live view**: Connected clients panel in TUI showing current connections
2. **Session log**: Log to file (`~/.config/ag-cl/share-sessions.log`)
3. **In-TUI history**: History tab showing past sessions

### Tracked Data

- Client nickname / key identifier
- Connection time
- Disconnection time
- Requests made during session (view count)

## Cloudflare Integration

### Quick Tunnels Only

Uses `trycloudflare.com` - no Cloudflare account required, random URL each session.

### Setup Experience

1. Check if `cloudflared` is installed
2. If missing: offer to install or guide setup
3. If present: spawn tunnel, capture URL
4. Display URL in TUI footer with one-key copy

### Connection Resilience

- Auto-reconnect with exponential backoff
- Status indicator in TUI during reconnect
- Notification when connection restored

## TUI Components

### Host Mode Additions

```
┌─────────────────────────────────────────────────────────────┐
│ ag-cl ─ SHARING ─ https://xxx.trycloudflare.com  [Y] Copy   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Dashboard]  [Clients]  [History]  [Settings]              │
│                                                             │
│  ┌─ Connected Clients (2/5) ─────────────────────────────┐  │
│  │  bob (abc***) ── connected 5m ago                     │  │
│  │  alice (def***) ── connected 2m ago                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [S] Stop Sharing  [C] Connect to Remote                    │
└─────────────────────────────────────────────────────────────┘
```

### Client Mode Additions

```
┌─────────────────────────────────────────────────────────────┐
│ ag-cl ─ CONNECTED ─ viewing bob's quotas ─ ● Live           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Remote Dashboard]                                         │
│                                                             │
│  ┌─ bob's Quotas ────────────────────────────────────────┐  │
│  │  claude-sonnet-4-5: ████████░░ 80%                    │  │
│  │  gemini-2.5-pro:    ██████░░░░ 60%                    │  │
│  │  (read-only view)                                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [D] Disconnect                                             │
└─────────────────────────────────────────────────────────────┘
```

### Settings Panel

Accessible via keybind, allows editing:

- Auth mode and keys
- Visibility toggles
- Client limits
- Poll interval
- Persistence setting

## File Locations

| Data                 | Location                             |
| -------------------- | ------------------------------------ |
| Share config         | `~/.config/ag-cl/share-config.json`  |
| Session logs         | `~/.config/ag-cl/share-sessions.log` |
| Friend keys (backup) | Part of share-config.json            |

## Security Considerations

1. **API keys transmitted over HTTPS** (Cloudflare tunnel provides TLS)
2. **Keys never logged** in session logs (only masked: `abc***`)
3. **Revocation immediate** - revoked keys rejected on next poll
4. **Max clients enforced** - prevents resource exhaustion
5. **Read-only client mode** - clients cannot modify host state

## Edge Cases

| Scenario                  | Behavior                              |
| ------------------------- | ------------------------------------- |
| Tunnel drops              | Auto-reconnect, status in TUI         |
| Client exceeds poll rate  | Rate limited, warned                  |
| Max clients reached       | New connections rejected with message |
| Invalid API key           | 401 response, client shows error      |
| Host stops sharing        | Clients notified, disconnected        |
| cloudflared not installed | Guide user through installation       |
