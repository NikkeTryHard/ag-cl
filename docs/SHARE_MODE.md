# Share Mode Documentation

Share Mode allows you to share your proxy with friends, giving them access to your pooled Anthropic/Gemini quota through a secure tunnel.

## Quick Start

1. Start the proxy server (`s` key or `:start` command)
2. Press `Shift+S` to start sharing
3. Wait for the tunnel URL to appear
4. Press `Y` to copy the URL
5. Share the URL (and API key if auth is enabled) with your friend

## Authentication

Share Mode supports two authentication modes to control who can access your proxy.

### Single Key Mode (Default)

One master key for all users:

- Simple to manage
- All users share the same key
- Good for small groups or temporary sharing

**To set up:**

1. Open Options (`o` or `?`)
2. Navigate to "Share Options"
3. Set "Enabled" to Y
4. Set "Mode" to "single"
5. Select "Master Key" to view/copy/regenerate

### Per-Friend Mode

Unique keys for each user:

- Track who's using your proxy
- Revoke individual access without affecting others
- See which friend is connected

**To set up:**

1. Open Options (`o` or `?`)
2. Navigate to "Share Options"
3. Set "Enabled" to Y
4. Set "Mode" to "per-friend"
5. Select "Friend Keys" to manage keys

### Managing Friend Keys

In the Friend Keys modal:

- `A` - Add a new key (with optional nickname)
- `Y` - Copy selected key to clipboard
- `R` - Revoke selected key (key still exists but won't work)
- `D` - Delete selected key permanently
- `Up/Down` - Navigate between keys
- `ESC` - Close modal (or return to list if in Add mode)

### Key Storage

Keys are stored in `~/.config/ag-cl/share-config.json`:

```json
{
  "auth": {
    "enabled": true,
    "mode": "per-friend",
    "masterKey": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "friendKeys": [
      {
        "key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "nickname": "Alice",
        "revoked": false,
        "createdAt": 1705276800000
      }
    ]
  }
}
```

## Visibility Settings

Control what information clients can see about your proxy:

| Setting        | Description                    |
| -------------- | ------------------------------ |
| Show Emails    | Show account email addresses   |
| Show Accounts  | Show individual account quotas |
| Show Models    | Show per-model breakdown       |
| Show Burn Rate | Show quota consumption rate    |

## Connection Limits

| Setting       | Description                             |
| ------------- | --------------------------------------- |
| Max Clients   | Maximum simultaneous connections (1-10) |
| Poll Interval | How often clients refresh quota data    |

## Keyboard Shortcuts

| Key       | Action                         |
| --------- | ------------------------------ |
| `Shift+S` | Start/Stop sharing             |
| `Shift+C` | Connect to a shared proxy      |
| `Shift+D` | Disconnect                     |
| `Y`       | Copy tunnel URL (when sharing) |

## Connecting to a Shared Proxy

1. Get the tunnel URL and API key from the host
2. Press `Shift+C` to open Connect modal
3. Enter the URL
4. Enter the API key (if required)
5. Optionally enter your nickname
6. Press Enter to connect

## Technical Details

- Tunnel: Uses Cloudflare Tunnel (cloudflared required)
- Protocol: HTTPS over Cloudflare's network
- Authentication: Bearer token in Authorization header
- Clients poll for quota updates (configurable interval)
