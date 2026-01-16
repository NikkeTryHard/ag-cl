# Claude Code Proxy Ecosystem Report

> Deep analysis of related proxy projects for Claude Code CLI integration.
> Generated: 2026-01-11

## Navigation

| Document                    | Description                     |
| --------------------------- | ------------------------------- |
| [Patterns](patterns.md)     | Cross-project pattern analysis  |
| [Roadmap](roadmap.md)       | Priority implementation roadmap |
| [Matrix](matrix.md)         | Feature comparison matrix       |
| [References](references.md) | Project links                   |

### Deep Dives (Implementation Details)

| Document                                                   | Description                              |
| ---------------------------------------------------------- | ---------------------------------------- |
| [Core Strategies](deep-dives/core-strategies.md)           | Warmup, dual quota, signatures, recovery |
| [Rate Limiting](deep-dives/rate-limiting.md)               | Backoff, quota fallback, tiered limits   |
| [Session & Streaming](deep-dives/session-streaming.md)     | Auth queues, token refresh, streaming    |
| [Protocol Translation](deep-dives/protocol-translation.md) | SSE parsing, schema cleaning, bridging   |
| [Resilience](deep-dives/resilience.md)                     | Error handling, session recovery         |
| [Extensions](deep-dives/extensions.md)                     | Tokenizers, MCP, CLI utilities           |

---

## Executive Summary

This report analyzes 5 major ecosystem projects that provide proxy/routing functionality for Claude Code and similar AI CLI tools. Each project offers unique patterns that could be adopted for ag-cl.

