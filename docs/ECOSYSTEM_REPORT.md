# Ecosystem Report

> Last updated: 2026-01-15

## Overview

Analysis of Claude Code proxy ecosystem projects for pattern adoption in ag-cl.

| Project                                                                             | Lang       | Focus                           | Maturity | Stars  | Last Activity |
| ----------------------------------------------------------------------------------- | ---------- | ------------------------------- | -------- | ------ | ------------- |
| [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)                         | Go         | Multi-provider enterprise proxy | High     | 6,761  | Jan 15, 2026  |
| [Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager)                | Rust/Tauri | Desktop app with quota mgmt     | High     | 13,673 | Jan 15, 2026  |
| [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) | TypeScript | OpenCode plugin                 | Medium   | -      | -             |
| [claude-code-router](https://github.com/musistudio/claude-code-router)              | TypeScript | Lightweight SSE routing         | Low      | -      | -             |
| [claude-code-proxy](https://github.com/1rgs/claude-code-proxy)                      | Python     | LiteLLM-based proxy             | Medium   | -      | -             |

---

## Project Summaries

### CLIProxyAPI (Go)

**Key Patterns:**

- Multi-provider executor system (10 providers: Gemini, Vertex, Claude, Codex, Qwen, iFlow, etc.)
- Routing strategies: round-robin vs fill-first (sticky until rate-limited)
- WebSocket gateway for real-time AI Studio connections
- Auth update queue with 256-buffer async processing
- Model registry with dynamic registration
- Priority-based auth selection (new in Jan 2026)
- Antigravity onboarding flow (new in Jan 2026)

**Adopted in ag-cl:** Multi-account pooling, fill-first routing strategy

### Antigravity-Manager (Rust/Tauri)

**Key Patterns:**

- Desktop app with system tray (Tauri v2)
- Auto-stream conversion (non-stream -> stream -> collect -> JSON) - eliminates most 429 errors
- Model-level rate limiting (per account+model tuple, not just account)
- Warmup request interception (synthetic response, saves 20-40% quota)
- Smart exponential backoff (60s -> 5m -> 30m -> 2h)
- Optimistic reset (all blocked + wait <= 2s -> clear all limits)
- Device fingerprint binding per account
- Complex duration parsing (`2h21m25.831582438s`)
- Quota protection bypass fix (v3.3.32, Jan 2026)

**Adopted in ag-cl:** Auto-refresh, quota visualization in TUI

### opencode-antigravity-auth (TypeScript)

**Key Patterns:**

- Plugin architecture for OpenCode
- Token extraction from `~/.gemini/oauth_creds.json`
- Dual quota pool fallback (Antigravity -> Gemini CLI, doubles quota)
- Account selection strategies: sticky, round-robin, hybrid
- Thinking signature cache (memory + disk with TTL)
- Model variants system (thinking budget via variants, not separate models)
- Session recovery (auto-resume on `tool_result_missing`)
- PID offset for parallel agent distribution

**Adopted in ag-cl:** Token extraction from ~/.gemini/

### claude-code-router (TypeScript)

**Key Patterns:**

- TransformStream-based SSE parser with buffer handling
- Graceful JSON parse error handling in event stream
- Model aliasing support

**Adopted in ag-cl:** SSE streaming patterns

### claude-code-proxy (Python)

**Key Patterns:**

- LiteLLM integration for multi-provider abstraction
- Simple deployment model
- Anthropic-compatible API surface

**Adopted in ag-cl:** Provider abstraction concepts

---

## Patterns Adopted

| Pattern                   | Source                    | Status      | Notes                                  |
| ------------------------- | ------------------------- | ----------- | -------------------------------------- |
| Multi-account pooling     | CLIProxyAPI               | Implemented | Account manager with verification      |
| Fill-first routing        | CLIProxyAPI               | Implemented | Stick until rate-limited               |
| Auto-refresh              | Antigravity-Manager       | Implemented | 5-hour interval, `--auto-refresh` flag |
| Token extraction          | opencode-antigravity-auth | Implemented | From ~/.gemini/                        |
| SSE streaming             | claude-code-router        | Implemented | TransformStream patterns               |
| Burn rate tracking        | Original                  | Implemented | Unique to ag-cl                        |
| Model-level rate limiting | Antigravity-Manager       | Planned     | Per (account, model) tuple             |
| Dual quota pools          | opencode-antigravity-auth | Planned     | Antigravity + Gemini CLI               |
| Warmup interception       | Antigravity-Manager       | Planned     | Synthetic responses                    |
| WebSocket gateway         | CLIProxyAPI               | Future      | For AI Studio                          |
| Desktop tray app          | Antigravity-Manager       | Future      | Tauri integration                      |
| Signature cache           | opencode-antigravity-auth | Future      | Memory + disk TTL                      |

---

## Feature Comparison Matrix

| Feature                |  ag-cl  | CLIProxyAPI | AG-Manager | OC-Auth | Router | Proxy |
| ---------------------- | :-----: | :---------: | :--------: | :-----: | :----: | :---: |
| **Providers**          |
| Gemini                 |   Yes   |     Yes     |    Yes     |   Yes   |  Yes   |  Yes  |
| Claude (API)           |   Yes   |     Yes     |    Yes     |   Yes   |  Yes   |   -   |
| Vertex AI              |    -    |     Yes     |     -      |    -    |   -    |   -   |
| OpenAI/Codex           |    -    |     Yes     |    Yes     |    -    |   -    |  Yes  |
| **Account Management** |
| Multi-account          |   Yes   |     Yes     |    Yes     |   Yes   |   -    |   -   |
| Rotation strategies    | Limited |    Full     |    Full    |  Full   |   -    |   -   |
| PID offset             |    -    |      -      |     -      |   Yes   |   -    |   -   |
| **Rate Limiting**      |
| Per-account            |   Yes   |     Yes     |    Yes     |   Yes   |   -    |   -   |
| Per-model              |    -    |      -      |    Yes     |    -    |   -    |   -   |
| Smart backoff          |   Yes   |     Yes     |    Yes     |   Yes   |   -    |   -   |
| Optimistic reset       |    -    |      -      |    Yes     |    -    |   -    |   -   |
| **Quota**              |
| Dual pools             |    -    |      -      |    Yes     |   Yes   |   -    |   -   |
| Auto-refresh           |   Yes   |     Yes     |    Yes     |   Yes   |   -    |   -   |
| Burn rate tracking     |   Yes   |      -      |     -      |    -    |   -    |   -   |
| **Resilience**         |
| Warmup interception    |    -    |      -      |    Yes     |    -    |   -    |   -   |
| Empty response retry   |   Yes   |      -      |    Yes     |    -    |   -    |   -   |
| Session recovery       |    -    |      -      |    Yes     |   Yes   |   -    |   -   |
| Auto-stream conversion |    -    |      -      |    Yes     |    -    |   -    |   -   |
| **Thinking Support**   |
| Signature handling     |   Yes   |      -      |    Yes     |   Yes   |   -    |   -   |
| Signature cache        |    -    |      -      |    Yes     |   Yes   |   -    |   -   |
| Variants system        |    -    |      -      |    Yes     |   Yes   |   -    |   -   |
| **Interface**          |
| TUI dashboard          |   Yes   |      -      |     -      |    -    |   -    |   -   |
| Web UI                 |    -    |      -      |    Yes     |    -    |   -    |   -   |
| Share mode             |   Yes   |      -      |     -      |    -    |   -    |   -   |

---

## Cross-Project Pattern Analysis

### Rate Limiting Strategies

| Project                   | Account-Level | Model-Level | Smart Backoff | Optimistic Reset |
| ------------------------- | :-----------: | :---------: | :-----------: | :--------------: |
| CLIProxyAPI               |      Yes      |      -      |      Yes      |        -         |
| Antigravity-Manager       |      Yes      |     Yes     |      Yes      |       Yes        |
| opencode-antigravity-auth |      Yes      |      -      |      Yes      |        -         |
| **ag-cl**                 |      Yes      |   Planned   |      Yes      |     Planned      |

**Recommendation:** Implement model-level rate limiting + optimistic reset.

### Account Selection

| Project                   |      Sticky      | Round-Robin | Hybrid  | PID Offset |
| ------------------------- | :--------------: | :---------: | :-----: | :--------: |
| CLIProxyAPI               | Yes (Fill-First) |     Yes     |    -    |     -      |
| Antigravity-Manager       |       Yes        |     Yes     |    -    |     -      |
| opencode-antigravity-auth |       Yes        |     Yes     |   Yes   |    Yes     |
| **ag-cl**                 |       Yes        |   Planned   | Planned |  Planned   |

**Recommendation:** Implement hybrid strategy with PID offset for parallel agents.

### Quota Management

| Project                   | Dual Pools | Proactive Refresh | Reset Parsing | Burn Rate |
| ------------------------- | :--------: | :---------------: | :-----------: | :-------: |
| CLIProxyAPI               |     -      |        Yes        |      Yes      |     -     |
| Antigravity-Manager       |    Yes     |        Yes        |      Yes      |     -     |
| opencode-antigravity-auth |    Yes     |        Yes        |      Yes      |     -     |
| **ag-cl**                 |  Planned   |        Yes        |      Yes      |    Yes    |

**Recommendation:** Implement dual quota pool fallback.

---

## Implementation Roadmap

### Completed

- [x] Multi-account pooling with verification
- [x] Quota tracking with burn rate calculation
- [x] TUI dashboard with real-time updates
- [x] Share mode with tunneling
- [x] OAuth flow (browser + no-browser)
- [x] Auto-refresh (5-hour interval)
- [x] Empty response retry (`--max-empty-retries`)
- [x] SSE streaming with proper parsing
- [x] Model fallback on quota exhaustion

### Phase 1: Quick Wins (Low Effort, High Value)

- [ ] Warmup request interception (20-40% quota savings)
- [ ] Smart exponential backoff (60s -> 5m -> 30m -> 2h)
- [ ] Optimistic reset (clear all limits when wait <= 2s)

### Phase 2: Core Improvements (Medium Effort, High Value)

- [ ] Model-level rate limiting (per account+model tuple)
- [ ] Account selection strategies (sticky, round-robin, hybrid)
- [ ] PID offset for parallel agent distribution
- [ ] Dual quota pool fallback (Antigravity + Gemini CLI)

### Phase 3: Advanced Features (High Effort, Medium Value)

- [ ] Thinking signature cache (memory + disk TTL)
- [ ] Auto-stream conversion (non-stream -> SSE -> JSON)
- [ ] Session recovery (auto-resume on errors)
- [ ] Model variants system (thinking budget via variants)

### Future Considerations

- [ ] WebSocket gateway for AI Studio real-time connections
- [ ] Desktop tray integration (Tauri)
- [ ] Device fingerprint binding per account
- [ ] Config presets system

---

## Smart Backoff Reference

| Consecutive Failures | Lockout Duration |
| -------------------- | ---------------- |
| 1                    | 60 seconds       |
| 2                    | 5 minutes        |
| 3                    | 30 minutes       |
| 4+                   | 2 hours          |

---

## Quota Pool Reference

| Provider | Pool 1 (Primary) | Pool 2 (Fallback) |
| -------- | ---------------- | ----------------- |
| Gemini   | Antigravity      | Gemini CLI        |
| Claude   | Antigravity      | -                 |

**Effect:** Doubles effective Gemini quota per account when both pools are utilized.

---

## Account Selection Strategies

| Strategy                | Behavior                                    | Best For                  |
| ----------------------- | ------------------------------------------- | ------------------------- |
| `sticky` / `fill-first` | Same account until rate-limited             | Prompt cache preservation |
| `round-robin`           | Rotate on every request                     | Maximum throughput        |
| `hybrid`                | Touch all fresh accounts first, then sticky | Sync reset timers + cache |

---

## References

- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) - Go multi-provider proxy
- [Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager) - Rust/Tauri desktop app
- [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) - OpenCode plugin
- [claude-code-router](https://github.com/musistudio/claude-code-router) - TypeScript SSE router
- [claude-code-proxy](https://github.com/1rgs/claude-code-proxy) - Python LiteLLM proxy