| Project                                                                             | Language   | Primary Focus                     | Maturity |
| ----------------------------------------------------------------------------------- | ---------- | --------------------------------- | -------- |
| [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)                         | Go         | Multi-provider enterprise proxy   | High     |
| [Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager)                | Rust/React | Desktop app with quota management | High     |
| [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) | TypeScript | OpenCode plugin for Antigravity   | Medium   |
| [claude-code-router](https://github.com/musistudio/claude-code-router)              | TypeScript | Lightweight SSE routing           | Low      |
| [claude-code-proxy](https://github.com/1rgs/claude-code-proxy)                      | Python     | LiteLLM-based proxy               | Medium   |

---

## 1. CLIProxyAPI (Go)

**Repository**: https://github.com/router-for-me/CLIProxyAPI

### Architecture

Enterprise-grade Go service with modular provider support. Key components:

```
CLIProxyAPI/
├── sdk/cliproxy/
│   ├── service.go       # Core service lifecycle
│   ├── auth/            # Authentication managers
│   └── usage/           # Usage tracking plugins
├── internal/
│   ├── api/             # HTTP server
│   ├── registry/        # Model registry
│   ├── runtime/executor/ # Provider executors
│   ├── watcher/         # File system monitoring
│   └── wsrelay/         # WebSocket gateway
```

### Key Features

#### Multi-Provider Executor System

```go
switch strings.ToLower(a.Provider) {
case "gemini":
    s.coreManager.RegisterExecutor(executor.NewGeminiExecutor(s.cfg))
case "vertex":
    s.coreManager.RegisterExecutor(executor.NewGeminiVertexExecutor(s.cfg))
case "gemini-cli":
    s.coreManager.RegisterExecutor(executor.NewGeminiCLIExecutor(s.cfg))
case "aistudio":
    s.coreManager.RegisterExecutor(executor.NewAIStudioExecutor(s.cfg, a.ID, s.wsGateway))
case "antigravity":
    s.coreManager.RegisterExecutor(executor.NewAntigravityExecutor(s.cfg))
case "claude":
    s.coreManager.RegisterExecutor(executor.NewClaudeExecutor(s.cfg))
case "codex":
    s.coreManager.RegisterExecutor(executor.NewCodexExecutor(s.cfg))
case "qwen":
    s.coreManager.RegisterExecutor(executor.NewQwenExecutor(s.cfg))
case "iflow":
    s.coreManager.RegisterExecutor(executor.NewIFlowExecutor(s.cfg))
default:
    s.coreManager.RegisterExecutor(executor.NewOpenAICompatExecutor(providerKey, s.cfg))
}
```

#### Routing Strategies

- **Round-Robin**: Rotate to next account on every request
- **Fill-First**: Stick to same account until rate-limited

```go
switch nextStrategy {
case "fill-first":
    selector = &coreauth.FillFirstSelector{}
default:
    selector = &coreauth.RoundRobinSelector{}
}
```

#### WebSocket Gateway for AI Studio

Real-time provider connections with auto-registration:

```go
func (s *Service) wsOnConnected(channelID string) {
    auth := &coreauth.Auth{
        ID:         channelID,
        Provider:   "aistudio",
        Status:     coreauth.StatusActive,
        Attributes: map[string]string{"runtime_only": "true"},
    }
    s.emitAuthUpdate(context.Background(), watcher.AuthUpdate{
        Action: watcher.AuthUpdateActionAdd,
        Auth:   auth,
    })
}
```

#### Auth Update Queue

Asynchronous authentication updates with buffering:

```go
func (s *Service) ensureAuthUpdateQueue(ctx context.Context) {
    s.authUpdates = make(chan watcher.AuthUpdate, 256)
    go s.consumeAuthUpdates(queueCtx)
}
```

### Adoption Candidates for ag-cl

| Feature                                  | Priority | Effort | Value         |
| ---------------------------------------- | -------- | ------ | ------------- |
| Multi-provider executor pattern          | High     | High   | Extensibility |
| Routing strategy abstraction             | Medium   | Medium | Flexibility   |
| Auth update queue                        | Low      | Medium | Reliability   |
| Model registry with dynamic registration | Medium   | High   | Scalability   |

---

## 2. Antigravity-Manager (Rust/React/Tauri)

**Repository**: https://github.com/lbjlaq/Antigravity-Manager

### Architecture

Desktop application built with Tauri v2 (Rust backend, React frontend).

```
Antigravity-Manager/
├── src-tauri/src/
│   ├── proxy/
│   │   ├── mappers/    # Protocol converters
│   │   │   ├── claude/
│   │   │   │   ├── collector.rs    # SSE collection
│   │   │   │   └── request.rs
│   │   │   ├── openai/
│   │   │   │   └── collector.rs
│   │   │   └── gemini/
│   │   ├── handlers/   # Request handlers
│   │   └── middleware/ # Auth, logging
│   ├── device.rs       # Device fingerprint
│   └── update_checker.rs
├── src/
│   ├── services/
│   │   └── accountService.ts
│   └── components/
```

### Key Features

#### Auto-Stream Conversion (429 Mitigation)

Converts non-stream requests to stream, collects SSE, returns JSON:

```
Non-stream request → Force stream=true → Collect SSE chunks → Convert to JSON
```

**Impact**: 429 errors reduced from "frequent" to "almost eliminated"

#### Model-Level Rate Limiting

Rate limits tracked per model, not per account:

```rust
// Before: Gemini Flash 429 → entire account locked
// After: Gemini Flash 429 → only Flash locked, Pro/Claude still work
```

#### Warmup Request Interception

Claude Code sends warmup requests every 10 seconds. The proxy intercepts these:

```rust
// Detection criteria:
// - Text content patterns
// - tool_result errors
// Response: Synthetic success (no API call)
// Header: X-Warmup-Intercepted
```

**Impact**: Significant quota savings over long sessions.

#### Device Fingerprint Binding

Per-account device fingerprint management:

```typescript
interface DeviceProfile {
  // Unique device identifiers per account
  // Reduces risk of account association/banning
}

// Features:
// - Capture current device fingerprint
// - Generate random fingerprint
// - Version history with restore
// - Per-account binding
```

#### Optimistic Reset Strategy

Two-layer defense for 429 edge cases:

```
Layer 1 (Buffer Delay): All accounts limited, wait ≤2s → 500ms buffer
Layer 2 (Optimistic Reset): Still blocked → clear all limits, retry
```

#### Smart Backoff

| Consecutive Failures | Lockout Duration |
| -------------------- | ---------------- |
| 1                    | 60 seconds       |
| 2                    | 5 minutes        |
| 3                    | 30 minutes       |
| 4+                   | 2 hours          |

#### Quota Duration Parsing

Parses complex Google API duration formats:

```rust
// Supports: "2h21m25.831582438s", "1h30m", "5m", "30s"
fn parse_duration_string(s: &str) -> Duration { ... }
```

#### Usage Scaling (Experimental)

Prevents clients from triggering false context compression when using Gemini's large context window:

```
Problem: Claude Code assumes 200k limit → triggers compression on Gemini's 1M context
Solution: Report scaled token counts → sqrt(tokens) when input > 30k
Example: 1M real tokens → reported as ~40k tokens
```

**Configuration**:

- Toggle: `enable_usage_scaling` in Experimental Settings
- Trigger: Input tokens > 30,000
- Algorithm: Square-root scaling
- Scope: Gemini models only (Claude models unaffected)
- Clients: Claude Code, Cursor, Windsurf

### Adoption Candidates for ag-cl

| Feature                         | Priority     | Effort | Value                      |
| ------------------------------- | ------------ | ------ | -------------------------- |
| Warmup request interception     | **Critical** | Low    | Quota savings              |
| Model-level rate limiting       | High         | Medium | Better quota utilization   |
| Auto-stream conversion          | High         | Medium | 429 reduction              |
| Smart exponential backoff       | Medium       | Low    | Stability                  |
| Optimistic reset strategy       | Medium       | Low    | Edge case handling         |
| Usage scaling (token reporting) | High         | Low    | Prevents false compression |
| Device fingerprint binding      | Low          | High   | Account protection         |

---

## 3. opencode-antigravity-auth (TypeScript)

**Repository**: https://github.com/NoeFabris/opencode-antigravity-auth

### Architecture

OpenCode plugin providing Antigravity OAuth integration.

### Key Features

#### Dual Quota System

Access two independent quota pools per account:

| Quota Pool      | When Used                              |
| --------------- | -------------------------------------- |
| **Antigravity** | Primary (tried first)                  |
| **Gemini CLI**  | Fallback when Antigravity rate-limited |

**Effect**: Doubles effective Gemini quota per account.

#### Account Selection Strategies

```json
{
  "account_selection_strategy": "sticky" | "round-robin" | "hybrid"
}
```

| Strategy      | Behavior                                    | Best For                  |
| ------------- | ------------------------------------------- | ------------------------- |
| `sticky`      | Same account until rate-limited             | Prompt cache preservation |
| `round-robin` | Rotate on every request                     | Maximum throughput        |
| `hybrid`      | Touch all fresh accounts first, then sticky | Sync reset timers + cache |

#### Thinking Block Signature Cache

Persists thinking signatures for conversation continuity:

```json
{
  "signature_cache": {
    "enabled": true,
    "memory_ttl_seconds": 3600,
    "disk_ttl_seconds": 172800,
    "write_interval_seconds": 60
  }
}
```

**Problem solved**: Claude thinking blocks require valid signatures across requests.

#### Model Variants System

Dynamic thinking budget via variants instead of separate models:

```json
{
  "antigravity-claude-sonnet-4-5-thinking": {
    "variants": {
      "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
      "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
    }
  }
}
```

**Before**: 12+ separate model definitions
**After**: 4 models with variants

#### Session Recovery

Auto-recover from `tool_result_missing` errors:

```json
{
  "session_recovery": true,
  "auto_resume": true,
  "resume_text": "continue"
}
```

#### Tool Hardening

- `tool_id_recovery`: Fix mismatched tool IDs from context compaction
- `claude_tool_hardening`: Prevent tool parameter hallucination

### Adoption Candidates for ag-cl

| Feature                      | Priority | Effort | Value                   |
| ---------------------------- | -------- | ------ | ----------------------- |
| Dual quota pool fallback     | High     | Medium | Doubled quota           |
| Account selection strategies | High     | Medium | Flexibility             |
| Signature cache              | High     | Medium | Conversation continuity |
| Session recovery             | Medium   | Low    | Resilience              |
| Model variants               | Medium   | Medium | Cleaner API             |

---

## 4. claude-code-router (TypeScript)

**Repository**: https://github.com/musistudio/claude-code-router

### Architecture

Lightweight TypeScript router with SSE parsing.

### Key Features

#### SSE Parser with TransformStream

```typescript
export class SSEParserTransform extends TransformStream<string, any> {
  private buffer = "";
  private currentEvent: Record<string, any> = {};

  constructor() {
    super({
      transform: (chunk: string, controller) => {
        this.buffer += chunk;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || ""; // Keep incomplete line

        for (const line of lines) {
          const event = this.processLine(line);
          if (event) controller.enqueue(event);
        }
      },
      flush: (controller) => {
        // Process remaining buffer
        if (this.buffer.trim()) {
          // ...
        }
      },
    });
  }

  private processLine(line: string): any | null {
    if (!line.trim()) {
      // Empty line = event boundary
      if (Object.keys(this.currentEvent).length > 0) {
        const event = { ...this.currentEvent };
        this.currentEvent = {};
        return event;
      }
      return null;
    }

    if (line.startsWith("event:")) {
      this.currentEvent.event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        this.currentEvent.data = { type: "done" };
      } else {
        try {
          this.currentEvent.data = JSON.parse(data);
        } catch (e) {
          this.currentEvent.data = { raw: data, error: "JSON parse failed" };
        }
      }
    } else if (line.startsWith("id:")) {
      this.currentEvent.id = line.slice(3).trim();
    } else if (line.startsWith("retry:")) {
      this.currentEvent.retry = parseInt(line.slice(6).trim());
    }
    return null;
  }
}
```

### Adoption Candidates for ag-cl

| Feature                            | Priority | Effort | Value      |
| ---------------------------------- | -------- | ------ | ---------- |
| TransformStream-based SSE parser   | Low      | Low    | Modern API |
| Graceful JSON parse error handling | Low      | Low    | Robustness |

---

## 5. claude-code-proxy (Python/LiteLLM)

**Repository**: https://github.com/1rgs/claude-code-proxy

### Architecture

Python proxy using LiteLLM for multi-provider support.

### Key Features

- LiteLLM abstraction for multiple AI providers
- Simple deployment model
- Anthropic-compatible API surface

### Adoption Candidates for ag-cl

Limited applicability due to different language/architecture.

---
