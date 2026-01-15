# Claude Code Proxy Ecosystem Report

> Deep analysis of related proxy projects for Claude Code CLI integration.
> Generated: 2026-01-11

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
│   ├── service.go       # Core service lifecycle (1326 lines)
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

### Adoption Candidates for ag-cl

| Feature                     | Priority     | Effort | Value                    |
| --------------------------- | ------------ | ------ | ------------------------ |
| Warmup request interception | **Critical** | Low    | Quota savings            |
| Model-level rate limiting   | High         | Medium | Better quota utilization |
| Auto-stream conversion      | High         | Medium | 429 reduction            |
| Smart exponential backoff   | Medium       | Low    | Stability                |
| Optimistic reset strategy   | Medium       | Low    | Edge case handling       |
| Device fingerprint binding  | Low          | High   | Account protection       |

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

## Cross-Project Pattern Analysis

### Rate Limiting Strategies

| Project                   | Account-Level | Model-Level | Smart Backoff | Optimistic Reset |
| ------------------------- | ------------- | ----------- | ------------- | ---------------- |
| CLIProxyAPI               | ✓             | ✗           | ✓             | ✗                |
| Antigravity-Manager       | ✓             | ✓           | ✓             | ✓                |
| opencode-antigravity-auth | ✓             | ✗           | ✓             | ✗                |

**Recommendation**: Implement model-level rate limiting + optimistic reset.

### Account Selection

| Project                   | Sticky         | Round-Robin | Hybrid | PID Offset |
| ------------------------- | -------------- | ----------- | ------ | ---------- |
| CLIProxyAPI               | ✓ (Fill-First) | ✓           | ✗      | ✗          |
| Antigravity-Manager       | ✓              | ✓           | ✗      | ✗          |
| opencode-antigravity-auth | ✓              | ✓           | ✓      | ✓          |

**Recommendation**: Implement hybrid strategy with PID offset for parallel agents.

### Quota Management

| Project                   | Dual Pools | Proactive Refresh | Reset Parsing | Burn Rate |
| ------------------------- | ---------- | ----------------- | ------------- | --------- |
| CLIProxyAPI               | ✗          | ✓                 | ✓             | ✗         |
| Antigravity-Manager       | ✓          | ✓                 | ✓             | ✗         |
| opencode-antigravity-auth | ✓          | ✓                 | ✓             | ✗         |
| ag-cl (current)           | ✗          | ✓                 | ✓             | ✓         |

**Recommendation**: Implement dual quota pool fallback.

### Thinking Block Handling

| Project                   | Signature Cache | Thinking Variants | Auto-Disable | Signature Validation |
| ------------------------- | --------------- | ----------------- | ------------ | -------------------- |
| CLIProxyAPI               | ✗               | ✗                 | ✗            | ✗                    |
| Antigravity-Manager       | ✓               | ✓                 | ✓            | ✓                    |
| opencode-antigravity-auth | ✓               | ✓                 | ✓            | ✗                    |

**Recommendation**: Implement signature caching with TTL.

---

## Priority Implementation Roadmap

### Phase 1: Quick Wins (Low Effort, High Value)

1. **Warmup Request Interception**
   - Detect Claude Code warmup patterns
   - Return synthetic success response
   - Add `X-Warmup-Intercepted` header
   - **Estimated quota savings**: 20-40% over long sessions

2. **Smart Exponential Backoff**
   - Track consecutive failures per account
   - Escalating lockout: 60s → 5m → 30m → 2h
   - Reset on success

3. **Optimistic Reset Strategy**
   - Detect "all accounts blocked but shortest wait ≤2s"
   - Buffer 500ms, then clear all limits
   - Prevents false "no available accounts" errors

### Phase 2: Core Improvements (Medium Effort, High Value)

4. **Model-Level Rate Limiting**
   - Track rate limits per `(account, model)` tuple
   - Allow Claude when only Gemini is limited
   - Significantly improves multi-model utilization

5. **Account Selection Strategies**
   - Implement: sticky, round-robin, hybrid
   - Add PID offset for parallel agent distribution
   - Make configurable via CLI flag

6. **Dual Quota Pool Fallback**
   - Try Antigravity quota first
   - Fallback to Gemini CLI quota on 429
   - Doubles effective quota per account

### Phase 3: Advanced Features (High Effort, Medium Value)

7. **Thinking Signature Cache**
   - Memory cache with configurable TTL (default: 1 hour)
   - Disk persistence for session recovery
   - Automatic signature extraction from responses

8. **Auto-Stream Conversion**
   - Force `stream: true` on non-stream requests
   - Collect SSE chunks into response buffer
   - Convert to JSON response
   - Eliminates most non-stream 429 errors

9. **Session Recovery**
   - Detect `tool_result_missing` errors
   - Auto-send configurable resume text
   - Log recovery events

---

## Appendix: Feature Comparison Matrix

| Feature                | ag-cl   | CLIProxyAPI | Antigravity-Manager | opencode-auth |
| ---------------------- | ------- | ----------- | ------------------- | ------------- |
| **Providers**          |
| Gemini                 | ✓       | ✓           | ✓                   | ✓             |
| Claude (API)           | ✓       | ✓           | ✓                   | ✓             |
| Vertex AI              | ✗       | ✓           | ✗                   | ✗             |
| OpenAI/Codex           | ✗       | ✓           | ✓                   | ✗             |
| Qwen                   | ✗       | ✓           | ✗                   | ✗             |
| **Rate Limiting**      |
| Per-account            | ✓       | ✓           | ✓                   | ✓             |
| Per-model              | ✗       | ✗           | ✓                   | ✗             |
| Smart backoff          | ✓       | ✓           | ✓                   | ✓             |
| Optimistic reset       | ✗       | ✗           | ✓                   | ✗             |
| **Account Management** |
| Multi-account          | ✓       | ✓           | ✓                   | ✓             |
| Rotation strategies    | Limited | ✓           | ✓                   | ✓             |
| PID offset             | ✗       | ✗           | ✗                   | ✓             |
| **Quota**              |
| Dual pools             | ✗       | ✗           | ✓                   | ✓             |
| Auto-refresh           | ✓       | ✓           | ✓                   | ✓             |
| Burn rate tracking     | ✓       | ✗           | ✗                   | ✗             |
| **Resilience**         |
| Warmup interception    | ✗       | ✗           | ✓                   | ✗             |
| Empty response retry   | ✓       | ✗           | ✓                   | ✗             |
| Session recovery       | ✗       | ✗           | ✓                   | ✓             |
| Auto-stream conversion | ✗       | ✗           | ✓                   | ✗             |
| **Thinking Support**   |
| Signature handling     | ✓       | ✗           | ✓                   | ✓             |
| Signature cache        | ✗       | ✗           | ✓                   | ✓             |
| Variants system        | ✗       | ✗           | ✓                   | ✓             |

---

## Appendix B: Implementation Deep Dives

### Warmup Request Interception (Antigravity-Manager)

**Source**: `src-tauri/src/proxy/handlers/claude.rs`

Claude Code sends warmup requests every ~10 seconds to keep connections alive. These consume quota unnecessarily.

**Detection Logic**:

```rust
fn is_warmup_request(request: &ClaudeRequest) -> bool {
    // Detection criteria:
    // 1. Text content containing "Warmup"
    // 2. tool_result errors with "Warmup" content
    // 3. Multiple warmup tool_results (≥2 out of last 10 messages)

    let mut warmup_tool_result_count = 0;
    let mut total_tool_results = 0;

    for msg in request.messages.iter().rev().take(10) {
        for content in &msg.content {
            match content {
                ContentBlock::Text { text } => {
                    if text.trim().eq_ignore_ascii_case("warmup") {
                        return true;
                    }
                }
                ContentBlock::ToolResult { content, is_error, .. } => {
                    total_tool_results += 1;
                    if *is_error && content.to_lowercase().contains("warmup") {
                        warmup_tool_result_count += 1;
                    }
                }
                _ => {}
            }
        }
    }

    // If majority of tool_results are warmup errors, confirm
    if total_tool_results >= 3 && warmup_tool_result_count >= total_tool_results / 2 {
        return true;
    }

    false
}
```

**Response Generation**:

```rust
fn create_warmup_response(request: &ClaudeRequest, is_stream: bool) -> Response {
    let response_body = json!({
        "id": format!("msg_warmup_{}", uuid::Uuid::new_v4()),
        "type": "message",
        "role": "assistant",
        "content": [{
            "type": "text",
            "text": "Warmup acknowledged."
        }],
        "model": &request.model,
        "stop_reason": "end_turn",
        "stop_sequence": null,
        "usage": {
            "input_tokens": 0,
            "output_tokens": 3
        }
    });

    let mut builder = Response::builder()
        .status(200)
        .header("content-type", "application/json")
        .header("x-warmup-intercepted", "true");

    if is_stream {
        // Return SSE format for streaming requests
        let sse_body = format!(
            "event: message_start\ndata: {}\n\n\
             event: message_stop\ndata: {{}}\n\n",
            response_body
        );
        builder.header("content-type", "text/event-stream").body(sse_body)
    } else {
        builder.body(response_body.to_string())
    }
}
```

**ag-cl Implementation Notes**:

- Add to request handler before forwarding to upstream
- Track interception count in metrics
- Consider `X-Warmup-Intercepted: true` header for debugging

---

### Model-Level Rate Limiting (Antigravity-Manager)

**Source**: `src-tauri/src/proxy/rate_limit.rs`

Track rate limits per (account, model) tuple instead of just per account.

**Data Structure**:

```rust
pub struct RateLimitInfo {
    pub reset_time: SystemTime,
    pub retry_after_sec: u64,
    pub detected_at: SystemTime,
    pub reason: RateLimitReason,
    pub model: Option<String>,  // None = account-level, Some = model-level
}

pub enum RateLimitReason {
    QuotaExhausted,           // Daily/hourly quota used up
    RateLimitExceeded,        // Per-minute rate limit
    ModelCapacityExhausted,   // No GPU instances available
    ServerError,              // 5xx errors
    Unknown,
}
```

**Smart Exponential Backoff**:

```rust
fn calculate_lockout(&self, account_id: &str, reason: RateLimitReason) -> u64 {
    let failure_count = {
        let mut count = self.failure_counts.entry(account_id.to_string()).or_insert(0);
        *count += 1;
        *count
    };

    match reason {
        RateLimitReason::QuotaExhausted => {
            // Escalating lockout for persistent quota issues
            match failure_count {
                1 => 60,      // 1 minute
                2 => 300,     // 5 minutes
                3 => 1800,    // 30 minutes
                _ => 7200,    // 2 hours
            }
        }
        RateLimitReason::RateLimitExceeded => 30,   // Short TPM limits
        RateLimitReason::ModelCapacityExhausted => 15, // Retry soon
        RateLimitReason::ServerError => 20,         // Soft backoff
        RateLimitReason::Unknown => 60,
    }
}
```

**Duration Parsing** (Google's complex formats):

```rust
fn parse_duration_string(s: &str) -> Option<u64> {
    // Supports: "2h21m25.831582438s", "1h30m", "5m", "30s", "500ms"
    let re = Regex::new(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?").ok()?;
    let caps = re.captures(s)?;

    let hours = caps.get(1).and_then(|m| m.as_str().parse::<u64>().ok()).unwrap_or(0);
    let minutes = caps.get(2).and_then(|m| m.as_str().parse::<u64>().ok()).unwrap_or(0);
    let seconds = caps.get(3).and_then(|m| m.as_str().parse::<f64>().ok()).unwrap_or(0.0);
    let milliseconds = caps.get(4).and_then(|m| m.as_str().parse::<u64>().ok()).unwrap_or(0);

    let total_seconds = hours * 3600 + minutes * 60 + seconds.ceil() as u64 + (milliseconds + 999) / 1000;
    if total_seconds > 0 { Some(total_seconds) } else { None }
}
```

**Optimistic Reset**:

```rust
pub fn clear_all(&self) {
    // When all accounts blocked but wait ≤2s, clear all limits
    // Fixes race conditions where timers are slightly off
    let count = self.limits.len();
    self.limits.clear();
    tracing::warn!("Optimistic reset: Cleared {} rate limit records", count);
}
```

---

### Dual Quota Pool Fallback (opencode-antigravity-auth)

**Source**: `src/plugin.ts`

Gemini has two independent quota pools per account: Antigravity and Gemini CLI.

**Header Style Routing**:

```typescript
type HeaderStyle = "antigravity" | "gemini-cli";

function getHeaderStyleFromUrl(urlString: string, family: ModelFamily): HeaderStyle {
  if (family === "claude") return "antigravity"; // Claude always uses Antigravity

  const modelWithSuffix = extractModelFromUrlWithSuffix(urlString);
  if (!modelWithSuffix) return "gemini-cli";

  const { quotaPreference } = resolveModelWithTier(modelWithSuffix);
  return quotaPreference ?? "gemini-cli";
}
```

**Fallback Logic**:

```typescript
// Check if current header style is rate-limited
if (accountManager.isRateLimitedForHeaderStyle(account, family, headerStyle, model)) {
  // Try alternate quota pool on same account
  if (config.quota_fallback && !explicitQuota && family === "gemini") {
    const alternateStyle = accountManager.getAvailableHeaderStyle(account, family, model);
    if (alternateStyle && alternateStyle !== headerStyle) {
      const quotaName = headerStyle === "gemini-cli" ? "Gemini CLI" : "Antigravity";
      const altQuotaName = alternateStyle === "gemini-cli" ? "Gemini CLI" : "Antigravity";
      await showToast(`${quotaName} quota exhausted, using ${altQuotaName} quota`, "warning");
      headerStyle = alternateStyle;
    } else {
      shouldSwitchAccount = true;
    }
  } else {
    shouldSwitchAccount = true;
  }
}
```

**Rate Limit Deduplication** (prevents concurrent 429s from inflating backoff):

```typescript
const RATE_LIMIT_DEDUP_WINDOW_MS = 2000; // 2 seconds

function getRateLimitBackoff(accountIndex: number, quotaKey: string, serverRetryAfterMs: number | null): { attempt: number; delayMs: number; isDuplicate: boolean } {
  const now = Date.now();
  const stateKey = `${accountIndex}:${quotaKey}`;
  const previous = rateLimitStateByAccountQuota.get(stateKey);

  // Deduplicate: multiple 429s within 2s = same event
  if (previous && now - previous.lastAt < RATE_LIMIT_DEDUP_WINDOW_MS) {
    const baseDelay = serverRetryAfterMs ?? 1000;
    const backoffDelay = Math.min(baseDelay * Math.pow(2, previous.consecutive429 - 1), 60_000);
    return {
      attempt: previous.consecutive429,
      delayMs: Math.max(baseDelay, backoffDelay),
      isDuplicate: true, // Don't increment counter
    };
  }

  // New event or expired window: increment counter
  const attempt = previous && now - previous.lastAt < RATE_LIMIT_STATE_RESET_MS ? previous.consecutive429 + 1 : 1;

  rateLimitStateByAccountQuota.set(stateKey, {
    consecutive429: attempt,
    lastAt: now,
    quotaKey,
  });

  const baseDelay = serverRetryAfterMs ?? 1000;
  const backoffDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), 60_000);
  return { attempt, delayMs: Math.max(baseDelay, backoffDelay), isDuplicate: false };
}
```

---

### Thinking Signature Cache (Both Projects)

**Problem**: Claude thinking blocks require valid signatures for multi-turn conversations. When context is compacted or messages are edited, signatures become invalid.

#### Antigravity-Manager Implementation (Rust)

**Source**: `src-tauri/src/proxy/signature_cache.rs`

```rust
pub struct SignatureCache {
    // Layer 1: tool_use_id -> signature
    tool_signatures: Mutex<HashMap<String, CacheEntry<String>>>,

    // Layer 2: signature -> model_family (cross-model validation)
    thinking_families: Mutex<HashMap<String, CacheEntry<String>>>,
}

const SIGNATURE_TTL: Duration = Duration::from_secs(2 * 60 * 60); // 2 hours
const MIN_SIGNATURE_LENGTH: usize = 50;

impl SignatureCache {
    pub fn global() -> &'static SignatureCache {
        static INSTANCE: OnceLock<SignatureCache> = OnceLock::new();
        INSTANCE.get_or_init(SignatureCache::new)
    }

    pub fn cache_tool_signature(&self, tool_use_id: &str, signature: String) {
        if signature.len() < MIN_SIGNATURE_LENGTH { return; }

        if let Ok(mut cache) = self.tool_signatures.lock() {
            cache.insert(tool_use_id.to_string(), CacheEntry::new(signature));

            // Lazy cleanup when size exceeds threshold
            if cache.len() > 1000 {
                cache.retain(|_, v| !v.is_expired());
            }
        }
    }
}
```

#### opencode-antigravity-auth Implementation (TypeScript)

**Source**: `src/plugin/cache/signature-cache.ts`

**Features**:

- Dual-TTL: short memory TTL (1h), longer disk TTL (48h)
- Atomic disk writes (temp file + rename)
- Background persistence with batched writes
- SHA-256 hashing for cache keys

```typescript
export class SignatureCache {
  private cache: Map<string, CacheEntry> = new Map();
  private dirty: boolean = false;
  private writeTimer: ReturnType<typeof setInterval> | null = null;

  // Store with optional full thinking text for recovery
  storeThinking(key: string, thinkingText: string, signature: string, toolIds?: string[]): void {
    if (!this.enabled || !thinkingText || !signature) return;

    this.cache.set(key, {
      value: signature,
      timestamp: Date.now(),
      thinkingText,
      textPreview: thinkingText.slice(0, 100),
      toolIds,
    });
    this.dirty = true;
  }

  // Atomic disk write pattern
  private saveToDisk(): boolean {
    // 1. Load existing disk entries
    // 2. Filter by disk_ttl
    // 3. Merge (memory takes precedence)
    // 4. Write to temp file
    // 5. Atomic rename to final path

    const tmpPath = join(tmpdir(), `cache-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    writeFileSync(tmpPath, JSON.stringify(cacheData, null, 2), "utf-8");

    try {
      renameSync(tmpPath, this.cacheFilePath);
    } catch {
      // Windows fallback: copy + delete
      writeFileSync(this.cacheFilePath, readFileSync(tmpPath));
      try {
        unlinkSync(tmpPath);
      } catch {}
    }

    this.dirty = false;
    return true;
  }
}
```

**In-Memory Integration** (`src/plugin/cache.ts`):

```typescript
// Hash thinking text for cache key (bounded memory)
function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16); // 64-bit key space
}

export function cacheSignature(sessionId: string, text: string, signature: string): void {
  const textHash = hashText(text);

  // Memory cache with LRU eviction
  let sessionCache = signatureCache.get(sessionId);
  if (!sessionCache) {
    sessionCache = new Map();
    signatureCache.set(sessionId, sessionCache);
  }

  // Evict expired entries at capacity
  if (sessionCache.size >= MAX_ENTRIES_PER_SESSION) {
    const now = Date.now();
    for (const [key, entry] of sessionCache.entries()) {
      if (now - entry.timestamp > SIGNATURE_CACHE_TTL_MS) {
        sessionCache.delete(key);
      }
    }
  }

  sessionCache.set(textHash, { signature, timestamp: Date.now() });

  // Also write to disk cache
  if (diskCache) {
    diskCache.store(`${sessionId}:${textHash}`, signature);
  }
}
```

---

### Session Recovery (opencode-antigravity-auth)

**Source**: `src/plugin/recovery.ts`

**Recoverable Error Types**:

| Error Type                    | Cause                              | Recovery                            |
| ----------------------------- | ---------------------------------- | ----------------------------------- |
| `tool_result_missing`         | ESC pressed during tool execution  | Inject synthetic tool_result blocks |
| `thinking_block_order`        | Thinking blocks corrupted/stripped | Prepend thinking parts to messages  |
| `thinking_disabled_violation` | Thinking in non-thinking model     | Strip thinking parts                |

**Detection**:

```typescript
export function detectErrorType(error: unknown): RecoveryErrorType {
  const message = getErrorMessage(error);

  if (message.includes("tool_use") && message.includes("tool_result")) {
    return "tool_result_missing";
  }

  if (message.includes("thinking") && (message.includes("first block") || message.includes("must start with") || message.includes("preceeding"))) {
    return "thinking_block_order";
  }

  if (message.includes("thinking is disabled") && message.includes("cannot contain")) {
    return "thinking_disabled_violation";
  }

  return null;
}
```

**Tool Result Recovery**:

```typescript
async function recoverToolResultMissing(client: PluginClient, sessionID: string, failedMsg: MessageData): Promise<boolean> {
  // Extract tool_use IDs from the failed message
  const toolUseIds = extractToolUseIds(failedMsg.parts || []);

  if (toolUseIds.length === 0) return false;

  // Inject synthetic tool_result blocks
  const toolResultParts = toolUseIds.map((id) => ({
    type: "tool_result" as const,
    tool_use_id: id,
    content: "Operation cancelled by user (ESC pressed)",
  }));

  await client.session.prompt({
    path: { id: sessionID },
    body: { parts: toolResultParts },
  });

  return true;
}
```

---

### Claude Tool Hardening (opencode-antigravity-auth)

**Source**: `src/plugin/request-helpers.ts`

Claude models can hallucinate tool parameters from training data. Tool hardening helps prevent this by making parameter requirements explicit.

**Two-Layer Defense**:

| Layer                    | Method                                   | Purpose                       |
| ------------------------ | ---------------------------------------- | ----------------------------- |
| 1. Description Injection | Add parameter hints to tool descriptions | Model sees constraints inline |
| 2. System Instruction    | Add tool usage rules to system prompt    | Reinforces correct behavior   |

**Layer 1: Parameter Signature Injection**

Appends parameter type hints to each tool's description:

```typescript
const SKIP_PARSE_KEYS = new Set(["oldString", "newString", "content", "filePath", "path", "text", "code", "source", "data", "body", "message", "prompt", "input", "output", "result", "value", "query", "pattern", "replacement", "template", "script", "command", "snippet"]);

function formatTypeHint(propData: Record<string, unknown>, depth = 0): string {
  const type = (propData.type as string) ?? "unknown";

  // Handle enum values
  if (propData.enum && Array.isArray(propData.enum)) {
    const enumVals = propData.enum as unknown[];
    if (enumVals.length <= 5) {
      return `string ENUM[${enumVals.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    return `string ENUM[${enumVals.length} options]`;
  }

  // Handle const values
  if (propData.const !== undefined) {
    return `string CONST=${JSON.stringify(propData.const)}`;
  }

  if (type === "array") {
    const items = propData.items as Record<string, unknown> | undefined;
    if (items && typeof items === "object") {
      const itemType = (items.type as string) ?? "unknown";
      if (itemType === "object" && depth < 1) {
        // Show nested object structure
        return `ARRAY_OF_OBJECTS[${nestedList.join(", ")}]`;
      }
      return `ARRAY_OF_${itemType.toUpperCase()}`;
    }
    return "ARRAY";
  }

  return type;
}

export function injectParameterSignatures(tools: any[], promptTemplate = "\n\n⚠️ STRICT PARAMETERS: {params}."): any[] {
  return tools.map((tool) => {
    const declarations = tool.functionDeclarations;
    if (!Array.isArray(declarations)) return tool;

    const newDeclarations = declarations.map((decl: any) => {
      // Skip if signature already injected
      if (decl.description?.includes("STRICT PARAMETERS:")) {
        return decl;
      }

      const schema = decl.parameters || decl.parametersJsonSchema;
      if (!schema) return decl;

      const required = (schema.required as string[]) ?? [];
      const properties = (schema.properties as Record<string, unknown>) ?? {};

      if (Object.keys(properties).length === 0) return decl;

      const paramList = Object.entries(properties).map(([propName, propData]) => {
        const typeHint = formatTypeHint(propData as Record<string, unknown>);
        const isRequired = required.includes(propName);
        return `${propName} (${typeHint}${isRequired ? ", REQUIRED" : ""})`;
      });

      const sigStr = promptTemplate.replace("{params}", paramList.join(", "));

      return {
        ...decl,
        description: (decl.description || "") + sigStr,
      };
    });

    return { ...tool, functionDeclarations: newDeclarations };
  });
}
```

**Example Output**:

```
# Original description:
"Edits a file by replacing old_string with new_string"

# After injection:
"Edits a file by replacing old_string with new_string

⚠️ STRICT PARAMETERS: file_path (string, REQUIRED), old_string (string, REQUIRED), new_string (string, REQUIRED)."
```

**Layer 2: System Instruction Injection**

Prepends tool usage rules to the system prompt:

```typescript
const CLAUDE_TOOL_SYSTEM_INSTRUCTION = `
CRITICAL TOOL USAGE INSTRUCTIONS:
- ONLY use parameters explicitly defined in each tool's schema
- NEVER invent, guess, or add parameters not in the schema
- If a parameter is marked REQUIRED, you MUST provide it
- If uncertain about a parameter, check the tool description
`;

export function injectToolHardeningInstruction(payload: Record<string, unknown>, instructionText: string): void {
  if (!instructionText) return;

  // Skip if instruction already present
  const existing = payload.systemInstruction as Record<string, unknown> | undefined;
  if (existing?.parts?.some((p) => p.text?.includes("CRITICAL TOOL USAGE INSTRUCTIONS"))) {
    return;
  }

  const instructionPart = { text: instructionText };

  if (payload.systemInstruction) {
    // Prepend to existing system instruction
    const parts = existing.parts as unknown[];
    if (Array.isArray(parts)) {
      parts.unshift(instructionPart);
    }
  } else {
    payload.systemInstruction = {
      role: "user",
      parts: [instructionPart],
    };
  }
}
```

**Integration** (in `request.ts`):

```typescript
const enableToolHardening = options?.claudeToolHardening ?? true;
if (enableToolHardening && isClaude && Array.isArray(requestPayload.tools)) {
  // Inject parameter signatures into tool descriptions
  requestPayload.tools = injectParameterSignatures(requestPayload.tools, CLAUDE_DESCRIPTION_PROMPT);

  // Inject tool hardening system instruction
  injectToolHardeningInstruction(requestPayload as Record<string, unknown>, CLAUDE_TOOL_SYSTEM_INSTRUCTION);
}
```

**ag-cl Implementation Notes**:

- Add `claudeToolHardening` config option (default: true)
- Can be disabled to reduce context size for simple tools
- Should be applied after JSON schema cleaning

---

### JSON Schema Cleaning for Antigravity API (opencode-antigravity-auth)

**Source**: `src/plugin/request-helpers.ts`

Claude's VALIDATED mode rejects many standard JSON Schema keywords. This multi-phase transformation converts schemas to Antigravity-compatible format while preserving semantic information in descriptions.

**Unsupported Keywords**:

```typescript
const UNSUPPORTED_CONSTRAINTS = ["minLength", "maxLength", "exclusiveMinimum", "exclusiveMaximum", "pattern", "minItems", "maxItems", "format", "default", "examples"] as const;

const UNSUPPORTED_KEYWORDS = [...UNSUPPORTED_CONSTRAINTS, "$schema", "$defs", "definitions", "const", "$ref", "additionalProperties", "propertyNames", "title", "$id", "$comment"] as const;
```

**Transformation Pipeline**:

| Phase | Function                       | Transformation                                                        |
| ----- | ------------------------------ | --------------------------------------------------------------------- |
| 1a    | `convertRefsToHints`           | `$ref: "#/$defs/Foo"` → `{ type: "object", description: "See: Foo" }` |
| 1b    | `convertConstToEnum`           | `{ const: "foo" }` → `{ enum: ["foo"] }`                              |
| 1c    | `addEnumHints`                 | Adds "(Allowed: a, b, c)" to description for small enums              |
| 1d    | `addAdditionalPropertiesHints` | `additionalProperties: false` → "(No extra properties allowed)"       |
| 1e    | `moveConstraintsToDescription` | `minLength: 1` → "(minLength: 1)" in description                      |
| 2a    | `mergeAllOf`                   | Flattens `allOf` into single object with merged properties            |
| 2b    | `flattenAnyOfOneOf`            | Selects best option, adds "(Accepts: type1 \| type2)" hint            |
| 2c    | `flattenTypeArrays`            | `type: ["string", "null"]` → `type: "string"` + "(nullable)"          |
| 3a    | `removeUnsupportedKeywords`    | Removes all unsupported keywords                                      |
| 3b    | `cleanupRequiredFields`        | Removes required entries for non-existent properties                  |
| 4     | `addEmptySchemaPlaceholder`    | Adds placeholder property to empty object schemas                     |

**Key Transformation: anyOf/oneOf Flattening**

Handles enum-like patterns specially:

```typescript
// Input: anyOf of const values (common in MCP tools)
{ anyOf: [{ const: "text" }, { const: "markdown" }, { const: "html" }] }

// Output: Merged enum
{ type: "string", enum: ["text", "markdown", "html"] }
```

**Empty Schema Placeholder**:

Claude VALIDATED mode requires at least one property. Empty object schemas get a placeholder:

```typescript
const EMPTY_SCHEMA_PLACEHOLDER_NAME = "__placeholder";
const EMPTY_SCHEMA_PLACEHOLDER_DESCRIPTION = "Placeholder for empty schema (always pass true)";

function addEmptySchemaPlaceholder(schema: any): any {
  if (schema.type === "object") {
    const hasProperties = schema.properties && Object.keys(schema.properties).length > 0;
    if (!hasProperties) {
      schema.properties = {
        [EMPTY_SCHEMA_PLACEHOLDER_NAME]: {
          type: "boolean",
          description: EMPTY_SCHEMA_PLACEHOLDER_DESCRIPTION,
        },
      };
      schema.required = [EMPTY_SCHEMA_PLACEHOLDER_NAME];
    }
  }
  return schema;
}
```

---

### Tool ID Assignment and Orphan Recovery (opencode-antigravity-auth)

**Source**: `src/plugin/request-helpers.ts`

Claude requires matching IDs between `functionCall` and `functionResponse` parts. Context compaction or message editing can break this pairing.

**Two-Pass ID Assignment**:

```typescript
export function assignToolIdsToContents(contents: any[]): { contents: any[]; pendingCallIdsByName: Map<string, string[]>; toolCallCounter: number } {
  let toolCallCounter = 0;
  const pendingCallIdsByName = new Map<string, string[]>();

  // Pass 1: Assign IDs to all functionCalls
  const newContents = contents.map((content: any) => {
    const newParts = content.parts.map((part: any) => {
      if (part.functionCall) {
        const call = { ...part.functionCall };
        if (!call.id) {
          call.id = `tool-call-${++toolCallCounter}`;
        }
        // Track by function name (FIFO queue)
        const nameKey = call.name || `tool-${toolCallCounter}`;
        const queue = pendingCallIdsByName.get(nameKey) || [];
        queue.push(call.id);
        pendingCallIdsByName.set(nameKey, queue);
        return { ...part, functionCall: call };
      }
      return part;
    });
    return { ...content, parts: newParts };
  });

  return { contents: newContents, pendingCallIdsByName, toolCallCounter };
}

// Pass 2: Match responses to calls by function name (FIFO order)
export function matchResponseIdsToContents(contents: any[], pendingCallIdsByName: Map<string, string[]>): any[] {
  return contents.map((content: any) => {
    const newParts = content.parts.map((part: any) => {
      if (part.functionResponse) {
        const resp = { ...part.functionResponse };
        if (!resp.id && typeof resp.name === "string") {
          const queue = pendingCallIdsByName.get(resp.name);
          if (queue && queue.length > 0) {
            resp.id = queue.shift(); // Consume first pending ID
          }
        }
        return { ...part, functionResponse: resp };
      }
      return part;
    });
    return { ...content, parts: newParts };
  });
}
```

**Orphan Recovery** (Multi-Pass Matching):

When IDs don't match after the two-pass assignment:

```typescript
export function fixToolResponseGrouping(contents: any[]): any[] {
  // Track pending tool call groups
  const pendingGroups: Array<{
    ids: string[];
    funcNames: string[];
    insertAfterIdx: number;
  }> = [];

  // Collected orphan responses
  const collectedResponses = new Map<string, any>();

  // ... collection logic ...

  // For remaining pending groups, apply orphan recovery
  for (const group of pendingGroups) {
    for (let i = 0; i < group.ids.length; i++) {
      const expectedId = group.ids[i];
      const expectedName = group.funcNames[i];

      if (collectedResponses.has(expectedId)) {
        // Direct ID match - ideal case
        groupResponses.push(collectedResponses.get(expectedId));
        collectedResponses.delete(expectedId);
      } else if (collectedResponses.size > 0) {
        let matchedId: string | null = null;

        // Pass 1: Match by function name
        for (const [orphanId, orphanResp] of collectedResponses) {
          if (orphanResp.functionResponse?.name === expectedName) {
            matchedId = orphanId;
            break;
          }
        }

        // Pass 2: Match "unknown_function" orphans
        if (!matchedId) {
          for (const [orphanId, orphanResp] of collectedResponses) {
            if (orphanResp.functionResponse?.name === "unknown_function") {
              matchedId = orphanId;
              break;
            }
          }
        }

        // Pass 3: Take first available
        if (!matchedId) {
          matchedId = collectedResponses.keys().next().value ?? null;
        }

        if (matchedId) {
          const orphanResp = collectedResponses.get(matchedId);
          collectedResponses.delete(matchedId);

          // Fix the ID and name to match expected
          orphanResp.functionResponse.id = expectedId;
          if (orphanResp.functionResponse.name === "unknown_function") {
            orphanResp.functionResponse.name = expectedName;
          }

          groupResponses.push(orphanResp);
        }
      } else {
        // No responses available - create placeholder
        groupResponses.push({
          functionResponse: {
            name: expectedName || "unknown_function",
            response: {
              result: {
                error: "Tool response was lost during context processing.",
                recovered: true,
              },
            },
            id: expectedId,
          },
        });
      }
    }
  }

  return newContents;
}
```

**Claude Format Defense in Depth**:

For Claude's `messages[]` format (vs Gemini's `contents[]`):

```typescript
export function validateAndFixClaudeToolPairing(messages: any[]): any[] {
  // First: Try gentle fix (inject placeholder tool_results)
  let fixed = fixClaudeToolPairing(messages);

  // Second: Validate - find any remaining orphans
  const orphanIds = findOrphanedToolUseIds(fixed);

  if (orphanIds.size === 0) {
    return fixed;
  }

  // Third: Nuclear option - remove orphaned tool_use entirely
  console.warn("[antigravity] fixClaudeToolPairing left orphans, applying nuclear option");
  return removeOrphanedToolUse(fixed, orphanIds);
}
```

---

### Empty Response Detection and Retry (opencode-antigravity-auth)

**Source**: `src/plugin/request-helpers.ts`

Large thinking budgets can cause the API to return empty responses. Detection enables automatic retry.

```typescript
export function isEmptyResponseBody(text: string): boolean {
  if (!text || !text.trim()) {
    return true;
  }

  try {
    const parsed = JSON.parse(text);

    // Check for empty candidates (Gemini/Antigravity format)
    if (parsed.candidates !== undefined) {
      if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
        return true;
      }

      const firstCandidate = parsed.candidates[0];
      if (!firstCandidate?.content?.parts) {
        return true;
      }

      const parts = firstCandidate.content.parts;
      if (!Array.isArray(parts) || parts.length === 0) {
        return true;
      }

      // Check if all parts are empty
      const hasContent = parts.some((part: any) => {
        if (typeof part.text === "string" && part.text.length > 0) return true;
        if (part.functionCall) return true;
        if (part.thought === true && typeof part.text === "string") return true;
        return false;
      });

      if (!hasContent) {
        return true;
      }
    }

    // Check response wrapper (Antigravity envelope)
    if (parsed.response !== undefined) {
      return isEmptyResponseBody(JSON.stringify(parsed.response));
    }

    return false;
  } catch {
    return true; // JSON parse error = empty
  }
}
```

**Streaming Chunk Counter**:

```typescript
export interface StreamingChunkCounter {
  increment: () => void;
  getCount: () => number;
  hasContent: () => boolean;
}

export function createStreamingChunkCounter(): StreamingChunkCounter {
  let count = 0;
  let hasRealContent = false;

  return {
    increment: () => {
      count++;
    },
    getCount: () => count,
    hasContent: () => hasRealContent || count > 0,
  };
}

export function isMeaningfulSseLine(line: string): boolean {
  if (!line.startsWith("data: ")) return false;

  const data = line.slice(6).trim();
  if (data === "[DONE]" || !data) return false;

  try {
    const parsed = JSON.parse(data);

    // Check for candidates with content
    if (parsed.candidates && Array.isArray(parsed.candidates)) {
      for (const candidate of parsed.candidates) {
        const parts = candidate?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (typeof part?.text === "string" && part.text.length > 0) return true;
            if (part?.functionCall) return true;
          }
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
```

---

### Recursive JSON String Auto-Parsing (opencode-antigravity-auth)

**Source**: `src/plugin/request-helpers.ts`

Antigravity sometimes returns JSON-stringified values in tool arguments. This function recursively parses them.

```typescript
// Keys whose string values should NOT be parsed as JSON
const SKIP_PARSE_KEYS = new Set(["oldString", "newString", "content", "filePath", "path", "text", "code", "source", "data", "body", "message", "prompt", "input", "output", "result", "value", "query"]);

export function recursivelyParseJsonStrings(obj: unknown, skipParseKeys: Set<string> = SKIP_PARSE_KEYS, currentKey?: string): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => recursivelyParseJsonStrings(item, skipParseKeys));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = recursivelyParseJsonStrings(value, skipParseKeys, key);
    }
    return result;
  }

  if (typeof obj !== "string") return obj;

  // Skip keys that contain literal text content
  if (currentKey && skipParseKeys.has(currentKey)) {
    return obj;
  }

  const stripped = obj.trim();

  // Check if it looks like JSON
  if (stripped && (stripped[0] === "{" || stripped[0] === "[")) {
    try {
      const parsed = JSON.parse(obj);
      return recursivelyParseJsonStrings(parsed);
    } catch {
      // Handle malformed JSON (trailing chars)
      if (stripped.startsWith("[") && !stripped.endsWith("]")) {
        const lastBracket = stripped.lastIndexOf("]");
        if (lastBracket > 0) {
          const cleaned = stripped.slice(0, lastBracket + 1);
          try {
            return recursivelyParseJsonStrings(JSON.parse(cleaned));
          } catch {}
        }
      }
    }
  }

  return obj;
}
```

**Integration in Response Processing**:

```typescript
function transformGeminiCandidate(candidate: any): any {
  // ... other transformations ...

  // Handle functionCall: parse JSON strings in args
  if (part.functionCall && part.functionCall.args) {
    const parsedArgs = recursivelyParseJsonStrings(part.functionCall.args);
    return {
      ...part,
      functionCall: {
        ...part.functionCall,
        args: parsedArgs,
      },
    };
  }
}
```

---

### Thinking Recovery: "Let it Crash and Start Again" (opencode-antigravity-auth)

**Source**: `src/plugin/thinking-recovery.ts`

When Claude's conversation history becomes corrupted (thinking blocks stripped/malformed), instead of trying to fix the state, this module closes the current turn and starts fresh.

**Philosophy**: "Let it crash and start again" - Abandon corrupted turns, let Claude generate fresh thinking.

**Conversation State Analysis**:

A "turn" can span multiple assistant messages in a tool-use loop. The key insight is finding the TURN START (first assistant message after last real user message):

```typescript
export interface ConversationState {
  /** True if we're in an incomplete tool use loop (ends with functionResponse) */
  inToolLoop: boolean;
  /** Index of first model message in current turn */
  turnStartIdx: number;
  /** Whether the TURN started with thinking */
  turnHasThinking: boolean;
  /** Index of last model message */
  lastModelIdx: number;
  /** Whether last model msg has thinking */
  lastModelHasThinking: boolean;
  /** Whether last model msg has tool calls */
  lastModelHasToolCalls: boolean;
}

export function analyzeConversationState(contents: any[]): ConversationState {
  const state: ConversationState = {
    inToolLoop: false,
    turnStartIdx: -1,
    turnHasThinking: false,
    lastModelIdx: -1,
    lastModelHasThinking: false,
    lastModelHasToolCalls: false,
  };

  // First pass: Find the last "real" user message (not a tool result)
  let lastRealUserIdx = -1;
  for (let i = 0; i < contents.length; i++) {
    const msg = contents[i];
    if (msg?.role === "user" && !isToolResultMessage(msg)) {
      lastRealUserIdx = i;
    }
  }

  // Second pass: Analyze conversation and find turn boundaries
  for (let i = 0; i < contents.length; i++) {
    const msg = contents[i];
    const role = msg?.role;

    if (role === "model" || role === "assistant") {
      const hasThinking = messageHasThinking(msg);
      const hasToolCalls = messageHasToolCalls(msg);

      // Track if this is the turn start
      if (i > lastRealUserIdx && state.turnStartIdx === -1) {
        state.turnStartIdx = i;
        state.turnHasThinking = hasThinking;
      }

      state.lastModelIdx = i;
      state.lastModelHasToolCalls = hasToolCalls;
      state.lastModelHasThinking = hasThinking;
    }
  }

  // Determine if we're in a tool loop (conversation ends with tool result)
  if (contents.length > 0) {
    const lastMsg = contents[contents.length - 1];
    if (lastMsg?.role === "user" && isToolResultMessage(lastMsg)) {
      state.inToolLoop = true;
    }
  }

  return state;
}
```

**Recovery Trigger**:

```typescript
export function needsThinkingRecovery(state: ConversationState): boolean {
  return state.inToolLoop && !state.turnHasThinking;
}
```

**Recovery Mechanism: Inject Synthetic Turn**:

```typescript
export function closeToolLoopForThinking(contents: any[]): any[] {
  // Strip any old/corrupted thinking first
  const strippedContents = stripAllThinkingBlocks(contents);

  // Count tool results from the end of the conversation
  const toolResultCount = countTrailingToolResults(strippedContents);

  // Build synthetic model message content based on tool count
  let syntheticModelContent: string;
  if (toolResultCount === 0) {
    syntheticModelContent = "[Processing previous context.]";
  } else if (toolResultCount === 1) {
    syntheticModelContent = "[Tool execution completed.]";
  } else {
    syntheticModelContent = `[${toolResultCount} tool executions completed.]`;
  }

  // Step 1: Inject synthetic MODEL message to complete the non-thinking turn
  const syntheticModel = {
    role: "model",
    parts: [{ text: syntheticModelContent }],
  };

  // Step 2: Inject synthetic USER message to start a NEW turn
  const syntheticUser = {
    role: "user",
    parts: [{ text: "[Continue]" }],
  };

  return [...strippedContents, syntheticModel, syntheticUser];
}
```

**Compacted Thinking Detection** (heuristic for context compaction):

```typescript
export function looksLikeCompactedThinkingTurn(msg: any): boolean {
  const parts = msg.parts || [];
  if (parts.length === 0) return false;

  // Has function calls?
  const hasFunctionCall = parts.some((p: any) => p?.functionCall);
  if (!hasFunctionCall) return false;

  // Has thinking blocks?
  const hasThinking = parts.some((p: any) => p.thought === true || p.type === "thinking");
  if (hasThinking) return false;

  // Has text before functionCall?
  const hasTextBeforeFunctionCall = parts.some((p: any, idx: number) => {
    const firstFuncIdx = parts.findIndex((fp: any) => fp?.functionCall);
    if (idx >= firstFuncIdx) return false;
    return "text" in p && p.text.trim().length > 0 && !p.thought;
  });

  // If functionCall but no text before it, likely compacted
  return !hasTextBeforeFunctionCall;
}
```

**ag-cl Implementation Notes**:

- Implement `analyzeConversationState()` to detect tool loops
- Use `needsThinkingRecovery()` as trigger condition
- Apply `closeToolLoopForThinking()` when recovery needed
- Clear signature cache after recovery

---

### Cross-Model Metadata Sanitization (opencode-antigravity-auth)

**Source**: `src/plugin/transform/cross-model-sanitizer.ts`

When switching between Claude and Gemini mid-session, foreign thinking signatures cause validation errors. This module strips them.

**Problem**: Gemini stores `thoughtSignature` in `metadata.google`, Claude stores `signature` in top-level thinking blocks. Foreign signatures fail validation.

**Signature Field Locations**:

```typescript
const GEMINI_SIGNATURE_FIELDS = ["thoughtSignature", "thinkingMetadata"] as const;
const CLAUDE_SIGNATURE_FIELDS = ["signature"] as const;
```

**Strip Gemini Metadata** (when targeting Claude):

```typescript
export function stripGeminiThinkingMetadata(part: Record<string, unknown>, preserveNonSignature = true): { part: Record<string, unknown>; stripped: number } {
  let stripped = 0;

  if ("thoughtSignature" in part) {
    delete part.thoughtSignature;
    stripped++;
  }

  if ("thinkingMetadata" in part) {
    delete part.thinkingMetadata;
    stripped++;
  }

  if (isPlainObject(part.metadata)) {
    const metadata = part.metadata as Record<string, unknown>;
    if (isPlainObject(metadata.google)) {
      const google = metadata.google as Record<string, unknown>;

      for (const field of GEMINI_SIGNATURE_FIELDS) {
        if (field in google) {
          delete google[field];
          stripped++;
        }
      }

      if (!preserveNonSignature || Object.keys(google).length === 0) {
        delete metadata.google;
      }

      if (Object.keys(metadata).length === 0) {
        delete part.metadata;
      }
    }
  }

  return { part, stripped };
}
```

**Strip Claude Signatures** (when targeting Gemini):

```typescript
export function stripClaudeThinkingFields(part: Record<string, unknown>): { part: Record<string, unknown>; stripped: number } {
  let stripped = 0;

  if (part.type === "thinking" || part.type === "redacted_thinking") {
    for (const field of CLAUDE_SIGNATURE_FIELDS) {
      if (field in part) {
        delete part[field];
        stripped++;
      }
    }
  }

  // Also strip orphan signatures (≥50 chars = likely thinking signature)
  if ("signature" in part && typeof part.signature === "string") {
    if ((part.signature as string).length >= 50) {
      delete part.signature;
      stripped++;
    }
  }

  return { part, stripped };
}
```

**In-Place Sanitization** (for performance):

```typescript
export function sanitizeCrossModelPayloadInPlace(payload: Record<string, unknown>, options: SanitizerOptions): number {
  const targetFamily = getModelFamily(options.targetModel);

  if (targetFamily === "unknown") {
    return 0;
  }

  let totalStripped = 0;

  const sanitizePartsInPlace = (parts: unknown[]): void => {
    for (const part of parts) {
      if (!isPlainObject(part)) continue;

      if (targetFamily === "claude") {
        const result = stripGeminiThinkingMetadata(part, true);
        totalStripped += result.stripped;
      } else if (targetFamily === "gemini") {
        const result = stripClaudeThinkingFields(part);
        totalStripped += result.stripped;
      }
    }
  };

  if (Array.isArray(payload.contents)) {
    for (const content of payload.contents) {
      if (isPlainObject(content) && Array.isArray(content.parts)) {
        sanitizePartsInPlace(content.parts);
      }
    }
  }

  if (Array.isArray(payload.messages)) {
    for (const message of payload.messages) {
      if (isPlainObject(message) && Array.isArray(message.content)) {
        sanitizePartsInPlace(message.content);
      }
    }
  }

  return totalStripped;
}
```

---

### Real-Time Streaming Transformer (opencode-antigravity-auth)

**Source**: `src/plugin/core/streaming/transformer.ts`

Uses Web Streams API `TransformStream` for true real-time incremental streaming. Thinking tokens are transformed and forwarded immediately as they arrive.

**Architecture**:

```typescript
export function createStreamingTransformer(signatureStore: SignatureStore, callbacks: StreamingCallbacks, options: StreamingOptions = {}): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const thoughtBuffer = createThoughtBuffer();
  const sentThinkingBuffer = createThoughtBuffer();
  const debugState = { injected: false };

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line

      for (const line of lines) {
        const transformedLine = transformSseLine(line, signatureStore, thoughtBuffer, sentThinkingBuffer, callbacks, options, debugState);
        controller.enqueue(encoder.encode(transformedLine + "\n"));
      }
    },
    flush(controller) {
      buffer += decoder.decode();

      if (buffer) {
        const transformedLine = transformSseLine(buffer, signatureStore, thoughtBuffer, sentThinkingBuffer, callbacks, options, debugState);
        controller.enqueue(encoder.encode(transformedLine));
      }
    },
  });
}
```

**Thinking Deduplication** (prevents duplicate text in streaming):

Gemini streams thinking text incrementally, sending the full text so far each time. This creates duplicates.

```typescript
export function deduplicateThinkingText(response: unknown, sentBuffer: ThoughtBuffer, displayedThinkingHashes?: Set<string>): unknown {
  // ... response type handling ...

  content.parts.map((part: unknown) => {
    const p = part as Record<string, unknown>;
    if (p.thought === true || p.type === "thinking") {
      const fullText = (p.text || p.thinking || "") as string;

      // Hash-based deduplication (for Gemini 3)
      if (displayedThinkingHashes) {
        const hash = hashString(fullText);
        if (displayedThinkingHashes.has(hash)) {
          sentBuffer.set(index, fullText);
          return null; // Skip duplicate
        }
        displayedThinkingHashes.add(hash);
      }

      // Delta-based deduplication
      const sentText = sentBuffer.get(index) ?? "";

      if (fullText.startsWith(sentText)) {
        const delta = fullText.slice(sentText.length); // Only new text
        sentBuffer.set(index, fullText);

        if (delta) {
          return { ...p, text: delta, thinking: delta };
        }
        return null;
      }

      sentBuffer.set(index, fullText);
      return part;
    }
    return part;
  });
}
```

**Signature Caching from Stream** (real-time extraction):

```typescript
export function cacheThinkingSignaturesFromResponse(response: unknown, signatureSessionKey: string, signatureStore: SignatureStore, thoughtBuffer: ThoughtBuffer, onCacheSignature?: (sessionKey: string, text: string, signature: string) => void): void {
  // Gemini format: accumulate thinking text, cache on thoughtSignature
  content.parts.forEach((part: unknown) => {
    const p = part as Record<string, unknown>;
    if (p.thought === true || p.type === "thinking") {
      const text = (p.text || p.thinking || "") as string;
      if (text) {
        const current = thoughtBuffer.get(index) ?? "";
        thoughtBuffer.set(index, current + text); // Accumulate
      }
    }

    if (p.thoughtSignature) {
      const fullText = thoughtBuffer.get(index) ?? "";
      if (fullText) {
        const signature = p.thoughtSignature as string;
        onCacheSignature?.(signatureSessionKey, fullText, signature);
        signatureStore.set(signatureSessionKey, { text: fullText, signature });
      }
    }
  });

  // Claude format: accumulate thinking, cache on signature block
  if (Array.isArray(resp.content)) {
    let thinkingText = "";
    resp.content.forEach((block: unknown) => {
      if (b?.type === "thinking") {
        thinkingText += (b.thinking || b.text || "") as string;
      }
      if (b?.signature && thinkingText) {
        const signature = b.signature as string;
        onCacheSignature?.(signatureSessionKey, thinkingText, signature);
        signatureStore.set(signatureSessionKey, { text: thinkingText, signature });
      }
    });
  }
}
```

**Simple DJB2 Hash for Deduplication**:

```typescript
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i); /* hash * 33 + c */
  }
  return (hash >>> 0).toString(16);
}
```

**ag-cl Implementation Notes**:

- Use Web Streams `TransformStream` for incremental processing
- Implement delta-based deduplication for thinking text
- Cache signatures as they arrive (not at end)
- Use `response.body.pipeThrough(transformer)` for zero-copy streaming

---

### Model Variants System (opencode-antigravity-auth)

**Source**: `src/plugin/transform/model-resolver.ts`

Dynamic thinking budget allocation via model variants/tiers instead of separate model definitions.

**Problem**: Creating separate model definitions for each thinking level leads to model sprawl (12+ definitions for just thinking variations).

**Solution**: Tier-based resolution with aliasing.

**Thinking Tier Budgets**:

```typescript
export const THINKING_TIER_BUDGETS = {
  claude: {
    low: 8192,
    medium: 16384,
    high: 32768,
  },
  "gemini-2.5-pro": {
    low: 8192,
    medium: 16384,
    high: 32768,
  },
  "gemini-2.5-flash": {
    low: 6144,
    medium: 12288,
    high: 24576,
  },
  default: {
    low: 4096,
    medium: 8192,
    high: 16384,
  },
} as const;

export type ThinkingTier = "low" | "medium" | "high";
```

**Model Aliasing**:

```typescript
const MODEL_ALIASES: Record<string, string> = {
  // Claude aliases
  "claude-sonnet-4": "claude-sonnet-4-20250514",
  "claude-sonnet": "claude-sonnet-4-20250514",
  "claude-opus-4": "claude-opus-4-20250514",
  "claude-opus": "claude-opus-4-20250514",
  "claude-sonnet-4-5": "claude-sonnet-4-5-20250514",
  "claude-sonnet-4-5-thinking": "claude-sonnet-4-5-20250514",
  "claude-opus-4-5": "claude-opus-4-5-20250514",
  "claude-opus-4-5-thinking": "claude-opus-4-5-20250514",

  // Gemini 3 aliases
  "gemini-3-pro": "gemini-3-pro",
  "gemini-3-flash": "gemini-3-flash",
  "gemini-3-pro-high": "gemini-3-pro",
  "gemini-3-pro-low": "gemini-3-pro",
  "gemini-3-flash-high": "gemini-3-flash",
  "gemini-3-flash-low": "gemini-3-flash",
};
```

**Tier Resolution** (extracts tier suffix from model name):

```typescript
const TIER_PATTERNS: Record<ThinkingTier, RegExp[]> = {
  low: [/-low$/i, /-l$/i, /-thinking-low$/i],
  medium: [/-medium$/i, /-med$/i, /-m$/i, /-thinking-medium$/i, /-thinking$/i],
  high: [/-high$/i, /-h$/i, /-thinking-high$/i, /-max$/i],
};

function extractThinkingTierFromModel(model: string): ThinkingTier | null {
  const normalized = model.toLowerCase();
  for (const [tier, patterns] of Object.entries(TIER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return tier as ThinkingTier;
      }
    }
  }
  return null;
}
```

**ResolvedModel Interface**:

```typescript
export interface ResolvedModel {
  /** The actual model name to use in API requests */
  actualModel: string;
  /** Thinking level string for Gemini 3 models */
  thinkingLevel?: string;
  /** Thinking budget for Claude/Gemini 2.5 models */
  thinkingBudget?: number;
  /** The tier that was resolved (for debugging) */
  tier?: ThinkingTier;
  /** Whether this is a thinking-enabled model */
  isThinkingModel?: boolean;
  /** Preferred quota pool for this model */
  quotaPreference?: HeaderStyle;
  /** Whether quota was explicitly specified in model name */
  explicitQuota?: boolean;
  /** Source of thinking config */
  configSource?: "variant" | "tier";
}
```

**Main Resolution Function**:

```typescript
export function resolveModelWithTier(requestedModel: string): ResolvedModel {
  // Step 1: Check for quota prefix (:antigravity or :gemini-cli)
  const isAntigravity = QUOTA_PREFIX_REGEX.test(requestedModel);
  const isGeminiCli = GEMINI_CLI_PREFIX_REGEX.test(requestedModel);
  const modelWithoutQuota = requestedModel.replace(QUOTA_PREFIX_REGEX, "").replace(GEMINI_CLI_PREFIX_REGEX, "");

  // Step 2: Extract tier from model name
  const tier = extractThinkingTierFromModel(modelWithoutQuota);
  const modelWithoutTier = tier ? modelWithoutQuota.replace(TIER_SUFFIX_REGEX, "") : modelWithoutQuota;

  // Step 3: Apply aliases
  const actualModel = MODEL_ALIASES[modelWithoutTier.toLowerCase()] ?? modelWithoutTier;

  // Step 4: Determine thinking config
  const family = getModelFamily(actualModel);

  if (family === "gemini" && actualModel.includes("gemini-3")) {
    // Gemini 3 uses thinkingLevel strings
    return {
      actualModel,
      thinkingLevel: tier ? GEMINI_3_THINKING_LEVELS[tier] : undefined,
      tier,
      isThinkingModel: !!tier,
      quotaPreference: isAntigravity ? "antigravity" : isGeminiCli ? "gemini-cli" : undefined,
      explicitQuota: isAntigravity || isGeminiCli,
    };
  }

  if (tier) {
    // Claude and Gemini 2.5 use numeric budgets
    const budgets = THINKING_TIER_BUDGETS[family] ?? THINKING_TIER_BUDGETS.default;
    return {
      actualModel,
      thinkingBudget: budgets[tier],
      tier,
      isThinkingModel: true,
      quotaPreference: isAntigravity ? "antigravity" : isGeminiCli ? "gemini-cli" : undefined,
      explicitQuota: isAntigravity || isGeminiCli,
      configSource: "tier",
    };
  }

  return {
    actualModel,
    quotaPreference: isAntigravity ? "antigravity" : isGeminiCli ? "gemini-cli" : undefined,
    explicitQuota: isAntigravity || isGeminiCli,
  };
}
```

**Gemini 3 Thinking Levels** (string-based vs numeric):

```typescript
const GEMINI_3_THINKING_LEVELS: Record<ThinkingTier, string> = {
  low: "low",
  medium: "medium",
  high: "high",
};
```

**Usage Examples**:

| Input Model                     | Resolved                     | Thinking Config                  |
| ------------------------------- | ---------------------------- | -------------------------------- |
| `claude-sonnet-4-5-high`        | `claude-sonnet-4-5-20250514` | `thinkingBudget: 32768`          |
| `claude-opus-4-5-low`           | `claude-opus-4-5-20250514`   | `thinkingBudget: 8192`           |
| `gemini-3-pro-high`             | `gemini-3-pro`               | `thinkingLevel: "high"`          |
| `gemini-2.5-pro-medium`         | `gemini-2.5-pro`             | `thinkingBudget: 16384`          |
| `:antigravity:gemini-2.5-flash` | `gemini-2.5-flash`           | `quotaPreference: "antigravity"` |

**ag-cl Implementation Notes**:

- Implement tier suffix extraction (-low, -medium, -high, -max)
- Map tiers to numeric budgets per model family
- Support Gemini 3 string-based thinking levels
- Add quota prefix parsing (:antigravity, :gemini-cli)
- Maintain alias table for shortened model names

---

### Account Selection Strategies Deep Dive (opencode-antigravity-auth)

**Source**: `src/plugin/accounts.ts`

Sophisticated multi-account rotation with per-quota rate limiting.

**Account Selection Strategies**:

```typescript
export type AccountSelectionStrategy = "sticky" | "round-robin" | "hybrid";
```

| Strategy      | Behavior                                    | Best For                  |
| ------------- | ------------------------------------------- | ------------------------- |
| `sticky`      | Same account until rate-limited             | Prompt cache preservation |
| `round-robin` | Rotate on every request                     | Maximum throughput        |
| `hybrid`      | Touch all fresh accounts first, then sticky | Sync reset timers + cache |

**QuotaKey System** (per-account, per-model rate limiting):

```typescript
function makeQuotaKey(family: ModelFamily, headerStyle: HeaderStyle, model?: string | null): string {
  // Format: "family:headerStyle" or "family:headerStyle:model" for model-specific limits
  if (model) {
    return `${family}:${headerStyle}:${model}`;
  }
  return `${family}:${headerStyle}`;
}

// Examples:
// "claude:antigravity" - Claude quota on Antigravity pool
// "gemini:gemini-cli" - Gemini quota on CLI pool
// "gemini:antigravity:gemini-2.5-pro" - Model-specific limit
```

**Rate Limit Tracking Structure**:

```typescript
interface ManagedAccount {
  index: number;
  email?: string;
  refreshToken: string;
  projectId?: string;

  // Rate limit reset times per quota key
  rateLimitResetTimes: Record<string, number>;

  // Track fresh state per quota key
  freshQuotaKeys: Set<string>;

  // Failure tracking
  consecutiveFailures?: number;
  cooldownUntil?: number;
  cooldownReason?: string;
}
```

**Selection Logic**:

```typescript
getCurrentOrNextForFamily(
  family: ModelFamily,
  model?: string | null,
  strategy: AccountSelectionStrategy = 'sticky',
  headerStyle: HeaderStyle = 'antigravity',
  pidOffsetEnabled: boolean = false,
): ManagedAccount | null {
  const quotaKey = makeQuotaKey(family, headerStyle, null);

  // Apply PID offset for multi-session distribution
  if (pidOffsetEnabled && !this.sessionOffsetApplied[family]) {
    const baseIndex = this.currentAccountIndexByFamily[family] ?? 0;
    const pidOffset = process.pid % this.accounts.length;
    this.currentAccountIndexByFamily[family] = (baseIndex + pidOffset) % this.accounts.length;
    this.sessionOffsetApplied[family] = true;
  }

  // Round-robin: always rotate
  if (strategy === 'round-robin') {
    return this.getNextForFamily(family, model);
  }

  // Hybrid: touch fresh accounts first, then sticky
  if (strategy === 'hybrid') {
    const freshAccounts = this.getFreshAccountsForQuota(quotaKey, family, model);
    if (freshAccounts.length > 0) {
      const next = freshAccounts[0];
      this.touchAccount(next, quotaKey);
      this.currentAccountIndexByFamily[family] = next.index;
      return next;
    }
    // Fall through to sticky behavior
  }

  // Sticky: same account until rate-limited
  const currentIndex = this.currentAccountIndexByFamily[family] ?? 0;
  const current = this.accounts[currentIndex];

  if (current && !this.isRateLimitedForHeaderStyle(current, family, headerStyle, model)) {
    return current;
  }

  // Current is rate-limited, find next available
  return this.getNextForFamily(family, model);
}
```

**Fresh Account Detection** (for hybrid strategy):

```typescript
private getFreshAccountsForQuota(quotaKey: string, family: ModelFamily, model?: string | null): ManagedAccount[] {
  return this.accounts.filter(account => {
    // Skip if rate-limited
    if (this.isRateLimitedForHeaderStyle(account, family,
        quotaKey.includes('antigravity') ? 'antigravity' : 'gemini-cli', model)) {
      return false;
    }

    // Check if this quota key has been "touched" this session
    return !account.freshQuotaKeys?.has(quotaKey);
  });
}

private touchAccount(account: ManagedAccount, quotaKey: string): void {
  if (!account.freshQuotaKeys) {
    account.freshQuotaKeys = new Set();
  }
  account.freshQuotaKeys.add(quotaKey);
}
```

**PID Offset** (parallel agent distribution):

```typescript
// Problem: Multiple Claude Code sessions use same account, hit limits together
// Solution: Offset starting index by process ID

if (pidOffsetEnabled && !this.sessionOffsetApplied[family]) {
  const baseIndex = this.currentAccountIndexByFamily[family] ?? 0;
  const pidOffset = process.pid % this.accounts.length;
  this.currentAccountIndexByFamily[family] = (baseIndex + pidOffset) % this.accounts.length;
  this.sessionOffsetApplied[family] = true;
}

// Result:
// PID 1234 with 3 accounts: starts at index 1234 % 3 = 1
// PID 1235 with 3 accounts: starts at index 1235 % 3 = 2
// PID 1236 with 3 accounts: starts at index 1236 % 3 = 0
// Distributes load across accounts
```

**Rate Limit Detection with Dual Quota Fallback**:

```typescript
isRateLimitedForHeaderStyle(
  account: ManagedAccount,
  family: ModelFamily,
  headerStyle: HeaderStyle,
  model?: string | null,
): boolean {
  const now = Date.now();

  // Check model-specific limit first
  if (model) {
    const modelKey = makeQuotaKey(family, headerStyle, model);
    const modelReset = account.rateLimitResetTimes[modelKey];
    if (modelReset && modelReset > now) {
      return true;
    }
  }

  // Check family-level limit
  const familyKey = makeQuotaKey(family, headerStyle);
  const familyReset = account.rateLimitResetTimes[familyKey];
  if (familyReset && familyReset > now) {
    return true;
  }

  return false;
}

getAvailableHeaderStyle(
  account: ManagedAccount,
  family: ModelFamily,
  model?: string | null,
): HeaderStyle | null {
  // Try antigravity first (preferred)
  if (!this.isRateLimitedForHeaderStyle(account, family, 'antigravity', model)) {
    return 'antigravity';
  }

  // Fall back to gemini-cli
  if (!this.isRateLimitedForHeaderStyle(account, family, 'gemini-cli', model)) {
    return 'gemini-cli';
  }

  return null;
}
```

**Toast Debouncing** (prevents spam on fast rotation):

```typescript
private lastToastShownAt: Record<number, number> = {};
private readonly TOAST_DEBOUNCE_MS = 5000;

shouldShowAccountToast(accountIndex: number): boolean {
  const now = Date.now();
  const lastShown = this.lastToastShownAt[accountIndex];

  if (!lastShown || (now - lastShown) > this.TOAST_DEBOUNCE_MS) {
    return true;
  }
  return false;
}

markToastShown(accountIndex: number): void {
  this.lastToastShownAt[accountIndex] = Date.now();
}
```

**ag-cl Implementation Notes**:

- Implement sticky (default), round-robin, hybrid strategies
- Add PID offset for parallel session distribution
- Track rate limits per (family, headerStyle, model) tuple
- Implement dual quota pool fallback (antigravity → gemini-cli)
- Add toast debouncing to prevent notification spam
- Persist currentAccountIndexByFamily for session continuity

---

### Auto-Stream Conversion and Tool Remapping (Antigravity-Manager)

**Source**: `src-tauri/src/proxy/mappers/claude/response.rs`

Converts Gemini streaming responses to Claude non-streaming format with tool argument remapping.

**Problem**: Claude Code sends non-streaming requests, but Antigravity's Gemini backend may return streaming format or use different parameter names for tools.

**Solution**: Collect streaming chunks, remap tool arguments, produce Claude-compatible JSON.

**NonStreamingProcessor**:

```rust
pub struct NonStreamingProcessor {
    // Accumulated content blocks
    content_blocks: Vec<ContentBlock>,

    // Text accumulation
    text_builder: String,

    // Thinking block accumulation
    thinking_builder: String,
    thinking_signature: Option<String>,

    // Tool call tracking
    pending_tool_calls: Vec<ToolUseBlock>,
}

impl NonStreamingProcessor {
    pub fn new() -> Self {
        Self {
            content_blocks: Vec::new(),
            text_builder: String::new(),
            thinking_builder: String::new(),
            thinking_signature: None,
            pending_tool_calls: Vec::new(),
        }
    }

    pub fn process_chunk(&mut self, chunk: &GeminiResponseChunk) -> Result<()> {
        for candidate in &chunk.candidates {
            if let Some(content) = &candidate.content {
                for part in &content.parts {
                    self.process_part(part)?;
                }
            }
        }
        Ok(())
    }

    fn process_part(&mut self, part: &GeminiPart) -> Result<()> {
        // Handle thinking blocks
        if part.thought == Some(true) {
            self.thinking_builder.push_str(&part.text.as_deref().unwrap_or(""));
            if let Some(sig) = &part.thought_signature {
                self.thinking_signature = Some(sig.clone());
            }
            return Ok(());
        }

        // Handle regular text
        if let Some(text) = &part.text {
            // Flush thinking if we have it
            self.flush_thinking();
            self.text_builder.push_str(text);
            return Ok(());
        }

        // Handle function calls
        if let Some(fc) = &part.function_call {
            self.flush_text();
            self.process_function_call(fc)?;
        }

        Ok(())
    }

    fn flush_thinking(&mut self) {
        if !self.thinking_builder.is_empty() {
            self.content_blocks.push(ContentBlock::Thinking {
                thinking: std::mem::take(&mut self.thinking_builder),
                signature: self.thinking_signature.take(),
            });
        }
    }

    fn flush_text(&mut self) {
        if !self.text_builder.is_empty() {
            self.content_blocks.push(ContentBlock::Text {
                text: std::mem::take(&mut self.text_builder),
            });
        }
    }
}
```

**Tool Argument Remapping** (Gemini → Claude Code):

```rust
fn remap_function_call_args(tool_name: &str, args: &mut serde_json::Value) {
    if !args.is_object() {
        return;
    }

    let obj = args.as_object_mut().unwrap();

    match tool_name.to_lowercase().as_str() {
        "grep" => {
            // Gemini uses "query", Claude Code expects "pattern"
            if let Some(query) = obj.remove("query") {
                obj.insert("pattern".to_string(), query);
            }

            // Claude Code uses "path" (string), NOT "paths" (array)!
            if let Some(paths) = obj.remove("paths") {
                if let Some(arr) = paths.as_array() {
                    if let Some(first) = arr.first() {
                        obj.insert("path".to_string(), first.clone());
                    }
                }
            }
        }

        "glob" => {
            // Gemini might use "patterns" (array), Claude expects "pattern" (string)
            if let Some(patterns) = obj.remove("patterns") {
                if let Some(arr) = patterns.as_array() {
                    if let Some(first) = arr.first() {
                        if let Some(s) = first.as_str() {
                            obj.insert("pattern".to_string(), serde_json::Value::String(s.to_string()));
                        }
                    }
                }
            }
        }

        "read" => {
            // Gemini might use "file_path" or "filePath", Claude expects "file_path"
            if let Some(fp) = obj.remove("filePath") {
                obj.insert("file_path".to_string(), fp);
            }
        }

        "ls" | "list_directory" => {
            // Gemini might use "directory" or "dir", Claude expects "path"
            if let Some(dir) = obj.remove("directory") {
                obj.insert("path".to_string(), dir);
            }
            if let Some(dir) = obj.remove("dir") {
                obj.insert("path".to_string(), dir);
            }
        }

        "bash" | "execute" => {
            // Gemini might use "script" or "code", Claude expects "command"
            if let Some(script) = obj.remove("script") {
                obj.insert("command".to_string(), script);
            }
            if let Some(code) = obj.remove("code") {
                obj.insert("command".to_string(), code);
            }
        }

        "edit" | "str_replace_editor" => {
            // Various parameter name differences
            if let Some(old) = obj.remove("oldString") {
                obj.insert("old_string".to_string(), old);
            }
            if let Some(new) = obj.remove("newString") {
                obj.insert("new_string".to_string(), new);
            }
            if let Some(fp) = obj.remove("filePath") {
                obj.insert("file_path".to_string(), fp);
            }
        }

        _ => {}
    }
}
```

**Tool Remapping Table**:

| Tool | Gemini Parameter         | Claude Parameter           |
| ---- | ------------------------ | -------------------------- |
| Grep | `query`                  | `pattern`                  |
| Grep | `paths` (array)          | `path` (string)            |
| Glob | `patterns` (array)       | `pattern` (string)         |
| Read | `filePath`               | `file_path`                |
| LS   | `directory`, `dir`       | `path`                     |
| Bash | `script`, `code`         | `command`                  |
| Edit | `oldString`, `newString` | `old_string`, `new_string` |

**Final Response Assembly**:

```rust
pub fn finalize(mut self) -> ClaudeResponse {
    // Flush any remaining content
    self.flush_thinking();
    self.flush_text();

    // Add pending tool calls
    for tool_call in self.pending_tool_calls {
        self.content_blocks.push(ContentBlock::ToolUse {
            id: tool_call.id,
            name: tool_call.name,
            input: tool_call.input,
        });
    }

    // Determine stop reason
    let stop_reason = if self.pending_tool_calls.is_empty() {
        "end_turn"
    } else {
        "tool_use"
    };

    ClaudeResponse {
        id: format!("msg_{}", uuid::Uuid::new_v4()),
        type_: "message".to_string(),
        role: "assistant".to_string(),
        content: self.content_blocks,
        model: "claude-sonnet-4-5-20250514".to_string(), // Mapped from request
        stop_reason: Some(stop_reason.to_string()),
        stop_sequence: None,
        usage: Usage {
            input_tokens: 0,  // Estimated or from Gemini response
            output_tokens: 0,
        },
    }
}
```

**ag-cl Implementation Notes**:

- Collect SSE chunks into buffer
- Parse thinking blocks with signature extraction
- Remap tool argument names per tool type
- Handle array-to-string conversions (paths → path)
- Generate Claude-compatible response structure
- Map stop_reason based on content type

---

### CLIProxyAPI Stream-to-NonStream Conversion (Go)

**Source**: `internal/runtime/executor/antigravity_executor.go`

Go implementation of stream-to-nonstream conversion with multi-endpoint fallback.

**Core Conversion Flow**:

```go
// executeClaudeNonStream forces streaming request then collects to non-stream
func (e *AntigravityExecutor) executeClaudeNonStream(
    ctx context.Context,
    auth *coreauth.Auth,
    token string,
    req *chat.Request,
    translated *translateapi.Request,
    opts executeOptions,
) (cliproxyexecutor.Response, error) {

    // Force streaming mode for API call
    httpReq, errReq := e.buildRequest(
        ctx, auth, token, req.Model, translated,
        true,  // streaming = true (forced)
        opts.Alt,
        baseURL,
    )
    if errReq != nil {
        return cliproxyexecutor.Response{}, errReq
    }

    // Execute streaming request
    out := make(chan cliproxyexecutor.Chunk, 100)
    var wg sync.WaitGroup
    wg.Add(1)

    go func() {
        defer wg.Done()
        e.handleSSEStream(ctx, httpResp.Body, out)
    }()

    // Collect all chunks
    var buffer bytes.Buffer
    for chunk := range out {
        if chunk.Error != nil {
            return cliproxyexecutor.Response{}, chunk.Error
        }
        buffer.Write(chunk.Payload)
    }

    wg.Wait()

    // Convert collected stream to non-stream response
    nonStreamPayload := e.convertStreamToNonStream(buffer.Bytes())

    return cliproxyexecutor.Response{
        Payload: nonStreamPayload,
        Headers: httpResp.Header,
    }, nil
}
```

**SSE Stream Parsing**:

```go
func (e *AntigravityExecutor) handleSSEStream(
    ctx context.Context,
    body io.ReadCloser,
    out chan<- cliproxyexecutor.Chunk,
) {
    defer close(out)
    defer body.Close()

    scanner := bufio.NewScanner(body)
    var eventType string
    var dataBuffer bytes.Buffer

    for scanner.Scan() {
        select {
        case <-ctx.Done():
            return
        default:
        }

        line := scanner.Text()

        if strings.HasPrefix(line, "event: ") {
            eventType = strings.TrimPrefix(line, "event: ")
            continue
        }

        if strings.HasPrefix(line, "data: ") {
            data := strings.TrimPrefix(line, "data: ")
            if data == "[DONE]" {
                continue
            }
            dataBuffer.WriteString(data)
            continue
        }

        // Empty line = event boundary
        if line == "" && dataBuffer.Len() > 0 {
            out <- cliproxyexecutor.Chunk{
                Event:   eventType,
                Payload: dataBuffer.Bytes(),
            }
            dataBuffer.Reset()
            eventType = ""
        }
    }

    // Flush remaining data
    if dataBuffer.Len() > 0 {
        out <- cliproxyexecutor.Chunk{
            Event:   eventType,
            Payload: dataBuffer.Bytes(),
        }
    }
}
```

**Stream to NonStream Conversion**:

```go
func (e *AntigravityExecutor) convertStreamToNonStream(stream []byte) []byte {
    var parts []map[string]interface{}

    var pendingText strings.Builder
    var pendingThought strings.Builder
    var pendingKind string // "text" or "thought"
    var pendingThoughtSig string

    // Flush pending content to parts
    flushPending := func() {
        switch pendingKind {
        case "text":
            if pendingText.Len() > 0 {
                parts = append(parts, map[string]interface{}{
                    "text": pendingText.String(),
                })
                pendingText.Reset()
            }
        case "thought":
            if pendingThought.Len() > 0 {
                part := map[string]interface{}{
                    "thought": true,
                    "text":    pendingThought.String(),
                }
                if pendingThoughtSig != "" {
                    part["thoughtSignature"] = pendingThoughtSig
                }
                parts = append(parts, part)
                pendingThought.Reset()
                pendingThoughtSig = ""
            }
        }
        pendingKind = ""
    }

    // Parse SSE lines
    lines := bytes.Split(stream, []byte("\n"))
    for _, line := range lines {
        if !bytes.HasPrefix(line, []byte("data: ")) {
            continue
        }

        data := bytes.TrimPrefix(line, []byte("data: "))
        if bytes.Equal(data, []byte("[DONE]")) {
            continue
        }

        var chunk map[string]interface{}
        if err := json.Unmarshal(data, &chunk); err != nil {
            continue
        }

        // Navigate to parts: candidates[0].content.parts
        candidates, _ := chunk["candidates"].([]interface{})
        if len(candidates) == 0 {
            continue
        }

        candidate, _ := candidates[0].(map[string]interface{})
        content, _ := candidate["content"].(map[string]interface{})
        chunkParts, _ := content["parts"].([]interface{})

        for _, p := range chunkParts {
            part, _ := p.(map[string]interface{})

            // Handle thinking blocks
            if thought, ok := part["thought"].(bool); ok && thought {
                if pendingKind != "thought" {
                    flushPending()
                    pendingKind = "thought"
                }
                if text, ok := part["text"].(string); ok {
                    pendingThought.WriteString(text)
                }
                if sig, ok := part["thoughtSignature"].(string); ok {
                    pendingThoughtSig = sig
                }
                continue
            }

            // Handle regular text
            if text, ok := part["text"].(string); ok {
                if pendingKind != "text" {
                    flushPending()
                    pendingKind = "text"
                }
                pendingText.WriteString(text)
                continue
            }

            // Handle function calls (flush and add directly)
            if fc, ok := part["functionCall"].(map[string]interface{}); ok {
                flushPending()
                parts = append(parts, map[string]interface{}{
                    "functionCall": fc,
                })
            }
        }
    }

    flushPending()

    // Build final response
    response := map[string]interface{}{
        "candidates": []map[string]interface{}{
            {
                "content": map[string]interface{}{
                    "role":  "model",
                    "parts": parts,
                },
                "finishReason": "STOP",
            },
        },
    }

    result, _ := json.Marshal(response)
    return result
}
```

**Multi-Endpoint Fallback**:

```go
var ANTIGRAVITY_ENDPOINTS = []string{
    "https://autopush-aiplatform.sandbox.googleapis.com",
    "https://aiplatform.googleapis.com",
    "https://generativelanguage.googleapis.com",
}

func (e *AntigravityExecutor) executeWithFallback(
    ctx context.Context,
    auth *coreauth.Auth,
    req *chat.Request,
) (cliproxyexecutor.Response, error) {
    var lastErr error

    for i, endpoint := range ANTIGRAVITY_ENDPOINTS {
        resp, err := e.executeOnEndpoint(ctx, auth, req, endpoint)

        if err == nil {
            return resp, nil
        }

        lastErr = err

        // Don't fallback on rate limits (429)
        if isRateLimitError(err) {
            return resp, err
        }

        // Log and try next endpoint
        e.logger.Warn("endpoint failed, trying fallback",
            "endpoint", endpoint,
            "attempt", i+1,
            "error", err,
        )
    }

    return cliproxyexecutor.Response{}, fmt.Errorf(
        "all %d endpoints failed: %w",
        len(ANTIGRAVITY_ENDPOINTS),
        lastErr,
    )
}
```

**Token Refresh with Expiry Skew**:

```go
const TOKEN_EXPIRY_SKEW = 3000 * time.Second // 50 minutes before actual expiry

func (e *AntigravityExecutor) ensureValidToken(
    ctx context.Context,
    auth *coreauth.Auth,
) (string, error) {
    // Check if token expires within skew window
    if auth.AccessTokenExpiry.Before(time.Now().Add(TOKEN_EXPIRY_SKEW)) {
        // Refresh token
        newToken, newExpiry, err := e.refreshToken(ctx, auth.RefreshToken)
        if err != nil {
            return "", fmt.Errorf("token refresh failed: %w", err)
        }

        auth.AccessToken = newToken
        auth.AccessTokenExpiry = newExpiry

        // Notify auth manager of update
        e.authManager.UpdateAuth(auth)
    }

    return auth.AccessToken, nil
}
```

**ag-cl Implementation Notes**:

- Implement SSE parsing with event type and data handling
- Collect chunks into buffer, then convert to non-stream
- Handle thinking blocks with signature preservation
- Multi-endpoint fallback with 429 passthrough
- Proactive token refresh with 50-minute skew
- Function call extraction and passthrough

---

### Proactive Token Refresh Queue (opencode-antigravity-auth)

**Source**: `src/plugin/refresh-queue.ts`

Background token refresh to ensure OAuth tokens remain valid without blocking user requests.

**Problem**: Token refresh during API calls adds latency and can cause request failures if refresh fails.

**Solution**: Background queue that proactively refreshes tokens approaching expiry.

**Configuration**:

```typescript
export interface ProactiveRefreshConfig {
  /** Enable proactive token refresh (default: true) */
  enabled: boolean;
  /** Seconds before expiry to trigger proactive refresh (default: 1800 = 30 minutes) */
  bufferSeconds: number;
  /** Interval between refresh checks in seconds (default: 300 = 5 minutes) */
  checkIntervalSeconds: number;
}

export const DEFAULT_PROACTIVE_REFRESH_CONFIG: ProactiveRefreshConfig = {
  enabled: true,
  bufferSeconds: 1800, // 30 minutes before expiry
  checkIntervalSeconds: 300, // Check every 5 minutes
};
```

**Queue State**:

```typescript
interface RefreshQueueState {
  isRunning: boolean;
  intervalHandle: ReturnType<typeof setInterval> | null;
  isRefreshing: boolean; // Prevents concurrent refresh storms
  lastCheckTime: number;
  lastRefreshTime: number;
  refreshCount: number;
  errorCount: number;
}
```

**Refresh Check Logic**:

```typescript
needsRefresh(account: ManagedAccount): boolean {
  if (!account.expires) {
    return false; // No expiry set - assume it's fine
  }

  const now = Date.now();
  const bufferMs = this.config.bufferSeconds * 1000;
  const refreshThreshold = now + bufferMs;

  // Refresh if token expires within buffer period
  return account.expires <= refreshThreshold;
}

getAccountsNeedingRefresh(): ManagedAccount[] {
  return this.accountManager.getAccounts().filter((account) => {
    // Only refresh if not already expired (let main flow handle expired tokens)
    if (this.isExpired(account)) {
      return false;
    }
    return this.needsRefresh(account);
  });
}
```

**Serialized Refresh** (prevents concurrent refresh storms):

```typescript
private async runRefreshCheck(): Promise<void> {
  if (this.state.isRefreshing) {
    return; // Already refreshing - skip this iteration
  }

  this.state.isRefreshing = true;
  this.state.lastCheckTime = Date.now();

  try {
    const accountsToRefresh = this.getAccountsNeedingRefresh();

    // Refresh accounts serially to avoid concurrent refresh storms
    for (const account of accountsToRefresh) {
      if (!this.state.isRunning) {
        break; // Queue was stopped - abort
      }

      try {
        const auth = this.accountManager.toAuthDetails(account);
        const refreshed = await this.refreshToken(auth, account);

        if (refreshed) {
          this.accountManager.updateFromAuth(account, refreshed);
          this.state.refreshCount++;
          this.state.lastRefreshTime = Date.now();

          // Persist the refreshed token
          await this.accountManager.saveToDisk().catch(() => {});
        }
      } catch (error) {
        this.state.errorCount++;
        // Log but don't throw - continue with other accounts
      }
    }
  } finally {
    this.state.isRefreshing = false;
  }
}
```

**Lifecycle Management**:

```typescript
start(): void {
  if (this.state.isRunning || !this.config.enabled) {
    return;
  }

  this.state.isRunning = true;
  const intervalMs = this.config.checkIntervalSeconds * 1000;

  // Run initial check after a short delay (let things settle)
  setTimeout(() => {
    if (this.state.isRunning) {
      this.runRefreshCheck().catch(() => {});
    }
  }, 5000);

  // Set up periodic checks
  this.state.intervalHandle = setInterval(() => {
    this.runRefreshCheck().catch(() => {});
  }, intervalMs);
}

stop(): void {
  this.state.isRunning = false;
  if (this.state.intervalHandle) {
    clearInterval(this.state.intervalHandle);
    this.state.intervalHandle = null;
  }
}
```

**ag-cl Implementation Notes**:

- Initialize queue after AccountManager is loaded
- Use setInterval for periodic background checks
- Serialize refreshes to prevent token endpoint flooding
- Track error counts for monitoring/alerting
- Silent operation - use structured logging only

---

### WebSocket Gateway for AI Studio (CLIProxyAPI)

**Source**: `internal/wsrelay/manager.go`, `internal/wsrelay/session.go`

Real-time WebSocket relay for AI Studio provider connections.

**Problem**: AI Studio requires persistent WebSocket connections that traditional HTTP proxies can't handle.

**Solution**: WebSocket manager that maintains persistent sessions per provider.

**Manager Architecture**:

```go
type Manager struct {
    path      string
    upgrader  websocket.Upgrader
    sessions  map[string]*session  // provider -> session
    sessMutex sync.RWMutex

    providerFactory func(*http.Request) (string, error)
    onConnected     func(string)          // Callback when provider connects
    onDisconnected  func(string, error)   // Callback when provider disconnects
}

func NewManager(opts Options) *Manager {
    mgr := &Manager{
        path:     opts.Path,
        sessions: make(map[string]*session),
        upgrader: websocket.Upgrader{
            ReadBufferSize:  1024,
            WriteBufferSize: 1024,
            CheckOrigin: func(r *http.Request) bool {
                return true // Allow all origins
            },
        },
        onConnected:    opts.OnConnected,
        onDisconnected: opts.OnDisconnected,
    }
    return mgr
}
```

**Session Management**:

```go
type session struct {
    conn       *websocket.Conn
    manager    *Manager
    provider   string
    id         string
    closed     chan struct{}
    closeOnce  sync.Once
    writeMutex sync.Mutex
    pending    sync.Map  // map[string]*pendingRequest
}

type pendingRequest struct {
    ch        chan Message
    closeOnce sync.Once
}
```

**Connection Upgrade and Registration**:

```go
func (m *Manager) handleWebsocket(w http.ResponseWriter, r *http.Request) {
    conn, err := m.upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }

    s := newSession(conn, m, randomProviderName())

    // Get provider ID from factory
    if m.providerFactory != nil {
        name, err := m.providerFactory(r)
        if err != nil {
            s.cleanup(err)
            return
        }
        s.provider = strings.ToLower(name)
    }

    // Register session, replacing existing if any
    m.sessMutex.Lock()
    var replaced *session
    if existing, ok := m.sessions[s.provider]; ok {
        replaced = existing
    }
    m.sessions[s.provider] = s
    m.sessMutex.Unlock()

    if replaced != nil {
        replaced.cleanup(errors.New("replaced by new connection"))
    }

    if m.onConnected != nil {
        m.onConnected(s.provider)
    }

    go s.run(context.Background())
}
```

**Heartbeat and Keep-Alive**:

```go
const (
    readTimeout       = 60 * time.Second
    writeTimeout      = 10 * time.Second
    heartbeatInterval = 30 * time.Second
)

func (s *session) startHeartbeat() {
    ticker := time.NewTicker(heartbeatInterval)
    go func() {
        defer ticker.Stop()
        for {
            select {
            case <-s.closed:
                return
            case <-ticker.C:
                s.writeMutex.Lock()
                err := s.conn.WriteControl(
                    websocket.PingMessage,
                    []byte("ping"),
                    time.Now().Add(writeTimeout),
                )
                s.writeMutex.Unlock()
                if err != nil {
                    s.cleanup(err)
                    return
                }
            }
        }
    }()
}
```

**Request/Response Pattern**:

```go
func (m *Manager) Send(ctx context.Context, provider string, msg Message) (<-chan Message, error) {
    s := m.session(provider)
    if s == nil {
        return nil, fmt.Errorf("wsrelay: provider %s not connected", provider)
    }
    return s.request(ctx, msg)
}

func (s *session) request(ctx context.Context, msg Message) (<-chan Message, error) {
    if msg.ID == "" {
        return nil, fmt.Errorf("wsrelay: message id is required")
    }

    // Register pending request
    if _, loaded := s.pending.LoadOrStore(msg.ID, &pendingRequest{
        ch: make(chan Message, 8),
    }); loaded {
        return nil, fmt.Errorf("wsrelay: duplicate message id %s", msg.ID)
    }

    value, _ := s.pending.Load(msg.ID)
    req := value.(*pendingRequest)

    if err := s.send(ctx, msg); err != nil {
        s.pending.LoadAndDelete(msg.ID)
        req.close()
        return nil, err
    }

    // Handle context cancellation
    go func() {
        select {
        case <-ctx.Done():
            if actual, loaded := s.pending.LoadAndDelete(msg.ID); loaded {
                actual.(*pendingRequest).close()
            }
        case <-s.closed:
        }
    }()

    return req.ch, nil
}
```

**Message Dispatch**:

```go
func (s *session) dispatch(msg Message) {
    // Handle ping
    if msg.Type == MessageTypePing {
        _ = s.send(context.Background(), Message{ID: msg.ID, Type: MessageTypePong})
        return
    }

    // Dispatch to pending request
    if value, ok := s.pending.Load(msg.ID); ok {
        req := value.(*pendingRequest)
        select {
        case req.ch <- msg:
        default:
        }

        // Clean up terminal messages
        if msg.Type == MessageTypeHTTPResp || msg.Type == MessageTypeError || msg.Type == MessageTypeStreamEnd {
            if actual, loaded := s.pending.LoadAndDelete(msg.ID); loaded {
                actual.(*pendingRequest).close()
            }
        }
    }
}
```

**ag-cl Implementation Notes**:

- Use gorilla/websocket for WebSocket handling
- Implement provider-keyed session registry
- Add heartbeat mechanism (30s ping interval)
- Use sync.Map for concurrent pending request tracking
- Implement graceful cleanup on session close

---

### Auth Update Queue and Dispatcher (CLIProxyAPI)

**Source**: `internal/watcher/dispatcher.go`

Batched, deduplicated authentication update delivery system.

**Problem**: Auth changes (add/modify/delete) need to be propagated to all consumers without flooding or losing updates.

**Solution**: Queue-based dispatcher with deduplication and batching.

**Auth Update Types**:

```go
type AuthUpdateAction string

const (
    AuthUpdateActionAdd    AuthUpdateAction = "add"
    AuthUpdateActionModify AuthUpdateAction = "modify"
    AuthUpdateActionDelete AuthUpdateAction = "delete"
)

type AuthUpdate struct {
    Action AuthUpdateAction
    ID     string
    Auth   *coreauth.Auth
}
```

**Queue Setup**:

```go
func (w *Watcher) setAuthUpdateQueue(queue chan<- AuthUpdate) {
    w.clientsMutex.Lock()
    defer w.clientsMutex.Unlock()

    w.authQueue = queue

    if w.dispatchCond == nil {
        w.dispatchCond = sync.NewCond(&w.dispatchMu)
    }

    // Cancel existing dispatch loop
    if w.dispatchCancel != nil {
        w.dispatchCancel()
        w.dispatchCond.Broadcast()
    }

    // Start new dispatch loop
    if queue != nil {
        ctx, cancel := context.WithCancel(context.Background())
        w.dispatchCancel = cancel
        go w.dispatchLoop(ctx)
    }
}
```

**Deduplication and Batching**:

```go
func (w *Watcher) dispatchAuthUpdates(updates []AuthUpdate) {
    if len(updates) == 0 {
        return
    }

    queue := w.getAuthQueue()
    if queue == nil {
        return
    }

    baseTS := time.Now().UnixNano()

    w.dispatchMu.Lock()
    if w.pendingUpdates == nil {
        w.pendingUpdates = make(map[string]AuthUpdate)
    }

    for idx, update := range updates {
        key := w.authUpdateKey(update, baseTS+int64(idx))

        // Deduplicate: later updates for same ID replace earlier ones
        if _, exists := w.pendingUpdates[key]; !exists {
            w.pendingOrder = append(w.pendingOrder, key)
        }
        w.pendingUpdates[key] = update
    }

    // Signal dispatch loop
    if w.dispatchCond != nil {
        w.dispatchCond.Signal()
    }
    w.dispatchMu.Unlock()
}

func (w *Watcher) authUpdateKey(update AuthUpdate, ts int64) string {
    if update.ID != "" {
        return update.ID  // Deduplicate by ID
    }
    return fmt.Sprintf("%s:%d", update.Action, ts)
}
```

**Dispatch Loop**:

```go
func (w *Watcher) dispatchLoop(ctx context.Context) {
    for {
        batch, ok := w.nextPendingBatch(ctx)
        if !ok {
            return
        }

        queue := w.getAuthQueue()
        if queue == nil {
            if ctx.Err() != nil {
                return
            }
            time.Sleep(10 * time.Millisecond)
            continue
        }

        // Dispatch batch to queue
        for _, update := range batch {
            select {
            case queue <- update:
            case <-ctx.Done():
                return
            }
        }
    }
}

func (w *Watcher) nextPendingBatch(ctx context.Context) ([]AuthUpdate, bool) {
    w.dispatchMu.Lock()
    defer w.dispatchMu.Unlock()

    // Wait for pending updates
    for len(w.pendingOrder) == 0 {
        if ctx.Err() != nil {
            return nil, false
        }
        w.dispatchCond.Wait()
        if ctx.Err() != nil {
            return nil, false
        }
    }

    // Drain all pending updates as a batch
    batch := make([]AuthUpdate, 0, len(w.pendingOrder))
    for _, key := range w.pendingOrder {
        batch = append(batch, w.pendingUpdates[key])
        delete(w.pendingUpdates, key)
    }
    w.pendingOrder = w.pendingOrder[:0]

    return batch, true
}
```

**State Diffing** (detect add/modify/delete):

```go
func (w *Watcher) prepareAuthUpdatesLocked(auths []*coreauth.Auth, force bool) []AuthUpdate {
    newState := make(map[string]*coreauth.Auth, len(auths))
    for _, auth := range auths {
        if auth == nil || auth.ID == "" {
            continue
        }
        newState[auth.ID] = auth.Clone()
    }

    // First time: emit all as adds
    if w.currentAuths == nil {
        w.currentAuths = newState
        updates := make([]AuthUpdate, 0, len(newState))
        for id, auth := range newState {
            updates = append(updates, AuthUpdate{
                Action: AuthUpdateActionAdd,
                ID:     id,
                Auth:   auth.Clone(),
            })
        }
        return updates
    }

    updates := make([]AuthUpdate, 0)

    // Detect adds and modifies
    for id, auth := range newState {
        if existing, ok := w.currentAuths[id]; !ok {
            updates = append(updates, AuthUpdate{
                Action: AuthUpdateActionAdd,
                ID:     id,
                Auth:   auth.Clone(),
            })
        } else if force || !authEqual(existing, auth) {
            updates = append(updates, AuthUpdate{
                Action: AuthUpdateActionModify,
                ID:     id,
                Auth:   auth.Clone(),
            })
        }
    }

    // Detect deletes
    for id := range w.currentAuths {
        if _, ok := newState[id]; !ok {
            updates = append(updates, AuthUpdate{
                Action: AuthUpdateActionDelete,
                ID:     id,
            })
        }
    }

    w.currentAuths = newState
    return updates
}
```

**ag-cl Implementation Notes**:

- Use condition variable for efficient waiting
- Deduplicate by auth ID (later updates win)
- Batch updates to reduce consumer load
- Implement state diffing for add/modify/delete detection
- Normalize timestamps for equality comparison

---

### Device Fingerprint Management (Antigravity-Manager)

**Source**: `src-tauri/src/modules/device.rs`

Per-account device fingerprint binding for account protection.

**Problem**: Using the same device fingerprint across multiple accounts can lead to account association and potential banning.

**Solution**: Generate and manage unique device fingerprints per account.

**DeviceProfile Structure**:

```rust
pub struct DeviceProfile {
    pub machine_id: String,     // auth0|user_<32-char-hex>
    pub mac_machine_id: String, // UUID v4 format
    pub dev_device_id: String,  // UUID v4
    pub sqm_id: String,         // {UPPERCASE-UUID}
}
```

**Fingerprint Generation**:

```rust
pub fn generate_profile() -> DeviceProfile {
    DeviceProfile {
        machine_id: format!("auth0|user_{}", random_hex(32)),
        mac_machine_id: new_standard_machine_id(),
        dev_device_id: Uuid::new_v4().to_string(),
        sqm_id: format!("{{{}}}", Uuid::new_v4().to_string().to_uppercase()),
    }
}

fn random_hex(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect::<String>()
        .to_lowercase()
}

fn new_standard_machine_id() -> String {
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // y is constrained to 8..b
    let mut rng = rand::thread_rng();
    let mut id = String::with_capacity(36);
    for ch in "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".chars() {
        match ch {
            '-' | '4' => id.push(ch),
            'x' => id.push_str(&format!("{:x}", rng.gen_range(0..16))),
            'y' => id.push_str(&format!("{:x}", rng.gen_range(8..12))),
            _ => {}
        }
    }
    id
}
```

**Storage Location Detection** (multi-platform):

```rust
pub fn get_storage_path() -> Result<PathBuf, String> {
    // 1) --user-data-dir argument
    if let Some(user_data_dir) = process::get_user_data_dir_from_process() {
        let path = user_data_dir
            .join("User")
            .join("globalStorage")
            .join("storage.json");
        if path.exists() {
            return Ok(path);
        }
    }

    // 2) Portable mode (based on executable path)
    if let Some(exe_path) = process::get_antigravity_executable_path() {
        if let Some(parent) = exe_path.parent() {
            let portable = parent
                .join("data")
                .join("user-data")
                .join("User")
                .join("globalStorage")
                .join("storage.json");
            if portable.exists() {
                return Ok(portable);
            }
        }
    }

    // 3) Standard installation paths per OS
    #[cfg(target_os = "macos")]
    {
        let path = home.join("Library/Application Support/Antigravity/User/globalStorage/storage.json");
        if path.exists() { return Ok(path); }
    }

    #[cfg(target_os = "windows")]
    {
        let path = PathBuf::from(appdata).join("Antigravity\\User\\globalStorage\\storage.json");
        if path.exists() { return Ok(path); }
    }

    #[cfg(target_os = "linux")]
    {
        let path = home.join(".config/Antigravity/User/globalStorage/storage.json");
        if path.exists() { return Ok(path); }
    }

    Err("storage.json not found".to_string())
}
```

**Profile Read/Write**:

```rust
pub fn read_profile(storage_path: &Path) -> Result<DeviceProfile, String> {
    let json: Value = serde_json::from_str(&content)?;

    // Support both nested and flat telemetry formats
    let get_field = |key: &str| -> Option<String> {
        // Try nested: telemetry.machineId
        if let Some(obj) = json.get("telemetry").and_then(|v| v.as_object()) {
            if let Some(v) = obj.get(key).and_then(|v| v.as_str()) {
                return Some(v.to_string());
            }
        }
        // Try flat: "telemetry.machineId"
        if let Some(v) = json.get(format!("telemetry.{key}")).and_then(|v| v.as_str()) {
            return Some(v.to_string());
        }
        None
    };

    Ok(DeviceProfile {
        machine_id: get_field("machineId")?,
        mac_machine_id: get_field("macMachineId")?,
        dev_device_id: get_field("devDeviceId")?,
        sqm_id: get_field("sqmId")?,
    })
}

pub fn write_profile(storage_path: &Path, profile: &DeviceProfile) -> Result<(), String> {
    let mut json: Value = serde_json::from_str(&content)?;

    // Write to nested telemetry object
    if let Some(telemetry) = json.get_mut("telemetry").and_then(|v| v.as_object_mut()) {
        telemetry.insert("machineId".to_string(), Value::String(profile.machine_id.clone()));
        telemetry.insert("macMachineId".to_string(), Value::String(profile.mac_machine_id.clone()));
        telemetry.insert("devDeviceId".to_string(), Value::String(profile.dev_device_id.clone()));
        telemetry.insert("sqmId".to_string(), Value::String(profile.sqm_id.clone()));
    }

    // Also write flat keys for compatibility
    if let Some(map) = json.as_object_mut() {
        map.insert("telemetry.machineId".to_string(), Value::String(profile.machine_id.clone()));
        // ... other fields ...
        map.insert("storage.serviceMachineId".to_string(), Value::String(profile.dev_device_id.clone()));
    }

    fs::write(storage_path, serde_json::to_string_pretty(&json)?)?;

    // Sync to SQLite state.vscdb
    sync_state_service_machine_id_value(&profile.dev_device_id)?;
    Ok(())
}
```

**SQLite State Sync**:

```rust
fn sync_state_service_machine_id_value(service_id: &str) -> Result<(), String> {
    let db_path = get_state_db_path()?;
    if !db_path.exists() {
        return Ok(()); // Skip if state.vscdb doesn't exist
    }

    let conn = Connection::open(&db_path)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT);",
        [],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('storage.serviceMachineId', ?1);",
        [service_id],
    )?;
    Ok(())
}
```

**Global Original Backup**:

```rust
pub fn load_global_original() -> Option<DeviceProfile> {
    let path = get_data_dir()?.join("device_original.json");
    if path.exists() {
        let content = fs::read_to_string(&path).ok()?;
        serde_json::from_str::<DeviceProfile>(&content).ok()
    } else {
        None
    }
}

pub fn save_global_original(profile: &DeviceProfile) -> Result<(), String> {
    let path = get_data_dir()?.join("device_original.json");
    if path.exists() {
        return Ok(()); // Don't overwrite existing backup
    }
    let content = serde_json::to_string_pretty(profile)?;
    fs::write(&path, content)?;
    Ok(())
}
```

**ag-cl Implementation Notes**:

- Generate unique fingerprints per account
- Store fingerprints with account credentials
- Apply fingerprint before making API calls
- Implement backup/restore for original fingerprint
- Sync across JSON and SQLite storage formats

---

### Multi-Provider Executor Patterns (CLIProxyAPI)

**Source**: `internal/runtime/executor/qwen_executor.go`, `codex_executor.go`, `iflow_executor.go`

CLIProxyAPI implements a pluggable executor pattern for multiple AI providers.

#### Qwen Executor (Alibaba)

**Key Pattern**: OpenAI-compatible API with Qwen-specific quirks.

```go
const (
    qwenUserAgent      = "google-api-nodejs-client/9.15.1"
    qwenXGoogAPIClient = "gl-node/22.17.0"
)

// Qwen3 "Poisoning" Workaround: Empty tools array causes random token injection
if (toolsResult.IsArray() && len(toolsResult.Array()) == 0) || !toolsResult.Exists() {
    // Inject dummy tool to prevent poisoning
    body, _ = sjson.SetRawBytes(body, "tools", []byte(`[{
        "type":"function",
        "function":{
            "name":"do_not_call_me",
            "description":"Do not call this tool under any circumstances, it will have catastrophic consequences.",
            "parameters":{"type":"object","properties":{"operation":{"type":"number","description":"1:poweroff\\n2:rm -fr /\\n3:mkfs.ext4 /dev/sda1"}},"required":["operation"]}
        }
    }]`))
}
```

**Qwen-Specific Headers**:

```go
func applyQwenHeaders(r *http.Request, token string, stream bool) {
    r.Header.Set("Authorization", "Bearer "+token)
    r.Header.Set("User-Agent", qwenUserAgent)
    r.Header.Set("X-Goog-Api-Client", qwenXGoogAPIClient)
    r.Header.Set("Client-Metadata", "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI")
}
```

#### Codex Executor (OpenAI)

**Key Pattern**: Uses ChatGPT's backend API with session caching.

```go
const (
    codexBaseURL = "https://chatgpt.com/backend-api/codex"
)

// Session caching for prompt reuse
func (e *CodexExecutor) cacheHelper(ctx context.Context, from sdktranslator.Format, url string, req cliproxyexecutor.Request, rawJSON []byte) (*http.Request, error) {
    var cache codexCache
    if from == "claude" {
        userIDResult := gjson.GetBytes(req.Payload, "metadata.user_id")
        if userIDResult.Exists() {
            key := fmt.Sprintf("%s-%s", req.Model, userIDResult.String())
            if cache, ok = getCodexCache(key); !ok {
                cache = codexCache{
                    ID:     uuid.New().String(),
                    Expire: time.Now().Add(1 * time.Hour),
                }
                setCodexCache(key, cache)
            }
        }
    }

    rawJSON, _ = sjson.SetBytes(rawJSON, "prompt_cache_key", cache.ID)
    httpReq.Header.Set("Conversation_id", cache.ID)
    httpReq.Header.Set("Session_id", cache.ID)
    return httpReq, nil
}
```

**Codex Headers**:

```go
func applyCodexHeaders(r *http.Request, auth *cliproxyauth.Auth, token string) {
    r.Header.Set("Version", "0.21.0")
    r.Header.Set("Openai-Beta", "responses=experimental")
    r.Header.Set("User-Agent", "codex_cli_rs/0.50.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464")
    r.Header.Set("Originator", "codex_cli_rs")

    if accountID, ok := auth.Metadata["account_id"].(string); ok {
        r.Header.Set("Chatgpt-Account-Id", accountID)
    }
}
```

**Tokenizer Selection**:

```go
func tokenizerForCodexModel(model string) (tokenizer.Codec, error) {
    switch {
    case strings.HasPrefix(sanitized, "gpt-5"):
        return tokenizer.ForModel(tokenizer.GPT5)
    case strings.HasPrefix(sanitized, "gpt-4.1"):
        return tokenizer.ForModel(tokenizer.GPT41)
    case strings.HasPrefix(sanitized, "gpt-4o"):
        return tokenizer.ForModel(tokenizer.GPT4o)
    case strings.HasPrefix(sanitized, "gpt-4"):
        return tokenizer.ForModel(tokenizer.GPT4)
    default:
        return tokenizer.Get(tokenizer.Cl100kBase)
    }
}
```

#### iFlow Executor

**Key Pattern**: OpenAI-compatible with model-specific thinking configuration.

```go
// GLM-4.6/4.7: Use chat_template_kwargs for thinking
if strings.HasPrefix(model, "glm-4") {
    body, _ = sjson.SetBytes(body, "chat_template_kwargs.enable_thinking", enableThinking)
    if enableThinking {
        body, _ = sjson.SetBytes(body, "chat_template_kwargs.clear_thinking", false)
    }
    return body
}

// MiniMax M2/M2.1: Use reasoning_split
if strings.HasPrefix(model, "minimax-m2") {
    body, _ = sjson.SetBytes(body, "reasoning_split", enableThinking)
    return body
}
```

**Dual Auth Support**:

```go
func (e *IFlowExecutor) Refresh(ctx context.Context, auth *cliproxyauth.Auth) (*cliproxyauth.Auth, error) {
    // Check if this is cookie-based authentication
    if cookie != "" && email != "" {
        return e.refreshCookieBased(ctx, auth, cookie, email)
    }
    // Otherwise, use OAuth-based refresh
    return e.refreshOAuthBased(ctx, auth)
}

// Cookie-based refresh (browser session)
func (e *IFlowExecutor) refreshCookieBased(ctx context.Context, auth *cliproxyauth.Auth, cookie, email string) (*cliproxyauth.Auth, error) {
    needsRefresh, _, err := iflowauth.ShouldRefreshAPIKey(currentExpire)
    if !needsRefresh {
        return auth, nil
    }
    keyData, err := svc.RefreshAPIKey(ctx, cookie, email)
    auth.Metadata["api_key"] = keyData.APIKey
    auth.Metadata["expired"] = keyData.ExpireTime
    return auth, nil
}
```

**Reasoning Content Preservation**:

```go
// For GLM-4.6/4.7 and MiniMax M2/M2.1, preserve reasoning_content in message history
func preserveReasoningContentInMessages(body []byte) []byte {
    model := strings.ToLower(gjson.GetBytes(body, "model").String())

    needsPreservation := strings.HasPrefix(model, "glm-4") || strings.HasPrefix(model, "minimax-m2")
    if !needsPreservation {
        return body
    }

    // Check if assistant messages have reasoning_content preserved
    messages.ForEach(func(_, msg gjson.Result) bool {
        if msg.Get("role").String() == "assistant" {
            if msg.Get("reasoning_content").Exists() {
                hasReasoningContent = true
                return false
            }
        }
        return true
    })

    return body
}
```

**Executor Comparison Table**:

| Feature          | Qwen                 | Codex                           | iFlow                                      |
| ---------------- | -------------------- | ------------------------------- | ------------------------------------------ |
| Base URL         | `portal.qwen.ai/v1`  | `chatgpt.com/backend-api/codex` | Configurable                               |
| Auth Type        | OAuth                | OAuth + API Key                 | OAuth + Cookie                             |
| Session Caching  | No                   | Yes (1 hour)                    | No                                         |
| Thinking Mode    | `reasoning_effort`   | `reasoning.effort`              | `chat_template_kwargs` / `reasoning_split` |
| Token Counting   | tiktoken (OpenAI)    | tiktoken (GPT-5)                | tiktoken (OpenAI)                          |
| Tools Workaround | Dummy tool injection | None                            | Noop placeholder                           |

---

### MCP Handler Patterns (Antigravity-Manager)

**Source**: `src-tauri/src/proxy/handlers/mcp.rs`

Antigravity-Manager implements Model Context Protocol (MCP) server proxying with session management.

**MCP Session Management**:

```rust
async fn handle_vision_post(state: AppState, headers: HeaderMap, body: Body) -> Response {
    let request_json: Value = serde_json::from_slice(&collected)?;

    let method = request_json.get("method").and_then(|m| m.as_str()).unwrap_or_default();

    // Handle initialize request - create new session
    if is_initialize_request(&request_json) {
        let session_id = state.zai_vision_mcp.create_session().await;

        let result = json!({
            "protocolVersion": requested_protocol,
            "capabilities": { "tools": {} },
            "serverInfo": {
                "name": "zai-mcp-server",
                "version": env!("CARGO_PKG_VERSION"),
            }
        });

        let mut resp = (StatusCode::OK, Json(jsonrpc_result(id, result))).into_response();
        resp.headers_mut().insert("mcp-session-id", session_id.into());
        return resp;
    }

    // Validate session for other methods
    let session_id = mcp_session_id(&headers)?;
    if !state.zai_vision_mcp.has_session(&session_id).await {
        return jsonrpc_error(id, -32000, "Bad Request: invalid Mcp-Session-Id");
    }

    // Route to handler
    match method {
        "tools/list" => /* return tool specs */,
        "tools/call" => /* execute tool */,
        _ => jsonrpc_error(id, -32601, format!("Method not found: {}", method)),
    }
}
```

**SSE Keep-Alive for Long-Running Sessions**:

```rust
async fn handle_vision_get(state: AppState, headers: HeaderMap) -> Response {
    let session_id = mcp_session_id(&headers)?;

    // Create ping stream for SSE keep-alive
    let ping_stream = IntervalStream::new(tokio::time::interval(Duration::from_secs(15)))
        .map(|_| {
            Ok::<axum::response::sse::Event, Infallible>(
                axum::response::sse::Event::default()
                    .event("ping")
                    .data("keepalive"),
            )
        });

    axum::response::sse::Sse::new(ping_stream)
        .keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text("keepalive"),
        )
        .into_response()
}
```

**MCP Proxy Forwarding**:

```rust
async fn forward_mcp(
    state: &AppState,
    incoming_headers: HeaderMap,
    method: Method,
    upstream_url: &str,
    body: Body,
) -> Response {
    let zai = state.zai.read().await.clone();
    if !zai.enabled || zai.api_key.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "z.ai is not configured").into_response();
    }

    // Build client with upstream proxy support
    let client = build_client(upstream_proxy, timeout_secs)?;

    // Copy passthrough headers
    let mut headers = copy_passthrough_headers(&incoming_headers);
    headers.insert(header::AUTHORIZATION, format!("Bearer {}", zai.api_key).into());

    // Forward request and stream response
    let resp = client.request(method, upstream_url).headers(headers).body(collected).send().await?;

    let stream = resp.bytes_stream().map(|chunk| match chunk {
        Ok(b) => Ok::<Bytes, std::io::Error>(b),
        Err(e) => Ok(Bytes::from(format!("Upstream stream error: {}", e))),
    });

    Response::builder().status(status).body(Body::from_stream(stream))
}
```

**Supported MCP Endpoints**:

| Endpoint                        | Handler                   | Purpose             |
| ------------------------------- | ------------------------- | ------------------- |
| `/api/mcp/web_search_prime/mcp` | `handle_web_search_prime` | Web search via z.ai |
| `/api/mcp/web_reader/mcp`       | `handle_web_reader`       | Web page reading    |
| `/api/mcp/zai/mcp`              | `handle_zai_mcp_server`   | Vision tools        |

---

### Rate Limit Tracker (Antigravity-Manager)

**Source**: `src-tauri/src/proxy/rate_limit.rs`

Comprehensive rate limit tracking with smart exponential backoff and optimistic reset.

**Rate Limit Reason Types**:

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RateLimitReason {
    QuotaExhausted,           // Daily quota used up
    RateLimitExceeded,        // Per-minute rate limit
    ModelCapacityExhausted,   // No GPU instances available
    ServerError,              // 5xx errors
    Unknown,
}
```

**Rate Limit Info Structure**:

```rust
#[derive(Debug, Clone)]
pub struct RateLimitInfo {
    pub reset_time: SystemTime,       // When the limit resets
    pub retry_after_sec: u64,         // Retry-After value
    pub detected_at: SystemTime,      // When limit was detected
    pub reason: RateLimitReason,      // Reason type
    pub model: Option<String>,        // None = account-level, Some = model-level
}

pub struct RateLimitTracker {
    limits: DashMap<String, RateLimitInfo>,      // Thread-safe map
    failure_counts: DashMap<String, u32>,        // For exponential backoff
}
```

**Smart Exponential Backoff**:

```rust
let lockout = match failure_count {
    1 => {
        tracing::warn!("Quota exhausted, 1st failure, locking 60s");
        60
    },
    2 => {
        tracing::warn!("Quota exhausted, 2nd consecutive failure, locking 5min");
        300
    },
    3 => {
        tracing::warn!("Quota exhausted, 3rd consecutive failure, locking 30min");
        1800
    },
    _ => {
        tracing::warn!("Quota exhausted, {}th consecutive failure, locking 2h", failure_count);
        7200
    }
};
```

**Reason-Specific Default Lockouts**:

```rust
match reason {
    RateLimitReason::QuotaExhausted => /* exponential: 60s → 5m → 30m → 2h */,
    RateLimitReason::RateLimitExceeded => 30,     // Short TPM limits
    RateLimitReason::ModelCapacityExhausted => 15, // Retry soon
    RateLimitReason::ServerError => 20,            // Soft backoff
    RateLimitReason::Unknown => 60,
}
```

**Duration String Parsing** (Google's complex formats):

```rust
fn parse_duration_string(&self, s: &str) -> Option<u64> {
    // Supports: "2h21m25.831582438s", "1h30m", "5m", "30s", "500ms"
    let re = Regex::new(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?").ok()?;
    let caps = re.captures(s)?;

    let hours = caps.get(1).and_then(|m| m.as_str().parse::<u64>().ok()).unwrap_or(0);
    let minutes = caps.get(2).and_then(|m| m.as_str().parse::<u64>().ok()).unwrap_or(0);
    let seconds = caps.get(3).and_then(|m| m.as_str().parse::<f64>().ok()).unwrap_or(0.0);
    let milliseconds = caps.get(4).and_then(|m| m.as_str().parse::<u64>().ok()).unwrap_or(0);

    let total_seconds = hours * 3600 + minutes * 60 + seconds.ceil() as u64 + (milliseconds + 999) / 1000;
    if total_seconds > 0 { Some(total_seconds) } else { None }
}
```

**Optimistic Reset**:

```rust
/// Clear all rate limits when timing race conditions cause false blocks
pub fn clear_all(&self) {
    let count = self.limits.len();
    self.limits.clear();
    tracing::warn!("🔄 Optimistic reset: Cleared all {} rate limit record(s)", count);
}
```

**Success Tracking** (resets backoff):

```rust
pub fn mark_success(&self, account_id: &str) {
    if self.failure_counts.remove(account_id).is_some() {
        tracing::debug!("Account {} succeeded, reset failure count", account_id);
    }
    self.limits.remove(account_id);
}
```

**Error Response Parsing**:

```rust
fn parse_from_error(&self, account_id: &str, status: u16, retry_after_header: Option<&str>, body: &str, model: Option<String>) -> Option<RateLimitInfo> {
    // Supports 429, 500, 503, 529

    // 1. Parse reason from JSON
    let reason = if status == 429 {
        self.parse_rate_limit_reason(body)
    } else {
        RateLimitReason::ServerError
    };

    // 2. Extract from Retry-After header
    if let Some(retry_after) = retry_after_header {
        if let Ok(seconds) = retry_after.parse::<u64>() {
            retry_after_sec = Some(seconds);
        }
    }

    // 3. Extract from error body
    if retry_after_sec.is_none() {
        retry_after_sec = self.parse_retry_time_from_body(body);
    }

    // 4. Apply safety buffer (minimum 2 seconds)
    let retry_sec = retry_after_sec.map(|s| if s < 2 { 2 } else { s }).unwrap_or(/* default based on reason */);

    Some(RateLimitInfo { ... })
}
```

**Reason Detection from Message**:

```rust
fn parse_rate_limit_reason(&self, body: &str) -> RateLimitReason {
    // Try JSON first
    if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
        if let Some(reason_str) = json.get("error").and_then(|e| e.get("details"))
            .and_then(|d| d.as_array()).and_then(|a| a.get(0))
            .and_then(|o| o.get("reason")).and_then(|v| v.as_str()) {

            return match reason_str {
                "QUOTA_EXHAUSTED" => RateLimitReason::QuotaExhausted,
                "RATE_LIMIT_EXCEEDED" => RateLimitReason::RateLimitExceeded,
                "MODEL_CAPACITY_EXHAUSTED" => RateLimitReason::ModelCapacityExhausted,
                _ => RateLimitReason::Unknown,
            };
        }
    }

    // Text matching (prioritize TPM over quota)
    let body_lower = body.to_lowercase();
    if body_lower.contains("per minute") || body_lower.contains("rate limit") {
        RateLimitReason::RateLimitExceeded
    } else if body_lower.contains("exhausted") || body_lower.contains("quota") {
        RateLimitReason::QuotaExhausted
    } else {
        RateLimitReason::Unknown
    }
}
```

---

### Simple Rate Limiter (Antigravity-Manager)

**Source**: `src-tauri/src/proxy/common/rate_limiter.rs`

Simple async rate limiter for API call throttling.

```rust
pub struct RateLimiter {
    min_interval: Duration,
    last_call: Arc<Mutex<Option<Instant>>>,
}

impl RateLimiter {
    pub fn new(min_interval_ms: u64) -> Self {
        Self {
            min_interval: Duration::from_millis(min_interval_ms),
            last_call: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn wait(&self) {
        let mut last = self.last_call.lock().await;
        if let Some(last_time) = *last {
            let elapsed = last_time.elapsed();
            if elapsed < self.min_interval {
                sleep(self.min_interval - elapsed).await;
            }
        }
        *last = Some(Instant::now());
    }
}

// Usage: Ensure 500ms between API calls
let limiter = RateLimiter::new(500);
limiter.wait().await;  // First call: immediate
limiter.wait().await;  // Second call: waits remaining time
```

**ag-cl Implementation Notes**:

- Use DashMap for thread-safe concurrent access
- Track failure counts separately for exponential backoff
- Parse Google's complex duration strings (h/m/s/ms)
- Distinguish TPM limits from quota exhaustion
- Implement optimistic reset for timing race conditions
- Apply minimum 2-second safety buffer

---

### Auto-Update Checker (Antigravity-Manager)

**Source**: `src-tauri/src/modules/update_checker.rs`

Desktop application auto-update functionality using GitHub releases API.

**UpdateInfo Structure**:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub download_url: String,
    pub release_notes: String,
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSettings {
    pub auto_check: bool,
    pub last_check_time: u64,
    #[serde(default = "default_check_interval")]
    pub check_interval_hours: u64,  // Default: 24 hours
}
```

**GitHub Release Check**:

```rust
const GITHUB_API_URL: &str = "https://api.github.com/repos/lbjlaq/Antigravity-Manager/releases/latest";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_CHECK_INTERVAL_HOURS: u64 = 24;

pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent("Antigravity-Manager")
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let response = client.get(GITHUB_API_URL).send().await?;
    let release: GitHubRelease = response.json().await?;

    // Remove 'v' prefix if present
    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let has_update = compare_versions(&latest_version, CURRENT_VERSION);

    Ok(UpdateInfo {
        current_version: CURRENT_VERSION.to_string(),
        latest_version,
        has_update,
        download_url: release.html_url,
        release_notes: release.body,
        published_at: release.published_at,
    })
}
```

**Semantic Version Comparison**:

```rust
fn compare_versions(latest: &str, current: &str) -> bool {
    let parse_version = |v: &str| -> Vec<u32> {
        v.split('.')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect()
    };

    let latest_parts = parse_version(latest);
    let current_parts = parse_version(current);

    for i in 0..latest_parts.len().max(current_parts.len()) {
        let latest_part = latest_parts.get(i).unwrap_or(&0);
        let current_part = current_parts.get(i).unwrap_or(&0);

        if latest_part > current_part {
            return true;  // Update available
        } else if latest_part < current_part {
            return false;  // Current is newer (dev build?)
        }
    }
    false  // Versions are equal
}
```

**Check Interval Logic**:

```rust
pub fn should_check_for_updates(settings: &UpdateSettings) -> bool {
    if !settings.auto_check {
        return false;
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let elapsed_hours = (now - settings.last_check_time) / 3600;
    let interval = settings.check_interval_hours.max(1);  // Minimum 1 hour

    elapsed_hours >= interval
}
```

**Settings Persistence**:

```rust
pub fn load_update_settings() -> Result<UpdateSettings, String> {
    let data_dir = get_data_dir()?;
    let settings_path = data_dir.join("update_settings.json");

    if !settings_path.exists() {
        return Ok(UpdateSettings::default());
    }

    let content = std::fs::read_to_string(&settings_path)?;
    serde_json::from_str(&content)
}

pub fn save_update_settings(settings: &UpdateSettings) -> Result<(), String> {
    let data_dir = get_data_dir()?;
    let settings_path = data_dir.join("update_settings.json");
    let content = serde_json::to_string_pretty(settings)?;
    std::fs::write(&settings_path, content)
}
```

---

### System Tray Integration (Antigravity-Manager)

**Source**: `src-tauri/src/modules/tray.rs`

Tauri v2 system tray with dynamic menu updates and i18n support.

**Tray Menu Structure**:

```rust
pub fn create_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    // Load i18n texts based on config
    let config = modules::load_app_config().unwrap_or_default();
    let texts = modules::i18n::get_tray_texts(&config.language);

    // Load tray icon (macOS Template Image support)
    let icon_bytes = include_bytes!("../../icons/tray-icon.png");
    let img = image::load_from_memory(icon_bytes)?.to_rgba8();
    let (width, height) = img.dimensions();
    let icon = Image::new_owned(img.into_raw(), width, height);

    // Status section (disabled - for display only)
    let info_user = MenuItem::with_id(app, "info_user", &loading_text, false, None::<&str>)?;
    let info_quota = MenuItem::with_id(app, "info_quota", &quota_text, false, None::<&str>)?;

    // Action section
    let switch_next = MenuItem::with_id(app, "switch_next", &texts.switch_next, true, None::<&str>)?;
    let refresh_curr = MenuItem::with_id(app, "refresh_curr", &texts.refresh_current, true, None::<&str>)?;

    // System section
    let show_i = MenuItem::with_id(app, "show", &texts.show_window, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", &texts.quit, true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &info_user, &info_quota, &sep1,
        &switch_next, &refresh_curr, &sep2,
        &show_i, &sep3, &quit_i,
    ])?;

    TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)  // Left click shows window
        .icon(icon)
        .on_menu_event(/* event handlers */)
        .on_tray_icon_event(/* left click handler */)
        .build(app)?;

    Ok(())
}
```

**Menu Event Handlers**:

```rust
.on_menu_event(move |app, event| {
    match event.id().as_ref() {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                #[cfg(target_os = "macos")]
                app.set_activation_policy(tauri::ActivationPolicy::Regular).unwrap_or(());
            }
        }

        "quit" => {
            app.exit(0);
        }

        "refresh_curr" => {
            // Async quota refresh for current account
            tauri::async_runtime::spawn(async move {
                if let Ok(Some(account_id)) = modules::get_current_account_id() {
                    let _ = app_handle.emit("tray://refresh-current", ());

                    if let Ok(mut account) = modules::load_account(&account_id) {
                        match modules::account::fetch_quota_with_retry(&mut account).await {
                            Ok(quota) => {
                                let _ = modules::update_account_quota(&account.id, quota);
                                update_tray_menus(&app_handle);
                            },
                            Err(e) => {
                                modules::logger::log_error(&format!("Tray refresh failed: {}", e));
                            }
                        }
                    }
                }
            });
        }

        "switch_next" => {
            // Round-robin account switching
            tauri::async_runtime::spawn(async move {
                if let Ok(accounts) = modules::list_accounts() {
                    if accounts.is_empty() { return; }

                    let current_id = modules::get_current_account_id().unwrap_or(None);
                    let next_account = if let Some(curr) = current_id {
                        let idx = accounts.iter().position(|a| a.id == curr).unwrap_or(0);
                        let next_idx = (idx + 1) % accounts.len();
                        &accounts[next_idx]
                    } else {
                        &accounts[0]
                    };

                    if let Ok(_) = modules::switch_account(&next_account.id).await {
                        let _ = app_handle.emit("tray://account-switched", next_account.id.clone());
                        update_tray_menus(&app_handle);
                    }
                }
            });
        }
        _ => {}
    }
})
```

**Dynamic Menu Updates**:

```rust
pub fn update_tray_menus<R: Runtime>(app: &tauri::AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let config = modules::load_app_config().unwrap_or_default();
        let texts = modules::i18n::get_tray_texts(&config.language);

        let current = modules::get_current_account_id().unwrap_or(None);
        let mut menu_lines = Vec::new();
        let mut user_text = format!("{}: {}", texts.current, texts.no_account);

        if let Some(id) = current {
            if let Ok(account) = modules::load_account(&id) {
                user_text = format!("{}: {}", texts.current, account.email);

                if let Some(q) = account.quota {
                    if q.is_forbidden {
                        menu_lines.push(format!("🚫 {}", texts.forbidden));
                    } else {
                        // Extract specific model quotas
                        for m in q.models {
                            let name = m.name.to_lowercase();
                            match name.as_str() {
                                "gemini-3-pro-high" => menu_lines.push(format!("Gemini High: {}%", m.percentage)),
                                "gemini-3-pro-image" => menu_lines.push(format!("Gemini Image: {}%", m.percentage)),
                                "claude-sonnet-4-5" => menu_lines.push(format!("Claude 4.5: {}%", m.percentage)),
                                _ => {}
                            }
                        }
                    }
                }
            }
        }

        // Rebuild and set new menu
        if let Ok(menu) = Menu::with_items(&app_clone, &items) {
            if let Some(tray) = app_clone.tray_by_id("main") {
                let _ = tray.set_menu(Some(menu));
            }
        }
    });
}
```

**Left Click to Show Window**:

```rust
.on_tray_icon_event(|tray, event| {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        ..
    } = event
    {
        let app = tray.app_handle();
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular).unwrap_or(());
        }
    }
})
```

**Config Change Listener**:

```rust
// Listen for config updates to refresh tray
app.listen("config://updated", move |_event| {
    modules::logger::log_info("Config updated, refreshing tray menu");
    update_tray_menus(&handle);
});
```

---

### Model Registry with Reference Counting (CLIProxyAPI)

**Source**: `internal/registry/model_registry.go`

Centralized model management with reference counting to track active clients.

**Core Data Structures**:

```go
type ModelInfo struct {
    ID                         string   `json:"id"`
    Object                     string   `json:"object"`  // "model"
    Created                    int64    `json:"created"`
    OwnedBy                    string   `json:"owned_by"`
    Type                       string   `json:"type"`  // "claude", "gemini", "openai"
    DisplayName                string   `json:"display_name,omitempty"`
    InputTokenLimit            int      `json:"inputTokenLimit,omitempty"`
    OutputTokenLimit           int      `json:"outputTokenLimit,omitempty"`
    SupportedGenerationMethods []string `json:"supportedGenerationMethods,omitempty"`
    Thinking                   *ThinkingSupport `json:"thinking,omitempty"`
}

type ThinkingSupport struct {
    Min            int      `json:"min,omitempty"`
    Max            int      `json:"max,omitempty"`
    ZeroAllowed    bool     `json:"zero_allowed,omitempty"`
    DynamicAllowed bool     `json:"dynamic_allowed,omitempty"`
    Levels         []string `json:"levels,omitempty"`  // ["low", "medium", "high"]
}

type ModelRegistration struct {
    Info                 *ModelInfo
    Count                int  // Reference count of active clients
    LastUpdated          time.Time
    QuotaExceededClients map[string]*time.Time
    Providers            map[string]int  // Provider -> client count
    SuspendedClients     map[string]string  // ClientID -> reason
}
```

**Global Singleton Pattern**:

```go
var globalRegistry *ModelRegistry
var registryOnce sync.Once

func GetGlobalRegistry() *ModelRegistry {
    registryOnce.Do(func() {
        globalRegistry = &ModelRegistry{
            models:           make(map[string]*ModelRegistration),
            clientModels:     make(map[string][]string),
            clientModelInfos: make(map[string]map[string]*ModelInfo),
            clientProviders:  make(map[string]string),
            mutex:            &sync.RWMutex{},
        }
    })
    return globalRegistry
}
```

**Client Registration with Reconciliation**:

```go
func (r *ModelRegistry) RegisterClient(clientID, clientProvider string, models []*ModelInfo) {
    r.mutex.Lock()
    defer r.mutex.Unlock()

    // Build new state
    newModels := make(map[string]*ModelInfo)
    newCounts := make(map[string]int)
    for _, model := range models {
        rawModelIDs = append(rawModelIDs, model.ID)
        newCounts[model.ID]++
        newModels[model.ID] = model
    }

    // Handle first registration (pure addition)
    if !hadExisting {
        for _, modelID := range rawModelIDs {
            r.addModelRegistration(modelID, provider, newModels[modelID], now)
        }
        r.clientModels[clientID] = rawModelIDs
        r.triggerModelsRegistered(provider, clientID, models)
        return
    }

    // Reconcile: detect adds, removes, count changes
    oldCounts := countModels(oldModels)

    // Apply removals first
    for id := range removed {
        r.removeModelRegistration(clientID, id, oldProvider, now)
    }

    // Apply additions
    for id, newCount := range newCounts {
        if diff := newCount - oldCounts[id]; diff > 0 {
            for i := 0; i < diff; i++ {
                r.addModelRegistration(id, provider, newModels[id], now)
            }
        }
    }
}
```

**Quota Exceeded and Suspension Tracking**:

```go
func (r *ModelRegistry) SetModelQuotaExceeded(clientID, modelID string) {
    r.mutex.Lock()
    defer r.mutex.Unlock()

    if registration, exists := r.models[modelID]; exists {
        now := time.Now()
        registration.QuotaExceededClients[clientID] = &now
    }
}

func (r *ModelRegistry) SuspendClientModel(clientID, modelID, reason string) {
    r.mutex.Lock()
    defer r.mutex.Unlock()

    if registration, exists := r.models[modelID]; exists {
        registration.SuspendedClients[clientID] = reason
        registration.LastUpdated = time.Now()
    }
}

func (r *ModelRegistry) ResumeClientModel(clientID, modelID string) {
    r.mutex.Lock()
    defer r.mutex.Unlock()

    if registration, exists := r.models[modelID]; exists {
        delete(registration.SuspendedClients, clientID)
        registration.LastUpdated = time.Now()
    }
}
```

**Available Models Calculation**:

```go
func (r *ModelRegistry) GetAvailableModels(handlerType string) []map[string]any {
    r.mutex.RLock()
    defer r.mutex.RUnlock()

    quotaExpiredDuration := 5 * time.Minute
    models := make([]map[string]any, 0)

    for _, registration := range r.models {
        availableClients := registration.Count
        now := time.Now()

        // Count clients with recent quota exceeded
        expiredClients := 0
        for _, quotaTime := range registration.QuotaExceededClients {
            if quotaTime != nil && now.Sub(*quotaTime) < quotaExpiredDuration {
                expiredClients++
            }
        }

        // Count suspended clients (distinguish quota vs other)
        cooldownSuspended := 0
        otherSuspended := 0
        for _, reason := range registration.SuspendedClients {
            if strings.EqualFold(reason, "quota") {
                cooldownSuspended++
            } else {
                otherSuspended++
            }
        }

        effectiveClients := availableClients - expiredClients - otherSuspended
        if effectiveClients < 0 {
            effectiveClients = 0
        }

        // Include if has clients OR is only cooling down
        if effectiveClients > 0 || (availableClients > 0 && (expiredClients > 0 || cooldownSuspended > 0) && otherSuspended == 0) {
            models = append(models, r.convertModelToMap(registration.Info, handlerType))
        }
    }

    return models
}
```

**Hook System for External Integrations**:

```go
type ModelRegistryHook interface {
    OnModelsRegistered(ctx context.Context, provider, clientID string, models []*ModelInfo)
    OnModelsUnregistered(ctx context.Context, provider, clientID string)
}

func (r *ModelRegistry) triggerModelsRegistered(provider, clientID string, models []*ModelInfo) {
    hook := r.hook
    if hook == nil {
        return
    }

    modelsCopy := cloneModelInfosUnique(models)
    go func() {
        defer func() {
            if recovered := recover(); recovered != nil {
                log.Errorf("model registry hook panic: %v", recovered)
            }
        }()
        ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
        defer cancel()
        hook.OnModelsRegistered(ctx, provider, clientID, modelsCopy)
    }()
}
```

**Handler Type Conversion**:

```go
func (r *ModelRegistry) convertModelToMap(model *ModelInfo, handlerType string) map[string]any {
    switch handlerType {
    case "openai":
        return map[string]any{
            "id": model.ID,
            "object": "model",
            "owned_by": model.OwnedBy,
            "created": model.Created,
        }
    case "claude":
        return map[string]any{
            "id": model.ID,
            "object": "model",
            "owned_by": model.OwnedBy,
        }
    case "gemini":
        return map[string]any{
            "name": model.Name,
            "displayName": model.DisplayName,
            "inputTokenLimit": model.InputTokenLimit,
            "outputTokenLimit": model.OutputTokenLimit,
        }
    default:
        return map[string]any{"id": model.ID, "object": "model"}
    }
}
```

---

### Tokenizer Helpers (CLIProxyAPI)

**Source**: `internal/runtime/executor/token_helpers.go`

OpenAI-compatible token counting using tiktoken.

**Model-Specific Tokenizer Selection**:

```go
func tokenizerForModel(model string) (tokenizer.Codec, error) {
    sanitized := strings.ToLower(strings.TrimSpace(model))
    switch {
    case sanitized == "":
        return tokenizer.Get(tokenizer.Cl100kBase)
    case strings.HasPrefix(sanitized, "gpt-5"):
        return tokenizer.ForModel(tokenizer.GPT5)
    case strings.HasPrefix(sanitized, "gpt-5.1"):
        return tokenizer.ForModel(tokenizer.GPT5)
    case strings.HasPrefix(sanitized, "gpt-4.1"):
        return tokenizer.ForModel(tokenizer.GPT41)
    case strings.HasPrefix(sanitized, "gpt-4o"):
        return tokenizer.ForModel(tokenizer.GPT4o)
    case strings.HasPrefix(sanitized, "gpt-4"):
        return tokenizer.ForModel(tokenizer.GPT4)
    case strings.HasPrefix(sanitized, "gpt-3.5"), strings.HasPrefix(sanitized, "gpt-3"):
        return tokenizer.ForModel(tokenizer.GPT35Turbo)
    case strings.HasPrefix(sanitized, "o1"):
        return tokenizer.ForModel(tokenizer.O1)
    case strings.HasPrefix(sanitized, "o3"):
        return tokenizer.ForModel(tokenizer.O3)
    case strings.HasPrefix(sanitized, "o4"):
        return tokenizer.ForModel(tokenizer.O4Mini)
    default:
        return tokenizer.Get(tokenizer.O200kBase)
    }
}
```

**Chat Completion Token Counting**:

```go
func countOpenAIChatTokens(enc tokenizer.Codec, payload []byte) (int64, error) {
    root := gjson.ParseBytes(payload)
    segments := make([]string, 0, 32)

    // Collect all text content
    collectOpenAIMessages(root.Get("messages"), &segments)
    collectOpenAITools(root.Get("tools"), &segments)
    collectOpenAIFunctions(root.Get("functions"), &segments)
    collectOpenAIToolChoice(root.Get("tool_choice"), &segments)
    collectOpenAIResponseFormat(root.Get("response_format"), &segments)
    addIfNotEmpty(&segments, root.Get("input").String())
    addIfNotEmpty(&segments, root.Get("prompt").String())

    joined := strings.TrimSpace(strings.Join(segments, "\n"))
    if joined == "" {
        return 0, nil
    }

    count, err := enc.Count(joined)
    return int64(count), err
}
```

**Content Extraction (handles multimodal)**:

```go
func collectOpenAIContent(content gjson.Result, segments *[]string) {
    if content.Type == gjson.String {
        addIfNotEmpty(segments, content.String())
        return
    }

    if content.IsArray() {
        content.ForEach(func(_, part gjson.Result) bool {
            partType := part.Get("type").String()
            switch partType {
            case "text", "input_text", "output_text":
                addIfNotEmpty(segments, part.Get("text").String())
            case "image_url":
                addIfNotEmpty(segments, part.Get("image_url.url").String())
            case "input_audio", "output_audio", "audio":
                addIfNotEmpty(segments, part.Get("id").String())
            case "tool_result":
                addIfNotEmpty(segments, part.Get("name").String())
                collectOpenAIContent(part.Get("content"), segments)
            default:
                addIfNotEmpty(segments, part.String())
            }
            return true
        })
    }
}
```

---

### Session Cache Helpers (CLIProxyAPI)

**Source**: `internal/runtime/executor/cache_helpers.go`

Thread-safe session cache with automatic expiry cleanup.

```go
type codexCache struct {
    ID     string
    Expire time.Time
}

var (
    codexCacheMap = make(map[string]codexCache)
    codexCacheMu  sync.RWMutex
)

const codexCacheCleanupInterval = 15 * time.Minute

var codexCacheCleanupOnce sync.Once

// Background cleanup goroutine (starts on first access)
func startCodexCacheCleanup() {
    go func() {
        ticker := time.NewTicker(codexCacheCleanupInterval)
        defer ticker.Stop()
        for range ticker.C {
            purgeExpiredCodexCache()
        }
    }()
}

func purgeExpiredCodexCache() {
    now := time.Now()
    codexCacheMu.Lock()
    defer codexCacheMu.Unlock()
    for key, cache := range codexCacheMap {
        if cache.Expire.Before(now) {
            delete(codexCacheMap, key)
        }
    }
}

func getCodexCache(key string) (codexCache, bool) {
    codexCacheCleanupOnce.Do(startCodexCacheCleanup)  // Lazy init
    codexCacheMu.RLock()
    cache, ok := codexCacheMap[key]
    codexCacheMu.RUnlock()
    if !ok || cache.Expire.Before(time.Now()) {
        return codexCache{}, false
    }
    return cache, true
}

func setCodexCache(key string, cache codexCache) {
    codexCacheCleanupOnce.Do(startCodexCacheCleanup)
    codexCacheMu.Lock()
    codexCacheMap[key] = cache
    codexCacheMu.Unlock()
}
```

---

### Payload Helpers and Thinking Normalization (CLIProxyAPI)

**Source**: `internal/runtime/executor/payload_helpers.go`

Configuration-driven payload transformation with thinking mode normalization.

**Thinking Metadata Application**:

```go
// Apply thinking config from model suffix metadata (e.g., (high), (8192))
func ApplyThinkingMetadata(payload []byte, metadata map[string]any, model string) []byte {
    lookupModel := util.ResolveOriginalModel(model, metadata)

    // Determine which model to use for thinking support check
    thinkingModel := lookupModel
    if !util.ModelSupportsThinking(lookupModel) && util.ModelSupportsThinking(model) {
        thinkingModel = model
    }

    budgetOverride, includeOverride, ok := util.ResolveThinkingConfigFromMetadata(thinkingModel, metadata)
    if !ok || (budgetOverride == nil && includeOverride == nil) {
        return payload
    }

    if budgetOverride != nil {
        norm := util.NormalizeThinkingBudget(thinkingModel, *budgetOverride)
        budgetOverride = &norm
    }

    return util.ApplyGeminiThinkingConfig(payload, budgetOverride, includeOverride)
}
```

**Thinking Config Normalization**:

```go
func NormalizeThinkingConfig(payload []byte, model string, allowCompat bool) []byte {
    if !util.ModelSupportsThinking(model) {
        if allowCompat {
            return payload
        }
        return StripThinkingFields(payload, false)  // Remove all thinking fields
    }

    if util.ModelUsesThinkingLevels(model) {
        return NormalizeReasoningEffortLevel(payload, model)
    }

    // Model supports thinking but uses numeric budgets, not levels
    // Strip effort string fields since they are not applicable
    return StripThinkingFields(payload, true)  // effortOnly
}

func StripThinkingFields(payload []byte, effortOnly bool) []byte {
    fieldsToRemove := []string{
        "reasoning_effort",
        "reasoning.effort",
    }
    if !effortOnly {
        fieldsToRemove = append([]string{"reasoning", "thinking"}, fieldsToRemove...)
    }

    out := payload
    for _, field := range fieldsToRemove {
        if gjson.GetBytes(out, field).Exists() {
            out, _ = sjson.DeleteBytes(out, field)
        }
    }
    return out
}
```

**Glob-Style Model Pattern Matching**:

```go
// matchModelPattern performs simple wildcard matching
// Examples:
//   "*-5" matches "gpt-5"
//   "gpt-*" matches "gpt-5" and "gpt-4"
//   "gemini-*-pro" matches "gemini-2.5-pro" and "gemini-3-pro"
func matchModelPattern(pattern, model string) bool {
    if pattern == "*" {
        return true
    }

    // Iterative glob-style matcher supporting only '*' wildcard
    pi, si := 0, 0
    starIdx := -1
    matchIdx := 0

    for si < len(model) {
        if pi < len(pattern) && pattern[pi] == model[si] {
            pi++
            si++
            continue
        }
        if pi < len(pattern) && pattern[pi] == '*' {
            starIdx = pi
            matchIdx = si
            pi++
            continue
        }
        if starIdx != -1 {
            pi = starIdx + 1
            matchIdx++
            si = matchIdx
            continue
        }
        return false
    }

    // Consume trailing wildcards
    for pi < len(pattern) && pattern[pi] == '*' {
        pi++
    }
    return pi == len(pattern)
}
```

**Thinking Validation**:

```go
func ValidateThinkingConfig(payload []byte, model string) error {
    if !util.ModelSupportsThinking(model) || !util.ModelUsesThinkingLevels(model) {
        return nil
    }

    levels := util.GetModelThinkingLevels(model)

    checkField := func(path string) error {
        if effort := gjson.GetBytes(payload, path); effort.Exists() {
            if _, ok := util.NormalizeReasoningEffortLevel(model, effort.String()); !ok {
                return statusErr{
                    code: http.StatusBadRequest,
                    msg:  fmt.Sprintf("unsupported reasoning effort level %q for model %s (supported: %s)",
                        effort.String(), model, strings.Join(levels, ", ")),
                }
            }
        }
        return nil
    }

    if err := checkField("reasoning_effort"); err != nil {
        return err
    }
    return checkField("reasoning.effort")
}
```

---

### Gemini Transform Module (opencode-antigravity-auth)

**Source**: `src/plugin/transform/gemini.ts`

Gemini-specific request transformations with model-aware thinking config builders.

**Model Detection**:

```typescript
export function isGemini3Model(model: string): boolean {
  return /^gemini[_-]?3[_-]/i.test(model);
}

export function isGemini25Model(model: string): boolean {
  return /^gemini[_-]?2\.5[_-]/i.test(model);
}

export function isGemini3ProModel(model: string): boolean {
  return /^gemini[_-]?3[_-]pro/i.test(model);
}

export function isGemini3FlashModel(model: string): boolean {
  return /^gemini[_-]?3[_-]flash/i.test(model);
}
```

**Gemini 3 Thinking Config** (uses string levels):

```typescript
export function buildGemini3ThinkingConfig(includeThoughts: boolean, thinkingLevel: ThinkingTier): ThinkingConfig {
  return {
    includeThoughts,
    thinkingLevel, // "low" | "medium" | "high" | "minimal"
  };
}

// Gemini 3 Pro only supports: low, high
// Gemini 3 Flash supports: minimal, low, medium, high
```

**Gemini 2.5 Thinking Config** (uses numeric budget):

```typescript
export function buildGemini25ThinkingConfig(includeThoughts: boolean, thinkingBudget?: number): ThinkingConfig {
  return {
    includeThoughts,
    ...(typeof thinkingBudget === "number" && thinkingBudget > 0 ? { thinkingBudget } : {}),
  };
}
```

**Tool Normalization**:

```typescript
export function normalizeGeminiTools(tools: unknown[]): unknown[] {
  return tools.map((tool: any) => {
    // Ensure functionDeclarations format
    if (tool.function && !tool.functionDeclarations) {
      return {
        functionDeclarations: [tool.function],
      };
    }
    return tool;
  });
}
```

**ag-cl Implementation Notes**:

- Use regex patterns for reliable model family detection
- Gemini 3 uses `thinkingLevel` (string), Gemini 2.5 uses `thinkingBudget` (number)
- Different thinking levels available per model variant
- Tool format must use `functionDeclarations` wrapper

---

### Claude Transform Module (opencode-antigravity-auth)

**Source**: `src/plugin/transform/claude.ts`

Claude-specific transformations including VALIDATED mode and interleaved thinking hints.

**Interleaved Thinking Hint**:

```typescript
export const CLAUDE_INTERLEAVED_THINKING_HINT = "Interleaved thinking is enabled. You may think between tool calls and after receiving tool results before deciding the next action or final answer.";

export function injectInterleavedThinkingHint(payload: RequestPayload): void {
  if (!payload.systemInstruction) {
    payload.systemInstruction = {
      role: "user",
      parts: [{ text: CLAUDE_INTERLEAVED_THINKING_HINT }],
    };
    return;
  }

  const parts = payload.systemInstruction.parts as Array<{ text?: string }>;
  if (Array.isArray(parts)) {
    // Check if already injected
    const alreadyHasHint = parts.some((p) => typeof p.text === "string" && p.text.includes("Interleaved thinking is enabled"));
    if (!alreadyHasHint) {
      parts.push({ text: CLAUDE_INTERLEAVED_THINKING_HINT });
    }
  }
}
```

**VALIDATED Mode for Tools**:

```typescript
export function configureClaudeToolConfig(payload: RequestPayload): void {
  if (!payload.toolConfig) {
    payload.toolConfig = {
      functionCallingConfig: {
        mode: "VALIDATED",
      },
    };
    return;
  }

  const toolConfig = payload.toolConfig as Record<string, unknown>;
  if (typeof toolConfig.functionCallingConfig === "object") {
    (toolConfig.functionCallingConfig as Record<string, unknown>).mode = "VALIDATED";
  } else {
    toolConfig.functionCallingConfig = { mode: "VALIDATED" };
  }
}
```

**Claude Thinking Config** (snake_case format):

```typescript
export function buildClaudeThinkingConfig(includeThoughts: boolean, thinkingBudget?: number): ThinkingConfig {
  return {
    include_thoughts: includeThoughts, // snake_case for Claude
    ...(typeof thinkingBudget === "number" && thinkingBudget > 0
      ? { thinking_budget: thinkingBudget } // snake_case
      : {}),
  } as unknown as ThinkingConfig;
}
```

**Tool Parameter Normalization**:

```typescript
export function normalizeClaudeToolParameters(tools: unknown[]): unknown[] {
  return tools.map((tool: any) => {
    const declarations = tool.functionDeclarations;
    if (!Array.isArray(declarations)) return tool;

    const newDeclarations = declarations.map((decl: any) => {
      const params = decl.parameters || decl.parametersJsonSchema;
      if (!params) return decl;

      // Ensure required is an array
      if (params.required && !Array.isArray(params.required)) {
        params.required = [];
      }

      // Ensure properties exists
      if (!params.properties) {
        params.properties = {};
      }

      return decl;
    });

    return { ...tool, functionDeclarations: newDeclarations };
  });
}
```

**Claude vs Gemini Format Comparison**:

| Aspect              | Claude                          | Gemini                        |
| ------------------- | ------------------------------- | ----------------------------- |
| Thinking config key | `include_thoughts` (snake_case) | `includeThoughts` (camelCase) |
| Budget key          | `thinking_budget`               | `thinkingBudget`              |
| Tool mode           | `VALIDATED` required            | Optional                      |
| Thinking hint       | Explicit injection              | Not needed                    |

---

### Stable ID Generator (CLIProxyAPI)

**Source**: `internal/watcher/synthesizer/helpers.go`

Deterministic ID generation with collision handling for auth entries.

**Problem**: When synthesizing auth entries from config files, need stable IDs that don't change on restart but handle duplicate entries.

**Solution**: SHA256 hashing with counter-based collision resolution.

```go
type StableIDGenerator struct {
    counters map[string]int
}

func NewStableIDGenerator() *StableIDGenerator {
    return &StableIDGenerator{counters: make(map[string]int)}
}

// Next produces a stable ID based on kind + input parts.
// Returns (full_id, short_id).
// Example: ("gemini:a1b2c3d4e5f6", "a1b2c3d4e5f6")
func (g *StableIDGenerator) Next(kind string, parts ...string) (string, string) {
    hasher := sha256.New()
    hasher.Write([]byte(kind))
    for _, part := range parts {
        trimmed := strings.TrimSpace(part)
        hasher.Write([]byte{0})  // Null separator
        hasher.Write([]byte(trimmed))
    }

    digest := hex.EncodeToString(hasher.Sum(nil))
    short := digest[:12]  // First 12 hex chars = 48 bits

    // Collision handling via counter
    key := kind + ":" + short
    index := g.counters[key]
    g.counters[key] = index + 1

    if index > 0 {
        short = fmt.Sprintf("%s-%d", short, index)  // e.g., "a1b2c3d4e5f6-1"
    }

    return fmt.Sprintf("%s:%s", kind, short), short
}
```

**Auth Metadata Extraction**:

```go
func ExtractAuthMetadata(auth *coreauth.Auth) map[string]interface{} {
    meta := make(map[string]interface{})

    if auth.Attributes != nil {
        for k, v := range auth.Attributes {
            // Skip internal attributes
            if strings.HasPrefix(k, "_") {
                continue
            }
            meta[k] = v
        }
    }

    // Add computed fields
    meta["provider"] = auth.Provider
    meta["status"] = string(auth.Status)

    return meta
}
```

**ag-cl Implementation Notes**:

- Use SHA256 for stable, reproducible IDs
- Null byte separator prevents "ab" + "c" = "a" + "bc" collisions
- Counter suffix handles duplicate inputs
- 12-char hex = 48 bits = 281 trillion unique IDs before collision

---

### Token Store Registry (CLIProxyAPI)

**Source**: `sdk/auth/store_registry.go`

Global token store with thread-safe lazy initialization.

```go
var (
    storeMu         sync.RWMutex
    registeredStore coreauth.Store
)

// SetTokenStore allows overriding the global store (for testing)
func SetTokenStore(s coreauth.Store) {
    storeMu.Lock()
    registeredStore = s
    storeMu.Unlock()
}

// GetTokenStore returns the global store, creating default if needed
func GetTokenStore() coreauth.Store {
    storeMu.RLock()
    s := registeredStore
    storeMu.RUnlock()

    if s != nil {
        return s
    }

    storeMu.Lock()
    defer storeMu.Unlock()

    // Double-check after acquiring write lock
    if registeredStore == nil {
        registeredStore = NewFileTokenStore()
    }
    return registeredStore
}
```

**ag-cl Implementation Notes**:

- Use RWMutex for read-heavy access patterns
- Double-check locking prevents race conditions
- Lazy initialization saves startup time
- SetTokenStore enables test injection

---

### Refresh Lead Registry (CLIProxyAPI)

**Source**: `sdk/auth/refresh_registry.go`

Provider-specific token refresh registration via Go init().

```go
type AuthenticatorFactory func() Authenticator

var (
    refreshLeadsMu sync.RWMutex
    refreshLeads   = make(map[string]AuthenticatorFactory)
)

func registerRefreshLead(provider string, factory AuthenticatorFactory) {
    refreshLeadsMu.Lock()
    refreshLeads[provider] = factory
    refreshLeadsMu.Unlock()
}

func getRefreshLead(provider string) (Authenticator, bool) {
    refreshLeadsMu.RLock()
    factory, ok := refreshLeads[provider]
    refreshLeadsMu.RUnlock()

    if !ok {
        return nil, false
    }
    return factory(), true
}

// Auto-registration via init()
func init() {
    registerRefreshLead("codex", func() Authenticator { return NewCodexAuthenticator() })
    registerRefreshLead("claude", func() Authenticator { return NewClaudeAuthenticator() })
    registerRefreshLead("qwen", func() Authenticator { return NewQwenAuthenticator() })
    registerRefreshLead("iflow", func() Authenticator { return NewIFlowAuthenticator() })
    registerRefreshLead("gemini", func() Authenticator { return NewGeminiAuthenticator() })
    registerRefreshLead("gemini-cli", func() Authenticator { return NewGeminiAuthenticator() })
    registerRefreshLead("antigravity", func() Authenticator { return NewAntigravityAuthenticator() })
}
```

**ag-cl Implementation Notes**:

- Factory pattern allows lazy authenticator creation
- init() auto-registers all providers at import time
- Same authenticator can be registered under multiple provider names
- RWMutex for thread-safe registry access

---

### Header Helpers (CLIProxyAPI)

**Source**: `internal/util/header_helpers.go`

Custom header extraction from auth attributes.

**Convention**: Headers stored as `header:Header-Name` in auth attributes.

```go
// extractCustomHeaders pulls headers from auth attributes prefixed with "header:"
func extractCustomHeaders(attrs map[string]string) map[string]string {
    headers := make(map[string]string)
    for k, v := range attrs {
        if !strings.HasPrefix(k, "header:") {
            continue
        }
        name := strings.TrimSpace(strings.TrimPrefix(k, "header:"))
        if name == "" {
            continue
        }
        val := strings.TrimSpace(v)
        if val == "" {
            continue
        }
        headers[name] = val
    }
    return headers
}

// applyCustomHeaders adds extracted headers to an HTTP request
func applyCustomHeaders(req *http.Request, headers map[string]string) {
    for name, value := range headers {
        req.Header.Set(name, value)
    }
}
```

**Usage Example**:

```go
// In auth attributes:
attrs := map[string]string{
    "header:X-Custom-Key": "secret-value",
    "header:X-Org-ID": "org-123",
    "other-attr": "ignored",
}

// Extracted headers:
// {
//   "X-Custom-Key": "secret-value",
//   "X-Org-ID": "org-123",
// }
```

**ag-cl Implementation Notes**:

- Use consistent `header:` prefix convention
- Trim whitespace from both key and value
- Skip empty values to avoid sending blank headers
- Apply with `req.Header.Set()` (overwrites existing)

---

### Thinking Budget Utilities (CLIProxyAPI)

**Source**: `internal/util/thinking.go`

Thinking budget normalization and level-to-budget mapping.

**Budget Normalization** (clamp to model's supported range):

```go
func NormalizeThinkingBudget(model string, budget int) int {
    // Handle dynamic budget (-1)
    if budget == -1 {
        if found, minBudget, maxBudget, zeroAllowed, dynamicAllowed := thinkingRangeFromRegistry(model); found {
            if dynamicAllowed {
                return -1
            }
            // Convert dynamic to midpoint
            mid := (minBudget + maxBudget) / 2
            if mid <= 0 && zeroAllowed {
                return 0
            }
            if mid <= 0 {
                return minBudget
            }
            return mid
        }
        return -1  // Unknown model, preserve dynamic
    }

    // Clamp to model's supported range
    if found, minBudget, maxBudget, zeroAllowed, _ := thinkingRangeFromRegistry(model); found {
        if budget < minBudget {
            if budget == 0 && zeroAllowed {
                return 0
            }
            return minBudget
        }
        if budget > maxBudget {
            return maxBudget
        }
    }

    return budget
}
```

**Effort Level to Budget Mapping**:

```go
var effortBudgetMap = map[string]int{
    "none":    0,
    "auto":    -1,
    "minimal": 512,
    "low":     1024,
    "medium":  8192,
    "high":    24576,
    "xhigh":   32768,
}

func ThinkingEffortToBudget(model, effort string) (int, bool) {
    normalized := strings.ToLower(strings.TrimSpace(effort))

    budget, ok := effortBudgetMap[normalized]
    if !ok {
        return 0, false
    }

    // Normalize to model's supported range
    return NormalizeThinkingBudget(model, budget), true
}
```

**Model Thinking Support Detection**:

```go
func ModelSupportsThinking(model string) bool {
    // Check registry first
    if info := registry.GetGlobalRegistry().GetModelInfo(model); info != nil {
        return info.Thinking != nil
    }

    // Fallback to pattern matching
    lower := strings.ToLower(model)
    if strings.Contains(lower, "thinking") {
        return true
    }
    if strings.Contains(lower, "claude-sonnet-4-5") || strings.Contains(lower, "claude-opus-4-5") {
        return true
    }
    if strings.Contains(lower, "gemini-3") || strings.Contains(lower, "gemini-2.5") {
        return true
    }

    return false
}

func ModelUsesThinkingLevels(model string) bool {
    // Gemini 3 models use string levels, not numeric budgets
    return strings.Contains(strings.ToLower(model), "gemini-3")
}
```

**ag-cl Implementation Notes**:

- Use model registry for accurate range info
- Fallback to pattern matching for unknown models
- Handle dynamic budget (-1) by converting to midpoint
- Validate levels against model-specific allowed values

---

### Account Selectors (CLIProxyAPI)

**Source**: `sdk/cliproxy/auth/selector.go`

Account selection strategies with cooldown handling.

**RoundRobinSelector** (rotate through accounts):

```go
type RoundRobinSelector struct {
    mu      sync.Mutex
    cursors map[string]int  // provider:model -> cursor position
}

func (s *RoundRobinSelector) Pick(
    ctx context.Context,
    provider, model string,
    opts cliproxyexecutor.Options,
    auths []*Auth,
) (*Auth, error) {
    now := time.Now()

    // Filter to available (not blocked/disabled) accounts
    available, err := getAvailableAuths(auths, provider, model, now)
    if err != nil {
        return nil, err
    }

    // Scoped cursor per provider:model
    key := provider + ":" + model

    s.mu.Lock()
    if s.cursors == nil {
        s.cursors = make(map[string]int)
    }
    index := s.cursors[key]
    s.cursors[key] = index + 1
    s.mu.Unlock()

    return available[index%len(available)], nil
}
```

**FillFirstSelector** (use first available, deterministic):

```go
type FillFirstSelector struct{}

func (s *FillFirstSelector) Pick(
    ctx context.Context,
    provider, model string,
    opts cliproxyexecutor.Options,
    auths []*Auth,
) (*Auth, error) {
    now := time.Now()

    available, err := getAvailableAuths(auths, provider, model, now)
    if err != nil {
        return nil, err
    }

    // Sort by ID for deterministic ordering
    sort.Slice(available, func(i, j int) bool {
        return available[i].ID < available[j].ID
    })

    // Return first available (stable)
    return available[0], nil
}
```

**Block Detection** (check if account is usable):

```go
type blockReason int

const (
    blockReasonNone blockReason = iota
    blockReasonDisabled
    blockReasonCooldown
)

func isAuthBlockedForModel(auth *Auth, model string, now time.Time) (bool, blockReason, time.Time) {
    // Check if globally disabled
    if auth.Disabled || auth.Status == StatusDisabled {
        return true, blockReasonDisabled, time.Time{}
    }

    // Check model-specific cooldown
    if model != "" {
        if state, ok := auth.ModelStates[model]; ok && state != nil {
            if state.Unavailable && state.NextRetryAfter.After(now) {
                return true, blockReasonCooldown, state.NextRetryAfter
            }
        }
    }

    return false, blockReasonNone, time.Time{}
}
```

**Model Cooldown Error Response**:

```go
func buildModelCooldownError(auth *Auth, model string, retryAfter time.Time) error {
    retryAfterSec := int(time.Until(retryAfter).Seconds())
    if retryAfterSec < 0 {
        retryAfterSec = 0
    }

    return &ModelCooldownError{
        StatusCode:    429,
        Model:         model,
        AccountID:     auth.ID,
        RetryAfterSec: retryAfterSec,
        Message: fmt.Sprintf(
            "Model %s is in cooldown for account %s, retry after %d seconds",
            model, auth.ID, retryAfterSec,
        ),
    }
}

type ModelCooldownError struct {
    StatusCode    int
    Model         string
    AccountID     string
    RetryAfterSec int
    Message       string
}

func (e *ModelCooldownError) Error() string {
    return e.Message
}
```

**ag-cl Implementation Notes**:

- Use RoundRobin for load distribution
- Use FillFirst for deterministic behavior (testing, debugging)
- Scope cursors by provider:model to avoid cross-contamination
- Track model-specific cooldowns, not just account-level
- Return structured errors with Retry-After info

---

### Session Recovery Storage (opencode-antigravity-auth)

**Source**: `src/plugin/recovery/storage.ts`

Session storage utilities for OpenCode integration.

**Message Reading**:

```typescript
export function readMessages(sessionID: string): StoredMessageMeta[] {
  const messageDir = getMessageDir(sessionID);
  if (!messageDir || !existsSync(messageDir)) {
    return [];
  }

  const messages: StoredMessageMeta[] = [];
  for (const file of readdirSync(messageDir)) {
    if (!file.endsWith(".json")) continue;

    const filePath = join(messageDir, file);
    const content = readFileSync(filePath, "utf-8");
    try {
      messages.push(JSON.parse(content));
    } catch {
      // Skip malformed JSON
    }
  }

  // Sort by creation time
  return messages.sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0));
}
```

**Part Reading** (message content blocks):

```typescript
export function readParts(sessionID: string, messageID: string): StoredPart[] {
  const partDir = getPartDir(sessionID, messageID);
  if (!partDir || !existsSync(partDir)) {
    return [];
  }

  const parts: StoredPart[] = [];
  for (const file of readdirSync(partDir)) {
    if (!file.endsWith(".json")) continue;

    const content = readFileSync(join(partDir, file), "utf-8");
    try {
      parts.push(JSON.parse(content));
    } catch {
      // Skip malformed
    }
  }

  // Sort by part ID (prt_0000000000_*)
  return parts.sort((a, b) => a.id.localeCompare(b.id));
}
```

**Thinking Block Recovery** (prepend synthetic thinking part):

```typescript
export function prependThinkingPart(sessionID: string, messageID: string): boolean {
  const partDir = getPartDir(sessionID, messageID);
  if (!partDir) return false;

  if (!existsSync(partDir)) {
    mkdirSync(partDir, { recursive: true });
  }

  // Generate thinking part ID (sorts before other parts)
  const partId = "prt_0000000000_thinking";

  const part: StoredPart = {
    id: partId,
    sessionID,
    messageID,
    type: "thinking",
    thinking: "", // Empty thinking block
    synthetic: true, // Mark as recovered
  };

  const partPath = join(partDir, `${partId}.json`);
  writeFileSync(partPath, JSON.stringify(part, null, 2));

  return true;
}
```

**Empty Message Detection**:

```typescript
export function isEmptyMessage(message: StoredMessageMeta, parts: StoredPart[]): boolean {
  // Check if message has no meaningful content
  if (parts.length === 0) {
    return true;
  }

  // Check if all parts are empty
  const hasContent = parts.some((part) => {
    if (part.type === "text" && part.text?.trim()) return true;
    if (part.type === "thinking" && part.thinking?.trim()) return true;
    if (part.type === "tool_use") return true;
    if (part.type === "tool_result") return true;
    return false;
  });

  return !hasContent;
}
```

**Recovery Flow Integration**:

```typescript
export async function recoverSession(sessionID: string): Promise<RecoveryResult> {
  const messages = readMessages(sessionID);
  const results: RecoveryAction[] = [];

  for (const message of messages) {
    const parts = readParts(sessionID, message.id);

    // Check for thinking block issues
    if (message.role === "assistant" && needsThinkingRecovery(message, parts)) {
      const success = prependThinkingPart(sessionID, message.id);
      results.push({
        messageID: message.id,
        action: "prepend_thinking",
        success,
      });
    }

    // Check for empty messages
    if (isEmptyMessage(message, parts)) {
      results.push({
        messageID: message.id,
        action: "empty_message_detected",
        success: true,
      });
    }
  }

  return { sessionID, actions: results };
}
```

---

### Signature Store Factory (opencode-antigravity-auth)

**Source**: `src/plugin/stores/signature-store.ts`

Factory functions for signature and thought buffer stores.

```typescript
export interface SignedThinking {
  text: string;
  signature: string;
}

export interface SignatureStore {
  get(key: string): SignedThinking | undefined;
  set(key: string, value: SignedThinking): void;
  has(key: string): boolean;
  delete(key: string): void;
}

export interface ThoughtBuffer {
  get(index: number): string | undefined;
  set(index: number, text: string): void;
  clear(): void;
}

export function createSignatureStore(): SignatureStore {
  const store = new Map<string, SignedThinking>();
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: SignedThinking) => {
      store.set(key, value);
    },
    has: (key: string) => store.has(key),
    delete: (key: string) => {
      store.delete(key);
    },
  };
}

export function createThoughtBuffer(): ThoughtBuffer {
  const buffer = new Map<number, string>();
  return {
    get: (index: number) => buffer.get(index),
    set: (index: number, text: string) => {
      buffer.set(index, text);
    },
    clear: () => buffer.clear(),
  };
}
```

**Usage in Streaming**:

```typescript
// During SSE stream processing
const signatureStore = createSignatureStore();
const thoughtBuffer = createThoughtBuffer();

function processStreamChunk(chunk: any) {
  const candidates = chunk.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // Accumulate thinking text
      if (part.thought === true && part.text) {
        const current = thoughtBuffer.get(i) ?? "";
        thoughtBuffer.set(i, current + part.text);
      }

      // Cache signature when received
      if (part.thoughtSignature) {
        const fullText = thoughtBuffer.get(i) ?? "";
        if (fullText) {
          signatureStore.set(sessionKey, {
            text: fullText,
            signature: part.thoughtSignature,
          });
        }
      }
    }
  }
}
```

---

### Gemini Thinking Config Utilities (CLIProxyAPI)

**Source**: `internal/util/gemini_thinking.go`

Comprehensive Gemini thinking configuration for both Gemini 3 and 2.5.

**Model Pattern Detection**:

```go
var (
    gemini3Pattern      = regexp.MustCompile(`(?i)^gemini[_-]?3[_-]`)
    gemini3ProPattern   = regexp.MustCompile(`(?i)^gemini[_-]?3[_-]pro`)
    gemini3FlashPattern = regexp.MustCompile(`(?i)^gemini[_-]?3[_-]flash`)
    gemini25Pattern     = regexp.MustCompile(`(?i)^gemini[_-]?2\.5[_-]`)
)

func IsGemini3Model(model string) bool {
    return gemini3Pattern.MatchString(model)
}

func IsGemini3ProModel(model string) bool {
    return gemini3ProPattern.MatchString(model)
}

func IsGemini3FlashModel(model string) bool {
    return gemini3FlashPattern.MatchString(model)
}

func IsGemini25Model(model string) bool {
    return gemini25Pattern.MatchString(model)
}
```

**Gemini 3 Thinking Levels**:

```go
// Pro only supports low, high
var Gemini3ProThinkingLevels = []string{"low", "high"}

// Flash supports minimal, low, medium, high
var Gemini3FlashThinkingLevels = []string{"minimal", "low", "medium", "high"}

func GetGemini3ThinkingLevels(model string) []string {
    if IsGemini3ProModel(model) {
        return Gemini3ProThinkingLevels
    }
    if IsGemini3FlashModel(model) {
        return Gemini3FlashThinkingLevels
    }
    return nil
}
```

**Budget to Gemini 3 Level Conversion**:

```go
func ThinkingBudgetToGemini3Level(model string, budget int) (string, bool) {
    if !IsGemini3Model(model) {
        return "", false
    }

    isFlash := IsGemini3FlashModel(model)

    switch {
    case budget == -1:  // Dynamic
        return "high", true

    case budget == 0:
        if isFlash {
            return "minimal", true
        }
        return "low", true

    case budget <= 512:
        if isFlash {
            return "minimal", true
        }
        return "low", true

    case budget <= 1024:
        return "low", true

    case budget <= 8192:
        if isFlash {
            return "medium", true
        }
        return "low", true  // Pro doesn't have medium

    default:
        return "high", true
    }
}
```

**Gemini 3 Level to Budget Conversion**:

```go
func Gemini3LevelToThinkingBudget(model, level string) (int, bool) {
    if !IsGemini3Model(model) {
        return 0, false
    }

    normalized := strings.ToLower(strings.TrimSpace(level))
    isFlash := IsGemini3FlashModel(model)

    switch normalized {
    case "minimal":
        if !isFlash {
            return 0, false  // Pro doesn't support minimal
        }
        return 512, true

    case "low":
        return 1024, true

    case "medium":
        if !isFlash {
            return 0, false  // Pro doesn't support medium
        }
        return 8192, true

    case "high":
        return 24576, true

    default:
        return 0, false
    }
}
```

**Reasoning Effort Mappings**:

```go
var ReasoningEffortBudgetMapping = map[string]int{
    "none":    0,
    "auto":    -1,     // Dynamic
    "minimal": 512,
    "low":     1024,
    "medium":  8192,
    "high":    24576,
    "xhigh":   32768,
}

var ReasoningEffortLevelMapping = map[string]string{
    "none":    "minimal",
    "auto":    "high",
    "minimal": "minimal",
    "low":     "low",
    "medium":  "medium",
    "high":    "high",
    "xhigh":   "high",
}
```

**Apply Thinking Config to Payload**:

```go
func ApplyGeminiThinkingConfig(payload []byte, budget *int, includeThoughts *bool) []byte {
    model := gjson.GetBytes(payload, "model").String()

    if IsGemini3Model(model) {
        // Gemini 3: Use thinkingLevel (string)
        if budget != nil {
            level, ok := ThinkingBudgetToGemini3Level(model, *budget)
            if ok {
                payload, _ = sjson.SetBytes(payload, "generationConfig.thinkingConfig.thinkingLevel", level)
            }
        }
        if includeThoughts != nil {
            payload, _ = sjson.SetBytes(payload, "generationConfig.thinkingConfig.includeThoughts", *includeThoughts)
        }
    } else if IsGemini25Model(model) {
        // Gemini 2.5: Use thinkingBudget (number)
        if budget != nil && *budget > 0 {
            payload, _ = sjson.SetBytes(payload, "generationConfig.thinkingConfig.thinkingBudget", *budget)
        }
        if includeThoughts != nil {
            payload, _ = sjson.SetBytes(payload, "generationConfig.thinkingConfig.includeThoughts", *includeThoughts)
        }
    }

    return payload
}
```

**Gemini 3 vs 2.5 Comparison**:

| Feature         | Gemini 3                   | Gemini 2.5       |
| --------------- | -------------------------- | ---------------- |
| Config field    | `thinkingLevel`            | `thinkingBudget` |
| Value type      | string                     | integer          |
| Pro levels      | low, high                  | 1024-32768       |
| Flash levels    | minimal, low, medium, high | 512-24576        |
| Dynamic support | "high"                     | -1               |

---

### 4.29 Rate Limit Backoff with Time-Window Deduplication

**Source**: `opencode-antigravity-auth/src/plugin.ts:498-566`

Sophisticated rate limit handling that prevents concurrent requests from causing incorrect exponential backoff.

**The Problem**: When multiple subagents hit 429 simultaneously, each would increment the consecutive counter, causing incorrect backoff (5 concurrent 429s = 2^5 instead of 2^1).

**The Solution**: Track per account+quota with deduplication window.

```typescript
const RATE_LIMIT_DEDUP_WINDOW_MS = 2000; // Concurrent requests within 2s are deduplicated
const RATE_LIMIT_STATE_RESET_MS = 120_000; // Reset after 2 minutes of no 429s

interface RateLimitState {
  consecutive429: number;
  lastAt: number;
  quotaKey: string;
}

// Key format: `${accountIndex}:${quotaKey}` for per-account-per-quota tracking
const rateLimitStateByAccountQuota = new Map<string, RateLimitState>();

function getRateLimitBackoff(accountIndex: number, quotaKey: string, serverRetryAfterMs: number | null): { attempt: number; delayMs: number; isDuplicate: boolean } {
  const now = Date.now();
  const stateKey = `${accountIndex}:${quotaKey}`;
  const previous = rateLimitStateByAccountQuota.get(stateKey);

  // Check if duplicate 429 within dedup window
  if (previous && now - previous.lastAt < RATE_LIMIT_DEDUP_WINDOW_MS) {
    const baseDelay = serverRetryAfterMs ?? 1000;
    const backoffDelay = Math.min(baseDelay * Math.pow(2, previous.consecutive429 - 1), 60_000);
    return {
      attempt: previous.consecutive429,
      delayMs: Math.max(baseDelay, backoffDelay),
      isDuplicate: true,
    };
  }

  // Reset if no 429 for 2 minutes, otherwise increment
  const attempt = previous && now - previous.lastAt < RATE_LIMIT_STATE_RESET_MS ? previous.consecutive429 + 1 : 1;

  rateLimitStateByAccountQuota.set(stateKey, {
    consecutive429: attempt,
    lastAt: now,
    quotaKey,
  });

  const baseDelay = serverRetryAfterMs ?? 1000;
  const backoffDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), 60_000);
  return { attempt, delayMs: Math.max(baseDelay, backoffDelay), isDuplicate: false };
}
```

**Key Design Decisions**:

| Aspect          | Implementation                                   |
| --------------- | ------------------------------------------------ |
| State key       | `accountIndex:quotaKey` for per-quota tracking   |
| Dedup window    | 2 seconds (concurrent requests treated as one)   |
| Reset threshold | 2 minutes without 429 resets counter             |
| Backoff formula | `baseDelay * 2^(attempt-1)`, max 60s             |
| Server respect  | Uses server `retry-after` as base when available |

---

### 4.30 Capacity Exhausted Tiered Backoff

**Source**: `opencode-antigravity-auth/src/plugin.ts:54-59, 1243-1257`

Special handling for "MODEL_CAPACITY_EXHAUSTED" errors with progressive delays.

```typescript
const CAPACITY_BACKOFF_TIERS_MS = [5000, 10000, 20000, 30000, 60000];

function getCapacityBackoffDelay(consecutiveFailures: number): number {
  const index = Math.min(consecutiveFailures, CAPACITY_BACKOFF_TIERS_MS.length - 1);
  return CAPACITY_BACKOFF_TIERS_MS[Math.max(0, index)] ?? 5000;
}

// In request handler:
if (isCapacityExhausted) {
  const failures = account.consecutiveFailures ?? 0;
  const capacityBackoffMs = getCapacityBackoffDelay(failures);
  account.consecutiveFailures = failures + 1;

  await showToast(`⏳ Server at capacity. Waiting ${backoffFormatted}... (attempt ${failures + 1})`, "warning");
  await sleep(capacityBackoffMs, abortSignal);
  continue; // Retry same account
}
```

**Backoff Progression**:

| Attempt | Delay |
| ------- | ----- |
| 1       | 5s    |
| 2       | 10s   |
| 3       | 20s   |
| 4       | 30s   |
| 5+      | 60s   |

**Detection Pattern**:

```typescript
const isCapacityExhausted = bodyInfo.reason === "MODEL_CAPACITY_EXHAUSTED" || (typeof bodyInfo.message === "string" && bodyInfo.message.toLowerCase().includes("no capacity"));
```

---

### 4.31 Proactive Token Refresh Queue

**Source**: `opencode-antigravity-auth/src/plugin/refresh-queue.ts`

Background token refresh to ensure OAuth tokens remain valid without blocking requests.

```typescript
export interface ProactiveRefreshConfig {
  enabled: boolean;
  bufferSeconds: number; // Default: 1800 (30 minutes before expiry)
  checkIntervalSeconds: number; // Default: 300 (5 minutes between checks)
}

interface RefreshQueueState {
  isRunning: boolean;
  intervalHandle: ReturnType<typeof setInterval> | null;
  isRefreshing: boolean; // Prevents concurrent refresh operations
  lastCheckTime: number;
  lastRefreshTime: number;
  refreshCount: number;
  errorCount: number;
}

export class ProactiveRefreshQueue {
  needsRefresh(account: ManagedAccount): boolean {
    if (!account.expires) return false;
    const now = Date.now();
    const bufferMs = this.config.bufferSeconds * 1000;
    const refreshThreshold = now + bufferMs;
    return account.expires <= refreshThreshold;
  }

  private async runRefreshCheck(): Promise<void> {
    if (this.state.isRefreshing) return; // Skip if already refreshing
    if (!this.accountManager) return;

    this.state.isRefreshing = true;
    this.state.lastCheckTime = Date.now();

    try {
      const accountsToRefresh = this.getAccountsNeedingRefresh();

      // Refresh accounts serially to avoid concurrent refresh storms
      for (const account of accountsToRefresh) {
        if (!this.state.isRunning) break; // Queue was stopped

        try {
          const auth = this.accountManager.toAuthDetails(account);
          const refreshed = await this.refreshToken(auth, account);

          if (refreshed) {
            this.accountManager.updateFromAuth(account, refreshed);
            this.state.refreshCount++;
            await this.accountManager.saveToDisk();
          }
        } catch (error) {
          this.state.errorCount++;
          log.warn("Failed to refresh account", { accountIndex: account.index });
        }
      }
    } finally {
      this.state.isRefreshing = false;
    }
  }

  start(): void {
    if (this.state.isRunning || !this.config.enabled) return;

    this.state.isRunning = true;
    const intervalMs = this.config.checkIntervalSeconds * 1000;

    // Initial check after 5 seconds (let things settle)
    setTimeout(() => {
      if (this.state.isRunning) this.runRefreshCheck();
    }, 5000);

    // Periodic checks
    this.state.intervalHandle = setInterval(() => {
      this.runRefreshCheck();
    }, intervalMs);
  }
}
```

**Key Design Features**:

| Feature             | Purpose                                  |
| ------------------- | ---------------------------------------- |
| Serial refresh      | Prevents refresh storms                  |
| isRefreshing guard  | Skips overlapping checks                 |
| 5s initial delay    | Lets initialization settle               |
| Non-blocking errors | Continues with other accounts on failure |
| Statistics tracking | refreshCount, errorCount for debugging   |

---

### 4.32 Auth Cache with Signature Persistence

**Source**: `opencode-antigravity-auth/src/plugin/cache.ts`

Two-tier caching: OAuth tokens and thinking signatures with memory + disk persistence.

**OAuth Token Cache**:

```typescript
const authCache = new Map<string, OAuthAuthDetails>();

function normalizeRefreshKey(refresh?: string): string | undefined {
  const key = refresh?.trim();
  return key ? key : undefined;
}

export function resolveCachedAuth(auth: OAuthAuthDetails): OAuthAuthDetails {
  const key = normalizeRefreshKey(auth.refresh);
  if (!key) return auth;

  const cached = authCache.get(key);
  if (!cached) {
    authCache.set(key, auth);
    return auth;
  }

  // Prefer unexpired tokens
  if (!accessTokenExpired(auth)) {
    authCache.set(key, auth);
    return auth;
  }
  if (!accessTokenExpired(cached)) {
    return cached;
  }

  authCache.set(key, auth);
  return auth;
}
```

**Signature Cache with TTL and LRU**:

```typescript
const SIGNATURE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES_PER_SESSION = 100;
const SIGNATURE_TEXT_HASH_HEX_LEN = 16; // 64-bit key space

// Map: sessionId -> Map<textHash, SignatureEntry>
const signatureCache = new Map<string, Map<string, SignatureEntry>>();
let diskCache: SignatureCache | null = null;

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, SIGNATURE_TEXT_HASH_HEX_LEN);
}

export function cacheSignature(sessionId: string, text: string, signature: string): void {
  if (!sessionId || !text || !signature) return;

  const textHash = hashText(text);

  // Write to memory cache
  let sessionMemCache = signatureCache.get(sessionId);
  if (!sessionMemCache) {
    sessionMemCache = new Map();
    signatureCache.set(sessionId, sessionMemCache);
  }

  // Evict old entries if at capacity (LRU-style)
  if (sessionMemCache.size >= MAX_ENTRIES_PER_SESSION) {
    const now = Date.now();
    // First: evict expired entries
    for (const [key, entry] of sessionMemCache.entries()) {
      if (now - entry.timestamp > SIGNATURE_CACHE_TTL_MS) {
        sessionMemCache.delete(key);
      }
    }
    // If still at capacity: remove oldest 25%
    if (sessionMemCache.size >= MAX_ENTRIES_PER_SESSION) {
      const entries = Array.from(sessionMemCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(MAX_ENTRIES_PER_SESSION / 4));
      for (const [key] of toRemove) {
        sessionMemCache.delete(key);
      }
    }
  }

  sessionMemCache.set(textHash, { signature, timestamp: Date.now() });

  // Write to disk cache if enabled
  if (diskCache) {
    const diskKey = `${sessionId}:${textHash}`;
    diskCache.store(diskKey, signature);
  }
}

export function getCachedSignature(sessionId: string, text: string): string | undefined {
  const textHash = hashText(text);

  // Check memory first
  const sessionMemCache = signatureCache.get(sessionId);
  if (sessionMemCache) {
    const entry = sessionMemCache.get(textHash);
    if (entry) {
      if (Date.now() - entry.timestamp > SIGNATURE_CACHE_TTL_MS) {
        sessionMemCache.delete(textHash);
      } else {
        return entry.signature;
      }
    }
  }

  // Fall back to disk cache (with promotion to memory)
  if (diskCache) {
    const diskKey = `${sessionId}:${textHash}`;
    const diskValue = diskCache.retrieve(diskKey);
    if (diskValue) {
      // Promote to memory for faster subsequent access
      let memCache = signatureCache.get(sessionId);
      if (!memCache) {
        memCache = new Map();
        signatureCache.set(sessionId, memCache);
      }
      memCache.set(textHash, { signature: diskValue, timestamp: Date.now() });
      return diskValue;
    }
  }

  return undefined;
}
```

**Cache Architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                    Memory Cache                          │
│  sessionId → Map<textHash, {signature, timestamp}>      │
│  - Max 100 entries per session                          │
│  - 1 hour TTL                                           │
│  - LRU eviction (oldest 25%)                            │
├─────────────────────────────────────────────────────────┤
│                    Disk Cache                            │
│  key: `${sessionId}:${textHash}`                        │
│  - Survives restarts                                    │
│  - Read promotion to memory                             │
│  - Natural TTL expiration                               │
└─────────────────────────────────────────────────────────┘
```

---

### 4.33 Account Failure Tracking with Cooldown

**Source**: `opencode-antigravity-auth/src/plugin.ts:594-619`

Prevents infinite retry loops by tracking non-429 failures per account.

```typescript
const accountFailureState = new Map<
  number,
  {
    consecutiveFailures: number;
    lastFailureAt: number;
  }
>();

const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_COOLDOWN_MS = 30_000; // 30 seconds cooldown after max failures
const FAILURE_STATE_RESET_MS = 120_000; // Reset after 2 minutes of no failures

function trackAccountFailure(accountIndex: number): {
  failures: number;
  shouldCooldown: boolean;
  cooldownMs: number;
} {
  const now = Date.now();
  const previous = accountFailureState.get(accountIndex);

  // Reset if last failure was more than 2 minutes ago
  const failures = previous && now - previous.lastFailureAt < FAILURE_STATE_RESET_MS ? previous.consecutiveFailures + 1 : 1;

  accountFailureState.set(accountIndex, {
    consecutiveFailures: failures,
    lastFailureAt: now,
  });

  const shouldCooldown = failures >= MAX_CONSECUTIVE_FAILURES;
  const cooldownMs = shouldCooldown ? FAILURE_COOLDOWN_MS : 0;

  return { failures, shouldCooldown, cooldownMs };
}

function resetAccountFailureState(accountIndex: number): void {
  accountFailureState.delete(accountIndex);
}
```

**Usage Pattern**:

```typescript
// After token refresh failure
const { failures, shouldCooldown, cooldownMs } = trackAccountFailure(account.index);
if (shouldCooldown) {
  accountManager.markAccountCoolingDown(account, cooldownMs, "auth-failure");
  accountManager.markRateLimited(account, cooldownMs, family, "antigravity", model);
}

// After successful operation
resetAccountFailureState(account.index);
```

**Failure Tracking Matrix**:

| Error Type            | Action                     |
| --------------------- | -------------------------- |
| Token refresh failed  | Track + potential cooldown |
| invalid_grant         | Remove account from pool   |
| Project context error | Track + potential cooldown |
| Network error         | Track + potential cooldown |
| Success (any)         | Reset failure state        |

---

### 4.34 Quota Fallback Strategy

**Source**: `opencode-antigravity-auth/src/plugin.ts:1134-1155, 1284-1310`

Automatic fallback between Antigravity and Gemini CLI quotas for Gemini models.

```typescript
// Check if header style is rate-limited for this account
if (accountManager.isRateLimitedForHeaderStyle(account, family, headerStyle, model)) {
  // Quota fallback: try alternate quota on same account (if enabled and not explicit)
  if (config.quota_fallback && !explicitQuota && family === "gemini") {
    const alternateStyle = accountManager.getAvailableHeaderStyle(account, family, model);
    if (alternateStyle && alternateStyle !== headerStyle) {
      const quotaName = headerStyle === "gemini-cli" ? "Gemini CLI" : "Antigravity";
      const altQuotaName = alternateStyle === "gemini-cli" ? "Gemini CLI" : "Antigravity";
      if (!quietMode) {
        await showToast(`${quotaName} quota exhausted, using ${altQuotaName} quota`, "warning");
      }
      headerStyle = alternateStyle;
    } else {
      shouldSwitchAccount = true;
    }
  } else {
    shouldSwitchAccount = true;
  }
}

// Prioritized Antigravity across ALL accounts first
if (family === "gemini") {
  if (headerStyle === "antigravity") {
    // Check if any other account has Antigravity quota
    if (hasOtherAccountWithAntigravity(account)) {
      await showToast(`Rate limited again. Switching account in 5s...`, "warning");
      await sleep(SWITCH_ACCOUNT_DELAY_MS, abortSignal);
      shouldSwitchAccount = true;
      break;
    }

    // All accounts exhausted for Antigravity - fall back to gemini-cli
    if (config.quota_fallback && !explicitQuota) {
      const alternateStyle = accountManager.getAvailableHeaderStyle(account, family, model);
      if (alternateStyle && alternateStyle !== headerStyle) {
        await showToast(`Antigravity quota exhausted for ${model}. Switching to Gemini CLI quota...`, "warning");
        headerStyle = alternateStyle;
        continue;
      }
    }
  }
}
```

**Fallback Priority Order**:

```
1. Same account, same quota (retry)
       ↓ (rate limited)
2. Same account, alternate quota (if quota_fallback enabled)
       ↓ (also rate limited)
3. Other accounts, Antigravity quota first
       ↓ (all antigravity exhausted)
4. Other accounts, Gemini CLI quota
       ↓ (all exhausted)
5. Wait for quota reset
```

**Quota Key Mapping**:

```typescript
function headerStyleToQuotaKey(headerStyle: HeaderStyle, family: ModelFamily): string {
  if (family === "claude") return "claude";
  return headerStyle === "antigravity" ? "gemini-antigravity" : "gemini-cli";
}
```

---

### 4.35 Empty Response Retry Logic

**Source**: `opencode-antigravity-auth/src/plugin.ts:1422-1462`

Automatic retry when API returns empty responses (common with large thinking budgets).

```typescript
// Track empty response retry attempts per request
const emptyResponseAttempts = new Map<string, number>();

if (response.ok && !prepared.streaming) {
  const maxAttempts = config.empty_response_max_attempts ?? 4;
  const retryDelayMs = config.empty_response_retry_delay_ms ?? 2000;

  const clonedForCheck = response.clone();
  const bodyText = await clonedForCheck.text();

  if (isEmptyResponseBody(bodyText)) {
    const emptyAttemptKey = `${prepared.sessionId ?? "none"}:${prepared.effectiveModel ?? "unknown"}`;
    const currentAttempts = (emptyResponseAttempts.get(emptyAttemptKey) ?? 0) + 1;
    emptyResponseAttempts.set(emptyAttemptKey, currentAttempts);

    if (currentAttempts < maxAttempts) {
      await showToast(`Empty response received. Retrying (${currentAttempts}/${maxAttempts})...`, "warning");
      await sleep(retryDelayMs, abortSignal);
      continue; // Retry the endpoint loop
    }

    // Clean up and throw after max attempts
    emptyResponseAttempts.delete(emptyAttemptKey);
    throw new EmptyResponseError("antigravity", prepared.effectiveModel ?? "unknown", currentAttempts);
  }

  // Clean up successful attempt tracking
  emptyResponseAttempts.delete(emptyAttemptKey);
}
```

**Custom Error Type**:

```typescript
export class EmptyResponseError extends Error {
  readonly provider: string;
  readonly model: string;
  readonly attempts: number;

  constructor(provider: string, model: string, attempts: number, message?: string) {
    super(message ?? `The model returned an empty response after ${attempts} attempts.`);
    this.name = "EmptyResponseError";
    this.provider = provider;
    this.model = model;
    this.attempts = attempts;
  }
}
```

---

### 4.36 WSL Detection for OAuth Flow

**Source**: `opencode-antigravity-auth/src/plugin.ts:100-137`

Environment detection to choose appropriate OAuth callback mechanism.

```typescript
function isWSL(): boolean {
  if (process.platform !== "linux") return false;
  try {
    const { readFileSync } = require("node:fs");
    const release = readFileSync("/proc/version", "utf8").toLowerCase();
    return release.includes("microsoft") || release.includes("wsl");
  } catch {
    return false;
  }
}

function isWSL2(): boolean {
  if (!isWSL()) return false;
  try {
    const { readFileSync } = require("node:fs");
    const version = readFileSync("/proc/version", "utf8").toLowerCase();
    return version.includes("wsl2") || version.includes("microsoft-standard");
  } catch {
    return false;
  }
}

function isRemoteEnvironment(): boolean {
  // SSH connection
  if (process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION) {
    return true;
  }
  // Container environments
  if (process.env.REMOTE_CONTAINERS || process.env.CODESPACES) {
    return true;
  }
  // Linux without display (not WSL)
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY && !isWSL()) {
    return true;
  }
  return false;
}

function shouldSkipLocalServer(): boolean {
  return isWSL2() || isRemoteEnvironment();
}
```

**OAuth Flow Selection**:

| Environment     | Local Server | Browser Open | Fallback          |
| --------------- | ------------ | ------------ | ----------------- |
| macOS/Windows   | ✓            | ✓            | Manual paste      |
| Linux (display) | ✓            | xdg-open     | Manual paste      |
| WSL1            | ✓            | wslview      | Manual paste      |
| WSL2            | ✗            | wslview      | Manual paste only |
| SSH             | ✗            | ✗            | Manual paste only |
| Codespaces      | ✗            | ✗            | Manual paste only |

---

### 4.37 Thinking Warmup Requests

**Source**: `opencode-antigravity-auth/src/plugin.ts:1057-1120`

Pre-flight requests to establish thinking session before main request.

```typescript
const runThinkingWarmup = async (prepared: ReturnType<typeof prepareAntigravityRequest>, projectId: string): Promise<void> => {
  if (!prepared.needsSignedThinkingWarmup || !prepared.sessionId) {
    return;
  }

  // Track attempts to prevent infinite warmup retries
  if (!trackWarmupAttempt(prepared.sessionId)) {
    return;
  }

  const warmupBody = buildThinkingWarmupBody(typeof prepared.init.body === "string" ? prepared.init.body : undefined, Boolean(prepared.effectiveModel?.toLowerCase().includes("claude") && prepared.effectiveModel?.toLowerCase().includes("thinking")));
  if (!warmupBody) {
    return;
  }

  // Force streaming for warmup to get signature back
  const warmupUrl = toWarmupStreamUrl(prepared.request);
  const warmupHeaders = new Headers(prepared.init.headers ?? {});
  warmupHeaders.set("accept", "text/event-stream");

  const warmupInit: RequestInit = {
    ...prepared.init,
    method: prepared.init.method ?? "POST",
    headers: warmupHeaders,
    body: warmupBody,
  };

  try {
    const warmupResponse = await fetch(warmupUrl, warmupInit);
    const transformed = await transformAntigravityResponse(
      warmupResponse,
      true, // streaming
      warmupDebugContext,
      prepared.requestedModel,
      projectId,
      warmupUrl,
      prepared.effectiveModel,
      prepared.sessionId,
    );
    await transformed.text(); // Consume response to cache signature
    markWarmupSuccess(prepared.sessionId);
  } catch (error) {
    clearWarmupAttempt(prepared.sessionId);
    // Warmup failure is non-fatal - main request may still work
  }
};
```

**Warmup Session Tracking**:

```typescript
const MAX_WARMUP_SESSIONS = 1000;
const MAX_WARMUP_RETRIES = 2;
const warmupAttemptedSessionIds = new Set<string>();
const warmupSucceededSessionIds = new Set<string>();

function trackWarmupAttempt(sessionId: string): boolean {
  // Skip if already succeeded
  if (warmupSucceededSessionIds.has(sessionId)) return false;

  // LRU eviction at capacity
  if (warmupAttemptedSessionIds.size >= MAX_WARMUP_SESSIONS) {
    const first = warmupAttemptedSessionIds.values().next().value;
    if (first) {
      warmupAttemptedSessionIds.delete(first);
      warmupSucceededSessionIds.delete(first);
    }
  }

  // Check retry limit
  const attempts = getWarmupAttemptCount(sessionId);
  if (attempts >= MAX_WARMUP_RETRIES) return false;

  warmupAttemptedSessionIds.add(sessionId);
  return true;
}
```

---

### 4.38 Response Translator State Machine (Antigravity→Claude)

**Source**: `CLIProxyAPI/internal/translator/antigravity/claude/antigravity_claude_response.go`

Sophisticated streaming response format conversion implementing a state machine that translates backend responses into Claude Code-compatible SSE format.

**State Machine Architecture**:

```go
// Params tracks conversion state across streaming chunks
type Params struct {
    HasFirstResponse     bool   // Has message_start been sent?
    ResponseType         int    // 0=none, 1=content, 2=thinking, 3=function
    ResponseIndex        int    // Content block index counter
    HasFinishReason      bool   // Finish reason observed?
    FinishReason         string
    HasUsageMetadata     bool
    PromptTokenCount     int64
    CandidatesTokenCount int64
    ThoughtsTokenCount   int64
    TotalTokenCount      int64
    CachedTokenCount     int64  // Indicates prompt caching is working
    HasSentFinalEvents   bool
    HasToolUse           bool
    HasContent           bool   // Tracks if ANY content was output

    // Signature caching support
    SessionID           string
    CurrentThinkingText strings.Builder
}
```

**SSE Event Generation**:

```go
func ConvertAntigravityResponseToClaude(ctx context.Context, modelName string,
    originalRequestRawJSON, requestRawJSON, rawJSON []byte, param *any) []string {

    // Initialize params on first call
    if *param == nil {
        *param = &Params{
            HasFirstResponse: false,
            ResponseType:     0,
            ResponseIndex:    0,
            SessionID:        deriveSessionID(originalRequestRawJSON),
        }
    }
    params := (*param).(*Params)

    // Handle [DONE] marker
    if bytes.Equal(rawJSON, []byte("[DONE]")) {
        if params.HasContent {
            appendFinalEvents(params, &output, true)
            return []string{
                output + "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n\n",
            }
        }
        return []string{}
    }

    // First response: emit message_start
    if !params.HasFirstResponse {
        output = "event: message_start\n"
        messageStartTemplate := `{"type": "message_start", "message": {...}}`
        // Inject usage metadata and model version
        output = output + fmt.Sprintf("data: %s\n\n\n", messageStartTemplate)
        params.HasFirstResponse = true
    }

    // Process parts array
    partsResult := gjson.GetBytes(rawJSON, "response.candidates.0.content.parts")
    // ...
}
```

**State Transitions**:

```
                    ┌──────────────────────────────────────┐
                    │            State Machine             │
                    │                                      │
   ┌────────────────▼────────────────┐                     │
   │      ResponseType = 0           │                     │
   │        (Initial)                │                     │
   └────────────────┬────────────────┘                     │
                    │                                      │
        ┌───────────┼───────────┐                         │
        ▼           ▼           ▼                         │
   ┌────────┐  ┌────────┐  ┌────────┐                     │
   │Type=1  │  │Type=2  │  │Type=3  │                     │
   │Content │  │Thinking│  │Function│                     │
   └────┬───┘  └────┬───┘  └────┬───┘                     │
        │           │           │                          │
        │   content_block_stop  │                          │
        └───────────┬───────────┘                          │
                    ▼                                      │
          ResponseIndex++                                  │
                    │                                      │
                    └──────────────────────────────────────┘
```

**Signature Caching During Stream**:

```go
// Cache signature when thoughtSignature arrives
if thoughtSignature := partResult.Get("thoughtSignature"); thoughtSignature.Exists() {
    if params.SessionID != "" && params.CurrentThinkingText.Len() > 0 {
        cache.CacheSignature(
            params.SessionID,
            params.CurrentThinkingText.String(),
            thoughtSignature.String(),
        )
        params.CurrentThinkingText.Reset()
    }

    output = output + "event: content_block_delta\n"
    data, _ := sjson.Set(
        `{"type":"content_block_delta","index":%d,"delta":{"type":"signature_delta","signature":""}}`,
        params.ResponseIndex,
    ), "delta.signature", thoughtSignature.String())
    output = output + fmt.Sprintf("data: %s\n\n\n", data)
}
```

**Stop Reason Resolution**:

```go
func resolveStopReason(params *Params) string {
    if params.HasToolUse {
        return "tool_use"
    }
    switch params.FinishReason {
    case "MAX_TOKENS":
        return "max_tokens"
    case "STOP", "FINISH_REASON_UNSPECIFIED", "UNKNOWN":
        return "end_turn"
    }
    return "end_turn"
}
```

---

### 4.39 Zero-Latency Streaming Response Writer

**Source**: `CLIProxyAPI/internal/api/middleware/response_writer.go`

Response writer wrapper that captures response data for logging without impacting client latency.

**Core Architecture**:

```go
type ResponseWriterWrapper struct {
    gin.ResponseWriter
    body           *bytes.Buffer              // Buffer for non-streaming responses
    isStreaming    bool                       // Detected via Content-Type
    streamWriter   logging.StreamingLogWriter // Async streaming log writer
    chunkChannel   chan []byte                // Non-blocking async channel
    streamDone     chan struct{}              // Signals streaming goroutine completion
    logger         logging.RequestLogger
    requestInfo    *RequestInfo
    statusCode     int
    headers        map[string][]string
    logOnErrorOnly bool
}
```

**Zero-Latency Write Pattern**:

```go
func (w *ResponseWriterWrapper) Write(data []byte) (int, error) {
    w.ensureHeadersCaptured()

    // CRITICAL: Write to client first (zero latency)
    n, err := w.ResponseWriter.Write(data)

    // THEN: Handle logging based on response type
    if w.isStreaming && w.chunkChannel != nil {
        // Non-blocking send with copy
        select {
        case w.chunkChannel <- append([]byte(nil), data...):
        default: // Channel full, skip logging to avoid blocking
        }
        return n, err
    }

    if w.shouldBufferResponseBody() {
        w.body.Write(data)
    }

    return n, err
}
```

**Streaming Detection**:

```go
func (w *ResponseWriterWrapper) detectStreaming(contentType string) bool {
    // Check Content-Type for Server-Sent Events
    if strings.Contains(contentType, "text/event-stream") {
        return true
    }

    // If concrete Content-Type set, treat as non-streaming
    if strings.TrimSpace(contentType) != "" {
        return false
    }

    // Fall back to request payload hints
    if w.requestInfo != nil && len(w.requestInfo.Body) > 0 {
        bodyStr := string(w.requestInfo.Body)
        return strings.Contains(bodyStr, `"stream": true`) ||
               strings.Contains(bodyStr, `"stream":true`)
    }

    return false
}
```

**Async Chunk Processing**:

```go
func (w *ResponseWriterWrapper) processStreamingChunks(done chan struct{}) {
    defer close(done)

    if w.streamWriter == nil || w.chunkChannel == nil {
        return
    }

    for chunk := range w.chunkChannel {
        w.streamWriter.WriteChunkAsync(chunk)
    }
}

func (w *ResponseWriterWrapper) WriteHeader(statusCode int) {
    w.statusCode = statusCode
    w.captureCurrentHeaders()

    contentType := w.ResponseWriter.Header().Get("Content-Type")
    w.isStreaming = w.detectStreaming(contentType)

    if w.isStreaming && w.logger.IsEnabled() {
        streamWriter, err := w.logger.LogStreamingRequest(...)
        if err == nil {
            w.streamWriter = streamWriter
            w.chunkChannel = make(chan []byte, 100) // Buffered channel
            doneChan := make(chan struct{})
            w.streamDone = doneChan

            // Start async chunk processor
            go w.processStreamingChunks(doneChan)
            _ = streamWriter.WriteStatus(statusCode, w.headers)
        }
    }

    w.ResponseWriter.WriteHeader(statusCode)
}
```

**Key Design Decisions**:

| Aspect              | Implementation                    |
| ------------------- | --------------------------------- |
| Client priority     | Write to client BEFORE logging    |
| Non-blocking        | Channel send with default case    |
| Buffer size         | 100-element buffered channel      |
| Streaming detection | Content-Type + request body hints |
| Goroutine lifecycle | Done channel for clean shutdown   |
| Header capture      | Copy to prevent race conditions   |

---

### 4.40 Streaming Interfaces for Thinking Deduplication

**Source**: `opencode-antigravity-auth/src/plugin/core/streaming/types.ts`

TypeScript interfaces for streaming transformation with signature caching and thinking deduplication.

```typescript
export interface SignedThinking {
  text: string;
  signature: string;
}

export interface SignatureStore {
  get(sessionKey: string): SignedThinking | undefined;
  set(sessionKey: string, value: SignedThinking): void;
  has(sessionKey: string): boolean;
  delete(sessionKey: string): void;
}

export interface StreamingCallbacks {
  onCacheSignature?: (sessionKey: string, text: string, signature: string) => void;
  onInjectDebug?: (response: unknown, debugText: string) => unknown;
  transformThinkingParts?: (parts: unknown) => unknown;
}

export interface StreamingOptions {
  signatureSessionKey?: string;
  debugText?: string;
  cacheSignatures?: boolean;
  displayedThinkingHashes?: Set<string>;
}

export interface ThoughtBuffer {
  get(index: number): string | undefined;
  set(index: number, text: string): void;
  clear(): void;
}
```

**Usage Pattern**:

```typescript
// Create streaming transformer with callbacks
const transformer = createStreamingTransformer(
  signatureStore,
  {
    onCacheSignature: (key, text, sig) => {
      // Persist signature for multi-turn
      cacheSignature(sessionId, text, sig);
    },
    onInjectDebug: (response, debugText) => {
      // Inject debug info into first response
      return injectDebugIntoResponse(response, debugText);
    },
  },
  {
    signatureSessionKey: sessionId,
    cacheSignatures: true,
    displayedThinkingHashes: new Set(),
  },
);

// Pipe response through transformer
const transformedStream = response.body.pipeThrough(transformer);
```

**ThoughtBuffer Implementation**:

```typescript
function createThoughtBuffer(): ThoughtBuffer {
  const buffer = new Map<number, string>();
  return {
    get: (index) => buffer.get(index),
    set: (index, text) => buffer.set(index, text),
    clear: () => buffer.clear(),
  };
}
```

---

### 4.41 Tool Use ID Generation with Atomic Counter

**Source**: `CLIProxyAPI/internal/translator/antigravity/claude/antigravity_claude_response.go:49, 260`

Process-wide unique tool use IDs using atomic counter for thread safety.

```go
// toolUseIDCounter provides a process-wide unique counter for tool use identifiers.
var toolUseIDCounter uint64

// In response translator:
if functionCallResult.Exists() {
    fcName := functionCallResult.Get("name").String()

    // Start a new tool use content block
    output = output + "event: content_block_start\n"

    // Create unique ID: name-timestamp-counter
    data := fmt.Sprintf(
        `{"type":"content_block_start","index":%d,"content_block":{"type":"tool_use","id":"","name":"","input":{}}}`,
        params.ResponseIndex,
    )
    data, _ = sjson.Set(data, "content_block.id",
        fmt.Sprintf("%s-%d-%d",
            fcName,
            time.Now().UnixNano(),
            atomic.AddUint64(&toolUseIDCounter, 1),
        ),
    )
    data, _ = sjson.Set(data, "content_block.name", fcName)
    output = output + fmt.Sprintf("data: %s\n\n\n", data)

    // ...
    params.ResponseType = 3 // Function state
    params.HasToolUse = true
}
```

**ID Format**: `{functionName}-{unixNano}-{atomicCounter}`

Example: `Read-1736589423456789012-42`

**Why This Pattern**:

| Component      | Purpose                              |
| -------------- | ------------------------------------ |
| Function name  | Human-readable prefix                |
| Unix nano      | Timestamp uniqueness                 |
| Atomic counter | Process-wide ordering                |
| Combined       | Globally unique, sortable, traceable |

---

### 4.42 Non-Streaming Response Conversion with Flush Pattern

**Source**: `CLIProxyAPI/internal/translator/antigravity/claude/antigravity_claude_response.go:363-520`

Complete non-streaming response conversion with builder pattern for content accumulation.

```go
func ConvertAntigravityResponseToClaudeNonStream(ctx context.Context, modelName string,
    originalRequestRawJSON, requestRawJSON, rawJSON []byte, param *any) string {

    root := gjson.ParseBytes(rawJSON)

    // Calculate tokens with fallback for missing fields
    promptTokens := root.Get("response.usageMetadata.promptTokenCount").Int()
    candidateTokens := root.Get("response.usageMetadata.candidatesTokenCount").Int()
    thoughtTokens := root.Get("response.usageMetadata.thoughtsTokenCount").Int()
    totalTokens := root.Get("response.usageMetadata.totalTokenCount").Int()
    cachedTokens := root.Get("response.usageMetadata.cachedContentTokenCount").Int()

    outputTokens := candidateTokens + thoughtTokens
    if outputTokens == 0 && totalTokens > 0 {
        // Fallback: derive from total
        outputTokens = totalTokens - promptTokens
        if outputTokens < 0 {
            outputTokens = 0
        }
    }

    // Initialize response template
    responseJSON := `{"id":"","type":"message","role":"assistant","model":"","content":null,...}`

    // Builder pattern for content accumulation
    textBuilder := strings.Builder{}
    thinkingBuilder := strings.Builder{}
    thinkingSignature := ""
    toolIDCounter := 0
    hasToolCall := false
    contentArrayInitialized := false

    ensureContentArray := func() {
        if contentArrayInitialized {
            return
        }
        responseJSON, _ = sjson.SetRaw(responseJSON, "content", "[]")
        contentArrayInitialized = true
    }

    flushText := func() {
        if textBuilder.Len() == 0 {
            return
        }
        ensureContentArray()
        block := `{"type":"text","text":""}`
        block, _ = sjson.Set(block, "text", textBuilder.String())
        responseJSON, _ = sjson.SetRaw(responseJSON, "content.-1", block)
        textBuilder.Reset()
    }

    flushThinking := func() {
        if thinkingBuilder.Len() == 0 && thinkingSignature == "" {
            return
        }
        ensureContentArray()
        block := `{"type":"thinking","thinking":""}`
        block, _ = sjson.Set(block, "thinking", thinkingBuilder.String())
        if thinkingSignature != "" {
            block, _ = sjson.Set(block, "signature", thinkingSignature)
        }
        responseJSON, _ = sjson.SetRaw(responseJSON, "content.-1", block)
        thinkingBuilder.Reset()
        thinkingSignature = ""
    }

    // Process parts
    parts := root.Get("response.candidates.0.content.parts")
    if parts.IsArray() {
        for _, part := range parts.Array() {
            isThought := part.Get("thought").Bool()

            if isThought {
                // Handle thought signature
                sig := part.Get("thoughtSignature")
                if !sig.Exists() {
                    sig = part.Get("thought_signature")
                }
                if sig.Exists() && sig.String() != "" {
                    thinkingSignature = sig.String()
                }
            }

            if text := part.Get("text"); text.Exists() && text.String() != "" {
                if isThought {
                    flushText() // Flush pending text before thinking
                    thinkingBuilder.WriteString(text.String())
                    continue
                }
                flushThinking() // Flush pending thinking before text
                textBuilder.WriteString(text.String())
                continue
            }

            if functionCall := part.Get("functionCall"); functionCall.Exists() {
                flushThinking()
                flushText()
                hasToolCall = true

                toolIDCounter++
                toolBlock := `{"type":"tool_use","id":"","name":"","input":{}}`
                toolBlock, _ = sjson.Set(toolBlock, "id", fmt.Sprintf("tool_%d", toolIDCounter))
                toolBlock, _ = sjson.Set(toolBlock, "name", functionCall.Get("name").String())

                if args := functionCall.Get("args"); args.Exists() && gjson.Valid(args.Raw) {
                    toolBlock, _ = sjson.SetRaw(toolBlock, "input", args.Raw)
                }

                ensureContentArray()
                responseJSON, _ = sjson.SetRaw(responseJSON, "content.-1", toolBlock)
            }
        }
    }

    // Final flush
    flushThinking()
    flushText()

    // Determine stop reason
    stopReason := "end_turn"
    if hasToolCall {
        stopReason = "tool_use"
    } else if finish := root.Get("response.candidates.0.finishReason"); finish.Exists() {
        switch finish.String() {
        case "MAX_TOKENS":
            stopReason = "max_tokens"
        }
    }
    responseJSON, _ = sjson.Set(responseJSON, "stop_reason", stopReason)

    return responseJSON
}
```

**Flush Pattern Diagram**:

```
┌─────────────────────────────────────────────────────────┐
│                  Content Processing                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   Text Part → textBuilder.Write()                        │
│       │                                                  │
│       └─► Thinking Part? → flushText() first             │
│                               │                          │
│                               └─► thinkingBuilder.Write()│
│                                       │                  │
│                                       └─► Tool Part?     │
│                                               │          │
│                                               └─► flush* │
│                                                   both   │
│                                                          │
├─────────────────────────────────────────────────────────┤
│   End of parts → flushThinking() → flushText()           │
└─────────────────────────────────────────────────────────┘
```

---

### 4.43 Thread-Safe Model Registry with Reference Counting (CLIProxyAPI)

**Location**: `internal/registry/model_registry.go` (1137 lines)

**Pattern**: Comprehensive registry managing model availability, quota tracking, and client-model associations with reference counting.

```go
type ModelRegistry struct {
    models           map[string]*ModelRegistration
    clientModels     map[string][]string           // clientID -> modelIDs
    clientModelInfos map[string]map[string]*ModelInfo
    clientProviders  map[string]string             // clientID -> provider
    mutex            *sync.RWMutex
    hook             ModelRegistryHook             // External integration
}

type ModelRegistration struct {
    Info                 *ModelInfo
    Count                int                        // Reference count
    QuotaExceededClients map[string]*time.Time     // clientID -> exceeded at
    Providers            map[string]int            // provider -> count
    SuspendedClients     map[string]string         // clientID -> reason
}
```

**Key Operations**:

```go
// Register client with its models
func (r *ModelRegistry) RegisterClient(clientID, clientProvider string, models []*ModelInfo) {
    r.mutex.Lock()
    defer r.mutex.Unlock()

    r.clientProviders[clientID] = clientProvider
    r.clientModels[clientID] = make([]string, 0, len(models))
    r.clientModelInfos[clientID] = make(map[string]*ModelInfo)

    for _, model := range models {
        modelID := model.ID
        r.clientModels[clientID] = append(r.clientModels[clientID], modelID)
        r.clientModelInfos[clientID][modelID] = model

        if existing, ok := r.models[modelID]; ok {
            existing.Count++  // Increment reference count
            existing.Providers[clientProvider]++
        } else {
            r.models[modelID] = &ModelRegistration{
                Info:                 model,
                Count:                1,
                QuotaExceededClients: make(map[string]*time.Time),
                Providers:            map[string]int{clientProvider: 1},
                SuspendedClients:     make(map[string]string),
            }
        }
    }

    if r.hook != nil {
        r.hook.OnClientRegistered(clientID, clientProvider, models)
    }
}

// Mark model quota exceeded for specific client
func (r *ModelRegistry) SetModelQuotaExceeded(clientID, modelID string) {
    r.mutex.Lock()
    defer r.mutex.Unlock()

    if reg, ok := r.models[modelID]; ok {
        now := time.Now()
        reg.QuotaExceededClients[clientID] = &now
    }
}

// Suspend model for specific client with reason
func (r *ModelRegistry) SuspendClientModel(clientID, modelID, reason string) {
    r.mutex.Lock()
    defer r.mutex.Unlock()

    if reg, ok := r.models[modelID]; ok {
        reg.SuspendedClients[clientID] = reason
    }
}

// Check if model available for client (not exceeded, not suspended)
func (r *ModelRegistry) IsModelAvailableForClient(clientID, modelID string) bool {
    r.mutex.RLock()
    defer r.mutex.RUnlock()

    reg, ok := r.models[modelID]
    if !ok {
        return false
    }

    // Check suspension
    if _, suspended := reg.SuspendedClients[clientID]; suspended {
        return false
    }

    // Check quota exceeded
    if exceededAt, exceeded := reg.QuotaExceededClients[clientID]; exceeded {
        if time.Since(*exceededAt) < quotaResetDuration {
            return false
        }
        delete(reg.QuotaExceededClients, clientID)
    }

    return true
}

// Get models by provider with availability filtering
func (r *ModelRegistry) GetAvailableModelsByProvider(provider string) []*ModelInfo {
    r.mutex.RLock()
    defer r.mutex.RUnlock()

    var models []*ModelInfo
    for _, reg := range r.models {
        if count, ok := reg.Providers[provider]; ok && count > 0 {
            models = append(models, reg.Info)
        }
    }
    return models
}

// Cleanup expired quota exceeded entries
func (r *ModelRegistry) CleanupExpiredQuotas(expiry time.Duration) {
    r.mutex.Lock()
    defer r.mutex.Unlock()

    now := time.Now()
    for _, reg := range r.models {
        for clientID, exceededAt := range reg.QuotaExceededClients {
            if now.Sub(*exceededAt) > expiry {
                delete(reg.QuotaExceededClients, clientID)
            }
        }
    }
}
```

**Multi-Format Output Support**:

```go
// Export for different API formats
func (r *ModelRegistry) GetModelsForOpenAI() []OpenAIModel {
    r.mutex.RLock()
    defer r.mutex.RUnlock()

    models := make([]OpenAIModel, 0, len(r.models))
    for id, reg := range r.models {
        models = append(models, OpenAIModel{
            ID:      id,
            Object:  "model",
            Created: reg.Info.CreatedAt,
            OwnedBy: reg.Info.Provider,
        })
    }
    return models
}

func (r *ModelRegistry) GetModelsForClaude() []ClaudeModel {
    // Similar conversion for Claude format
}

func (r *ModelRegistry) GetModelsForGemini() []GeminiModel {
    // Similar conversion for Gemini format
}
```

**Hook System for External Integration**:

```go
type ModelRegistryHook interface {
    OnClientRegistered(clientID, provider string, models []*ModelInfo)
    OnClientUnregistered(clientID string)
    OnModelQuotaExceeded(clientID, modelID string)
    OnModelSuspended(clientID, modelID, reason string)
}

func (r *ModelRegistry) SetHook(hook ModelRegistryHook) {
    r.mutex.Lock()
    defer r.mutex.Unlock()
    r.hook = hook
}
```

**Why This Matters**: Enables sophisticated multi-client model management with per-client quota tracking and provider-aware availability.

---

### 4.44 Model Mapper with Regex Support (CLIProxyAPI)

**Location**: `internal/api/modules/amp/model_mapping.go` (148 lines)

**Pattern**: Model name aliasing with exact mapping, regex rules, and hot-reload capability.

```go
type ModelMapper interface {
    MapModel(requestedModel string) string
    LoadMappings(config ModelMappingConfig)
}

type DefaultModelMapper struct {
    mu       sync.RWMutex
    mappings map[string]string  // exact: from -> to
    regexps  []regexMapping     // regex rules in order
    registry *ModelRegistry     // For availability check
}

type regexMapping struct {
    pattern *regexp.Regexp
    target  string
}

type ModelMappingConfig struct {
    ExactMappings map[string]string `json:"exact"`
    RegexMappings []RegexRule       `json:"regex"`
}

type RegexRule struct {
    Pattern string `json:"pattern"`
    Target  string `json:"target"`
}
```

**Implementation**:

```go
func NewDefaultModelMapper(registry *ModelRegistry) *DefaultModelMapper {
    return &DefaultModelMapper{
        mappings: make(map[string]string),
        regexps:  make([]regexMapping, 0),
        registry: registry,
    }
}

func (m *DefaultModelMapper) LoadMappings(config ModelMappingConfig) {
    m.mu.Lock()
    defer m.mu.Unlock()

    // Load exact mappings
    m.mappings = make(map[string]string)
    for from, to := range config.ExactMappings {
        m.mappings[strings.ToLower(from)] = to
    }

    // Compile regex mappings
    m.regexps = make([]regexMapping, 0, len(config.RegexMappings))
    for _, rule := range config.RegexMappings {
        pattern, err := regexp.Compile("(?i)" + rule.Pattern) // Case-insensitive
        if err != nil {
            log.Printf("Invalid regex pattern '%s': %v", rule.Pattern, err)
            continue
        }
        m.regexps = append(m.regexps, regexMapping{
            pattern: pattern,
            target:  rule.Target,
        })
    }
}

func (m *DefaultModelMapper) MapModel(requestedModel string) string {
    m.mu.RLock()
    defer m.mu.RUnlock()

    normalized := strings.ToLower(strings.TrimSpace(requestedModel))

    // 1. Check exact mapping first (fast path)
    if target, ok := m.mappings[normalized]; ok {
        if m.isModelAvailable(target) {
            return target
        }
    }

    // 2. Try regex mappings in order
    for _, rm := range m.regexps {
        if rm.pattern.MatchString(requestedModel) {
            // Support capture group replacement
            target := rm.pattern.ReplaceAllString(requestedModel, rm.target)
            if m.isModelAvailable(target) {
                return target
            }
        }
    }

    // 3. Return original if no mapping matches
    return requestedModel
}

func (m *DefaultModelMapper) isModelAvailable(modelID string) bool {
    if m.registry == nil {
        return true // No registry = assume available
    }
    return m.registry.HasModel(modelID)
}
```

**Hot-Reload Support**:

```go
func (m *DefaultModelMapper) WatchConfigFile(path string) error {
    watcher, err := fsnotify.NewWatcher()
    if err != nil {
        return err
    }

    go func() {
        for {
            select {
            case event := <-watcher.Events:
                if event.Op&fsnotify.Write == fsnotify.Write {
                    config, err := loadConfigFromFile(path)
                    if err != nil {
                        log.Printf("Failed to reload config: %v", err)
                        continue
                    }
                    m.LoadMappings(config)
                    log.Printf("Reloaded model mappings from %s", path)
                }
            case err := <-watcher.Errors:
                log.Printf("Config watcher error: %v", err)
            }
        }
    }()

    return watcher.Add(path)
}
```

**Example Configuration**:

```json
{
  "exact": {
    "gpt-4": "claude-sonnet-4-20250514",
    "gpt-4o": "claude-sonnet-4-20250514",
    "claude-3-opus": "claude-opus-4-20250514"
  },
  "regex": [
    {
      "pattern": "^gpt-4-turbo.*",
      "target": "claude-sonnet-4-20250514"
    },
    {
      "pattern": "^claude-3\\.5-sonnet.*",
      "target": "claude-sonnet-4-20250514"
    },
    {
      "pattern": "^gemini-(.+)$",
      "target": "gemini-2.5-$1"
    }
  ]
}
```

**Why This Matters**: Enables flexible model aliasing with case-insensitive matching and capture group support for dynamic mapping.

---

### 4.45 Error Sentinel Pattern (CLIProxyAPI)

**Location**: `sdk/access/errors.go`, `sdk/auth/errors.go`

**Pattern**: Go idiomatic sentinel errors for clean error handling across packages.

```go
// sdk/access/errors.go
package access

import "errors"

var (
    ErrNoCredentials    = errors.New("no credentials found")
    ErrInvalidCredential = errors.New("invalid credential")
    ErrNotHandled       = errors.New("request not handled by any client")
    ErrAllClientsExhausted = errors.New("all clients exhausted or rate limited")
    ErrModelNotFound    = errors.New("model not found in registry")
)

// sdk/auth/errors.go
package auth

import "fmt"

type ProjectSelectionError struct {
    Message string
    Projects []string
}

func (e *ProjectSelectionError) Error() string {
    return fmt.Sprintf("%s: available projects: %v", e.Message, e.Projects)
}

type EmailRequiredError struct {
    Message string
}

func (e *EmailRequiredError) Error() string {
    return e.Message
}
```

**Usage Pattern**:

```go
func ProcessRequest(req *Request) error {
    client, err := selectClient(req)
    if errors.Is(err, access.ErrNoCredentials) {
        return fmt.Errorf("authentication required: %w", err)
    }
    if errors.Is(err, access.ErrAllClientsExhausted) {
        return fmt.Errorf("rate limited, try again later: %w", err)
    }

    var projectErr *auth.ProjectSelectionError
    if errors.As(err, &projectErr) {
        return fmt.Errorf("select project: %s", strings.Join(projectErr.Projects, ", "))
    }

    return nil
}
```

**Why This Matters**: Enables clean error type checking with `errors.Is()` and `errors.As()` for sophisticated error handling.

---

### 4.46 Translator Pipeline with Middleware Chain (CLIProxyAPI)

**Location**: `sdk/translator/pipeline.go` (107 lines)

**Pattern**: Request/response transformation pipeline with composable middleware and format registry.

```go
// Envelope types for transformation
type RequestEnvelope struct {
    Format Format
    Model  string
    Stream bool
    Body   []byte
}

type ResponseEnvelope struct {
    Format Format
    Model  string
    Stream bool
    Body   []byte
    Chunks []string
}

// Middleware signatures
type RequestMiddleware func(ctx context.Context, req RequestEnvelope, next RequestHandler) (RequestEnvelope, error)
type ResponseMiddleware func(ctx context.Context, resp ResponseEnvelope, next ResponseHandler) (ResponseEnvelope, error)

// Pipeline with middleware chain
type Pipeline struct {
    registry           *Registry
    requestMiddleware  []RequestMiddleware
    responseMiddleware []ResponseMiddleware
}

// TranslateRequest applies middleware in reverse order (onion pattern)
func (p *Pipeline) TranslateRequest(ctx context.Context, from, to Format, req RequestEnvelope) (RequestEnvelope, error) {
    terminal := func(ctx context.Context, input RequestEnvelope) (RequestEnvelope, error) {
        translated := p.registry.TranslateRequest(from, to, input.Model, input.Body, input.Stream)
        input.Body = translated
        input.Format = to
        return input, nil
    }

    handler := terminal
    // Build chain from last to first (reverse order)
    for i := len(p.requestMiddleware) - 1; i >= 0; i-- {
        mw := p.requestMiddleware[i]
        next := handler
        handler = func(ctx context.Context, r RequestEnvelope) (RequestEnvelope, error) {
            return mw(ctx, r, next)
        }
    }

    return handler(ctx, req)
}
```

**Why This Matters**: Enables format-agnostic request/response transformation with pluggable middleware.

---

### 4.47 Translator Registry with Streaming/Non-Streaming Transforms (CLIProxyAPI)

**Location**: `sdk/translator/registry.go` (143 lines)

**Pattern**: Thread-safe registry for bidirectional format transformations.

```go
type Registry struct {
    mu        sync.RWMutex
    requests  map[Format]map[Format]RequestTransform   // from -> to -> transform
    responses map[Format]map[Format]ResponseTransform  // from -> to -> transform
}

// Register both request and response transforms
func (r *Registry) Register(from, to Format, request RequestTransform, response ResponseTransform) {
    r.mu.Lock()
    defer r.mu.Unlock()

    if _, ok := r.requests[from]; !ok {
        r.requests[from] = make(map[Format]RequestTransform)
    }
    if request != nil {
        r.requests[from][to] = request
    }

    if _, ok := r.responses[from]; !ok {
        r.responses[from] = make(map[Format]ResponseTransform)
    }
    r.responses[from][to] = response
}

// Stream vs Non-Stream differentiation
func (r *Registry) TranslateStream(ctx context.Context, from, to Format, model string,
    originalRequestRawJSON, requestRawJSON, rawJSON []byte, param *any) []string {
    r.mu.RLock()
    defer r.mu.RUnlock()

    // Note: Response lookup uses swapped direction (to -> from)
    if byTarget, ok := r.responses[to]; ok {
        if fn, isOk := byTarget[from]; isOk && fn.Stream != nil {
            return fn.Stream(ctx, model, originalRequestRawJSON, requestRawJSON, rawJSON, param)
        }
    }
    return []string{string(rawJSON)}
}

// Default package-level registry
var defaultRegistry = NewRegistry()

func Default() *Registry { return defaultRegistry }
```

**Why This Matters**: Provides centralized format conversion with separate streaming/non-streaming paths.

---

### 4.48 Stream Forwarder with Keep-Alive Heartbeats (CLIProxyAPI)

**Location**: `sdk/api/handlers/stream_forwarder.go` (122 lines)

**Pattern**: Generic SSE stream forwarder with configurable keep-alive, terminal errors, and done markers.

```go
type StreamForwardOptions struct {
    KeepAliveInterval  *time.Duration
    WriteChunk         func(chunk []byte)
    WriteTerminalError func(errMsg *interfaces.ErrorMessage)
    WriteDone          func()  // e.g., OpenAI's [DONE]
    WriteKeepAlive     func()  // Default: SSE comment heartbeat
}

func (h *BaseAPIHandler) ForwardStream(c *gin.Context, flusher http.Flusher, cancel func(error),
    data <-chan []byte, errs <-chan *interfaces.ErrorMessage, opts StreamForwardOptions) {

    writeKeepAlive := opts.WriteKeepAlive
    if writeKeepAlive == nil {
        writeKeepAlive = func() {
            _, _ = c.Writer.Write([]byte(": keep-alive\n\n"))
        }
    }

    keepAliveInterval := StreamingKeepAliveInterval(h.Cfg)
    if opts.KeepAliveInterval != nil {
        keepAliveInterval = *opts.KeepAliveInterval
    }

    var keepAlive *time.Ticker
    if keepAliveInterval > 0 {
        keepAlive = time.NewTicker(keepAliveInterval)
        defer keepAlive.Stop()
    }

    var terminalErr *interfaces.ErrorMessage
    for {
        select {
        case <-c.Request.Context().Done():
            cancel(c.Request.Context().Err())
            return

        case chunk, ok := <-data:
            if !ok {
                // Check for pending terminal error
                if terminalErr == nil {
                    select {
                    case errMsg, ok := <-errs:
                        if ok && errMsg != nil {
                            terminalErr = errMsg
                        }
                    default:
                    }
                }
                if terminalErr != nil {
                    if opts.WriteTerminalError != nil {
                        opts.WriteTerminalError(terminalErr)
                    }
                    flusher.Flush()
                    cancel(terminalErr.Error)
                    return
                }
                // Normal completion
                if opts.WriteDone != nil {
                    opts.WriteDone()
                }
                flusher.Flush()
                cancel(nil)
                return
            }
            opts.WriteChunk(chunk)
            flusher.Flush()

        case errMsg, ok := <-errs:
            if ok && errMsg != nil {
                terminalErr = errMsg
                if opts.WriteTerminalError != nil {
                    opts.WriteTerminalError(errMsg)
                    flusher.Flush()
                }
            }
            cancel(errMsg.Error)
            return

        case <-keepAlive.C:
            writeKeepAlive()
            flusher.Flush()
        }
    }
}
```

**Why This Matters**: Provides robust SSE streaming with heartbeats to prevent timeouts and graceful error propagation.

---

### 4.49 Auth Manager with Provider Rotation and Retry (CLIProxyAPI)

**Location**: `sdk/cliproxy/auth/conductor.go` (1760 lines)

**Pattern**: Comprehensive auth lifecycle management with provider rotation, quota backoff, and auto-refresh.

```go
type Manager struct {
    store     Store
    executors map[string]ProviderExecutor
    selector  Selector
    hook      Hook
    mu        sync.RWMutex
    auths     map[string]*Auth

    // Per-model provider rotation (prevents hotspot on single provider)
    providerOffsets map[string]int

    // Retry configuration (atomic for lock-free access)
    requestRetry     atomic.Int32
    maxRetryInterval atomic.Int64

    // Model name aliasing
    modelNameMappings atomic.Value

    // Auto refresh
    refreshCancel context.CancelFunc
}

// Execute with multi-provider rotation
func (m *Manager) Execute(ctx context.Context, providers []string, req Request, opts Options) (Response, error) {
    normalized := m.normalizeProviders(providers)
    rotated := m.rotateProviders(req.Model, normalized)  // Start from different provider each time

    retryTimes, maxWait := m.retrySettings()
    attempts := retryTimes + 1

    var lastErr error
    for attempt := 0; attempt < attempts; attempt++ {
        resp, errExec := m.executeProvidersOnce(ctx, rotated, ...)
        if errExec == nil {
            return resp, nil
        }
        lastErr = errExec
        wait, shouldRetry := m.shouldRetryAfterError(errExec, attempt, attempts, rotated, req.Model, maxWait)
        if !shouldRetry {
            break
        }
        if errWait := waitForCooldown(ctx, wait); errWait != nil {
            return Response{}, errWait
        }
    }
    return Response{}, lastErr
}

// Provider rotation with atomic offset tracking
func (m *Manager) rotateProviders(model string, providers []string) []string {
    m.mu.Lock()
    offset := m.providerOffsets[model]
    m.providerOffsets[model] = (offset + 1) % len(providers)  // Atomic increment
    m.mu.Unlock()

    if offset == 0 {
        return providers
    }
    // Rotate: [3,1,2] for offset 1 on [1,2,3]
    rotated := make([]string, 0, len(providers))
    rotated = append(rotated, providers[offset:]...)
    rotated = append(rotated, providers[:offset]...)
    return rotated
}

// Mark result with HTTP status code handling
func (m *Manager) MarkResult(ctx context.Context, result Result) {
    // Update auth state based on status code
    statusCode := statusCodeFromResult(result.Error)
    switch statusCode {
    case 401:
        next := now.Add(30 * time.Minute)  // Auth error cooldown
    case 402, 403:
        next := now.Add(30 * time.Minute)  // Payment required cooldown
    case 404:
        next := now.Add(12 * time.Hour)    // Not found - long cooldown
    case 429:
        // Exponential backoff for rate limits
        cooldown, nextLevel := nextQuotaCooldown(backoffLevel)
        auth.Quota.BackoffLevel = nextLevel
    case 408, 500, 502, 503, 504:
        next := now.Add(1 * time.Minute)   // Transient error - short cooldown
    }

    // Update model registry
    if result.Success {
        registry.ClearModelQuotaExceeded(result.AuthID, result.Model)
        registry.ResumeClientModel(result.AuthID, result.Model)
    } else {
        registry.SuspendClientModel(result.AuthID, result.Model, suspendReason)
    }
}
```

**Why This Matters**: Enables multi-provider load distribution with intelligent retry and quota management.

---

### 4.50 Usage Manager with Plugin System (CLIProxyAPI)

**Location**: `sdk/cliproxy/usage/manager.go` (182 lines)

**Pattern**: Queue-based usage tracking with plugin architecture for metrics collection.

```go
type Record struct {
    Provider    string
    Model       string
    APIKey      string
    AuthID      string
    AuthIndex   string
    Source      string
    RequestedAt time.Time
    Failed      bool
    Detail      Detail
}

type Detail struct {
    InputTokens     int64
    OutputTokens    int64
    ReasoningTokens int64
    CachedTokens    int64
    TotalTokens     int64
}

type Plugin interface {
    HandleUsage(ctx context.Context, record Record)
}

type Manager struct {
    once     sync.Once
    stopOnce sync.Once
    cancel   context.CancelFunc

    mu     sync.Mutex
    cond   *sync.Cond
    queue  []queueItem
    closed bool

    pluginsMu sync.RWMutex
    plugins   []Plugin
}

// Publish enqueues with auto-start
func (m *Manager) Publish(ctx context.Context, record Record) {
    m.Start(context.Background())  // Lazy start
    m.mu.Lock()
    if m.closed {
        m.mu.Unlock()
        return
    }
    m.queue = append(m.queue, queueItem{ctx: ctx, record: record})
    m.mu.Unlock()
    m.cond.Signal()
}

// Safe dispatch with panic recovery
func safeInvoke(plugin Plugin, ctx context.Context, record Record) {
    defer func() {
        if r := recover(); r != nil {
            log.Errorf("usage: plugin panic recovered: %v", r)
        }
    }()
    plugin.HandleUsage(ctx, record)
}

// Default global manager
var defaultManager = NewManager(512)
func DefaultManager() *Manager { return defaultManager }
func RegisterPlugin(plugin Plugin) { DefaultManager().Register(plugin) }
```

**Why This Matters**: Enables decoupled usage tracking with multiple consumers (logging, billing, analytics).

---

### 4.51 Service Lifecycle with Hot-Reload (CLIProxyAPI)

**Location**: `sdk/cliproxy/service.go` (1326 lines)

**Pattern**: Complete service lifecycle with file watching, config hot-reload, and executor binding.

```go
type Service struct {
    cfg        *config.Config
    cfgMu      sync.RWMutex
    configPath string

    // Provider abstractions
    tokenProvider  TokenClientProvider
    apiKeyProvider APIKeyClientProvider

    // File watching
    watcher        *WatcherWrapper
    watcherCancel  context.CancelFunc
    watcherFactory WatcherFactory

    // Auth update queue (async processing)
    authUpdates   chan watcher.AuthUpdate
    authQueueStop context.CancelFunc

    // Managers
    coreManager   *coreauth.Manager
    accessManager *sdkaccess.Manager

    // WebSocket gateway
    wsGateway     *wsrelay.Manager

    // Lifecycle
    server       *api.Server
    serverErr    chan error
    shutdownOnce sync.Once
}

// Run with hot-reload callback
func (s *Service) Run(ctx context.Context) error {
    // ... initialization ...

    reloadCallback := func(newCfg *config.Config) {
        // Update routing strategy
        if previousStrategy != nextStrategy {
            switch nextStrategy {
            case "fill-first":
                s.coreManager.SetSelector(&coreauth.FillFirstSelector{})
            default:
                s.coreManager.SetSelector(&coreauth.RoundRobinSelector{})
            }
        }

        // Apply retry config
        s.applyRetryConfig(newCfg)

        // Update OAuth model mappings
        s.coreManager.SetOAuthModelMappings(newCfg.OAuthModelMappings)

        // Rebind executors for config changes
        s.rebindExecutors()
    }

    watcherWrapper, err = s.watcherFactory(s.configPath, s.cfg.AuthDir, reloadCallback)
    // ...
}

// Dynamic executor binding based on auth type
func (s *Service) ensureExecutorsForAuth(a *coreauth.Auth) {
    switch strings.ToLower(a.Provider) {
    case "gemini":
        s.coreManager.RegisterExecutor(executor.NewGeminiExecutor(s.cfg))
    case "antigravity":
        s.coreManager.RegisterExecutor(executor.NewAntigravityExecutor(s.cfg))
    case "claude":
        s.coreManager.RegisterExecutor(executor.NewClaudeExecutor(s.cfg))
    // ... other providers
    default:
        s.coreManager.RegisterExecutor(executor.NewOpenAICompatExecutor(providerKey, s.cfg))
    }
}

// WebSocket provider lifecycle
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

**Why This Matters**: Provides complete production-ready service lifecycle with dynamic reconfiguration.

---

### 4.52 WebSocket Relay Manager with Session Replacement (CLIProxyAPI - Go)

**Pattern**: WebSocket connection manager with automatic session replacement and pending request cleanup.

```go
// internal/wsrelay/manager.go (206 lines)
type Manager struct {
    path      string
    upgrader  websocket.Upgrader
    sessions  map[string]*session
    sessMutex sync.RWMutex

    providerFactory func(*http.Request) (string, error)
    onConnected     func(string)
    onDisconnected  func(string, error)

    logDebugf func(string, ...any)
    logInfof  func(string, ...any)
    logWarnf  func(string, ...any)
}

// Session replacement on reconnection
func (m *Manager) handleWebsocket(w http.ResponseWriter, r *http.Request) {
    conn, err := m.upgrader.Upgrade(w, r, nil)
    if err != nil {
        m.logWarnf("wsrelay: upgrade failed: %v", err)
        return
    }
    s := newSession(conn, m, randomProviderName())

    // Get provider name from factory (e.g., from query params or headers)
    if m.providerFactory != nil {
        name, err := m.providerFactory(r)
        if err != nil {
            s.cleanup(err)
            return
        }
        if strings.TrimSpace(name) != "" {
            s.provider = strings.ToLower(name)
        }
    }

    m.sessMutex.Lock()
    var replaced *session
    if existing, ok := m.sessions[s.provider]; ok {
        replaced = existing  // Track old session for cleanup
    }
    m.sessions[s.provider] = s  // Replace with new session
    m.sessMutex.Unlock()

    // Clean up replaced session (existing clients get disconnection error)
    if replaced != nil {
        replaced.cleanup(errors.New("replaced by new connection"))
    }

    if m.onConnected != nil {
        m.onConnected(s.provider)
    }

    go s.run(context.Background())
}

// Send to specific provider with channel-based response
func (m *Manager) Send(ctx context.Context, provider string, msg Message) (<-chan Message, error) {
    s := m.session(provider)
    if s == nil {
        return nil, fmt.Errorf("wsrelay: provider %s not connected", provider)
    }
    return s.request(ctx, msg)
}

// Graceful shutdown - close all sessions
func (m *Manager) Stop(_ context.Context) error {
    m.sessMutex.Lock()
    sessions := make([]*session, 0, len(m.sessions))
    for _, sess := range m.sessions {
        sessions = append(sessions, sess)
    }
    m.sessions = make(map[string]*session)  // Clear registry
    m.sessMutex.Unlock()

    for _, sess := range sessions {
        if sess != nil {
            sess.cleanup(errors.New("wsrelay: manager stopped"))
        }
    }
    return nil
}
```

**Why This Matters**: Production-ready WebSocket relay with automatic reconnection handling and clean session lifecycle.

---

### 4.53 WebSocket Session with Pending Request Correlation (CLIProxyAPI - Go)

**Pattern**: Request/response correlation over WebSocket with heartbeat keep-alive and cleanup on close.

```go
// internal/wsrelay/session.go (189 lines)
const (
    readTimeout          = 60 * time.Second
    writeTimeout         = 10 * time.Second
    maxInboundMessageLen = 64 << 20 // 64 MiB
    heartbeatInterval    = 30 * time.Second
)

type pendingRequest struct {
    ch        chan Message
    closeOnce sync.Once
}

func (pr *pendingRequest) close() {
    if pr == nil {
        return
    }
    pr.closeOnce.Do(func() {
        close(pr.ch)
    })
}

type session struct {
    conn       *websocket.Conn
    manager    *Manager
    provider   string
    id         string
    closed     chan struct{}
    closeOnce  sync.Once
    writeMutex sync.Mutex
    pending    sync.Map // map[string]*pendingRequest - request ID -> response channel
}

// Heartbeat using ping/pong frames
func (s *session) startHeartbeat() {
    ticker := time.NewTicker(heartbeatInterval)
    go func() {
        defer ticker.Stop()
        for {
            select {
            case <-s.closed:
                return
            case <-ticker.C:
                s.writeMutex.Lock()
                err := s.conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(writeTimeout))
                s.writeMutex.Unlock()
                if err != nil {
                    s.cleanup(err)
                    return
                }
            }
        }
    }()
}

// Message dispatch with terminal message detection
func (s *session) dispatch(msg Message) {
    if msg.Type == MessageTypePing {
        _ = s.send(context.Background(), Message{ID: msg.ID, Type: MessageTypePong})
        return
    }

    if value, ok := s.pending.Load(msg.ID); ok {
        req := value.(*pendingRequest)
        select {
        case req.ch <- msg:
        default:  // Channel full - drop message
        }

        // Terminal message types - clean up pending request
        if msg.Type == MessageTypeHTTPResp || msg.Type == MessageTypeError || msg.Type == MessageTypeStreamEnd {
            if actual, loaded := s.pending.LoadAndDelete(msg.ID); loaded {
                actual.(*pendingRequest).close()
            }
        }
    }
}

// Request with automatic cleanup on context cancellation
func (s *session) request(ctx context.Context, msg Message) (<-chan Message, error) {
    if msg.ID == "" {
        return nil, fmt.Errorf("wsrelay: message id is required")
    }

    // Prevent duplicate pending requests
    if _, loaded := s.pending.LoadOrStore(msg.ID, &pendingRequest{ch: make(chan Message, 8)}); loaded {
        return nil, fmt.Errorf("wsrelay: duplicate message id %s", msg.ID)
    }

    value, _ := s.pending.Load(msg.ID)
    req := value.(*pendingRequest)

    if err := s.send(ctx, msg); err != nil {
        s.pending.LoadAndDelete(msg.ID)
        req.close()
        return nil, err
    }

    // Cleanup on context cancellation or session close
    go func() {
        select {
        case <-ctx.Done():
            if actual, loaded := s.pending.LoadAndDelete(msg.ID); loaded {
                actual.(*pendingRequest).close()
            }
        case <-s.closed:
        }
    }()

    return req.ch, nil
}

// Cleanup sends error to all pending requests
func (s *session) cleanup(cause error) {
    s.closeOnce.Do(func() {
        close(s.closed)
        // Send error to all pending requests
        s.pending.Range(func(key, value any) bool {
            req := value.(*pendingRequest)
            msg := Message{ID: key.(string), Type: MessageTypeError, Payload: map[string]any{"error": cause.Error()}}
            select {
            case req.ch <- msg:
            default:
            }
            req.close()
            return true
        })
        s.pending = sync.Map{}  // Clear all pending
        _ = s.conn.Close()
        if s.manager != nil {
            s.manager.handleSessionClosed(s, cause)
        }
    })
}
```

**Why This Matters**: Complete request/response correlation over WebSocket with proper lifecycle management and error propagation.

---

### 4.54 WebSocket Message Types Protocol (CLIProxyAPI - Go)

**Pattern**: Simple message type enumeration for WebSocket RPC-style communication.

```go
// internal/wsrelay/message.go (28 lines)
type Message struct {
    ID      string         `json:"id"`
    Type    string         `json:"type"`
    Payload map[string]any `json:"payload,omitempty"`
}

const (
    // Request/Response lifecycle
    MessageTypeHTTPReq     = "http_request"    // Request to forward
    MessageTypeHTTPResp    = "http_response"   // Non-streaming response (terminal)

    // Streaming lifecycle
    MessageTypeStreamStart = "stream_start"    // Streaming begins
    MessageTypeStreamChunk = "stream_chunk"    // Streaming data
    MessageTypeStreamEnd   = "stream_end"      // Streaming complete (terminal)

    // Error and health
    MessageTypeError       = "error"           // Error response (terminal)
    MessageTypePing        = "ping"            // Health check
    MessageTypePong        = "pong"            // Health check response
)
```

**Why This Matters**: Simple, extensible protocol for WebSocket-based API forwarding with clear terminal message semantics.

---

### 4.55 Antigravity Executor with Base URL Fallback (CLIProxyAPI - Go)

**Pattern**: Full executor implementation with multi-endpoint fallback and stream aggregation for non-streaming responses.

```go
// internal/runtime/executor/antigravity_executor.go (1525+ lines)
const (
    antigravityBaseURLDaily        = "https://daily-cloudcode-pa.googleapis.com"
    antigravitySandboxBaseURLDaily = "https://daily-cloudcode-pa.sandbox.googleapis.com"
    antigravityBaseURLProd         = "https://cloudcode-pa.googleapis.com"
    antigravityCountTokensPath     = "/v1internal:countTokens"
    antigravityStreamPath          = "/v1internal:streamGenerateContent"
    antigravityGeneratePath        = "/v1internal:generateContent"
    antigravityModelsPath          = "/v1internal:fetchAvailableModels"
    antigravityClientID            = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
    antigravityClientSecret        = "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"
    refreshSkew                    = 3000 * time.Second  // Refresh 50 mins early
    systemInstruction              = "You are Antigravity, a powerful agentic AI coding assistant..."
)

// Base URL fallback order - tries sandbox first, then daily, then prod
func antigravityBaseURLFallbackOrder(auth *cliproxyauth.Auth) []string {
    if base := resolveCustomAntigravityBaseURL(auth); base != "" {
        return []string{base}  // Custom override - single endpoint
    }
    return []string{
        antigravitySandboxBaseURLDaily,
        antigravityBaseURLDaily,
        antigravityBaseURLProd,
    }
}

// Execute with fallback loop
func (e *AntigravityExecutor) Execute(ctx context.Context, auth *cliproxyauth.Auth, req cliproxyexecutor.Request, opts cliproxyexecutor.Options) (resp cliproxyexecutor.Response, err error) {
    // Token refresh with skew
    token, updatedAuth, errToken := e.ensureAccessToken(ctx, auth)
    if errToken != nil {
        return resp, errToken
    }

    reporter := newUsageReporter(ctx, e.Identifier(), req.Model, auth)
    defer reporter.trackFailure(ctx, &err)

    // Translate request format
    from := opts.SourceFormat
    to := sdktranslator.FromString("antigravity")
    translated := sdktranslator.TranslateRequest(from, to, req.Model, bytes.Clone(req.Payload), false)

    // Apply thinking configuration
    translated = ApplyThinkingMetadataCLI(translated, req.Metadata, req.Model)
    translated = normalizeAntigravityThinking(req.Model, translated, isClaude)

    baseURLs := antigravityBaseURLFallbackOrder(auth)
    httpClient := newProxyAwareHTTPClient(ctx, e.cfg, auth, 0)

    var lastStatus int
    var lastBody []byte
    var lastErr error

    // Fallback loop - tries each base URL
    for idx, baseURL := range baseURLs {
        httpReq, errReq := e.buildRequest(ctx, auth, token, req.Model, translated, false, opts.Alt, baseURL)
        if errReq != nil {
            return resp, errReq
        }

        httpResp, errDo := httpClient.Do(httpReq)
        if errDo != nil {
            // Network error - try next endpoint
            if errors.Is(errDo, context.Canceled) || errors.Is(errDo, context.DeadlineExceeded) {
                return resp, errDo  // Don't retry context errors
            }
            lastErr = errDo
            if idx+1 < len(baseURLs) {
                log.Debugf("antigravity executor: request error, retrying with fallback: %s", baseURLs[idx+1])
                continue
            }
            return resp, errDo
        }

        // Check for rate limiting - try next endpoint
        if httpResp.StatusCode == http.StatusTooManyRequests && idx+1 < len(baseURLs) {
            log.Debugf("antigravity executor: rate limited, retrying with fallback: %s", baseURLs[idx+1])
            lastStatus = httpResp.StatusCode
            lastBody = bodyBytes
            continue
        }

        // Success or non-retryable error
        if httpResp.StatusCode >= 200 && httpResp.StatusCode < 300 {
            reporter.publish(ctx, parseAntigravityUsage(bodyBytes))
            var param any
            converted := sdktranslator.TranslateNonStream(ctx, to, from, req.Model, opts.OriginalRequest, translated, bodyBytes, &param)
            return cliproxyexecutor.Response{Payload: []byte(converted)}, nil
        }

        return resp, statusErr{code: httpResp.StatusCode, msg: string(bodyBytes)}
    }

    // All endpoints failed
    return resp, lastErr
}
```

**Why This Matters**: Complete executor implementation with multi-endpoint resilience and proper error handling.

---

### 4.56 Stream-to-NonStream Aggregation (CLIProxyAPI - Go)

**Pattern**: Aggregate streaming SSE chunks into single non-streaming response for Claude models.

```go
// internal/runtime/executor/antigravity_executor.go (stream aggregation)
// For Claude models that only support streaming, collect chunks and synthesize non-streaming response
func (e *AntigravityExecutor) executeClaudeNonStream(ctx context.Context, auth *cliproxyauth.Auth, req cliproxyexecutor.Request, opts cliproxyexecutor.Options) (resp cliproxyexecutor.Response, err error) {
    // ... same token/translation setup ...

    // Use streaming endpoint even for non-streaming request
    httpReq, errReq := e.buildRequest(ctx, auth, token, req.Model, translated, true, opts.Alt, baseURL)

    out := make(chan cliproxyexecutor.StreamChunk)
    go func(resp *http.Response) {
        defer close(out)
        defer resp.Body.Close()

        scanner := bufio.NewScanner(resp.Body)
        scanner.Buffer(nil, streamScannerBuffer)

        for scanner.Scan() {
            line := scanner.Bytes()
            line = FilterSSEUsageMetadata(line)  // Filter intermediate usage

            payload := jsonPayload(line)
            if payload == nil {
                continue
            }

            if detail, ok := parseAntigravityStreamUsage(payload); ok {
                reporter.publish(ctx, detail)
            }

            out <- cliproxyexecutor.StreamChunk{Payload: payload}
        }
    }(httpResp)

    // Aggregate all chunks into single buffer
    var buffer bytes.Buffer
    for chunk := range out {
        if chunk.Err != nil {
            return resp, chunk.Err
        }
        if len(chunk.Payload) > 0 {
            buffer.Write(chunk.Payload)
            buffer.Write([]byte("\n"))
        }
    }

    // Convert aggregated stream to non-stream format
    resp = cliproxyexecutor.Response{Payload: e.convertStreamToNonStream(buffer.Bytes())}

    // Translate back to original format
    var param any
    converted := sdktranslator.TranslateNonStream(ctx, to, from, req.Model, opts.OriginalRequest, translated, resp.Payload, &param)
    return cliproxyexecutor.Response{Payload: []byte(converted)}, nil
}

// Convert stream chunks to non-stream response
func (e *AntigravityExecutor) convertStreamToNonStream(stream []byte) []byte {
    responseTemplate := ""
    var traceID, finishReason, modelVersion, responseID, role, usageRaw string
    parts := make([]map[string]interface{}, 0)
    var pendingKind string
    var pendingText strings.Builder
    var pendingThoughtSig string

    flushPending := func() {
        if pendingKind == "" {
            return
        }
        text := pendingText.String()
        switch pendingKind {
        case "text":
            if strings.TrimSpace(text) != "" {
                parts = append(parts, map[string]interface{}{"text": text})
            }
        case "thought":
            part := map[string]interface{}{"thought": true, "text": text}
            if pendingThoughtSig != "" {
                part["thoughtSignature"] = pendingThoughtSig
            }
            parts = append(parts, part)
        }
        pendingKind = ""
        pendingText.Reset()
        pendingThoughtSig = ""
    }

    // Process each line (SSE data)
    for _, line := range bytes.Split(stream, []byte("\n")) {
        trimmed := bytes.TrimSpace(line)
        if len(trimmed) == 0 || !gjson.ValidBytes(trimmed) {
            continue
        }

        root := gjson.ParseBytes(trimmed)
        responseNode := root.Get("response")
        if !responseNode.Exists() {
            if root.Get("candidates").Exists() {
                responseNode = root
            } else {
                continue
            }
        }
        responseTemplate = responseNode.Raw

        // Extract metadata from chunks
        if traceResult := root.Get("traceId"); traceResult.Exists() {
            traceID = traceResult.String()
        }
        if roleResult := responseNode.Get("candidates.0.content.role"); roleResult.Exists() {
            role = roleResult.String()
        }
        if finishResult := responseNode.Get("candidates.0.finishReason"); finishResult.Exists() {
            finishReason = finishResult.String()
        }
        if usageResult := responseNode.Get("usageMetadata"); usageResult.Exists() {
            usageRaw = usageResult.Raw
        }

        // Aggregate parts - merge consecutive text/thought blocks
        if partsResult := responseNode.Get("candidates.0.content.parts"); partsResult.IsArray() {
            for _, part := range partsResult.Array() {
                thought := part.Get("thought").Bool()
                text := part.Get("text").String()
                sig := part.Get("thoughtSignature").String()

                kind := "text"
                if thought {
                    kind = "thought"
                }

                // Flush if kind changed
                if pendingKind != "" && pendingKind != kind {
                    flushPending()
                }

                pendingKind = kind
                pendingText.WriteString(text)
                if kind == "thought" && sig != "" {
                    pendingThoughtSig = sig
                }
            }
        }
    }
    flushPending()

    // Build final response
    partsJSON, _ := json.Marshal(parts)
    responseTemplate, _ = sjson.SetRaw(responseTemplate, "candidates.0.content.parts", string(partsJSON))
    if role != "" {
        responseTemplate, _ = sjson.Set(responseTemplate, "candidates.0.content.role", role)
    }
    if finishReason != "" {
        responseTemplate, _ = sjson.Set(responseTemplate, "candidates.0.finishReason", finishReason)
    }
    if usageRaw != "" {
        responseTemplate, _ = sjson.SetRaw(responseTemplate, "usageMetadata", usageRaw)
    }

    output := `{"response":{},"traceId":""}`
    output, _ = sjson.SetRaw(output, "response", responseTemplate)
    if traceID != "" {
        output, _ = sjson.Set(output, "traceId", traceID)
    }
    return []byte(output)
}
```

**Why This Matters**: Enables non-streaming API consumers to use streaming-only models by aggregating chunks.

---

### 4.57 Model Name Aliasing with Bidirectional Mapping (CLIProxyAPI - Go)

**Pattern**: Bidirectional model name mapping between external aliases and internal API names.

```go
// internal/runtime/executor/antigravity_executor.go (model mapping)
// External alias -> Internal API name
func alias2ModelName(modelName string) string {
    switch modelName {
    case "gemini-2.5-computer-use-preview-10-2025":
        return "rev19-uic3-1p"
    case "gemini-3-pro-image-preview":
        return "gemini-3-pro-image"
    case "gemini-3-pro-preview":
        return "gemini-3-pro-high"
    case "gemini-3-flash-preview":
        return "gemini-3-flash"
    case "gemini-claude-sonnet-4-5":
        return "claude-sonnet-4-5"
    case "gemini-claude-sonnet-4-5-thinking":
        return "claude-sonnet-4-5-thinking"
    case "gemini-claude-opus-4-5-thinking":
        return "claude-opus-4-5-thinking"
    default:
        return modelName  // Pass through unknown models
    }
}

// Internal API name -> External alias
func modelName2Alias(modelName string) string {
    switch modelName {
    case "rev19-uic3-1p":
        return "gemini-2.5-computer-use-preview-10-2025"
    case "gemini-3-pro-image":
        return "gemini-3-pro-image-preview"
    case "gemini-3-pro-high":
        return "gemini-3-pro-preview"
    case "gemini-3-flash":
        return "gemini-3-flash-preview"
    case "claude-sonnet-4-5":
        return "gemini-claude-sonnet-4-5"
    case "claude-sonnet-4-5-thinking":
        return "gemini-claude-sonnet-4-5-thinking"
    case "claude-opus-4-5-thinking":
        return "gemini-claude-opus-4-5-thinking"
    // Hidden/unsupported models return empty (filtered from model list)
    case "chat_20706", "chat_23310", "gemini-2.5-flash-thinking", "gemini-3-pro-low", "gemini-2.5-pro":
        return ""
    default:
        return modelName
    }
}

// Usage in request building
func (e *AntigravityExecutor) buildRequest(...) (*http.Request, error) {
    // ...
    payload = geminiToAntigravity(modelName, payload, projectID)
    payload, _ = sjson.SetBytes(payload, "model", alias2ModelName(modelName))  // Map to internal name
    // ...
}

// Usage in model listing
func FetchAntigravityModels(ctx context.Context, auth *cliproxyauth.Auth, cfg *config.Config) []*registry.ModelInfo {
    // ...
    for originalName := range result.Map() {
        aliasName := modelName2Alias(originalName)  // Map to external name
        if aliasName != "" {  // Filter hidden models
            models = append(models, &registry.ModelInfo{
                ID:   aliasName,
                Name: aliasName,
                // ...
            })
        }
    }
    return models
}
```

**Why This Matters**: Decouples external API model names from internal/upstream naming, enabling model renaming without breaking clients.

---

### 4.58 Gemini CLI Executor with Model Fallback (CLIProxyAPI - Go)

**Pattern**: Executor with automatic fallback to alternative model names on rate limiting.

```go
// internal/runtime/executor/gemini_cli_executor.go (600+ lines)
// Fallback order for CLI preview models
func cliPreviewFallbackOrder(model string) []string {
    // Returns list of equivalent models to try on 429
    // e.g., ["gemini-2.5-pro", "gemini-2.5-pro-preview", "gemini-2.5-pro-exp"]
    // Implementation depends on model naming conventions
}

func (e *GeminiCLIExecutor) Execute(ctx context.Context, auth *cliproxyauth.Auth, req cliproxyexecutor.Request, opts cliproxyexecutor.Options) (resp cliproxyexecutor.Response, err error) {
    // ... token source setup ...

    // Build model fallback list
    models := cliPreviewFallbackOrder(req.Model)
    if len(models) == 0 || models[0] != req.Model {
        models = append([]string{req.Model}, models...)  // Ensure requested model is first
    }

    var lastStatus int
    var lastBody []byte

    // Try each model in fallback order
    for idx, attemptModel := range models {
        payload := append([]byte(nil), basePayload...)
        payload = setJSONField(payload, "project", projectID)
        payload = setJSONField(payload, "model", attemptModel)

        tok, errTok := tokenSource.Token()
        if errTok != nil {
            return resp, errTok
        }

        url := fmt.Sprintf("%s/%s:%s", codeAssistEndpoint, codeAssistVersion, "generateContent")
        httpReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
        httpReq.Header.Set("Authorization", "Bearer "+tok.AccessToken)
        applyGeminiCLIHeaders(httpReq)

        httpResp, errDo := httpClient.Do(httpReq)
        if errDo != nil {
            return resp, errDo
        }

        data, _ := io.ReadAll(httpResp.Body)
        httpResp.Body.Close()

        if httpResp.StatusCode >= 200 && httpResp.StatusCode < 300 {
            // Success - translate and return
            reporter.publish(ctx, parseGeminiCLIUsage(data))
            var param any
            out := sdktranslator.TranslateNonStream(respCtx, to, from, attemptModel, opts.OriginalRequest, payload, data, &param)
            return cliproxyexecutor.Response{Payload: []byte(out)}, nil
        }

        lastStatus = httpResp.StatusCode
        lastBody = data

        // Rate limited - try next model in fallback list
        if httpResp.StatusCode == 429 {
            if idx+1 < len(models) {
                log.Debugf("gemini cli executor: rate limited, retrying with next model: %s", models[idx+1])
            }
            continue
        }

        // Non-429 error - return immediately
        return resp, newGeminiStatusErr(httpResp.StatusCode, data)
    }

    // All models rate limited
    if lastStatus == 0 {
        lastStatus = 429
    }
    return resp, newGeminiStatusErr(lastStatus, lastBody)
}
```

**Why This Matters**: Automatic fallback to equivalent models when rate limited, improving request success rate.

---

### 4.59 Token Expiry with Skew-Based Refresh (CLIProxyAPI - Go)

**Pattern**: Proactive token refresh with configurable skew to prevent expired token usage.

```go
// internal/runtime/executor/antigravity_executor.go (token management)
const refreshSkew = 3000 * time.Second  // 50 minutes - refresh before actual expiry

func (e *AntigravityExecutor) ensureAccessToken(ctx context.Context, auth *cliproxyauth.Auth) (string, *cliproxyauth.Auth, error) {
    if auth == nil {
        return "", nil, statusErr{code: http.StatusUnauthorized, msg: "missing auth"}
    }

    // Get current access token and expiry from metadata
    accessToken := metaStringValue(auth.Metadata, "access_token")
    expiry := tokenExpiry(auth.Metadata)

    // Check if token is still valid with skew buffer
    if accessToken != "" && expiry.After(time.Now().Add(refreshSkew)) {
        return accessToken, nil, nil  // Token still good
    }

    // Token expired or within skew buffer - refresh
    refreshCtx := context.Background()  // Use fresh context for refresh
    if ctx != nil {
        // Preserve round-tripper for proxy support
        if rt, ok := ctx.Value("cliproxy.roundtripper").(http.RoundTripper); ok && rt != nil {
            refreshCtx = context.WithValue(refreshCtx, "cliproxy.roundtripper", rt)
        }
    }

    updated, errRefresh := e.refreshToken(refreshCtx, auth.Clone())
    if errRefresh != nil {
        return "", nil, errRefresh
    }

    return metaStringValue(updated.Metadata, "access_token"), updated, nil
}

func tokenExpiry(metadata map[string]any) time.Time {
    if metadata == nil {
        return time.Time{}
    }

    // Try RFC3339 "expired" field first
    if expStr, ok := metadata["expired"].(string); ok {
        if parsed, err := time.Parse(time.RFC3339, expStr); err == nil {
            return parsed
        }
    }

    // Fall back to expires_in + timestamp calculation
    expiresIn, hasExpires := int64Value(metadata["expires_in"])
    tsMs, hasTimestamp := int64Value(metadata["timestamp"])
    if hasExpires && hasTimestamp {
        return time.Unix(0, tsMs*int64(time.Millisecond)).Add(time.Duration(expiresIn) * time.Second)
    }

    return time.Time{}  // Unknown expiry
}

func (e *AntigravityExecutor) refreshToken(ctx context.Context, auth *cliproxyauth.Auth) (*cliproxyauth.Auth, error) {
    refreshToken := metaStringValue(auth.Metadata, "refresh_token")
    if refreshToken == "" {
        return auth, statusErr{code: http.StatusUnauthorized, msg: "missing refresh token"}
    }

    // Standard OAuth2 token refresh
    form := url.Values{}
    form.Set("client_id", antigravityClientID)
    form.Set("client_secret", antigravityClientSecret)
    form.Set("grant_type", "refresh_token")
    form.Set("refresh_token", refreshToken)

    httpReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
    httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

    httpClient := newProxyAwareHTTPClient(ctx, e.cfg, auth, 0)
    httpResp, errDo := httpClient.Do(httpReq)
    // ...

    var tokenResp struct {
        AccessToken  string `json:"access_token"`
        RefreshToken string `json:"refresh_token"`
        ExpiresIn    int64  `json:"expires_in"`
    }
    json.Unmarshal(bodyBytes, &tokenResp)

    // Update auth metadata
    if auth.Metadata == nil {
        auth.Metadata = make(map[string]any)
    }
    auth.Metadata["access_token"] = tokenResp.AccessToken
    if tokenResp.RefreshToken != "" {
        auth.Metadata["refresh_token"] = tokenResp.RefreshToken  // Handle token rotation
    }
    auth.Metadata["expires_in"] = tokenResp.ExpiresIn
    auth.Metadata["timestamp"] = time.Now().UnixMilli()
    auth.Metadata["expired"] = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second).Format(time.RFC3339)
    auth.Metadata["type"] = antigravityAuthType

    return auth, nil
}
```

**Why This Matters**: Prevents request failures due to expired tokens by proactively refreshing before actual expiry.

---

### 4.60 Scenario-Based Smart Router (claude-code-router - TypeScript)

**Pattern**: Context-aware model routing based on token count thresholds, tool usage, and thinking mode.

```typescript
// packages/core/src/utils/router.ts (367 lines)
export type RouterScenarioType = "default" | "background" | "think" | "longContext" | "webSearch";

export interface RouterFallbackConfig {
  default?: string[];
  background?: string[];
  think?: string[];
  longContext?: string[];
  webSearch?: string[];
}

const getUseModel = async (req: any, tokenCount: number, configService: ConfigService, lastUsage?: Usage | undefined): Promise<{ model: string; scenarioType: RouterScenarioType }> => {
  const projectSpecificRouter = await getProjectSpecificRouter(req, configService);
  const Router = projectSpecificRouter || configService.get("Router");

  // Provider,model direct routing (bypass all logic)
  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    const finalProvider = providers.find((p: any) => p.name.toLowerCase() === provider);
    if (finalProvider) {
      return { model: `${finalProvider.name},${finalModel}`, scenarioType: "default" };
    }
  }

  // Long context threshold routing (60k tokens default)
  const longContextThreshold = Router?.longContextThreshold || 60000;
  const lastUsageThreshold = lastUsage && lastUsage.input_tokens > longContextThreshold && tokenCount > 20000;
  if ((lastUsageThreshold || tokenCount > longContextThreshold) && Router?.longContext) {
    req.log.info(`Using long context model due to token count: ${tokenCount}`);
    return { model: Router.longContext, scenarioType: "longContext" };
  }

  // Subagent model injection via system prompt tag
  if (req.body?.system?.[1]?.text?.startsWith("<CCR-SUBAGENT-MODEL>")) {
    const model = req.body.system[1].text.match(/<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s);
    if (model) {
      req.body.system[1].text = req.body.system[1].text.replace(`<CCR-SUBAGENT-MODEL>${model[1]}</CCR-SUBAGENT-MODEL>`, "");
      return { model: model[1], scenarioType: "default" };
    }
  }

  // Claude Haiku → background model routing
  if (req.body.model?.includes("claude") && req.body.model?.includes("haiku") && Router?.background) {
    return { model: Router.background, scenarioType: "background" };
  }

  // Web search tool routing (higher priority than thinking)
  if (Array.isArray(req.body.tools) && req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) && Router?.webSearch) {
    return { model: Router.webSearch, scenarioType: "webSearch" };
  }

  // Thinking mode routing
  if (req.body.thinking && Router?.think) {
    return { model: Router.think, scenarioType: "think" };
  }

  return { model: Router?.default, scenarioType: "default" };
};

export const router = async (req: any, _res: any, context: RouterContext) => {
  // Parse sessionId from metadata.user_id
  if (req.body.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1) {
      req.sessionId = parts[1];
    }
  }

  // Calculate token count (using TokenizerService or legacy tiktoken)
  let tokenCount: number;
  if (context.tokenizerService) {
    const result = await context.tokenizerService.countTokens({ messages, system, tools }, tokenizerConfig);
    tokenCount = result.tokenCount;
  } else {
    tokenCount = calculateTokenCount(messages, system, tools);
  }

  // Custom router support
  const customRouterPath = configService.get("CUSTOM_ROUTER_PATH");
  if (customRouterPath) {
    req.tokenCount = tokenCount;
    model = await require(customRouterPath)(req, configService.getAll(), { event });
  }

  if (!model) {
    const result = await getUseModel(req, tokenCount, configService, lastMessageUsage);
    model = result.model;
    req.scenarioType = result.scenarioType;
  }
  req.body.model = model;
};
```

**Why This Matters**: Intelligent model selection based on request characteristics, enabling cost optimization and capability matching.

---

### 4.61 Session-to-Project Mapping with LRU Cache (claude-code-router - TypeScript)

**Pattern**: Fast project lookup by session ID with memory-bounded caching.

```typescript
// packages/core/src/utils/router.ts (project discovery)
import { LRUCache } from "lru-cache";

// Cache with max 1000 entries - null value indicates previously searched but not found
const sessionProjectCache = new LRUCache<string, string>({
  max: 1000,
});

export const searchProjectBySession = async (sessionId: string): Promise<string | null> => {
  // Check cache first
  if (sessionProjectCache.has(sessionId)) {
    const result = sessionProjectCache.get(sessionId);
    if (!result || result === "") {
      return null; // Cached "not found" result
    }
    return result;
  }

  try {
    const dir = await opendir(CLAUDE_PROJECTS_DIR);
    const folderNames: string[] = [];

    // Collect all folder names
    for await (const dirent of dir) {
      if (dirent.isDirectory()) {
        folderNames.push(dirent.name);
      }
    }

    // Concurrently check each project folder for sessionId.jsonl file
    const checkPromises = folderNames.map(async (folderName) => {
      const sessionFilePath = join(CLAUDE_PROJECTS_DIR, folderName, `${sessionId}.jsonl`);
      try {
        const fileStat = await stat(sessionFilePath);
        return fileStat.isFile() ? folderName : null;
      } catch {
        return null; // File does not exist
      }
    });

    const results = await Promise.all(checkPromises);

    // Return first match and cache it
    for (const result of results) {
      if (result) {
        sessionProjectCache.set(sessionId, result);
        return result;
      }
    }

    // Cache "not found" result (empty string)
    sessionProjectCache.set(sessionId, "");
    return null;
  } catch (error) {
    // Cache null result on error
    sessionProjectCache.set(sessionId, "");
    return null;
  }
};

// Project-specific router config
const getProjectSpecificRouter = async (req: any, configService: ConfigService) => {
  if (req.sessionId) {
    const project = await searchProjectBySession(req.sessionId);
    if (project) {
      const sessionConfigPath = join(HOME_DIR, project, `${req.sessionId}.json`);
      const projectConfigPath = join(HOME_DIR, project, "config.json");

      // Session config takes priority over project config
      try {
        const sessionConfig = JSON.parse(await readFile(sessionConfigPath, "utf8"));
        if (sessionConfig?.Router) return sessionConfig.Router;
      } catch {}
      try {
        const projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8"));
        if (projectConfig?.Router) return projectConfig.Router;
      } catch {}
    }
  }
  return undefined; // Fall back to global config
};
```

**Why This Matters**: Enables per-project and per-session model configuration with efficient caching.

---

### 4.62 Thinking Budget to Level Mapping (claude-code-router - TypeScript)

**Pattern**: Simple tiered mapping from numeric budget to semantic thinking level.

```typescript
// packages/core/src/utils/thinking.ts (9 lines)
import { ThinkLevel } from "@/types/llm";

export const getThinkLevel = (thinking_budget: number): ThinkLevel => {
  if (thinking_budget <= 0) return "none";
  if (thinking_budget <= 1024) return "low";
  if (thinking_budget <= 8192) return "medium";
  return "high";
};

// Usage in anthropic.transformer.ts
if (request.thinking) {
  result.reasoning = {
    effort: getThinkLevel(request.thinking.budget_tokens), // "low"|"medium"|"high"
    enabled: request.thinking.type === "enabled",
  };
}
```

**Why This Matters**: Bridges Anthropic's numeric thinking budget to providers using semantic effort levels.

---

### 4.63 Bidirectional Anthropic Transformer (claude-code-router - TypeScript)

**Pattern**: Full round-trip conversion between Anthropic and OpenAI/unified format for both streaming and non-streaming.

```typescript
// packages/core/src/transformer/anthropic.transformer.ts (1070 lines)
export class AnthropicTransformer implements Transformer {
  name = "Anthropic";
  endPoint = "/v1/messages";

  // Outbound: Convert Anthropic request to unified format
  async transformRequestOut(request: Record<string, any>): Promise<UnifiedChatRequest> {
    const messages: UnifiedMessage[] = [];

    // Convert system prompt (string or array)
    if (typeof request.system === "string") {
      messages.push({ role: "system", content: request.system });
    } else if (Array.isArray(request.system)) {
      const textParts = request.system
        .filter((item) => item.type === "text" && item.text)
        .map((item) => ({ type: "text", text: item.text, cache_control: item.cache_control }));
      messages.push({ role: "system", content: textParts });
    }

    // Convert messages with tool_use/tool_result handling
    requestMessages?.forEach((msg: any) => {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        // Extract tool_result parts as separate tool messages
        const toolParts = msg.content.filter((c) => c.type === "tool_result" && c.tool_use_id);
        toolParts.forEach((tool) => {
          messages.push({
            role: "tool",
            content: typeof tool.content === "string" ? tool.content : JSON.stringify(tool.content),
            tool_call_id: tool.tool_use_id,
            cache_control: tool.cache_control,
          });
        });
      }

      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const assistantMessage: UnifiedMessage = { role: "assistant", content: "" };

        // Merge text parts
        const textParts = msg.content.filter((c) => c.type === "text");
        assistantMessage.content = textParts.map((t) => t.text).join("\n");

        // Convert tool_use to tool_calls
        const toolCallParts = msg.content.filter((c) => c.type === "tool_use");
        if (toolCallParts.length) {
          assistantMessage.tool_calls = toolCallParts.map((tool) => ({
            id: tool.id,
            type: "function",
            function: { name: tool.name, arguments: JSON.stringify(tool.input || {}) },
          }));
        }

        // Extract thinking block
        const thinkingPart = msg.content.find((c) => c.type === "thinking" && c.signature);
        if (thinkingPart) {
          assistantMessage.thinking = { content: thinkingPart.thinking, signature: thinkingPart.signature };
        }

        messages.push(assistantMessage);
      }
    });

    return { messages, model: request.model, .../* other fields */ };
  }

  // Inbound: Convert OpenAI response to Anthropic format
  async transformResponseIn(response: Response, context?: TransformerContext): Promise<Response> {
    const isStream = response.headers.get("Content-Type")?.includes("text/event-stream");
    if (isStream) {
      const convertedStream = await this.convertOpenAIStreamToAnthropic(response.body, context!);
      return new Response(convertedStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    } else {
      const data = await response.json();
      const anthropicResponse = this.convertOpenAIResponseToAnthropic(data, context!);
      return new Response(JSON.stringify(anthropicResponse), { headers: { "Content-Type": "application/json" } });
    }
  }
}
```

**Why This Matters**: Complete bidirectional conversion enabling Anthropic clients to use any OpenAI-compatible backend.

---

### 4.64 OpenAI-to-Anthropic Stream Conversion (claude-code-router - TypeScript)

**Pattern**: Real-time stream format conversion with content block index management.

```typescript
// packages/core/src/transformer/anthropic.transformer.ts (stream conversion)
private async convertOpenAIStreamToAnthropic(openaiStream: ReadableStream, context: TransformerContext): Promise<ReadableStream> {
  const readable = new ReadableStream({
    start: async (controller) => {
      const encoder = new TextEncoder();
      const messageId = `msg_${Date.now()}`;
      let hasStarted = false;
      let hasTextContentStarted = false;
      let isThinkingStarted = false;
      let contentIndex = 0;
      let currentContentBlockIndex = -1;
      const toolCallIndexToContentBlockIndex = new Map<number, number>();

      // Atomic content block index allocation
      const assignContentBlockIndex = (): number => contentIndex++;

      const safeEnqueue = (data: Uint8Array) => {
        if (!isClosed) {
          controller.enqueue(data);
        }
      };

      // Process OpenAI chunks
      for (const chunk of openaiChunks) {
        // Send message_start on first chunk
        if (!hasStarted) {
          hasStarted = true;
          const messageStart = {
            type: "message_start",
            message: { id: messageId, type: "message", role: "assistant", content: [], model, stop_reason: null },
          };
          safeEnqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`));
        }

        // Handle thinking content (OpenAI format)
        if (choice?.delta?.thinking) {
          if (!isThinkingStarted) {
            const thinkingBlockIndex = assignContentBlockIndex();
            safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
              type: "content_block_start",
              index: thinkingBlockIndex,
              content_block: { type: "thinking", thinking: "" },
            })}\n\n`));
            currentContentBlockIndex = thinkingBlockIndex;
            isThinkingStarted = true;
          }

          if (choice.delta.thinking.signature) {
            // Signature delta + content block stop
            safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
              type: "content_block_delta",
              index: currentContentBlockIndex,
              delta: { type: "signature_delta", signature: choice.delta.thinking.signature },
            })}\n\n`));
            safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({
              type: "content_block_stop",
              index: currentContentBlockIndex,
            })}\n\n`));
            currentContentBlockIndex = -1;
          } else if (choice.delta.thinking.content) {
            safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
              type: "content_block_delta",
              index: currentContentBlockIndex,
              delta: { type: "thinking_delta", thinking: choice.delta.thinking.content },
            })}\n\n`));
          }
        }

        // Handle text content
        if (choice?.delta?.content) {
          if (!hasTextContentStarted) {
            hasTextContentStarted = true;
            const textBlockIndex = assignContentBlockIndex();
            safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
              type: "content_block_start",
              index: textBlockIndex,
              content_block: { type: "text", text: "" },
            })}\n\n`));
            currentContentBlockIndex = textBlockIndex;
          }

          safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: currentContentBlockIndex,
            delta: { type: "text_delta", text: choice.delta.content },
          })}\n\n`));
        }

        // Handle tool calls
        if (choice?.delta?.tool_calls) {
          for (const toolCall of choice.delta.tool_calls) {
            const toolCallIndex = toolCall.index ?? 0;
            const isNewToolCall = !toolCallIndexToContentBlockIndex.has(toolCallIndex);

            if (isNewToolCall) {
              // Close any previous block, start new tool_use block
              const newContentBlockIndex = assignContentBlockIndex();
              toolCallIndexToContentBlockIndex.set(toolCallIndex, newContentBlockIndex);
              safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
                type: "content_block_start",
                index: newContentBlockIndex,
                content_block: { type: "tool_use", id: toolCall.id, name: toolCall.function?.name, input: {} },
              })}\n\n`));
            }

            if (toolCall.function?.arguments) {
              const blockIndex = toolCallIndexToContentBlockIndex.get(toolCallIndex)!;
              safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
                type: "content_block_delta",
                index: blockIndex,
                delta: { type: "input_json_delta", partial_json: toolCall.function.arguments },
              })}\n\n`));
            }
          }
        }

        // Finish reason mapping
        if (choice?.finish_reason) {
          const stopReasonMapping = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use" };
          // Send message_delta with mapped stop_reason + usage
        }
      }
    },
  });

  return readable;
}
```

**Why This Matters**: Complete streaming format translation enabling real-time Anthropic clients to use OpenAI backends.

---

### 4.65 Gemini Request Builder with Thinking Config (claude-code-router - TypeScript)

**Pattern**: Unified request conversion to Gemini format with thinking budget and tool handling.

```typescript
// packages/core/src/utils/gemini.util.ts (1045 lines)
export function buildRequestBody(request: UnifiedChatRequest): Record<string, any> {
  const tools = [];

  // Convert tools to Gemini functionDeclarations
  const functionDeclarations = request.tools
    ?.filter((tool) => tool.function.name !== "web_search")
    ?.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parametersJsonSchema: tool.function.parameters, // Use JSON Schema directly
    }));
  if (functionDeclarations?.length) {
    tools.push(tTool({ functionDeclarations }));
  }

  // Handle web_search as Google Search tool
  const webSearch = request.tools?.find((tool) => tool.function.name === "web_search");
  if (webSearch) {
    tools.push({ googleSearch: {} });
  }

  // Convert messages to Gemini contents
  const contents: any[] = [];
  const toolResponses = request.messages.filter((item) => item.role === "tool");

  request.messages
    .filter((item) => item.role !== "tool")
    .forEach((message) => {
      const role = message.role === "assistant" ? "model" : "user";
      const parts = [];

      // Handle thinking signature preservation
      if (typeof message.content === "string") {
        const part: any = { text: message.content };
        if (message?.thinking?.signature) {
          part.thoughtSignature = message.thinking.signature;
        }
        parts.push(part);
      }

      // Handle tool_calls as functionCall parts
      if (Array.isArray(message.tool_calls)) {
        parts.push(
          ...message.tool_calls.map((toolCall, index) => ({
            functionCall: {
              id: toolCall.id || `tool_${Math.random().toString(36).substring(2, 15)}`,
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments || "{}"),
            },
            thoughtSignature: index === 0 && message.thinking?.signature ? message.thinking.signature : undefined,
          })),
        );
      }

      contents.push({ role, parts });

      // Add function responses after model message with tool_calls
      if (role === "model" && message.tool_calls) {
        const functionResponses = message.tool_calls.map((tool) => {
          const response = toolResponses.find((item) => item.tool_call_id === tool.id);
          return {
            functionResponse: {
              name: tool.function?.name,
              response: { result: response?.content },
            },
          };
        });
        contents.push({ role: "user", parts: functionResponses });
      }
    });

  // Generation config with thinking
  const generationConfig: any = {};
  if (request.reasoning?.effort && request.reasoning.effort !== "none") {
    generationConfig.thinkingConfig = { includeThoughts: true };

    // Gemini 3 uses semantic levels
    if (request.model.includes("gemini-3")) {
      generationConfig.thinkingConfig.thinkingLevel = request.reasoning.effort; // "low"|"medium"|"high"
    } else {
      // Older models use numeric budgets
      const thinkingBudgets = request.model.includes("pro") ? [128, 32768] : [0, 24576];
      if (request.reasoning.max_tokens) {
        generationConfig.thinkingConfig.thinkingBudget = Math.min(Math.max(request.reasoning.max_tokens, thinkingBudgets[0]), thinkingBudgets[1]);
      }
    }
  }

  return {
    contents,
    tools: tools.length ? tools : undefined,
    generationConfig,
    toolConfig: request.tool_choice ? buildToolConfig(request.tool_choice) : undefined,
  };
}
```

**Why This Matters**: Complete unified-to-Gemini conversion including thinking configuration and tool handling.

---

### 4.66 JSON Schema Cleanup for Gemini API (claude-code-router - TypeScript)

**Pattern**: Recursive schema sanitization to remove unsupported fields.

```typescript
// packages/core/src/utils/gemini.util.ts (schema processing)
export function cleanupParameters(obj: any, keyName?: string): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    obj.forEach((item) => cleanupParameters(item));
    return;
  }

  // Whitelist of valid Gemini schema fields
  const validFields = new Set(["type", "format", "title", "description", "nullable", "enum", "maxItems", "minItems", "properties", "required", "minProperties", "maxProperties", "minLength", "maxLength", "pattern", "example", "anyOf", "propertyOrdering", "default", "items", "minimum", "maximum"]);

  // Remove unsupported fields (except in "properties" container)
  if (keyName !== "properties") {
    Object.keys(obj).forEach((key) => {
      if (!validFields.has(key)) {
        delete obj[key];
      }
    });
  }

  // Remove enum from non-string types
  if (obj.enum && obj.type !== "string") {
    delete obj.enum;
  }

  // Remove unsupported format values
  if (obj.type === "string" && obj.format && !["enum", "date-time"].includes(obj.format)) {
    delete obj.format;
  }

  // Recurse into nested structures
  Object.keys(obj).forEach((key) => cleanupParameters(obj[key], key));
}

// Type array to anyOf transformation
function flattenTypeArrayToAnyOf(typeList: Array<string>, resultingSchema: any): void {
  if (typeList.includes("null")) {
    resultingSchema["nullable"] = true;
  }
  const listWithoutNull = typeList.filter((type) => type !== "null");

  if (listWithoutNull.length === 1) {
    resultingSchema["type"] = listWithoutNull[0].toUpperCase();
  } else {
    resultingSchema["anyOf"] = listWithoutNull.map((t) => ({ type: t.toUpperCase() }));
  }
}

// Full JSON Schema to Gemini Schema conversion
function processJsonSchema(_jsonSchema: any): any {
  const genAISchema = {};

  // Handle nullable union: {anyOf: [{type: 'null'}, {type: 'object'}]}
  const incomingAnyOf = _jsonSchema["anyOf"];
  if (Array.isArray(incomingAnyOf) && incomingAnyOf.length === 2) {
    if (incomingAnyOf[0]?.["type"] === "null") {
      genAISchema["nullable"] = true;
      _jsonSchema = incomingAnyOf[1];
    } else if (incomingAnyOf[1]?.["type"] === "null") {
      genAISchema["nullable"] = true;
      _jsonSchema = incomingAnyOf[0];
    }
  }

  // Handle type arrays
  if (Array.isArray(_jsonSchema["type"])) {
    flattenTypeArrayToAnyOf(_jsonSchema["type"], genAISchema);
  }

  // Skip additionalProperties (not supported)
  // Recursively process items, anyOf, properties

  return genAISchema;
}
```

**Why This Matters**: Ensures tool schemas are compatible with Gemini API's stricter requirements.

---

### 4.67 Model Aliasing with Provider Preference (claude-code-proxy - Python)

**Pattern**: Pydantic field validator with environment-based model aliasing and provider prefix injection.

```python
# claude-code-proxy/server.py (model validation via Pydantic)

# Environment-based configuration
PREFERRED_PROVIDER = os.environ.get("PREFERRED_PROVIDER", "openai").lower()
BIG_MODEL = os.environ.get("BIG_MODEL", "gpt-4.1")
SMALL_MODEL = os.environ.get("SMALL_MODEL", "gpt-4.1-mini")

OPENAI_MODELS = ["o3-mini", "o1", "o1-mini", "gpt-4.5-preview", "gpt-4o", "gpt-4.1", "gpt-4.1-mini"]
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"]

class MessagesRequest(BaseModel):
    model: str
    max_tokens: int
    messages: List[Message]
    original_model: Optional[str] = None  # Store original for logging

    @field_validator('model')
    def validate_model_field(cls, v, info):
        original_model = v
        new_model = v

        # Strip existing provider prefixes for matching
        clean_v = v
        if clean_v.startswith('anthropic/'):
            clean_v = clean_v[10:]
        elif clean_v.startswith('openai/'):
            clean_v = clean_v[7:]
        elif clean_v.startswith('gemini/'):
            clean_v = clean_v[7:]

        # Model aliasing based on provider preference
        if PREFERRED_PROVIDER == "anthropic":
            new_model = f"anthropic/{clean_v}"

        # Haiku → SMALL_MODEL with provider prefix
        elif 'haiku' in clean_v.lower():
            if PREFERRED_PROVIDER == "google" and SMALL_MODEL in GEMINI_MODELS:
                new_model = f"gemini/{SMALL_MODEL}"
            else:
                new_model = f"openai/{SMALL_MODEL}"

        # Sonnet → BIG_MODEL with provider prefix
        elif 'sonnet' in clean_v.lower():
            if PREFERRED_PROVIDER == "google" and BIG_MODEL in GEMINI_MODELS:
                new_model = f"gemini/{BIG_MODEL}"
            else:
                new_model = f"openai/{BIG_MODEL}"

        # Add prefix to known models
        elif clean_v in GEMINI_MODELS and not v.startswith('gemini/'):
            new_model = f"gemini/{clean_v}"
        elif clean_v in OPENAI_MODELS and not v.startswith('openai/'):
            new_model = f"openai/{clean_v}"

        # Store original in context for logging
        values = info.data
        if isinstance(values, dict):
            values['original_model'] = original_model

        return new_model
```

**Why This Matters**: Declarative model aliasing via Pydantic validators, enabling flexible model mapping at request validation time.

---

### 4.68 Anthropic-to-LiteLLM Request Conversion (claude-code-proxy - Python)

**Pattern**: Full format conversion from Anthropic API to LiteLLM/OpenAI format with special handling for tool results.

```python
# claude-code-proxy/server.py (request conversion)
def convert_anthropic_to_litellm(anthropic_request: MessagesRequest) -> Dict[str, Any]:
    """Convert Anthropic API request format to LiteLLM format (OpenAI-compatible)."""
    messages = []

    # Handle system prompt (string or list of content blocks)
    if anthropic_request.system:
        if isinstance(anthropic_request.system, str):
            messages.append({"role": "system", "content": anthropic_request.system})
        elif isinstance(anthropic_request.system, list):
            system_text = ""
            for block in anthropic_request.system:
                if hasattr(block, 'type') and block.type == "text":
                    system_text += block.text + "\n\n"
                elif isinstance(block, dict) and block.get("type") == "text":
                    system_text += block.get("text", "") + "\n\n"
            if system_text:
                messages.append({"role": "system", "content": system_text.strip()})

    # Convert conversation messages
    for msg in anthropic_request.messages:
        content = msg.content
        if isinstance(content, str):
            messages.append({"role": msg.role, "content": content})
        else:
            # Special handling for tool_result in user messages
            # OpenAI expects tool results as plain text in user messages
            if msg.role == "user" and any(
                block.type == "tool_result" for block in content if hasattr(block, "type")
            ):
                text_content = ""
                for block in content:
                    if hasattr(block, "type"):
                        if block.type == "text":
                            text_content += block.text + "\n"
                        elif block.type == "tool_result":
                            tool_id = block.tool_use_id if hasattr(block, "tool_use_id") else ""
                            result_content = parse_tool_result_content(block.content)
                            text_content += f"Tool result for {tool_id}:\n{result_content}\n"
                messages.append({"role": "user", "content": text_content.strip()})
            else:
                # Standard content block handling
                processed_content = []
                for block in content:
                    if hasattr(block, "type"):
                        if block.type == "text":
                            processed_content.append({"type": "text", "text": block.text})
                        elif block.type == "image":
                            processed_content.append({"type": "image", "source": block.source})
                        elif block.type == "tool_use":
                            processed_content.append({
                                "type": "tool_use", "id": block.id,
                                "name": block.name, "input": block.input
                            })
                messages.append({"role": msg.role, "content": processed_content})

    # Cap max_tokens for OpenAI/Gemini models
    max_tokens = anthropic_request.max_tokens
    if anthropic_request.model.startswith(("openai/", "gemini/")):
        max_tokens = min(max_tokens, 16384)

    litellm_request = {
        "model": anthropic_request.model,
        "messages": messages,
        "max_completion_tokens": max_tokens,
        "temperature": anthropic_request.temperature,
        "stream": anthropic_request.stream,
    }

    # Convert tools to OpenAI format with Gemini schema cleaning
    if anthropic_request.tools:
        openai_tools = []
        is_gemini = anthropic_request.model.startswith("gemini/")

        for tool in anthropic_request.tools:
            tool_dict = tool.dict() if hasattr(tool, 'dict') else dict(tool)
            input_schema = tool_dict.get("input_schema", {})

            if is_gemini:
                input_schema = clean_gemini_schema(input_schema)

            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool_dict["name"],
                    "description": tool_dict.get("description", ""),
                    "parameters": input_schema
                }
            })
        litellm_request["tools"] = openai_tools

    # Convert tool_choice format
    if anthropic_request.tool_choice:
        tc = anthropic_request.tool_choice
        choice_type = tc.get("type")
        if choice_type == "auto":
            litellm_request["tool_choice"] = "auto"
        elif choice_type == "any":
            litellm_request["tool_choice"] = "any"
        elif choice_type == "tool" and "name" in tc:
            litellm_request["tool_choice"] = {
                "type": "function", "function": {"name": tc["name"]}
            }

    return litellm_request
```

**Why This Matters**: Complete request format translation enabling Anthropic clients to use LiteLLM's multi-provider backend.

---

### 4.69 Gemini Schema Cleaning (claude-code-proxy - Python)

**Pattern**: Recursive removal of unsupported JSON Schema fields for Gemini API compatibility.

```python
# claude-code-proxy/server.py (Gemini schema sanitization)
def clean_gemini_schema(schema: Any) -> Any:
    """Recursively removes unsupported fields from a JSON schema for Gemini."""
    if isinstance(schema, dict):
        # Remove specific keys unsupported by Gemini tool parameters
        schema.pop("additionalProperties", None)
        schema.pop("default", None)

        # Check for unsupported 'format' in string types
        if schema.get("type") == "string" and "format" in schema:
            allowed_formats = {"enum", "date-time"}
            if schema["format"] not in allowed_formats:
                logger.debug(f"Removing unsupported format '{schema['format']}' for string type")
                schema.pop("format")

        # Recursively clean nested schemas (properties, items, etc.)
        for key, value in list(schema.items()):  # list() allows modification during iteration
            schema[key] = clean_gemini_schema(value)

    elif isinstance(schema, list):
        # Recursively clean items in a list
        return [clean_gemini_schema(item) for item in schema]

    return schema
```

**Why This Matters**: Ensures tool definitions work with Gemini's stricter schema requirements without manual adjustment.

---

### 4.70 LiteLLM-to-Anthropic Response Conversion (claude-code-proxy - Python)

**Pattern**: Converting LiteLLM (OpenAI format) responses to Anthropic format with tool call handling.

```python
# claude-code-proxy/server.py (response conversion)
def convert_litellm_to_anthropic(litellm_response: Union[Dict[str, Any], Any],
                                 original_request: MessagesRequest) -> MessagesResponse:
    """Convert LiteLLM (OpenAI format) response to Anthropic API response format."""
    try:
        # Handle ModelResponse object from LiteLLM
        if hasattr(litellm_response, 'choices') and hasattr(litellm_response, 'usage'):
            choices = litellm_response.choices
            message = choices[0].message if choices else None
            content_text = message.content if message else ""
            tool_calls = message.tool_calls if message else None
            finish_reason = choices[0].finish_reason if choices else "stop"
            usage_info = litellm_response.usage
            response_id = getattr(litellm_response, 'id', f"msg_{uuid.uuid4()}")
        else:
            # Handle dict responses (backward compatibility)
            response_dict = litellm_response if isinstance(litellm_response, dict) else litellm_response.dict()
            choices = response_dict.get("choices", [{}])
            message = choices[0].get("message", {}) if choices else {}
            content_text = message.get("content", "")
            tool_calls = message.get("tool_calls", None)
            finish_reason = choices[0].get("finish_reason", "stop") if choices else "stop"
            usage_info = response_dict.get("usage", {})
            response_id = response_dict.get("id", f"msg_{uuid.uuid4()}")

        # Check if this is a Claude model (supports content blocks)
        clean_model = original_request.model
        if clean_model.startswith("anthropic/"):
            clean_model = clean_model[len("anthropic/"):]
        is_claude_model = clean_model.startswith("claude-")

        # Build content list
        content = []
        if content_text:
            content.append({"type": "text", "text": content_text})

        # Convert tool calls to Anthropic format (tool_use blocks)
        if tool_calls and is_claude_model:
            if not isinstance(tool_calls, list):
                tool_calls = [tool_calls]

            for tool_call in tool_calls:
                if isinstance(tool_call, dict):
                    function = tool_call.get("function", {})
                    tool_id = tool_call.get("id", f"tool_{uuid.uuid4()}")
                    name = function.get("name", "")
                    arguments = function.get("arguments", "{}")
                else:
                    function = getattr(tool_call, "function", None)
                    tool_id = getattr(tool_call, "id", f"tool_{uuid.uuid4()}")
                    name = getattr(function, "name", "") if function else ""
                    arguments = getattr(function, "arguments", "{}") if function else "{}"

                # Parse arguments from JSON string
                if isinstance(arguments, str):
                    try:
                        arguments = json.loads(arguments)
                    except json.JSONDecodeError:
                        arguments = {"raw": arguments}

                content.append({
                    "type": "tool_use",
                    "id": tool_id,
                    "name": name,
                    "input": arguments
                })

        elif tool_calls and not is_claude_model:
            # For non-Claude models, convert tool calls to text format
            tool_text = "\n\nTool usage:\n"
            for tool_call in (tool_calls if isinstance(tool_calls, list) else [tool_calls]):
                # Extract function info...
                tool_text += f"Tool: {name}\nArguments: {arguments_str}\n\n"

            if content and content[0]["type"] == "text":
                content[0]["text"] += tool_text
            else:
                content.append({"type": "text", "text": tool_text})

        # Map OpenAI finish_reason to Anthropic stop_reason
        stop_reason_map = {
            "stop": "end_turn",
            "length": "max_tokens",
            "tool_calls": "tool_use"
        }
        stop_reason = stop_reason_map.get(finish_reason, "end_turn")

        # Ensure content is never empty
        if not content:
            content.append({"type": "text", "text": ""})

        return MessagesResponse(
            id=response_id,
            model=original_request.model,
            role="assistant",
            content=content,
            stop_reason=stop_reason,
            stop_sequence=None,
            usage=Usage(
                input_tokens=usage_info.prompt_tokens if hasattr(usage_info, 'prompt_tokens') else usage_info.get("prompt_tokens", 0),
                output_tokens=usage_info.completion_tokens if hasattr(usage_info, 'completion_tokens') else usage_info.get("completion_tokens", 0)
            )
        )
    except Exception as e:
        # Fallback response on error
        return MessagesResponse(
            id=f"msg_{uuid.uuid4()}", model=original_request.model, role="assistant",
            content=[{"type": "text", "text": f"Error converting response: {str(e)}"}],
            stop_reason="end_turn", usage=Usage(input_tokens=0, output_tokens=0)
        )
```

**Why This Matters**: Enables Anthropic clients to consume responses from any LiteLLM-supported backend.

---

### 4.71 Streaming SSE Handler with Tool Call Support (claude-code-proxy - Python)

**Pattern**: Async generator converting LiteLLM streaming to Anthropic SSE format with proper content block management.

```python
# claude-code-proxy/server.py (streaming handler)
async def handle_streaming(response_generator, original_request: MessagesRequest):
    """Handle streaming responses from LiteLLM and convert to Anthropic format."""
    try:
        message_id = f"msg_{uuid.uuid4().hex[:24]}"

        # Send message_start event
        message_data = {
            'type': 'message_start',
            'message': {
                'id': message_id, 'type': 'message', 'role': 'assistant',
                'model': original_request.model, 'content': [],
                'stop_reason': None, 'stop_sequence': None,
                'usage': {'input_tokens': 0, 'cache_creation_input_tokens': 0,
                          'cache_read_input_tokens': 0, 'output_tokens': 0}
            }
        }
        yield f"event: message_start\ndata: {json.dumps(message_data)}\n\n"

        # Start text content block (index 0)
        yield f"event: content_block_start\ndata: {json.dumps({
            'type': 'content_block_start', 'index': 0,
            'content_block': {'type': 'text', 'text': ''}
        })}\n\n"

        # Keepalive ping
        yield f"event: ping\ndata: {json.dumps({'type': 'ping'})}\n\n"

        tool_index = None
        text_block_closed = False
        text_sent = False
        accumulated_text = ""
        last_tool_index = 0
        output_tokens = 0
        has_sent_stop_reason = False

        async for chunk in response_generator:
            # Extract usage info
            if hasattr(chunk, 'usage') and chunk.usage is not None:
                if hasattr(chunk.usage, 'completion_tokens'):
                    output_tokens = chunk.usage.completion_tokens

            if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
                choice = chunk.choices[0]
                delta = getattr(choice, 'delta', {})
                finish_reason = getattr(choice, 'finish_reason', None)

                # Handle text content
                delta_content = getattr(delta, 'content', None) or (
                    delta.get('content') if isinstance(delta, dict) else None
                )
                if delta_content:
                    accumulated_text += delta_content
                    if tool_index is None and not text_block_closed:
                        text_sent = True
                        yield f"event: content_block_delta\ndata: {json.dumps({
                            'type': 'content_block_delta', 'index': 0,
                            'delta': {'type': 'text_delta', 'text': delta_content}
                        })}\n\n"

                # Handle tool calls
                delta_tool_calls = getattr(delta, 'tool_calls', None)
                if delta_tool_calls:
                    # Close text block on first tool call
                    if tool_index is None and not text_block_closed:
                        text_block_closed = True
                        yield f"event: content_block_stop\ndata: {json.dumps({
                            'type': 'content_block_stop', 'index': 0
                        })}\n\n"

                    for tool_call in (delta_tool_calls if isinstance(delta_tool_calls, list) else [delta_tool_calls]):
                        current_index = getattr(tool_call, 'index', 0)

                        # New tool call - start new block
                        if tool_index is None or current_index != tool_index:
                            tool_index = current_index
                            last_tool_index += 1
                            anthropic_tool_index = last_tool_index

                            function = getattr(tool_call, 'function', None)
                            name = getattr(function, 'name', '') if function else ''
                            tool_id = getattr(tool_call, 'id', f"toolu_{uuid.uuid4().hex[:24]}")

                            yield f"event: content_block_start\ndata: {json.dumps({
                                'type': 'content_block_start', 'index': anthropic_tool_index,
                                'content_block': {'type': 'tool_use', 'id': tool_id, 'name': name, 'input': {}}
                            })}\n\n"

                        # Send argument deltas
                        function = getattr(tool_call, 'function', None)
                        arguments = getattr(function, 'arguments', '') if function else ''
                        if arguments:
                            yield f"event: content_block_delta\ndata: {json.dumps({
                                'type': 'content_block_delta', 'index': anthropic_tool_index,
                                'delta': {'type': 'input_json_delta', 'partial_json': arguments}
                            })}\n\n"

                # Handle finish reason
                if finish_reason and not has_sent_stop_reason:
                    has_sent_stop_reason = True

                    # Close all open tool blocks
                    if tool_index is not None:
                        for i in range(1, last_tool_index + 1):
                            yield f"event: content_block_stop\ndata: {json.dumps({
                                'type': 'content_block_stop', 'index': i
                            })}\n\n"

                    # Close text block if still open
                    if not text_block_closed:
                        yield f"event: content_block_stop\ndata: {json.dumps({
                            'type': 'content_block_stop', 'index': 0
                        })}\n\n"

                    # Map stop reason
                    stop_reason = {
                        "length": "max_tokens", "tool_calls": "tool_use", "stop": "end_turn"
                    }.get(finish_reason, "end_turn")

                    # Send message_delta with stop reason
                    yield f"event: message_delta\ndata: {json.dumps({
                        'type': 'message_delta',
                        'delta': {'stop_reason': stop_reason, 'stop_sequence': None},
                        'usage': {'output_tokens': output_tokens}
                    })}\n\n"

                    # Send message_stop
                    yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n"
                    yield "data: [DONE]\n\n"
                    return

    except Exception as e:
        yield f"event: message_delta\ndata: {json.dumps({
            'type': 'message_delta', 'delta': {'stop_reason': 'error'},
            'usage': {'output_tokens': 0}
        })}\n\n"
        yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n"
        yield "data: [DONE]\n\n"
```

**Why This Matters**: Real-time format translation for streaming, maintaining proper event structure and content block lifecycle.

---

### 4.72 Tool Result Content Parser (claude-code-proxy - Python)

**Pattern**: Polymorphic content extraction handling multiple input formats gracefully.

```python
# claude-code-proxy/server.py (content normalization)
def parse_tool_result_content(content):
    """Helper function to properly parse and normalize tool result content."""
    if content is None:
        return "No content provided"

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        result = ""
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                result += item.get("text", "") + "\n"
            elif isinstance(item, str):
                result += item + "\n"
            elif isinstance(item, dict):
                if "text" in item:
                    result += item.get("text", "") + "\n"
                else:
                    try:
                        result += json.dumps(item) + "\n"
                    except:
                        result += str(item) + "\n"
            else:
                try:
                    result += str(item) + "\n"
                except:
                    result += "Unparseable content\n"
        return result.strip()

    if isinstance(content, dict):
        if content.get("type") == "text":
            return content.get("text", "")
        try:
            return json.dumps(content)
        except:
            return str(content)

    # Fallback for any other type
    try:
        return str(content)
    except:
        return "Unparseable content"
```

**Why This Matters**: Robust content extraction that handles the variety of formats tools may return.

---

### 4.73 Provider-Based API Key Routing (claude-code-proxy - Python)

**Pattern**: Dynamic API key and endpoint selection based on model prefix.

```python
# claude-code-proxy/server.py (API key routing)
@app.post("/v1/messages")
async def create_message(request: MessagesRequest, raw_request: Request):
    try:
        # Convert Anthropic request to LiteLLM format
        litellm_request = convert_anthropic_to_litellm(request)

        # Route to appropriate provider based on model prefix
        if request.model.startswith("openai/"):
            litellm_request["api_key"] = OPENAI_API_KEY
            if OPENAI_BASE_URL:
                litellm_request["api_base"] = OPENAI_BASE_URL
                logger.debug(f"Using OpenAI with custom base URL: {OPENAI_BASE_URL}")

        elif request.model.startswith("gemini/"):
            if USE_VERTEX_AUTH:
                # Use Vertex AI with ADC (Application Default Credentials)
                litellm_request["vertex_project"] = VERTEX_PROJECT
                litellm_request["vertex_location"] = VERTEX_LOCATION
                litellm_request["custom_llm_provider"] = "vertex_ai"
            else:
                # Use Gemini API key directly
                litellm_request["api_key"] = GEMINI_API_KEY

        else:
            # Default to Anthropic
            litellm_request["api_key"] = ANTHROPIC_API_KEY

        # Handle streaming vs non-streaming
        if request.stream:
            response = await litellm.acompletion(**litellm_request)
            return StreamingResponse(
                handle_streaming(response, request),
                media_type="text/event-stream"
            )
        else:
            response = await litellm.acompletion(**litellm_request)
            anthropic_response = convert_litellm_to_anthropic(response, request)
            return JSONResponse(content=anthropic_response.dict())

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Why This Matters**: Clean separation of provider configuration from request handling logic.

---

### 4.74 Colorized Logging Filter (claude-code-proxy - Python)

**Pattern**: Custom logging filter and formatter for clean, colored output with noise suppression.

```python
# claude-code-proxy/server.py (logging configuration)

# Filter to block noisy log messages
class MessageFilter(logging.Filter):
    def filter(self, record):
        # Block messages containing these strings
        blocked_phrases = [
            "LiteLLM completion()",
            "HTTP Request:",
            "selected model name for cost calculation",
            "utils.py",
            "cost_calculator"
        ]

        if hasattr(record, 'msg') and isinstance(record.msg, str):
            for phrase in blocked_phrases:
                if phrase in record.msg:
                    return False
        return True

# Apply the filter to the root logger to catch all messages
root_logger = logging.getLogger()
root_logger.addFilter(MessageFilter())

# Custom formatter for model mapping logs
class ColorizedFormatter(logging.Formatter):
    """Custom formatter to highlight model mappings"""
    BLUE = "\033[94m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    RESET = "\033[0m"
    BOLD = "\033[1m"

    def format(self, record):
        if record.levelno == logging.DEBUG and "MODEL MAPPING" in record.msg:
            # Apply colors and formatting to model mapping logs
            return f"{self.BOLD}{self.GREEN}{record.msg}{self.RESET}"
        return super().format(record)

# Apply custom formatter to console handler
for handler in logger.handlers:
    if isinstance(handler, logging.StreamHandler):
        handler.setFormatter(ColorizedFormatter('%(asctime)s - %(levelname)s - %(message)s'))
```

**Why This Matters**: Improves debugging experience by highlighting important events and suppressing noise.

---

### 4.75 Pydantic Request Models with Union Types (claude-code-proxy - Python)

**Pattern**: Comprehensive request/response models using Pydantic with union types for polymorphic content.

```python
# claude-code-proxy/server.py (Pydantic models)
from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Any, Optional, Union, Literal

class ContentBlockText(BaseModel):
    type: Literal["text"]
    text: str

class ContentBlockImage(BaseModel):
    type: Literal["image"]
    source: Dict[str, Any]

class ContentBlockToolUse(BaseModel):
    type: Literal["tool_use"]
    id: str
    name: str
    input: Dict[str, Any]

class ContentBlockToolResult(BaseModel):
    type: Literal["tool_result"]
    tool_use_id: str
    content: Union[str, List[Dict[str, Any]], Dict[str, Any], List[Any], Any]

class SystemContent(BaseModel):
    type: Literal["text"]
    text: str

class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: Union[str, List[Union[ContentBlockText, ContentBlockImage, ContentBlockToolUse, ContentBlockToolResult]]]

class Tool(BaseModel):
    name: str
    description: Optional[str] = None
    input_schema: Dict[str, Any]

class ThinkingConfig(BaseModel):
    enabled: bool = True

class MessagesRequest(BaseModel):
    model: str
    max_tokens: int
    messages: List[Message]
    system: Optional[Union[str, List[SystemContent]]] = None
    stop_sequences: Optional[List[str]] = None
    stream: Optional[bool] = False
    temperature: Optional[float] = 1.0
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    tools: Optional[List[Tool]] = None
    tool_choice: Optional[Dict[str, Any]] = None
    thinking: Optional[ThinkingConfig] = None
    original_model: Optional[str] = None

class Usage(BaseModel):
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0

class MessagesResponse(BaseModel):
    id: str
    model: str
    role: Literal["assistant"] = "assistant"
    content: List[Union[ContentBlockText, ContentBlockToolUse]]
    type: Literal["message"] = "message"
    stop_reason: Optional[Literal["end_turn", "max_tokens", "stop_sequence", "tool_use"]] = None
    stop_sequence: Optional[str] = None
    usage: Usage
```

**Why This Matters**: Type-safe request/response validation with automatic serialization and documentation generation.

---

### 4.76 Thinking Metadata Application via gjson/sjson (CLIProxyAPI - Go)

**Pattern**: Apply thinking configuration from model suffix metadata using high-performance JSON manipulation.

```go
// internal/runtime/executor/payload_helpers.go (thinking metadata)
import (
    "github.com/tidwall/gjson"
    "github.com/tidwall/sjson"
)

// ApplyThinkingMetadata applies thinking config from model suffix metadata (e.g., (high), (8192))
// for standard Gemini format payloads. It normalizes the budget when the model supports thinking.
func ApplyThinkingMetadata(payload []byte, metadata map[string]any, model string) []byte {
    // Use the alias from metadata if available, as it's registered in the global registry
    // with thinking metadata; the upstream model name may not be registered.
    lookupModel := util.ResolveOriginalModel(model, metadata)

    // Determine which model to use for thinking support check.
    // If the alias (lookupModel) is not in the registry, fall back to the upstream model.
    thinkingModel := lookupModel
    if !util.ModelSupportsThinking(lookupModel) && util.ModelSupportsThinking(model) {
        thinkingModel = model
    }

    budgetOverride, includeOverride, ok := util.ResolveThinkingConfigFromMetadata(thinkingModel, metadata)
    if !ok || (budgetOverride == nil && includeOverride == nil) {
        return payload
    }
    if !util.ModelSupportsThinking(thinkingModel) {
        return payload
    }
    if budgetOverride != nil {
        norm := util.NormalizeThinkingBudget(thinkingModel, *budgetOverride)
        budgetOverride = &norm
    }
    return util.ApplyGeminiThinkingConfig(payload, budgetOverride, includeOverride)
}

// ApplyThinkingMetadataCLI applies thinking config for Gemini CLI format payloads (nested under "request")
func ApplyThinkingMetadataCLI(payload []byte, metadata map[string]any, model string) []byte {
    // Same logic but uses util.ApplyGeminiCLIThinkingConfig for nested path
    // ...
    return util.ApplyGeminiCLIThinkingConfig(payload, budgetOverride, includeOverride)
}
```

**Why This Matters**: Decouples thinking configuration from model suffix parsing, enabling dynamic configuration injection.

---

### 4.77 Rule-Based Payload Configuration with Root Paths (CLIProxyAPI - Go)

**Pattern**: Flexible payload parameter injection with defaults and overrides based on model/protocol matching.

```go
// internal/runtime/executor/payload_helpers.go (payload config rules)

// applyPayloadConfigWithRoot applies config rules relative to a root path (e.g., "request" for CLI format)
func applyPayloadConfigWithRoot(cfg *config.Config, model, protocol, root string, payload, original []byte) []byte {
    if cfg == nil || len(payload) == 0 {
        return payload
    }
    rules := cfg.Payload
    if len(rules.Default) == 0 && len(rules.Override) == 0 {
        return payload
    }
    model = strings.TrimSpace(model)
    if model == "" {
        return payload
    }
    out := payload
    source := original
    if len(source) == 0 {
        source = payload
    }
    appliedDefaults := make(map[string]struct{})

    // Apply default rules: first write wins per field across all matching rules
    for i := range rules.Default {
        rule := &rules.Default[i]
        if !payloadRuleMatchesModel(rule, model, protocol) {
            continue
        }
        for path, value := range rule.Params {
            fullPath := buildPayloadPath(root, path)
            if fullPath == "" {
                continue
            }
            // Only apply if field doesn't exist in original
            if gjson.GetBytes(source, fullPath).Exists() {
                continue
            }
            // Only apply once per path (first wins)
            if _, ok := appliedDefaults[fullPath]; ok {
                continue
            }
            updated, errSet := sjson.SetBytes(out, fullPath, value)
            if errSet != nil {
                continue
            }
            out = updated
            appliedDefaults[fullPath] = struct{}{}
        }
    }

    // Apply override rules: last write wins per field across all matching rules
    for i := range rules.Override {
        rule := &rules.Override[i]
        if !payloadRuleMatchesModel(rule, model, protocol) {
            continue
        }
        for path, value := range rule.Params {
            fullPath := buildPayloadPath(root, path)
            if fullPath == "" {
                continue
            }
            updated, errSet := sjson.SetBytes(out, fullPath, value)
            if errSet != nil {
                continue
            }
            out = updated
        }
    }
    return out
}

// buildPayloadPath combines root path with relative parameter path
func buildPayloadPath(root, path string) string {
    r := strings.TrimSpace(root)
    p := strings.TrimSpace(path)
    if r == "" {
        return p
    }
    if p == "" {
        return r
    }
    if strings.HasPrefix(p, ".") {
        p = p[1:]
    }
    return r + "." + p
}
```

**Why This Matters**: Enables declarative payload modification through configuration rather than code changes.

---

### 4.78 Wildcard Model Pattern Matching (CLIProxyAPI - Go)

**Pattern**: Glob-style pattern matching for model-based rule application.

```go
// internal/runtime/executor/payload_helpers.go (pattern matching)

// matchModelPattern performs simple wildcard matching where '*' matches zero or more characters.
// Examples:
//   "*-5" matches "gpt-5"
//   "gpt-*" matches "gpt-5" and "gpt-4"
//   "gemini-*-pro" matches "gemini-2.5-pro" and "gemini-3-pro"
func matchModelPattern(pattern, model string) bool {
    pattern = strings.TrimSpace(pattern)
    model = strings.TrimSpace(model)
    if pattern == "" {
        return false
    }
    if pattern == "*" {
        return true
    }
    // Iterative glob-style matcher supporting only '*' wildcard
    pi, si := 0, 0
    starIdx := -1
    matchIdx := 0
    for si < len(model) {
        if pi < len(pattern) && (pattern[pi] == model[si]) {
            pi++
            si++
            continue
        }
        if pi < len(pattern) && pattern[pi] == '*' {
            starIdx = pi
            matchIdx = si
            pi++
            continue
        }
        if starIdx != -1 {
            pi = starIdx + 1
            matchIdx++
            si = matchIdx
            continue
        }
        return false
    }
    for pi < len(pattern) && pattern[pi] == '*' {
        pi++
    }
    return pi == len(pattern)
}
```

**Why This Matters**: Enables flexible model family targeting in configuration rules (e.g., apply to all "gemini-\*-pro" models).

---

### 4.79 Thinking Field Normalization and Stripping (CLIProxyAPI - Go)

**Pattern**: Model-aware thinking configuration normalization with selective field removal.

```go
// internal/runtime/executor/payload_helpers.go (thinking normalization)

// NormalizeThinkingConfig normalizes thinking-related fields in the payload
// based on model capabilities. For models without thinking support, it strips
// reasoning fields. For models with level-based thinking, it validates and
// normalizes the reasoning effort level.
func NormalizeThinkingConfig(payload []byte, model string, allowCompat bool) []byte {
    if len(payload) == 0 || model == "" {
        return payload
    }

    if !util.ModelSupportsThinking(model) {
        if allowCompat {
            return payload
        }
        return StripThinkingFields(payload, false)
    }

    if util.ModelUsesThinkingLevels(model) {
        return NormalizeReasoningEffortLevel(payload, model)
    }

    // Model supports thinking but uses numeric budgets, not levels.
    // Strip effort string fields since they are not applicable.
    return StripThinkingFields(payload, true)
}

// StripThinkingFields removes thinking-related fields from the payload for
// models that do not support thinking. If effortOnly is true, only removes
// effort string fields (for models using numeric budgets).
func StripThinkingFields(payload []byte, effortOnly bool) []byte {
    fieldsToRemove := []string{
        "reasoning_effort",
        "reasoning.effort",
    }
    if !effortOnly {
        fieldsToRemove = append([]string{"reasoning", "thinking"}, fieldsToRemove...)
    }
    out := payload
    for _, field := range fieldsToRemove {
        if gjson.GetBytes(out, field).Exists() {
            out, _ = sjson.DeleteBytes(out, field)
        }
    }
    return out
}

// NormalizeReasoningEffortLevel validates and normalizes the reasoning_effort field
func NormalizeReasoningEffortLevel(payload []byte, model string) []byte {
    out := payload

    if effort := gjson.GetBytes(out, "reasoning_effort"); effort.Exists() {
        if normalized, ok := util.NormalizeReasoningEffortLevel(model, effort.String()); ok {
            out, _ = sjson.SetBytes(out, "reasoning_effort", normalized)
        }
    }

    if effort := gjson.GetBytes(out, "reasoning.effort"); effort.Exists() {
        if normalized, ok := util.NormalizeReasoningEffortLevel(model, effort.String()); ok {
            out, _ = sjson.SetBytes(out, "reasoning.effort", normalized)
        }
    }

    return out
}
```

**Why This Matters**: Ensures thinking parameters are correctly applied or removed based on model capabilities.

---

### 4.80 Reasoning Transformer with Streaming Support (claude-code-router - TypeScript)

**Pattern**: Bidirectional reasoning content transformation with streaming buffer management.

```typescript
// packages/core/src/transformer/reasoning.transformer.ts
export class ReasoningTransformer implements Transformer {
  static TransformerName = "reasoning";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (!this.enable) {
      request.thinking = { type: "disabled", budget_tokens: -1 };
      request.enable_thinking = false;
      return request;
    }
    if (request.reasoning) {
      request.thinking = {
        type: "enabled",
        budget_tokens: request.reasoning.max_tokens,
      };
      request.enable_thinking = true;
    }
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("stream")) {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let reasoningContent = "";
      let isReasoningComplete = false;
      let buffer = "";

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();

          const processLine = (line: string, context: ReasoningContext) => {
            if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
              const data = JSON.parse(line.slice(6));

              // Extract reasoning_content from delta
              if (data.choices?.[0]?.delta?.reasoning_content) {
                context.appendReasoningContent(data.choices[0].delta.reasoning_content);

                // Transform to thinking format
                const thinkingChunk = {
                  ...data,
                  choices: [
                    {
                      ...data.choices[0],
                      delta: {
                        ...data.choices[0].delta,
                        thinking: { content: data.choices[0].delta.reasoning_content },
                      },
                    },
                  ],
                };
                delete thinkingChunk.choices[0].delta.reasoning_content;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));
                return;
              }

              // Check if reasoning is complete (content arrived after reasoning)
              if ((data.choices?.[0]?.delta?.content || data.choices?.[0]?.delta?.tool_calls) && context.reasoningContent() && !context.isReasoningComplete()) {
                context.setReasoningComplete(true);
                const signature = Date.now().toString();

                // Emit complete thinking block with signature
                const thinkingChunk = {
                  ...data,
                  choices: [
                    {
                      ...data.choices[0],
                      delta: {
                        thinking: { content: context.reasoningContent(), signature },
                      },
                    },
                  ],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));
              }
              // ... continue with content
            }
          };
          // ... stream processing loop
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }
    return response;
  }
}
```

**Why This Matters**: Enables reasoning/thinking format bridging for models that emit reasoning_content.

---

### 4.81 Tool Use Transformer with ExitTool Pattern (claude-code-router - TypeScript)

**Pattern**: Force tool usage with graceful exit mechanism via synthetic ExitTool.

```typescript
// packages/core/src/transformer/tooluse.transformer.ts
export class TooluseTransformer implements Transformer {
  name = "tooluse";

  transformRequestIn(request: UnifiedChatRequest): UnifiedChatRequest {
    // Add system reminder for tool mode
    request.messages.push({
      role: "system",
      content: `<system-reminder>Tool mode is active. The user expects you to proactively execute
        the most suitable tool. If no available tool is appropriate, you MUST call the \`ExitTool\`
        to exit tool mode — this is the only valid way to terminate tool mode.</system-reminder>`,
    });

    if (request.tools?.length) {
      request.tool_choice = "required";  // Force tool use

      // Add ExitTool as escape hatch
      request.tools.push({
        type: "function",
        function: {
          name: "ExitTool",
          description: `Use this tool when in tool mode and have completed the task.
            IMPORTANT: Before using this tool, ensure that none of the available tools
            are applicable to the current task.`,
          parameters: {
            type: "object",
            properties: {
              response: {
                type: "string",
                description: "Your response will be forwarded to the user exactly as returned.",
              },
            },
            required: ["response"],
          },
        },
      });
    }
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();

      // Convert ExitTool call to regular content
      if (jsonResponse?.choices?.[0]?.message.tool_calls?.[0]?.function?.name === "ExitTool") {
        const toolCall = jsonResponse.choices[0].message.tool_calls[0];
        const toolArguments = JSON.parse(toolCall.function.arguments || "{}");
        jsonResponse.choices[0].message.content = toolArguments.response || "";
        delete jsonResponse.choices[0].message.tool_calls;
      }

      return new Response(JSON.stringify(jsonResponse), { ... });
    }
    // ... streaming handler
    return response;
  }
}
```

**Why This Matters**: Enables forced tool use mode while providing a clean exit mechanism for non-tool-applicable requests.

---

### 4.82 Force Reasoning via XML Tags (claude-code-router - TypeScript)

**Pattern**: Inject reasoning prompt and extract thinking from XML-tagged responses.

```typescript
// packages/core/src/transformer/forcereasoning.transformer.ts
const PROMPT = `Always think before answering. Even if the problem seems simple,
always write down your reasoning process explicitly.

Output format:
<reasoning_content>
Your detailed thinking process goes here
</reasoning_content>
Your final answer must follow after the closing tag above.`;

const MAX_INTERLEAVED_TIMES = 10;

export class ForceReasoningTransformer implements Transformer {
  name = "forcereasoning";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    let times = 0;

    // Inject previous thinking content into assistant messages
    request.messages
      .filter((msg) => msg.role === "assistant")
      .reverse()
      .forEach((message) => {
        if (message.thinking?.content) {
          if (!message.content || times < MAX_INTERLEAVED_TIMES) {
            times++;
            message.content = `<reasoning_content>${message.thinking.content}</reasoning_content>\n${message.content}`;
          }
          delete message.thinking;
        }
      });

    // Add reasoning prompt to last user message
    const lastMessage = request.messages[request.messages.length - 1];
    if (lastMessage.role === "user") {
      if (Array.isArray(lastMessage.content)) {
        lastMessage.content.push({ type: "text", text: PROMPT });
      } else {
        lastMessage.content = [
          { type: "text", text: PROMPT },
          { type: "text", text: lastMessage.content || '' },
        ];
      }
    }
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    const reasonStartTag = "<reasoning_content>";
    const reasonStopTag = "</reasoning_content>";

    if (response.headers.get("Content-Type")?.includes("stream")) {
      let fsmState: "SEARCHING" | "REASONING" | "FINAL" = "SEARCHING";
      let tagBuffer = "";

      const stream = new ReadableStream({
        async start(controller) {
          // FSM-based streaming parser
          const processAndEnqueue = (originalData: any, content: string | null) => {
            let currentContent = tagBuffer + (content || "");
            tagBuffer = "";

            while (currentContent.length > 0) {
              if (fsmState === "SEARCHING") {
                const startTagIndex = currentContent.indexOf(reasonStartTag);
                if (startTagIndex !== -1) {
                  currentContent = currentContent.substring(startTagIndex + reasonStartTag.length);
                  fsmState = "REASONING";
                } else {
                  // Buffer potential partial tag at end
                  for (let i = reasonStartTag.length - 1; i > 0; i--) {
                    if (currentContent.endsWith(reasonStartTag.substring(0, i))) {
                      tagBuffer = currentContent.substring(currentContent.length - i);
                      break;
                    }
                  }
                  currentContent = "";
                }
              } else if (fsmState === "REASONING") {
                const endTagIndex = currentContent.indexOf(reasonStopTag);
                if (endTagIndex !== -1) {
                  const reasoningPart = currentContent.substring(0, endTagIndex);
                  // Emit thinking block
                  const thinkingChunk = { ...originalData, choices: [{ delta: { thinking: { content: reasoningPart } } }] };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));
                  // Emit signature
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { thinking: { signature: Date.now().toString() } } }] })}\n\n`));
                  currentContent = currentContent.substring(endTagIndex + reasonStopTag.length);
                  fsmState = "FINAL";
                } else {
                  // Emit partial reasoning
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { thinking: { content: currentContent } } }] })}\n\n`));
                  currentContent = "";
                }
              } else if (fsmState === "FINAL") {
                // Emit final content
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: currentContent } }] })}\n\n`));
                currentContent = "";
              }
            }
          };
          // ... stream loop
        },
      });

      return new Response(stream, { ... });
    }
    return response;
  }
}
```

**Why This Matters**: Forces reasoning for models that don't natively support it by injecting prompts and parsing XML-tagged output.

---

### 4.83 Max Completion Tokens Normalization (claude-code-router - TypeScript)

**Pattern**: Simple field transformation for API compatibility.

```typescript
// packages/core/src/transformer/maxcompletiontokens.transformer.ts
export class MaxCompletionTokens implements Transformer {
  static TransformerName = "maxcompletiontokens";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    // Convert max_tokens to max_completion_tokens for OpenAI API compatibility
    if (request.max_tokens) {
      request.max_completion_tokens = request.max_tokens;
      delete request.max_tokens;
    }
    return request;
  }
}
```

**Why This Matters**: Ensures token limit parameters are in the correct format for different API versions.

---

### 4.84 Thinking Validation with 400 Error Response (CLIProxyAPI - Go)

**Pattern**: Pre-request validation with structured error responses for unsupported configurations.

```go
// internal/runtime/executor/payload_helpers.go (validation)

// ValidateThinkingConfig checks for unsupported reasoning levels on level-based models.
// Returns a statusErr with 400 when an unsupported level is supplied to avoid silently
// downgrading requests.
func ValidateThinkingConfig(payload []byte, model string) error {
    if len(payload) == 0 || model == "" {
        return nil
    }
    if !util.ModelSupportsThinking(model) || !util.ModelUsesThinkingLevels(model) {
        return nil
    }

    levels := util.GetModelThinkingLevels(model)
    checkField := func(path string) error {
        if effort := gjson.GetBytes(payload, path); effort.Exists() {
            if _, ok := util.NormalizeReasoningEffortLevel(model, effort.String()); !ok {
                return statusErr{
                    code: http.StatusBadRequest,
                    msg:  fmt.Sprintf("unsupported reasoning effort level %q for model %s (supported: %s)",
                        effort.String(), model, strings.Join(levels, ", ")),
                }
            }
        }
        return nil
    }

    if err := checkField("reasoning_effort"); err != nil {
        return err
    }
    if err := checkField("reasoning.effort"); err != nil {
        return err
    }
    return nil
}
```

**Why This Matters**: Fails fast with clear error messages rather than silently degrading functionality.

---

### 4.85 Cache Control Stripping for Non-Claude Models (claude-code-router - TypeScript)

**Pattern**: Selectively strip Anthropic-specific `cache_control` from content blocks for providers that don't support prompt caching.

```typescript
// packages/core/src/transformer/cleancache.transformer.ts
export class CleancacheTransformer implements Transformer {
  name = "cleancache";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (Array.isArray(request.messages)) {
      request.messages.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          // Strip cache_control from content items
          (msg.content as MessageContent[]).forEach((item) => {
            if ((item as TextContent).cache_control) {
              delete (item as TextContent).cache_control;
            }
          });
        } else if (msg.cache_control) {
          // Also handle message-level cache_control
          delete msg.cache_control;
        }
      });
    }
    return request;
  }
}
```

**Why This Matters**: Enables Claude Code's prompt caching hints to pass through to Anthropic while being stripped for other providers.

---

### 4.86 Tool Argument Streaming Accumulation (claude-code-router - TypeScript)

**Pattern**: Buffer tool call arguments across streaming chunks, then parse and emit as complete JSON.

```typescript
// packages/core/src/transformer/enhancetool.transformer.ts
interface ToolCall {
  index?: number;
  name?: string;
  id?: string;
  arguments?: string; // Accumulated JSON string
}

let currentToolCall: ToolCall = {};

const processLine = (line: string, context) => {
  const data = JSON.parse(line.slice(6));

  // Handle tool calls in streaming mode
  if (data.choices?.[0]?.delta?.tool_calls?.length) {
    const toolCallDelta = data.choices[0].delta.tool_calls[0];

    // Initialize currentToolCall if this is the first chunk
    if (typeof currentToolCall.index === "undefined") {
      currentToolCall = {
        index: toolCallDelta.index,
        name: toolCallDelta.function?.name || "",
        id: toolCallDelta.id || "",
        arguments: toolCallDelta.function?.arguments || "",
      };
      // Clear arguments from first chunk, will emit complete later
      if (toolCallDelta.function?.arguments) {
        toolCallDelta.function.arguments = "";
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      return;
    }

    // Accumulate arguments if continuing same tool call
    if (currentToolCall.index === toolCallDelta.index) {
      if (toolCallDelta.function?.arguments) {
        currentToolCall.arguments += toolCallDelta.function.arguments;
      }
      // Don't emit intermediate chunks - wait for complete JSON
      return;
    }
  }

  // When finish_reason is tool_calls, parse and emit complete arguments
  if (data.choices?.[0]?.finish_reason === "tool_calls" && currentToolCall.index !== undefined) {
    const finalArgs = parseToolArguments(currentToolCall.arguments || "", this.logger);

    const delta = {
      role: "assistant",
      tool_calls: [
        {
          function: { name: currentToolCall.name, arguments: finalArgs },
          id: currentToolCall.id,
          index: currentToolCall.index,
          type: "function",
        },
      ],
    };

    const modifiedData = { ...data, choices: [{ ...data.choices[0], delta }] };
    delete modifiedData.choices[0].delta.content;
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(modifiedData)}\n\n`));
    currentToolCall = {}; // Reset for next tool call
    return;
  }
};
```

**Why This Matters**: Solves malformed JSON from partial streaming chunks; enables reliable tool argument parsing.

---

### 4.87 Sampling Parameter Clamping (claude-code-router - TypeScript)

**Pattern**: Enforce provider limits on sampling parameters with configurable caps.

```typescript
// packages/core/src/transformer/sampling.transformer.ts
export class SamplingTransformer implements Transformer {
  static TransformerName = "sampling";

  max_tokens: number;
  temperature: number;
  top_p: number;
  top_k: number;
  repetition_penalty: number;

  constructor(private readonly options?: TransformerOptions) {
    // Configure limits from options
    this.max_tokens = this.options?.max_tokens;
    this.temperature = this.options?.temperature;
    this.top_p = this.options?.top_p;
    this.top_k = this.options?.top_k;
    this.repetition_penalty = this.options?.repetition_penalty;
  }

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    // Clamp max_tokens to configured limit
    if (request.max_tokens && request.max_tokens > this.max_tokens) {
      request.max_tokens = this.max_tokens;
    }
    // Override temperature if configured
    if (typeof this.temperature !== "undefined") {
      request.temperature = this.temperature;
    }
    // Override top_p if configured
    if (typeof this.top_p !== "undefined") {
      request.top_p = this.top_p;
    }
    // Override top_k if configured
    if (typeof this.top_k !== "undefined") {
      request.top_k = this.top_k;
    }
    // Override repetition_penalty if configured
    if (typeof this.repetition_penalty !== "undefined") {
      request.repetition_penalty = this.repetition_penalty;
    }
    return request;
  }
}
```

**Why This Matters**: Prevents API errors from exceeding provider limits; allows cost control via token capping.

---

### 4.88 DeepSeek Reasoning-to-Thinking Conversion (claude-code-router - TypeScript)

**Pattern**: Transform DeepSeek's `reasoning_content` field to Claude Code's `thinking` format with streaming support.

```typescript
// packages/core/src/transformer/deepseek.transformer.ts
export class DeepseekTransformer implements Transformer {
  name = "deepseek";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    // DeepSeek has max token limit of 8192
    if (request.max_tokens && request.max_tokens > 8192) {
      request.max_tokens = 8192;
    }
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (!response.headers.get("Content-Type")?.includes("stream")) {
      return response;
    }

    let reasoningContent = "";
    let isReasoningComplete = false;

    const processLine = (line: string, context) => {
      const data = JSON.parse(line.slice(6));

      // Extract reasoning_content from DeepSeek delta
      if (data.choices?.[0]?.delta?.reasoning_content) {
        context.appendReasoningContent(data.choices[0].delta.reasoning_content);

        // Transform to thinking format for streaming
        const thinkingChunk = {
          ...data,
          choices: [
            {
              ...data.choices[0],
              delta: {
                ...data.choices[0].delta,
                thinking: { content: data.choices[0].delta.reasoning_content },
              },
            },
          ],
        };
        delete thinkingChunk.choices[0].delta.reasoning_content;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));
        return;
      }

      // When content arrives after reasoning, emit complete thinking block with signature
      if (data.choices?.[0]?.delta?.content && context.reasoningContent() && !context.isReasoningComplete()) {
        context.setReasoningComplete(true);
        const signature = Date.now().toString(); // Simple timestamp signature

        const thinkingChunk = {
          ...data,
          choices: [
            {
              ...data.choices[0],
              delta: {
                ...data.choices[0].delta,
                content: null,
                thinking: { content: context.reasoningContent(), signature },
              },
            },
          ],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));
      }
      // ... continue with regular content
    };

    // ... stream processing
  }
}
```

**Why This Matters**: Enables DeepSeek R1's reasoning to display as thinking blocks in Claude Code.

---

### 4.89 OpenRouter Tool ID Normalization (claude-code-router - TypeScript)

**Pattern**: Convert numeric tool IDs to UUID format for Claude Code compatibility.

```typescript
// packages/core/src/transformer/openrouter.transformer.ts
import { v4 as uuidv4 } from "uuid";

export class OpenrouterTransformer implements Transformer {
  static TransformerName = "openrouter";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    // Non-Claude models: strip cache_control and fix image URLs
    if (!request.model.includes("claude")) {
      request.messages.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((item: any) => {
            if (item.cache_control) delete item.cache_control;
            if (item.type === "image_url") {
              delete item.media_type;
            }
          });
        } else if (msg.cache_control) {
          delete msg.cache_control;
        }
      });
    } else {
      // Claude via OpenRouter: convert image URLs to data URIs
      request.messages.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((item: any) => {
            if (item.type === "image_url" && !item.image_url.url.startsWith("http")) {
              item.image_url.url = `data:${item.media_type};base64,${item.image_url.url}`;
              delete item.media_type;
            }
          });
        }
      });
    }
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    // ... in streaming handler:

    // Normalize numeric tool IDs to UUIDs
    if (data.choices?.[0]?.delta?.tool_calls?.length && !Number.isNaN(parseInt(data.choices?.[0]?.delta?.tool_calls[0].id, 10))) {
      data.choices?.[0]?.delta?.tool_calls.forEach((tool: any) => {
        tool.id = `call_${uuidv4()}`; // Generate proper call ID
      });
    }

    // Track tool calls for finish_reason fix
    if (data.choices?.[0]?.delta?.tool_calls?.length && !hasToolCall) {
      hasToolCall = true;
    }

    // Fix finish_reason for usage chunk
    if (data.usage) {
      data.choices[0].finish_reason = hasToolCall ? "tool_calls" : "stop";
    }
  }
}
```

**Why This Matters**: Fixes OpenRouter's non-standard tool IDs and finish_reason handling for Claude Code compatibility.

---

### 4.90 Custom Parameters Deep Merge Injection (claude-code-router - TypeScript)

**Pattern**: Inject arbitrary parameters into requests with recursive object merging.

```typescript
// packages/core/src/transformer/customparams.transformer.ts
export interface CustomParamsOptions extends TransformerOptions {
  /** Custom parameters to inject - supports string, number, boolean, object, array */
  [key: string]: any;
}

export class CustomParamsTransformer implements Transformer {
  static TransformerName = "customparams";

  private options: CustomParamsOptions;

  constructor(options: CustomParamsOptions = {}) {
    this.options = options;
  }

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    const modifiedRequest = { ...request } as any;

    for (const [key, value] of Object.entries(this.options)) {
      if (key in modifiedRequest) {
        // Deep merge objects (but not arrays)
        if (typeof modifiedRequest[key] === "object" && typeof value === "object" && !Array.isArray(modifiedRequest[key]) && !Array.isArray(value) && modifiedRequest[key] !== null && value !== null) {
          modifiedRequest[key] = this.deepMergeObjects(modifiedRequest[key], value);
        }
        // For non-objects, preserve original value (don't override)
      } else {
        // Add new parameter with deep clone
        modifiedRequest[key] = this.cloneValue(value);
      }
    }

    return modifiedRequest;
  }

  private deepMergeObjects(target: any, source: any): any {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (key in result && typeof result[key] === "object" && typeof value === "object" && !Array.isArray(result[key]) && !Array.isArray(value) && result[key] !== null && value !== null) {
        result[key] = this.deepMergeObjects(result[key], value);
      } else {
        result[key] = this.cloneValue(value);
      }
    }
    return result;
  }

  private cloneValue(value: any): any {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((item) => this.cloneValue(item));
    const cloned: any = {};
    for (const [key, val] of Object.entries(value)) {
      cloned[key] = this.cloneValue(val);
    }
    return cloned;
  }
}
```

**Why This Matters**: Enables runtime configuration injection without modifying transformer code.

---

### 4.91 Session Recovery with Error Type Detection (opencode-antigravity-auth - TypeScript)

**Pattern**: Detect and recover from specific API error types with appropriate remediation.

```typescript
// src/plugin/recovery.ts
export type RecoveryErrorType = "tool_result_missing" | "thinking_block_order" | "thinking_disabled_violation" | null;

/** Extract normalized error message from unknown error */
function getErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error.toLowerCase();

  const errorObj = error as Record<string, unknown>;
  const paths = [errorObj.data, errorObj.error, errorObj, (errorObj.data as any)?.error];

  for (const obj of paths) {
    if (obj && typeof obj === "object") {
      const msg = (obj as any).message;
      if (typeof msg === "string" && msg.length > 0) return msg.toLowerCase();
    }
  }
  return JSON.stringify(error).toLowerCase();
}

/** Detect error type from message patterns */
export function detectErrorType(error: unknown): RecoveryErrorType {
  const message = getErrorMessage(error);

  // tool_result_missing: ESC pressed during tool execution
  if (message.includes("tool_use") && message.includes("tool_result")) {
    return "tool_result_missing";
  }

  // thinking_block_order: Thinking blocks corrupted/stripped
  if (message.includes("thinking") && (message.includes("first block") || message.includes("must start with") || message.includes("preceeding") || (message.includes("expected") && message.includes("found")))) {
    return "thinking_block_order";
  }

  // thinking_disabled_violation: Thinking in non-thinking model
  if (message.includes("thinking is disabled") && message.includes("cannot contain")) {
    return "thinking_disabled_violation";
  }

  return null;
}

export function isRecoverableError(error: unknown): boolean {
  return detectErrorType(error) !== null;
}
```

**Why This Matters**: Automatic session recovery prevents users from losing work due to transient API errors.

---

### 4.92 Tool Result Missing Recovery via Synthetic Injection (opencode-antigravity-auth - TypeScript)

**Pattern**: Recover from ESC-interrupted tool calls by injecting synthetic tool_result blocks.

```typescript
// src/plugin/recovery.ts

interface ToolUsePart {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function extractToolUseIds(parts: MessagePart[]): string[] {
  return parts.filter((p): p is ToolUsePart & MessagePart => p.type === "tool_use" && !!p.id).map((p) => p.id!);
}

/** Recover from tool_result_missing by injecting synthetic tool_result blocks */
async function recoverToolResultMissing(client: PluginClient, sessionID: string, failedMsg: MessageData): Promise<boolean> {
  // Try API parts first, fallback to filesystem if empty
  let parts = failedMsg.parts || [];
  if (parts.length === 0 && failedMsg.info?.id) {
    const storedParts = readParts(failedMsg.info.id);
    parts = storedParts.map((p) => ({
      type: p.type === "tool" ? "tool_use" : p.type,
      id: "callID" in p ? p.callID : p.id,
      name: "tool" in p ? p.tool : undefined,
      input: "state" in p ? p.state?.input : undefined,
    }));
  }

  const toolUseIds = extractToolUseIds(parts);
  if (toolUseIds.length === 0) return false;

  // Create synthetic tool_result for each interrupted tool
  const toolResultParts = toolUseIds.map((id) => ({
    type: "tool_result" as const,
    tool_use_id: id,
    content: "Operation cancelled by user (ESC pressed)",
  }));

  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: { parts: toolResultParts },
    });
    return true;
  } catch {
    return false;
  }
}
```

**Why This Matters**: Enables graceful recovery from ESC-interrupted tool execution without session corruption.

---

### 4.93 Thinking Block Order Recovery via Prepending (opencode-antigravity-auth - TypeScript)

**Pattern**: Fix corrupted thinking block order by prepending missing thinking parts.

```typescript
// src/plugin/recovery.ts

/** Extract message index from error (e.g., "messages.79") */
function extractMessageIndex(error: unknown): number | null {
  const message = getErrorMessage(error);
  const match = message.match(/messages\.(\d+)/);
  if (!match || !match[1]) return null;
  return parseInt(match[1], 10);
}

/** Recover from thinking_block_order by prepending thinking parts */
async function recoverThinkingBlockOrder(sessionID: string, _failedMsg: MessageData, error: unknown): Promise<boolean> {
  // Try to find target message index from error
  const targetIndex = extractMessageIndex(error);
  if (targetIndex !== null) {
    const targetMessageID = findMessageByIndexNeedingThinking(sessionID, targetIndex);
    if (targetMessageID) {
      return prependThinkingPart(sessionID, targetMessageID);
    }
  }

  // Fallback: find all orphan thinking messages
  const orphanMessages = findMessagesWithOrphanThinking(sessionID);
  if (orphanMessages.length === 0) return false;

  let anySuccess = false;
  for (const messageID of orphanMessages) {
    if (prependThinkingPart(sessionID, messageID)) {
      anySuccess = true;
    }
  }

  return anySuccess;
}

/** Recover from thinking_disabled_violation by stripping thinking parts */
async function recoverThinkingDisabledViolation(sessionID: string, _failedMsg: MessageData): Promise<boolean> {
  const messagesWithThinking = findMessagesWithThinkingBlocks(sessionID);
  if (messagesWithThinking.length === 0) return false;

  let anySuccess = false;
  for (const messageID of messagesWithThinking) {
    if (stripThinkingParts(messageID)) {
      anySuccess = true;
    }
  }

  return anySuccess;
}
```

**Why This Matters**: Automatic recovery from API-level thinking block corruption without user intervention.

---

### 4.94 Auto-Update Checker with Local Dev Detection (opencode-antigravity-auth - TypeScript)

**Pattern**: Check for plugin updates while respecting local development mode and pinned versions.

```typescript
// src/hooks/auto-update-checker/checker.ts

function stripJsonComments(json: string): string {
  return json
    .replace(/\\"|"(?:\\"|[^"])*"|(\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/)/g, (m, g) => (g ? "" : m))
    .replace(/,(\s*[}\]])/g, "$1");
}

export function isLocalDevMode(directory: string): boolean {
  return getLocalDevPath(directory) !== null;
}

export function getLocalDevPath(directory: string): string | null {
  for (const configPath of getConfigPaths(directory)) {
    try {
      if (!fs.existsSync(configPath)) continue;
      const content = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(stripJsonComments(content)) as OpencodeConfig;
      const plugins = config.plugin ?? [];

      for (const entry of plugins) {
        // Detect file:// protocol indicating local dev
        if (entry.startsWith("file://") && entry.includes(PACKAGE_NAME)) {
          try {
            return fileURLToPath(entry);
          } catch {
            return entry.replace("file://", "");
          }
        }
      }
    } catch { continue; }
  }
  return null;
}

export interface PluginEntryInfo {
  entry: string;
  isPinned: boolean;
  pinnedVersion: string | null;
  configPath: string;
}

export function findPluginEntry(directory: string): PluginEntryInfo | null {
  for (const configPath of getConfigPaths(directory)) {
    const config = JSON.parse(stripJsonComments(fs.readFileSync(configPath, "utf-8")));
    for (const entry of config.plugin ?? []) {
      if (entry === PACKAGE_NAME) {
        return { entry, isPinned: false, pinnedVersion: null, configPath };
      }
      if (entry.startsWith(`${PACKAGE_NAME}@`)) {
        const pinnedVersion = entry.slice(PACKAGE_NAME.length + 1);
        const isPinned = pinnedVersion !== "latest";
        return { entry, isPinned, pinnedVersion: isPinned ? pinnedVersion : null, configPath };
      }
    }
  }
  return null;
}

export async function checkForUpdate(directory: string): Promise<UpdateCheckResult> {
  if (isLocalDevMode(directory)) {
    return { needsUpdate: false, isLocalDev: true, isPinned: false };
  }

  const pluginInfo = findPluginEntry(directory);
  if (!pluginInfo) return { needsUpdate: false, isPinned: false };

  const currentVersion = getCachedVersion() ?? pluginInfo.pinnedVersion;
  const latestVersion = await getLatestVersion();

  return {
    needsUpdate: currentVersion !== latestVersion,
    currentVersion,
    latestVersion,
    isPinned: pluginInfo.isPinned,
  };
}
```

**Why This Matters**: Automatic update prompts with proper handling of development and pinned version scenarios.

---

### 4.95 Pinned Version Update via Regex-Based Config Rewriting (opencode-antigravity-auth - TypeScript)

**Pattern**: Update pinned plugin versions in config files while preserving formatting.

```typescript
// src/hooks/auto-update-checker/checker.ts

export function updatePinnedVersion(configPath: string, oldEntry: string, newVersion: string): boolean {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const newEntry = `${PACKAGE_NAME}@${newVersion}`;

    // Find the plugin array in the config
    const pluginMatch = content.match(/"plugin"\s*:\s*\[/);
    if (!pluginMatch || pluginMatch.index === undefined) {
      debugLog(`No "plugin" array found in ${configPath}`);
      return false;
    }

    // Parse the plugin array bounds using bracket counting
    const startIdx = pluginMatch.index + pluginMatch[0].length;
    let bracketCount = 1;
    let endIdx = startIdx;

    for (let i = startIdx; i < content.length && bracketCount > 0; i++) {
      if (content[i] === "[") bracketCount++;
      else if (content[i] === "]") bracketCount--;
      endIdx = i;
    }

    const before = content.slice(0, startIdx);
    const pluginArrayContent = content.slice(startIdx, endIdx);
    const after = content.slice(endIdx);

    // Escape special regex characters in old entry
    const escapedOldEntry = oldEntry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`["']${escapedOldEntry}["']`);

    if (!regex.test(pluginArrayContent)) {
      debugLog(`Entry "${oldEntry}" not found in plugin array`);
      return false;
    }

    // Replace only within the plugin array (preserves other formatting)
    const updatedPluginArray = pluginArrayContent.replace(regex, `"${newEntry}"`);
    const updatedContent = before + updatedPluginArray + after;

    if (updatedContent === content) return false;

    fs.writeFileSync(configPath, updatedContent, "utf-8");
    return true;
  } catch (err) {
    console.error(`Failed to update config file ${configPath}:`, err);
    return false;
  }
}
```

**Why This Matters**: Non-destructive config updates that preserve user formatting, comments, and whitespace.

---

### 4.96 Vertex AI Dynamic Auth with Google Auth Library (claude-code-router - TypeScript)

**Pattern**: Dynamically acquire OAuth tokens for Vertex AI using Google Cloud Application Default Credentials.

```typescript
// packages/core/src/transformer/vertex-gemini.transformer.ts
async function getAccessToken(): Promise<string> {
  try {
    const { GoogleAuth } = await import("google-auth-library");

    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    return accessToken.token || "";
  } catch (error) {
    throw new Error("Failed to get access token for Vertex AI. Please ensure you have set up authentication using one of these methods:\n" + "1. Set GOOGLE_APPLICATION_CREDENTIALS to point to service account key file\n" + '2. Run "gcloud auth application-default login"\n' + "3. Use Google Cloud environment with default service account");
  }
}

export class VertexGeminiTransformer implements Transformer {
  name = "vertex-gemini";

  async transformRequestIn(request: UnifiedChatRequest, provider: LLMProvider): Promise<Record<string, any>> {
    // Extract project ID from env or service account file
    let projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

    if (!projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const fs = await import("fs");
      const keyContent = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8");
      const credentials = JSON.parse(keyContent);
      if (credentials?.project_id) projectId = credentials.project_id;
    }

    if (!projectId) {
      throw new Error("Project ID required for Vertex AI. Set GOOGLE_CLOUD_PROJECT.");
    }

    const accessToken = await getAccessToken();
    return {
      body: buildRequestBody(request),
      config: {
        url: new URL(`./v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${request.model}:${request.stream ? "streamGenerateContent" : "generateContent"}`, provider.baseUrl || `https://${location}-aiplatform.googleapis.com`),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-goog-api-key": undefined, // Remove API key auth
        },
      },
    };
  }
}
```

**Why This Matters**: Enables using Vertex AI Gemini with standard GCP authentication instead of API keys.

---

### 4.97 OpenAI-to-Anthropic Stream Event Conversion (claude-code-router - TypeScript)

**Pattern**: Convert OpenAI streaming format to Anthropic SSE format with content block management.

```typescript
// packages/core/src/transformer/anthropic.transformer.ts (excerpt)
private async convertOpenAIStreamToAnthropic(
  openaiStream: ReadableStream,
  context: TransformerContext
): Promise<ReadableStream> {
  return new ReadableStream({
    start: async (controller) => {
      const encoder = new TextEncoder();
      const messageId = `msg_${Date.now()}`;
      let hasStarted = false;
      let contentIndex = 0;
      let currentContentBlockIndex = -1;
      const toolCalls = new Map<number, any>();

      // Atomic content block index allocation
      const assignContentBlockIndex = (): number => {
        const idx = contentIndex;
        contentIndex++;
        return idx;
      };

      const safeEnqueue = (data: Uint8Array) => {
        if (!isClosed) controller.enqueue(data);
      };

      // On first chunk: emit message_start
      if (!hasStarted) {
        hasStarted = true;
        const messageStart = {
          type: "message_start",
          message: {
            id: messageId, type: "message", role: "assistant",
            content: [], model: model, stop_reason: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        };
        safeEnqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`));
      }

      // On thinking chunk: emit thinking content block
      if (choice?.delta?.thinking) {
        if (!isThinkingStarted) {
          const idx = assignContentBlockIndex();
          safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
            type: "content_block_start", index: idx,
            content_block: { type: "thinking", thinking: "" }
          })}\n\n`));
          currentContentBlockIndex = idx;
          isThinkingStarted = true;
        }
        // Emit signature or thinking content...
      }

      // On text content: emit text content block
      if (choice?.delta?.content) {
        if (!hasTextContentStarted) {
          const idx = assignContentBlockIndex();
          safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
            type: "content_block_start", index: idx,
            content_block: { type: "text", text: "" }
          })}\n\n`));
          hasTextContentStarted = true;
        }
        safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta", index: currentContentBlockIndex,
          delta: { type: "text_delta", text: choice.delta.content }
        })}\n\n`));
      }
    }
  });
}
```

**Why This Matters**: Enables full Claude Code compatibility with any OpenAI-compatible provider, including thinking and tool use.

---

### 4.98 Anthropic Request Format Normalization (claude-code-router - TypeScript)

**Pattern**: Convert Anthropic-native requests to unified OpenAI-like format for multi-provider routing.

```typescript
// packages/core/src/transformer/anthropic.transformer.ts (request normalization)
async transformRequestOut(request: Record<string, any>): Promise<UnifiedChatRequest> {
  const messages: UnifiedMessage[] = [];

  // Convert system message
  if (request.system) {
    if (typeof request.system === "string") {
      messages.push({ role: "system", content: request.system });
    } else if (Array.isArray(request.system)) {
      const textParts = request.system
        .filter((item: any) => item.type === "text" && item.text)
        .map((item: any) => ({ type: "text", text: item.text, cache_control: item.cache_control }));
      messages.push({ role: "system", content: textParts });
    }
  }

  // Convert user messages - extract tool_result parts
  for (const msg of request.messages || []) {
    if (msg.role === "user") {
      const toolParts = msg.content.filter((c: any) => c.type === "tool_result");
      for (const tool of toolParts) {
        messages.push({
          role: "tool",
          content: typeof tool.content === "string" ? tool.content : JSON.stringify(tool.content),
          tool_call_id: tool.tool_use_id,
        });
      }
    } else if (msg.role === "assistant") {
      const assistantMessage: UnifiedMessage = { role: "assistant", content: "" };
      // Extract text, tool_use, and thinking parts...
      messages.push(assistantMessage);
    }
  }

  // Convert thinking config to reasoning
  if (request.thinking) {
    result.reasoning = {
      effort: getThinkLevel(request.thinking.budget_tokens),
      enabled: request.thinking.type === "enabled",
    };
  }

  return result;
}
```

**Why This Matters**: Enables using Anthropic's native API format while routing to any backend provider.

---

### 4.99 Stream Usage Injection (claude-code-router - TypeScript)

**Pattern**: Inject stream_options to enable usage tracking in streaming responses.

```typescript
// packages/core/src/transformer/streamoptions.transformer.ts
export class StreamOptionsTransformer implements Transformer {
  name = "streamoptions";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    // Only add stream_options if streaming is enabled
    if (!request.stream) return request;

    // Enable usage tracking in stream response
    request.stream_options = {
      include_usage: true,
    };

    return request;
  }
}
```

**Why This Matters**: Enables token usage tracking in streaming responses, required for accurate billing/metering.

---

### 4.100 Groq Tool ID and Schema Normalization (claude-code-router - TypeScript)

**Pattern**: Normalize Groq-specific quirks: generate tool IDs and strip $schema from tool definitions.

```typescript
// packages/core/src/transformer/groq.transformer.ts
import { v4 as uuidv4 } from "uuid";

export class GroqTransformer implements Transformer {
  name = "groq";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    // Strip cache_control (Groq doesn't support prompt caching)
    request.messages.forEach((msg) => {
      if (Array.isArray(msg.content)) {
        (msg.content as MessageContent[]).forEach((item) => {
          if ((item as TextContent).cache_control) {
            delete (item as TextContent).cache_control;
          }
        });
      }
    });

    // Remove $schema from tool parameters (Groq rejects it)
    if (Array.isArray(request.tools)) {
      request.tools.forEach((tool) => {
        delete tool.function.parameters.$schema;
      });
    }

    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    // In streaming: generate proper UUIDs for tool calls
    if (data.choices?.[0]?.delta?.tool_calls?.length) {
      data.choices?.[0]?.delta?.tool_calls.forEach((tool: any) => {
        tool.id = `call_${uuidv4()}`;
      });
    }
  }
}
```

**Why This Matters**: Makes Groq compatible with Claude Code's tool use expectations.

---

### 4.101 Cerebras Reasoning Field Handling (claude-code-router - TypeScript)

**Pattern**: Strip reasoning config for providers that don't support it, with explicit disable flag.

```typescript
// packages/core/src/transformer/cerebras.transformer.ts
export class CerebrasTransformer implements Transformer {
  name = "cerebras";

  async transformRequestIn(request: UnifiedChatRequest, provider: LLMProvider): Promise<Record<string, unknown>> {
    const transformedRequest = JSON.parse(JSON.stringify(request));

    // Handle reasoning config
    if (transformedRequest.reasoning) {
      delete transformedRequest.reasoning; // Cerebras doesn't support reasoning
    } else {
      transformedRequest.disable_reasoning = false; // Explicit disable
    }

    return {
      body: transformedRequest,
      config: {
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
      },
    };
  }
}
```

**Why This Matters**: Enables fast inference via Cerebras while gracefully handling unsupported features.

---

### 4.102 Vertex Claude URL Construction with Regional Endpoints (claude-code-router - TypeScript)

**Pattern**: Construct Vertex AI Claude endpoint URLs with proper regional routing.

```typescript
// packages/core/src/transformer/vertex-claude.transformer.ts
export class VertexClaudeTransformer implements Transformer {
  name = "vertex-claude";

  async transformRequestIn(request: UnifiedChatRequest, provider: LLMProvider): Promise<Record<string, any>> {
    let projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-east5"; // Claude limited regions

    // Try extracting from service account file
    if (!projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
      if (credentials?.project_id) projectId = credentials.project_id;
    }

    const accessToken = await getAccessToken();
    return {
      body: buildRequestBody(request),
      config: {
        // Regional endpoint with Anthropic publisher path
        url: new URL(`/v1/projects/${projectId}/locations/${location}/publishers/anthropic/models/${request.model}:${request.stream ? "streamRawPredict" : "rawPredict"}`, `https://${location}-aiplatform.googleapis.com`).toString(),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    };
  }
}
```

**Why This Matters**: Enables using Claude models via Vertex AI with proper authentication and regional routing.

---

### 4.103 DashMap-Based Concurrent Token Pool with Subscription Tier Priority (Antigravity-Manager - Rust)

**Pattern**: Use DashMap for lock-free concurrent token storage with priority sorting by subscription tier.

```rust
// src-tauri/src/proxy/token_manager.rs
use dashmap::DashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

pub struct TokenManager {
    tokens: Arc<DashMap<String, ProxyToken>>,  // account_id -> ProxyToken
    current_index: Arc<AtomicUsize>,
    rate_limit_tracker: Arc<RateLimitTracker>,
    session_accounts: Arc<DashMap<String, String>>, // SessionID -> AccountID
}

impl TokenManager {
    pub async fn get_token_internal(&self, quota_group: &str, force_rotate: bool, session_id: Option<&str>) -> Result<(String, String, String), String> {
        let mut tokens_snapshot: Vec<ProxyToken> = self.tokens.iter().map(|e| e.value().clone()).collect();

        // Sort by subscription tier priority: ULTRA > PRO > FREE
        // Rationale: ULTRA/PRO reset fast, prefer consuming; FREE resets slow, use as fallback
        tokens_snapshot.sort_by(|a, b| {
            let tier_priority = |tier: &Option<String>| match tier.as_deref() {
                Some("ULTRA") => 0,
                Some("PRO") => 1,
                Some("FREE") => 2,
                _ => 3,
            };
            tier_priority(&a.subscription_tier).cmp(&tier_priority(&b.subscription_tier))
        });

        // Round-robin selection with atomic index
        let start_idx = self.current_index.fetch_add(1, Ordering::SeqCst) % total;
        // ...
    }
}
```

**Why This Matters**: Enables efficient concurrent token access without blocking, with intelligent priority-based selection to maximize quota utilization.

---

### 4.104 Sticky Session Configuration with Three Scheduling Modes (Antigravity-Manager - Rust)

**Pattern**: Configurable session affinity with explicit scheduling modes for different use cases.

```rust
// src-tauri/src/proxy/sticky_config.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum SchedulingMode {
    /// Cache-first: Lock to same account, wait when rate-limited
    /// Maximizes Prompt Caching hit rate
    CacheFirst,

    /// Balance: Lock to same account, switch immediately when rate-limited
    /// Balances success rate and performance
    Balance,

    /// Performance-first: Pure round-robin
    /// Best load balancing, but no caching benefit
    PerformanceFirst,
}

impl Default for SchedulingMode {
    fn default() -> Self {
        Self::Balance  // Sensible default
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StickySessionConfig {
    pub mode: SchedulingMode,
    pub max_wait_seconds: u64,  // Max wait in CacheFirst mode
}
```

**Why This Matters**: Provides flexibility to tune between prompt caching efficiency and multi-account load distribution.

---

### 4.105 Session Fingerprinting via SHA256 Content Hashing (Antigravity-Manager - Rust)

**Pattern**: Generate stable session IDs from message content using SHA256 hashing for session affinity.

```rust
// src-tauri/src/proxy/session_manager.rs
use sha2::{Sha256, Digest};

pub struct SessionManager;

impl SessionManager {
    pub fn extract_session_id(request: &ClaudeRequest) -> String {
        // 1. Prefer user_id from metadata
        if let Some(metadata) = &request.metadata {
            if let Some(user_id) = &metadata.user_id {
                if !user_id.is_empty() && !user_id.contains("session-") {
                    return user_id.clone();
                }
            }
        }

        // 2. Fallback: SHA256 fingerprint of first meaningful user message
        let mut hasher = Sha256::new();
        hasher.update(request.model.as_bytes());  // Mix in model for differentiation

        for msg in &request.messages {
            if msg.role != "user" { continue; }

            let text = extract_text_content(&msg.content);
            let clean_text = text.trim();

            // Skip short messages (likely probes) or system tags
            if clean_text.len() > 10 && !clean_text.contains("<system-reminder>") {
                hasher.update(clean_text.as_bytes());
                break;  // Only first meaningful message as anchor
            }
        }

        let hash = format!("{:x}", hasher.finalize());
        format!("sid-{}", &hash[..16])  // Truncate to 16 chars
    }
}
```

**Why This Matters**: Enables session affinity for stateless proxy without requiring explicit session IDs from clients.

---

### 4.106 Double-Layer Signature Cache with TTL (Antigravity-Manager - Rust)

**Pattern**: Two-layer cache for thinking signatures with automatic TTL expiration.

```rust
// src-tauri/src/proxy/signature_cache.rs
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const SIGNATURE_TTL: Duration = Duration::from_secs(2 * 60 * 60);  // 2 hours
const MIN_SIGNATURE_LENGTH: usize = 50;

#[derive(Clone, Debug)]
struct CacheEntry<T> {
    data: T,
    timestamp: SystemTime,
}

impl<T> CacheEntry<T> {
    fn is_expired(&self) -> bool {
        self.timestamp.elapsed().unwrap_or(Duration::ZERO) > SIGNATURE_TTL
    }
}

pub struct SignatureCache {
    /// Layer 1: Tool Use ID -> Thinking Signature
    tool_signatures: Mutex<HashMap<String, CacheEntry<String>>>,

    /// Layer 2: Signature -> Model Family (cross-model compatibility checks)
    thinking_families: Mutex<HashMap<String, CacheEntry<String>>>,
}

impl SignatureCache {
    pub fn global() -> &'static SignatureCache {
        static INSTANCE: OnceLock<SignatureCache> = OnceLock::new();
        INSTANCE.get_or_init(SignatureCache::new)
    }

    pub fn cache_tool_signature(&self, tool_use_id: &str, signature: String) {
        if signature.len() < MIN_SIGNATURE_LENGTH { return; }

        if let Ok(mut cache) = self.tool_signatures.lock() {
            cache.insert(tool_use_id.to_string(), CacheEntry::new(signature));

            // Cleanup when cache grows too large
            if cache.len() > 1000 {
                cache.retain(|_, v| !v.is_expired());
            }
        }
    }
}
```

**Why This Matters**: Enables signature recovery for tool calls while preventing memory bloat with TTL-based eviction.

---

### 4.107 Intelligent Rate Limit Tracking with Reason Classification (Antigravity-Manager - Rust)

**Pattern**: Classify rate limit reasons and apply different backoff strategies per reason type.

```rust
// src-tauri/src/proxy/rate_limit.rs
use dashmap::DashMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RateLimitReason {
    QuotaExhausted,          // Daily quota used up
    RateLimitExceeded,       // Requests per minute limit
    ModelCapacityExhausted,  // No GPU instances available
    ServerError,             // 5xx errors
    Unknown,
}

pub struct RateLimitTracker {
    limits: DashMap<String, RateLimitInfo>,
    failure_counts: DashMap<String, u32>,  // For exponential backoff
}

impl RateLimitTracker {
    pub fn parse_from_error(&self, account_id: &str, status: u16, retry_after_header: Option<&str>, body: &str, model: Option<String>) -> Option<RateLimitInfo> {
        let reason = self.parse_rate_limit_reason(body);

        // Different default lockouts per reason type
        let retry_sec = match reason {
            RateLimitReason::QuotaExhausted => {
                // Exponential backoff: 60s, 5min, 30min, 2h
                let failure_count = self.failure_counts.entry(account_id.to_string()).or_insert(0);
                *failure_count += 1;
                match *failure_count {
                    1 => 60,
                    2 => 300,
                    3 => 1800,
                    _ => 7200,
                }
            },
            RateLimitReason::RateLimitExceeded => 30,      // Short-lived, quick retry
            RateLimitReason::ModelCapacityExhausted => 15, // Transient, even quicker
            RateLimitReason::ServerError => 20,            // Soft backoff
            RateLimitReason::Unknown => 60,
        };
        // ...
    }

    fn parse_rate_limit_reason(&self, body: &str) -> RateLimitReason {
        // Prioritize "per minute" detection over "exhausted" to avoid TPM misclassification
        if body.to_lowercase().contains("per minute") {
            RateLimitReason::RateLimitExceeded
        } else if body.to_lowercase().contains("exhausted") {
            RateLimitReason::QuotaExhausted
        } else {
            RateLimitReason::Unknown
        }
    }
}
```

**Why This Matters**: Applies intelligent backoff strategies based on the actual cause of rate limiting.

---

### 4.108 Optimistic Reset Strategy for Race Conditions (Antigravity-Manager - Rust)

**Pattern**: Two-layer defense against timing race conditions when all accounts appear rate-limited.

```rust
// src-tauri/src/proxy/token_manager.rs (in get_token_internal)
let mut token = match target_token {
    Some(t) => t,
    None => {
        // Optimistic reset: Two-layer protection
        let min_wait = tokens_snapshot.iter()
            .filter_map(|t| self.rate_limit_tracker.get_reset_seconds(&t.account_id))
            .min();

        // Layer 1: If shortest wait <= 2s, apply 500ms buffer for state sync
        if let Some(wait_sec) = min_wait {
            if wait_sec <= 2 {
                tracing::warn!("All accounts rate-limited but wait is {}s. Applying 500ms buffer...", wait_sec);
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                // Retry account selection
                let retry_token = tokens_snapshot.iter()
                    .find(|t| !self.is_rate_limited(&t.account_id));

                if let Some(t) = retry_token {
                    tracing::info!("✅ Buffer delay successful!");
                    t.clone()
                } else {
                    // Layer 2: Buffer failed, execute optimistic reset
                    tracing::warn!("Buffer delay failed. Executing optimistic reset...");
                    self.rate_limit_tracker.clear_all();

                    // Try again with cleared state
                    tokens_snapshot.iter()
                        .find(|t| !attempted.contains(&t.account_id))
                        .map(|t| t.clone())
                        .ok_or("All accounts failed after optimistic reset")?
                }
            } else {
                return Err(format!("All accounts limited. Wait {}s.", wait_sec));
            }
        }
    }
};
```

**Why This Matters**: Handles race conditions in distributed systems where rate limit state may be slightly stale.

---

### 4.109 Duration String Parsing with Regex (Antigravity-Manager - Rust)

**Pattern**: Parse Google API duration strings like "1h16m0.667s" into milliseconds.

```rust
// src-tauri/src/proxy/upstream/retry.rs
use regex::Regex;
use once_cell::sync::Lazy;

static DURATION_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"([\d.]+)\s*(ms|s|m|h)").unwrap()
});

pub fn parse_duration_ms(duration_str: &str) -> Option<u64> {
    let mut total_ms: f64 = 0.0;
    let mut matched = false;

    for cap in DURATION_RE.captures_iter(duration_str) {
        matched = true;
        let value: f64 = cap[1].parse().ok()?;
        let unit = &cap[2];

        match unit {
            "ms" => total_ms += value,
            "s" => total_ms += value * 1000.0,
            "m" => total_ms += value * 60.0 * 1000.0,
            "h" => total_ms += value * 60.0 * 60.0 * 1000.0,
            _ => {}
        }
    }

    if matched { Some(total_ms.round() as u64) } else { None }
}

// Usage: parse_duration_ms("1h16m0.667s") => Some(4560667)
```

**Why This Matters**: Enables precise retry timing based on Google API's duration format.

---

### 4.110 Tool Argument Remapping for Gemini-Claude Compatibility (Antigravity-Manager - Rust)

**Pattern**: Remap Gemini tool call arguments to match Claude Code's expected schema.

```rust
// src-tauri/src/proxy/mappers/claude/streaming.rs
fn remap_function_call_args(tool_name: &str, args: &mut serde_json::Value) {
    if let Some(obj) = args.as_object_mut() {
        match tool_name.to_lowercase().as_str() {
            "grep" | "glob" => {
                // Gemini uses "query", Claude Code expects "pattern"
                if let Some(query) = obj.remove("query") {
                    if !obj.contains_key("pattern") {
                        obj.insert("pattern".to_string(), query);
                    }
                }

                // CRITICAL: Claude Code uses "path" (string), NOT "paths" (array)!
                if !obj.contains_key("path") {
                    if let Some(paths) = obj.remove("paths") {
                        let path_str = if let Some(arr) = paths.as_array() {
                            arr.get(0)
                                .and_then(|v| v.as_str())
                                .unwrap_or(".")
                                .to_string()
                        } else if let Some(s) = paths.as_str() {
                            s.to_string()
                        } else {
                            ".".to_string()
                        };
                        obj.insert("path".to_string(), serde_json::json!(path_str));
                    } else {
                        obj.insert("path".to_string(), serde_json::json!("."));
                    }
                }
            }
            "read" => {
                // Gemini: "path" -> Claude Code: "file_path"
                if let Some(path) = obj.remove("path") {
                    if !obj.contains_key("file_path") {
                        obj.insert("file_path".to_string(), path);
                    }
                }
            }
            _ => {}
        }
    }
}
```

**Why This Matters**: Makes Gemini models usable with Claude Code by translating tool call schemas.

---

### 4.111 Streaming State Machine with Block Type Tracking (Antigravity-Manager - Rust)

**Pattern**: State machine for converting Gemini SSE to Claude SSE format with proper block management.

```rust
// src-tauri/src/proxy/mappers/claude/streaming.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockType {
    None,
    Text,
    Thinking,
    Function,
}

pub struct StreamingState {
    block_type: BlockType,
    pub block_index: usize,
    pub message_start_sent: bool,
    pub message_stop_sent: bool,
    used_tool: bool,
    signatures: SignatureManager,
    trailing_signature: Option<String>,
    pub model_name: Option<String>,
}

impl StreamingState {
    pub fn start_block(&mut self, block_type: BlockType, content_block: serde_json::Value) -> Vec<Bytes> {
        let mut chunks = Vec::new();

        // End current block before starting new one
        if self.block_type != BlockType::None {
            chunks.extend(self.end_block());
        }

        chunks.push(self.emit("content_block_start", json!({
            "type": "content_block_start",
            "index": self.block_index,
            "content_block": content_block
        })));

        self.block_type = block_type;
        chunks
    }

    pub fn end_block(&mut self) -> Vec<Bytes> {
        if self.block_type == BlockType::None { return vec![]; }

        let mut chunks = Vec::new();

        // Emit pending signature for thinking blocks
        if self.block_type == BlockType::Thinking && self.signatures.has_pending() {
            if let Some(signature) = self.signatures.consume() {
                chunks.push(self.emit_delta("signature_delta", json!({ "signature": signature })));
            }
        }

        chunks.push(self.emit("content_block_stop", json!({
            "type": "content_block_stop",
            "index": self.block_index
        })));

        self.block_index += 1;
        self.block_type = BlockType::None;
        chunks
    }
}
```

**Why This Matters**: Enables correct SSE format conversion between Gemini and Claude formats with proper content block lifecycle.

---

### 4.112 Base64 Signature Decoding for Gemini-Claude Bridge (Antigravity-Manager - Rust)

**Pattern**: Decode Base64-encoded thinking signatures from Gemini to raw format for Claude.

```rust
// src-tauri/src/proxy/mappers/claude/streaming.rs (in PartProcessor::process)
pub fn process(&mut self, part: &GeminiPart) -> Vec<Bytes> {
    // Decode Base64 signature if present (Gemini sends Base64, Claude expects Raw)
    let signature = part.thought_signature.as_ref().map(|sig| {
        use base64::Engine;
        match base64::engine::general_purpose::STANDARD.decode(sig) {
            Ok(decoded_bytes) => {
                match String::from_utf8(decoded_bytes) {
                    Ok(decoded_str) => {
                        tracing::debug!("[Streaming] Decoded base64 signature (len {} -> {})",
                            sig.len(), decoded_str.len());
                        decoded_str
                    },
                    Err(_) => sig.clone()  // Not valid UTF-8, keep as is
                }
            },
            Err(_) => sig.clone()  // Not base64, keep as is
        }
    });
    // ... use decoded signature
}
```

**Why This Matters**: Handles the encoding difference between Gemini and Claude thinking signature formats.

---

### 4.113 Upstream Client with Endpoint Fallback (Antigravity-Manager - Rust)

**Pattern**: Multi-endpoint fallback with intelligent retry conditions.

```rust
// src-tauri/src/proxy/upstream/client.rs
const V1_INTERNAL_BASE_URL_FALLBACKS: [&str; 2] = [
    "https://cloudcode-pa.googleapis.com/v1internal",        // Production (stable)
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal",  // Daily (new features)
];

pub struct UpstreamClient {
    http_client: Client,
}

impl UpstreamClient {
    fn should_try_next_endpoint(status: StatusCode) -> bool {
        status == StatusCode::TOO_MANY_REQUESTS
            || status == StatusCode::REQUEST_TIMEOUT
            || status == StatusCode::NOT_FOUND
            || status.is_server_error()
    }

    pub async fn call_v1_internal(&self, method: &str, access_token: &str, body: Value, query_string: Option<&str>) -> Result<Response, String> {
        let mut last_err: Option<String> = None;

        for (idx, base_url) in V1_INTERNAL_BASE_URL_FALLBACKS.iter().enumerate() {
            let url = Self::build_url(base_url, method, query_string);
            let has_next = idx + 1 < V1_INTERNAL_BASE_URL_FALLBACKS.len();

            let response = self.http_client.post(&url).headers(headers.clone()).json(&body).send().await;

            match response {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        if idx > 0 {
                            tracing::info!("✓ Upstream fallback succeeded | Endpoint: {} | Attempt: {}", base_url, idx + 1);
                        }
                        return Ok(resp);
                    }

                    if has_next && Self::should_try_next_endpoint(status) {
                        tracing::warn!("Endpoint returned {} at {}, trying next", status, base_url);
                        last_err = Some(format!("Upstream {} returned {}", base_url, status));
                        continue;
                    }

                    return Ok(resp);  // Non-retryable error
                }
                Err(e) => {
                    last_err = Some(format!("Request failed at {}: {}", base_url, e));
                    if !has_next { break; }
                    continue;
                }
            }
        }

        Err(last_err.unwrap_or_else(|| "All endpoints failed".to_string()))
    }
}
```

**Why This Matters**: Provides resilience against endpoint-specific failures with automatic fallback.

---

### 4.114 Token Refresh with Proactive Expiry Check (Antigravity-Manager - Rust)

**Pattern**: Check token expiry with buffer and refresh proactively before requests.

```rust
// src-tauri/src/proxy/token_manager.rs (in get_token_internal)
// Check if token is about to expire (5 minute buffer)
let now = chrono::Utc::now().timestamp();
if now >= token.timestamp - 300 {  // 300 seconds = 5 minutes
    tracing::debug!("Account {} token expiring soon, refreshing...", token.email);

    match crate::modules::oauth::refresh_access_token(&token.refresh_token).await {
        Ok(token_response) => {
            // Update local memory object
            token.access_token = token_response.access_token.clone();
            token.expires_in = token_response.expires_in;
            token.timestamp = now + token_response.expires_in;

            // Sync to shared DashMap
            if let Some(mut entry) = self.tokens.get_mut(&token.account_id) {
                entry.access_token = token.access_token.clone();
                entry.expires_in = token.expires_in;
                entry.timestamp = token.timestamp;
            }

            // Persist to disk (avoid frequent refreshes after restart)
            self.save_refreshed_token(&token.account_id, &token_response).await?;
        }
        Err(e) => {
            // Handle invalid_grant by disabling account
            if e.contains("invalid_grant") {
                tracing::error!("Disabling account due to invalid_grant: {}", token.email);
                self.disable_account(&token.account_id, &format!("invalid_grant: {}", e)).await?;
                self.tokens.remove(&token.account_id);
            }
            attempted.insert(token.account_id.clone());
            continue;  // Try next account
        }
    }
}
```

**Why This Matters**: Prevents request failures due to token expiry by proactively refreshing.

---

### 4.115 Thinking Recovery via Synthetic Message Injection (Antigravity-Manager - Rust)

**Pattern**: Detect broken tool loops and inject synthetic messages to recover.

```rust
// src-tauri/src/proxy/mappers/claude/thinking_utils.rs
pub fn analyze_conversation_state(messages: &[Message]) -> ConversationState {
    let mut state = ConversationState::default();

    // Find last assistant message
    for (i, msg) in messages.iter().enumerate().rev() {
        if msg.role == "assistant" {
            state.last_assistant_idx = Some(i);
            break;
        }
    }

    // Check if last message is ToolResult (indicates tool loop)
    if let Some(last_msg) = messages.last() {
        if last_msg.role == "user" {
            if let MessageContent::Array(blocks) = &last_msg.content {
                if blocks.iter().any(|b| matches!(b, ContentBlock::ToolResult { .. })) {
                    state.in_tool_loop = true;
                }
            }
        }
    }
    state
}

pub fn close_tool_loop_for_thinking(messages: &mut Vec<Message>) {
    let state = analyze_conversation_state(messages);

    if !state.in_tool_loop { return; }

    // Check if last assistant message has thinking block
    let has_thinking = /* check logic */;

    if !has_thinking {
        tracing::info!("[Thinking-Recovery] Detected broken tool loop. Injecting synthetic messages.");

        // Inject synthetic messages to close the loop
        messages.push(Message {
            role: "assistant".to_string(),
            content: MessageContent::Array(vec![
                ContentBlock::Text {
                    text: "[System: Tool loop recovered. Previous tool execution accepted.]".to_string()
                }
            ])
        });
        messages.push(Message {
            role: "user".to_string(),
            content: MessageContent::Array(vec![
                ContentBlock::Text {
                    text: "Please continue with the next step.".to_string()
                }
            ])
        });
    }
}
```

**Why This Matters**: Enables recovery from broken tool loops when thinking signatures are stripped.

---

### 4.116 Global Thought Signature Store with Length-Based Update (Antigravity-Manager - Rust)

**Pattern**: Global singleton for signature storage that only stores longer signatures.

```rust
// src-tauri/src/proxy/mappers/signature_store.rs
use std::sync::{Mutex, OnceLock};

static GLOBAL_THOUGHT_SIG: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn get_thought_sig_storage() -> &'static Mutex<Option<String>> {
    GLOBAL_THOUGHT_SIG.get_or_init(|| Mutex::new(None))
}

/// Store signature only if longer than existing (avoid partial overwrites)
pub fn store_thought_signature(sig: &str) {
    if let Ok(mut guard) = get_thought_sig_storage().lock() {
        let should_store = match &*guard {
            None => true,
            Some(existing) => sig.len() > existing.len(),  // Only longer signatures
        };

        if should_store {
            tracing::debug!("[ThoughtSig] Storing new signature (len: {}, replacing: {:?})",
                sig.len(), guard.as_ref().map(|s| s.len()));
            *guard = Some(sig.to_string());
        }
    }
}

pub fn get_thought_signature() -> Option<String> {
    if let Ok(guard) = get_thought_sig_storage().lock() {
        guard.clone()
    } else {
        None
    }
}
```

**Why This Matters**: Prevents partial/short signatures from overwriting valid complete signatures.

---

### 4.117 Simple Rate Limiter with Minimum Interval (Antigravity-Manager - Rust)

**Pattern**: Ensure minimum interval between API calls to prevent burst rate limiting.

```rust
// src-tauri/src/proxy/common/rate_limiter.rs
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration, Instant};

pub struct RateLimiter {
    min_interval: Duration,
    last_call: Arc<Mutex<Option<Instant>>>,
}

impl RateLimiter {
    pub fn new(min_interval_ms: u64) -> Self {
        Self {
            min_interval: Duration::from_millis(min_interval_ms),
            last_call: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn wait(&self) {
        let mut last = self.last_call.lock().await;
        if let Some(last_time) = *last {
            let elapsed = last_time.elapsed();
            if elapsed < self.min_interval {
                sleep(self.min_interval - elapsed).await;
            }
        }
        *last = Some(Instant::now());
    }
}

// Usage: Ensure >= 500ms between calls
// let limiter = RateLimiter::new(500);
// limiter.wait().await;
// make_api_call().await;
```

**Why This Matters**: Simple pattern to prevent burst requests that would trigger rate limits.

---

### 4.118 Account Disabling with Reason Logging (Antigravity-Manager - Rust)

**Pattern**: Automatically disable accounts that fail with invalid_grant and persist the reason.

```rust
// src-tauri/src/proxy/token_manager.rs
async fn disable_account(&self, account_id: &str, reason: &str) -> Result<(), String> {
    let path = if let Some(entry) = self.tokens.get(account_id) {
        entry.account_path.clone()
    } else {
        self.data_dir.join("accounts").join(format!("{}.json", account_id))
    };

    let mut content: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?
    ).map_err(|e| format!("Parse failed: {}", e))?;

    let now = chrono::Utc::now().timestamp();
    content["disabled"] = serde_json::Value::Bool(true);
    content["disabled_at"] = serde_json::Value::Number(now.into());
    content["disabled_reason"] = serde_json::Value::String(truncate_reason(reason, 800));

    std::fs::write(&path, serde_json::to_string_pretty(&content).unwrap())
        .map_err(|e| format!("Write failed: {}", e))?;

    tracing::warn!("Account disabled: {} ({:?})", account_id, path);
    Ok(())
}

fn truncate_reason(reason: &str, max_len: usize) -> String {
    if reason.chars().count() <= max_len {
        reason.to_string()
    } else {
        let mut s: String = reason.chars().take(max_len).collect();
        s.push('…');
        s
    }
}
```

**Why This Matters**: Provides audit trail for account issues and prevents repeated failed authentications.

---

### 4.119 Proactive Background Token Refresh Queue (opencode-antigravity-auth)

**Pattern**: Background refresh queue that proactively refreshes tokens before they expire.

**Source File**: `src/plugin/refresh-queue.ts`

**Implementation**:

```typescript
export class ProactiveRefreshQueue {
  private readonly config: ProactiveRefreshConfig;
  private accountManager: AccountManager | null = null;

  private state: RefreshQueueState = {
    isRunning: false,
    intervalHandle: null,
    isRefreshing: false,
    lastCheckTime: 0,
    refreshCount: 0,
    errorCount: 0,
  };

  needsRefresh(account: ManagedAccount): boolean {
    if (!account.expires) return false;

    const now = Date.now();
    const bufferMs = this.config.bufferSeconds * 1000;
    const refreshThreshold = now + bufferMs;

    return account.expires <= refreshThreshold;
  }

  private async runRefreshCheck(): Promise<void> {
    if (this.state.isRefreshing) return; // Skip if already refreshing

    this.state.isRefreshing = true;
    this.state.lastCheckTime = Date.now();

    try {
      const accountsToRefresh = this.getAccountsNeedingRefresh();

      // Refresh accounts serially to avoid concurrent refresh storms
      for (const account of accountsToRefresh) {
        if (!this.state.isRunning) break;

        const auth = this.accountManager.toAuthDetails(account);
        const refreshed = await this.refreshToken(auth, account);

        if (refreshed) {
          this.accountManager.updateFromAuth(account, refreshed);
          this.state.refreshCount++;
          await this.accountManager.saveToDisk();
        }
      }
    } finally {
      this.state.isRefreshing = false;
    }
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    const intervalMs = this.config.checkIntervalSeconds * 1000;

    // Initial check after 5s delay (let things settle)
    setTimeout(() => {
      if (this.state.isRunning) this.runRefreshCheck();
    }, 5000);

    // Periodic checks
    this.state.intervalHandle = setInterval(() => {
      this.runRefreshCheck();
    }, intervalMs);
  }
}
```

**Key Design Decisions**:

1. **Buffer time**: Default 30 minutes before expiry (configurable)
2. **Serial refresh**: Prevents "refresh storms" when multiple tokens expire together
3. **Non-blocking**: Never blocks user requests
4. **Persists after refresh**: Saves refreshed tokens to disk immediately

**Why This Matters**: Eliminates request-blocking token refresh latency - users never wait for token refresh during API calls.

---

### 4.120 Account Selection Strategies with Quota Key Tracking (opencode-antigravity-auth)

**Pattern**: Multiple account selection strategies optimized for different use cases.

**Source File**: `src/plugin/accounts.ts`, `src/plugin/config/schema.ts`

**Implementation**:

```typescript
export type AccountSelectionStrategy = 'sticky' | 'round-robin' | 'hybrid';

export type BaseQuotaKey = "claude" | "gemini-antigravity" | "gemini-cli";
export type QuotaKey = BaseQuotaKey | `${BaseQuotaKey}:${string}`;

function getQuotaKey(family: ModelFamily, headerStyle: HeaderStyle, model?: string | null): QuotaKey {
  if (family === "claude") return "claude";
  const base = headerStyle === "gemini-cli" ? "gemini-cli" : "gemini-antigravity";
  if (model) return `${base}:${model}`;
  return base;
}

getCurrentOrNextForFamily(
  family: ModelFamily,
  model?: string | null,
  strategy: AccountSelectionStrategy = 'sticky',
  headerStyle: HeaderStyle = 'antigravity',
  pidOffsetEnabled: boolean = false,
): ManagedAccount | null {
  const quotaKey = getQuotaKey(family, headerStyle, model);

  if (strategy === 'round-robin') {
    const next = this.getNextForFamily(family, model);
    if (next) {
      this.markTouchedForQuota(next, quotaKey);
      this.currentAccountIndexByFamily[family] = next.index;
    }
    return next;
  }

  if (strategy === 'hybrid') {
    const freshAccounts = this.getFreshAccountsForQuota(quotaKey, family, model);
    if (freshAccounts.length > 0) {
      const fresh = freshAccounts[0];
      if (fresh) {
        fresh.lastUsed = nowMs();
        this.markTouchedForQuota(fresh, quotaKey);
        this.currentAccountIndexByFamily[family] = fresh.index;
        return fresh;
      }
    }
  }

  // PID-based offset for multi-session distribution (opt-in)
  if (pidOffsetEnabled && !this.sessionOffsetApplied[family]) {
    const pidOffset = process.pid % this.accounts.length;
    const baseIndex = this.currentAccountIndexByFamily[family] ?? 0;
    this.currentAccountIndexByFamily[family] = (baseIndex + pidOffset) % this.accounts.length;
    this.sessionOffsetApplied[family] = true;
  }

  // Default: sticky strategy
  const current = this.getCurrentAccountForFamily(family);
  if (current && !isRateLimitedForFamily(current, family, model)) {
    current.lastUsed = nowMs();
    this.markTouchedForQuota(current, quotaKey);
    return current;
  }

  return this.getNextForFamily(family, model);
}
```

**Strategy Descriptions**:

- **`sticky`**: Use same account until rate-limited (preserves prompt cache)
- **`round-robin`**: Rotate to next account on every request (maximum throughput)
- **`hybrid`**: Touch all fresh accounts first to sync reset timers, then sticky

**Why This Matters**: Different workloads need different strategies - single sessions benefit from sticky (cache), parallel agents benefit from round-robin or PID offset.

---

### 4.121 Rate Limit State with Time-Window Deduplication (opencode-antigravity-auth)

**Pattern**: Prevents incorrect exponential backoff when multiple parallel requests hit 429 simultaneously.

**Source File**: `src/plugin.ts`

**Implementation**:

```typescript
const RATE_LIMIT_DEDUP_WINDOW_MS = 2000; // 2 seconds
const RATE_LIMIT_STATE_RESET_MS = 120_000; // Reset after 2 minutes

interface RateLimitState {
  consecutive429: number;
  lastAt: number;
  quotaKey: string;
}

const rateLimitStateByAccountQuota = new Map<string, RateLimitState>();

function getRateLimitBackoff(accountIndex: number, quotaKey: string, serverRetryAfterMs: number | null): { attempt: number; delayMs: number; isDuplicate: boolean } {
  const now = Date.now();
  const stateKey = `${accountIndex}:${quotaKey}`;
  const previous = rateLimitStateByAccountQuota.get(stateKey);

  // Check if this is a duplicate 429 within the dedup window
  if (previous && now - previous.lastAt < RATE_LIMIT_DEDUP_WINDOW_MS) {
    // Same rate limit event from concurrent request - don't increment
    const baseDelay = serverRetryAfterMs ?? 1000;
    const backoffDelay = Math.min(baseDelay * Math.pow(2, previous.consecutive429 - 1), 60_000);
    return {
      attempt: previous.consecutive429,
      delayMs: Math.max(baseDelay, backoffDelay),
      isDuplicate: true,
    };
  }

  // Check if we should reset or increment
  const attempt = previous && now - previous.lastAt < RATE_LIMIT_STATE_RESET_MS ? previous.consecutive429 + 1 : 1;

  rateLimitStateByAccountQuota.set(stateKey, {
    consecutive429: attempt,
    lastAt: now,
    quotaKey,
  });

  const baseDelay = serverRetryAfterMs ?? 1000;
  const backoffDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), 60_000);
  return { attempt, delayMs: Math.max(baseDelay, backoffDelay), isDuplicate: false };
}
```

**Problem Solved**: When 5 concurrent subagents hit 429 simultaneously, each would increment the counter, causing 2^5 backoff instead of 2^1.

**Why This Matters**: Prevents massive backoff delays when running parallel subagents that hit rate limits at the same time.

---

### 4.122 Dual-TTL Signature Cache with Atomic Writes (opencode-antigravity-auth)

**Pattern**: Two-tier caching (memory + disk) with atomic file writes for thinking signature persistence.

**Source File**: `src/plugin/cache/signature-cache.ts`

**Implementation**:

```typescript
interface CacheEntry {
  value: string;
  timestamp: number;
  thinkingText?: string; // Optional for recovery
  textPreview?: string; // For debugging
  toolIds?: string[]; // Associated tool calls
}

export class SignatureCache {
  private cache: Map<string, CacheEntry> = new Map();

  private memoryTtlMs: number; // Short: 1 hour default
  private diskTtlMs: number; // Long: 48 hours default
  private dirty: boolean = false;
  private writeTimer: ReturnType<typeof setInterval> | null = null;

  storeThinking(key: string, thinkingText: string, signature: string, toolIds?: string[]): void {
    this.cache.set(key, {
      value: signature,
      timestamp: Date.now(),
      thinkingText,
      textPreview: thinkingText.slice(0, 100),
      toolIds,
    });
    this.dirty = true;
  }

  private saveToDisk(): boolean {
    // Step 1: Load existing disk entries
    let existingEntries: Record<string, CacheEntry> = {};
    if (existsSync(this.cacheFilePath)) {
      const content = readFileSync(this.cacheFilePath, "utf-8");
      existingEntries = JSON.parse(content).entries || {};
    }

    // Step 2: Filter by disk TTL
    const validDiskEntries: Record<string, CacheEntry> = {};
    for (const [key, entry] of Object.entries(existingEntries)) {
      if (Date.now() - entry.timestamp <= this.diskTtlMs) {
        validDiskEntries[key] = entry;
      }
    }

    // Step 3: Merge - memory entries take precedence
    const mergedEntries = { ...validDiskEntries };
    for (const [key, entry] of this.cache.entries()) {
      mergedEntries[key] = entry;
    }

    // Step 4: Atomic write (temp file + rename)
    const tmpPath = join(tmpdir(), `antigravity-cache-${Date.now()}.tmp`);
    writeFileSync(tmpPath, JSON.stringify(cacheData, null, 2));

    try {
      renameSync(tmpPath, this.cacheFilePath);
    } catch {
      // Windows fallback: copy + delete
      writeFileSync(this.cacheFilePath, readFileSync(tmpPath));
      unlinkSync(tmpPath);
    }

    this.dirty = false;
    return true;
  }
}
```

**Key Design Decisions**:

1. **Dual TTL**: Short memory TTL (1 hour), longer disk TTL (48 hours)
2. **Batched writes**: Background interval writes, not on every change
3. **Atomic writes**: Temp file + rename prevents corruption
4. **Merge on save**: Preserves disk entries not in memory

**Why This Matters**: Enables thinking block recovery across sessions without risking cache corruption on crashes.

---

### 4.123 Thinking Recovery via Synthetic Message Injection (opencode-antigravity-auth)

**Pattern**: "Let it crash and start again" recovery for corrupted thinking state.

**Source File**: `src/plugin/thinking-recovery.ts`

**Implementation**:

```typescript
export interface ConversationState {
  inToolLoop: boolean; // Ends with functionResponse
  turnStartIdx: number; // First model message in turn
  turnHasThinking: boolean; // TURN started with thinking
  lastModelIdx: number; // Last model message index
  lastModelHasThinking: boolean;
  lastModelHasToolCalls: boolean;
}

export function analyzeConversationState(contents: any[]): ConversationState {
  // First pass: Find the last "real" user message (not a tool result)
  let lastRealUserIdx = -1;
  for (let i = 0; i < contents.length; i++) {
    if (contents[i]?.role === "user" && !isToolResultMessage(contents[i])) {
      lastRealUserIdx = i;
    }
  }

  // Second pass: Track turn boundaries and thinking state
  for (let i = 0; i < contents.length; i++) {
    const msg = contents[i];
    if (msg?.role === "model" || msg?.role === "assistant") {
      if (i > lastRealUserIdx && state.turnStartIdx === -1) {
        state.turnStartIdx = i;
        state.turnHasThinking = messageHasThinking(msg);
      }
      state.lastModelIdx = i;
      state.lastModelHasToolCalls = messageHasToolCalls(msg);
    }
  }

  // Check if we're in a tool loop
  const lastMsg = contents[contents.length - 1];
  if (lastMsg?.role === "user" && isToolResultMessage(lastMsg)) {
    state.inToolLoop = true;
  }

  return state;
}

export function closeToolLoopForThinking(contents: any[]): any[] {
  // Step 1: Strip ALL thinking blocks (removes corrupted ones)
  const strippedContents = stripAllThinkingBlocks(contents);

  const toolResultCount = countTrailingToolResults(strippedContents);

  // Step 2: Inject synthetic MODEL message to complete the non-thinking turn
  const syntheticModel = {
    role: "model",
    parts: [{ text: `[${toolResultCount} tool executions completed.]` }],
  };

  // Step 3: Inject synthetic USER message to start a NEW turn
  const syntheticUser = {
    role: "user",
    parts: [{ text: "[Continue]" }],
  };

  return [...strippedContents, syntheticModel, syntheticUser];
}

export function needsThinkingRecovery(state: ConversationState): boolean {
  return state.inToolLoop && !state.turnHasThinking;
}
```

**Philosophy**: Instead of trying to fix corrupted thinking state, abandon the corrupted turn and let Claude generate fresh thinking.

**Why This Matters**: Prevents session lockup when thinking blocks get stripped/malformed during context compaction.

---

### 4.124 Cross-Model Metadata Sanitization (opencode-antigravity-auth)

**Pattern**: Strips incompatible signature fields when switching models mid-session.

**Source File**: `src/plugin/transform/cross-model-sanitizer.ts`

**Implementation**:

```typescript
const GEMINI_SIGNATURE_FIELDS = ["thoughtSignature", "thinkingMetadata"] as const;
const CLAUDE_SIGNATURE_FIELDS = ["signature"] as const;

export function stripGeminiThinkingMetadata(part: Record<string, unknown>, preserveNonSignature = true): { part: Record<string, unknown>; stripped: number } {
  let stripped = 0;

  // Direct fields
  if ("thoughtSignature" in part) {
    delete part.thoughtSignature;
    stripped++;
  }
  if ("thinkingMetadata" in part) {
    delete part.thinkingMetadata;
    stripped++;
  }

  // Nested in metadata.google
  if (isPlainObject(part.metadata)) {
    const metadata = part.metadata as Record<string, unknown>;
    if (isPlainObject(metadata.google)) {
      const google = metadata.google as Record<string, unknown>;

      for (const field of GEMINI_SIGNATURE_FIELDS) {
        if (field in google) {
          delete google[field];
          stripped++;
        }
      }

      if (!preserveNonSignature || Object.keys(google).length === 0) {
        delete metadata.google;
      }
    }
  }

  return { part, stripped };
}

export function stripClaudeThinkingFields(part: Record<string, unknown>): { part: Record<string, unknown>; stripped: number } {
  let stripped = 0;

  if (part.type === "thinking" || part.type === "redacted_thinking") {
    for (const field of CLAUDE_SIGNATURE_FIELDS) {
      if (field in part) {
        delete part[field];
        stripped++;
      }
    }
  }

  // Heuristic: Long signatures (>= 50 chars) are likely cryptographic
  if ("signature" in part && typeof part.signature === "string") {
    if ((part.signature as string).length >= 50) {
      delete part.signature;
      stripped++;
    }
  }

  return { part, stripped };
}

export function sanitizeCrossModelPayload(payload: unknown, options: SanitizerOptions): SanitizationResult {
  const targetFamily = getModelFamily(options.targetModel);

  if (targetFamily === "claude") {
    // Strip Gemini fields when targeting Claude
    return deepSanitizeCrossModelMetadata(payload, targetFamily);
  } else if (targetFamily === "gemini") {
    // Strip Claude fields when targeting Gemini
    return deepSanitizeCrossModelMetadata(payload, targetFamily);
  }
}
```

**Root Cause Fixed**: Gemini stores `thoughtSignature` in `metadata.google`, Claude stores `signature` in thinking blocks. Foreign signatures fail validation.

**Why This Matters**: Enables seamless model switching mid-conversation without "Invalid signature" errors.

---

### 4.125 Model Resolution with Thinking Tier and Quota Routing (opencode-antigravity-auth)

**Pattern**: Resolves model names with tier suffixes to API names and thinking configurations.

**Source File**: `src/plugin/transform/model-resolver.ts`

**Implementation**:

```typescript
export const THINKING_TIER_BUDGETS = {
  claude: { low: 8192, medium: 16384, high: 32768 },
  "gemini-2.5-pro": { low: 8192, medium: 16384, high: 32768 },
  "gemini-2.5-flash": { low: 6144, medium: 12288, high: 24576 },
  default: { low: 4096, medium: 8192, high: 16384 },
} as const;

const ANTIGRAVITY_ONLY_MODELS = /^(claude|gpt)/i;
const LEGACY_ANTIGRAVITY_GEMINI3 = /^gemini-3-(pro-(low|high)|flash(-low|-medium|-high)?)$/i;

export function resolveModelWithTier(requestedModel: string): ResolvedModel {
  const isAntigravity = QUOTA_PREFIX_REGEX.test(requestedModel);
  const modelWithoutQuota = requestedModel.replace(QUOTA_PREFIX_REGEX, "");

  const tier = extractThinkingTierFromModel(modelWithoutQuota);
  const baseName = tier ? modelWithoutQuota.replace(TIER_REGEX, "") : modelWithoutQuota;

  // Determine quota routing
  const isAntigravityOnly = ANTIGRAVITY_ONLY_MODELS.test(modelWithoutQuota);
  const isLegacyAntigravity = LEGACY_ANTIGRAVITY_GEMINI3.test(modelWithoutQuota);
  const quotaPreference = isAntigravity || isAntigravityOnly || isLegacyAntigravity ? "antigravity" : "gemini-cli";

  const actualModel = MODEL_ALIASES[baseName] || baseName;
  const isThinking = isThinkingCapableModel(actualModel);

  // Claude thinking models without tier get max budget (32768)
  if (actualModel.includes("claude") && actualModel.includes("thinking") && !tier) {
    return {
      actualModel,
      thinkingBudget: THINKING_TIER_BUDGETS.claude.high,
      isThinkingModel: true,
      quotaPreference,
    };
  }

  // Gemini 3 models get thinkingLevel instead of budget
  if (actualModel.includes("gemini-3")) {
    return {
      actualModel,
      thinkingLevel: tier || "low",
      isThinkingModel: true,
      quotaPreference,
    };
  }

  // Apply tier budget for other thinking models
  if (tier) {
    const budgetFamily = getBudgetFamily(actualModel);
    const thinkingBudget = THINKING_TIER_BUDGETS[budgetFamily][tier];
    return { actualModel, thinkingBudget, tier, isThinkingModel: isThinking, quotaPreference };
  }

  return { actualModel, isThinkingModel: isThinking, quotaPreference };
}
```

**Quota Routing Rules**:

- `antigravity-` prefix → Antigravity quota (explicit)
- Claude/GPT models → Antigravity quota (auto, these only exist on Antigravity)
- Legacy Gemini 3 names (`gemini-3-pro-low`) → Antigravity quota (backward compat)
- Other models → Gemini CLI quota (default)

**Why This Matters**: Enables consistent model aliasing and correct quota routing across different naming conventions.

---

### 4.126 Compacted Thinking Turn Detection Heuristics (opencode-antigravity-auth)

**Pattern**: Distinguishes "never had thinking" from "thinking was stripped" scenarios.

**Source File**: `src/plugin/thinking-recovery.ts`

**Implementation**:

```typescript
/**
 * Heuristics:
 * 1. Has functionCall parts (typical thinking flow produces tool calls)
 * 2. No thinking parts (thought: true)
 * 3. No text content before functionCall (thinking responses usually have text)
 */
export function looksLikeCompactedThinkingTurn(msg: any): boolean {
  const parts = msg.parts || [];
  if (parts.length === 0) return false;

  // Must have function calls
  const hasFunctionCall = parts.some((p: any) => p && typeof p === "object" && p.functionCall);
  if (!hasFunctionCall) return false;

  // Must NOT have thinking blocks
  const hasThinking = parts.some((p: any) => p?.thought === true || p?.type === "thinking" || p?.type === "redacted_thinking");
  if (hasThinking) return false;

  // Check for text content before functionCall
  const hasTextBeforeFunctionCall = parts.some((p: any, idx: number) => {
    const firstFuncIdx = parts.findIndex((fp: any) => fp && typeof fp === "object" && fp.functionCall);
    if (idx >= firstFuncIdx) return false;
    return "text" in p && typeof p.text === "string" && p.text.trim().length > 0 && !p.thought;
  });

  // If functionCall but no text before it → likely compacted
  return !hasTextBeforeFunctionCall;
}

export function hasPossibleCompactedThinking(contents: any[], turnStartIdx: number): boolean {
  for (let i = turnStartIdx; i < contents.length; i++) {
    if (contents[i]?.role === "model" && looksLikeCompactedThinkingTurn(contents[i])) {
      return true;
    }
  }
  return false;
}
```

**Key Insight**: A model message with tool calls but no text before them is suspicious - thinking-enabled models usually produce text alongside tool calls.

**Why This Matters**: Enables proactive recovery detection before errors occur.

---

### 4.127 Zod-Based Configuration Schema with Environment Overrides (opencode-antigravity-auth)

**Pattern**: Type-safe configuration with validation, defaults, and environment variable overrides.

**Source File**: `src/plugin/config/schema.ts`

**Implementation**:

```typescript
import { z } from "zod";

export const AccountSelectionStrategySchema = z.enum(["sticky", "round-robin", "hybrid"]);

export const SignatureCacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  memory_ttl_seconds: z.number().min(60).max(86400).default(3600),
  disk_ttl_seconds: z.number().min(3600).max(604800).default(172800),
  write_interval_seconds: z.number().min(10).max(600).default(60),
});

export const AntigravityConfigSchema = z.object({
  $schema: z.string().optional(), // JSON Schema for IDE support

  quiet_mode: z.boolean().default(false),
  debug: z.boolean().default(false),
  keep_thinking: z.boolean().default(false),
  session_recovery: z.boolean().default(true),
  auto_resume: z.boolean().default(true),
  resume_text: z.string().default("continue"),

  // Empty response retry (ported from LLM-API-Key-Proxy)
  empty_response_max_attempts: z.number().min(1).max(10).default(4),
  empty_response_retry_delay_ms: z.number().min(500).max(10000).default(2000),

  // Proactive token refresh
  proactive_token_refresh: z.boolean().default(true),
  proactive_refresh_buffer_seconds: z.number().min(60).max(7200).default(1800),
  proactive_refresh_check_interval_seconds: z.number().min(30).max(1800).default(300),

  // Rate limiting
  max_rate_limit_wait_seconds: z.number().min(0).max(3600).default(300),
  quota_fallback: z.boolean().default(false),
  account_selection_strategy: AccountSelectionStrategySchema.default("sticky"),
  pid_offset_enabled: z.boolean().default(false),
  switch_on_first_rate_limit: z.boolean().default(true),

  signature_cache: SignatureCacheConfigSchema.optional(),
});

export type AntigravityConfig = z.infer<typeof AntigravityConfigSchema>;
```

**Config File Locations** (priority order, highest wins):

1. Project: `.opencode/antigravity.json`
2. User: `~/.config/opencode/antigravity.json` (Linux/Mac)
3. Environment variables override file values

**Why This Matters**: Provides type safety, validation with clear error messages, and sensible defaults.

---

### 4.128 Per-Model Quota Tracking with Hierarchical Keys (opencode-antigravity-auth)

**Pattern**: Track rate limits per account, per header style, and optionally per model.

**Source File**: `src/plugin/accounts.ts`

**Implementation**:

```typescript
export type BaseQuotaKey = "claude" | "gemini-antigravity" | "gemini-cli";
export type QuotaKey = BaseQuotaKey | `${BaseQuotaKey}:${string}`;

export interface ManagedAccount {
  index: number;
  email?: string;
  rateLimitResetTimes: RateLimitStateV3;  // Map<QuotaKey, resetTimestamp>
  touchedForQuota: Record<string, number>;
  consecutiveFailures?: number;
  coolingDownUntil?: number;
  cooldownReason?: CooldownReason;
}

function isRateLimitedForHeaderStyle(
  account: ManagedAccount,
  family: ModelFamily,
  headerStyle: HeaderStyle,
  model?: string | null
): boolean {
  clearExpiredRateLimits(account);

  if (family === "claude") {
    return isRateLimitedForQuotaKey(account, "claude");
  }

  // Check model-specific quota first if provided
  if (model) {
    const modelKey = getQuotaKey(family, headerStyle, model);
    if (isRateLimitedForQuotaKey(account, modelKey)) {
      return true;
    }
  }

  // Then check base family quota
  const baseKey = getQuotaKey(family, headerStyle);
  return isRateLimitedForQuotaKey(account, baseKey);
}

getMinWaitTimeForFamily(family: ModelFamily, model?: string | null): number {
  // For Gemini, account becomes available when EITHER pool expires
  for (const a of this.accounts) {
    const antigravityKey = getQuotaKey(family, "antigravity", model);
    const cliKey = getQuotaKey(family, "gemini-cli", model);

    const accountWait = Math.min(
      t1 !== undefined ? Math.max(0, t1 - nowMs()) : Infinity,
      t2 !== undefined ? Math.max(0, t2 - nowMs()) : Infinity
    );
    if (accountWait !== Infinity) waitTimes.push(accountWait);
  }
  return waitTimes.length > 0 ? Math.min(...waitTimes) : 0;
}
```

**Hierarchical Key Structure**:

- Base: `claude`, `gemini-antigravity`, `gemini-cli`
- Model-specific: `gemini-antigravity:gemini-3-pro`, `gemini-cli:gemini-2.5-flash`

**Why This Matters**: Different models have different quotas - tracking per-model prevents blocking when only one model is exhausted.

---

### 4.129 Account Cooldown with Reason Tracking (opencode-antigravity-auth)

**Pattern**: Temporary account suspension with typed cooldown reasons.

**Source File**: `src/plugin/accounts.ts`

**Implementation**:

```typescript
export type CooldownReason = "rate-limit" | "auth-failure" | "project-error" | "network-error";

export interface ManagedAccount {
  coolingDownUntil?: number;
  cooldownReason?: CooldownReason;
  consecutiveFailures?: number;
}

markAccountCoolingDown(account: ManagedAccount, cooldownMs: number, reason: CooldownReason): void {
  account.coolingDownUntil = nowMs() + cooldownMs;
  account.cooldownReason = reason;
}

isAccountCoolingDown(account: ManagedAccount): boolean {
  if (account.coolingDownUntil === undefined) return false;
  if (nowMs() >= account.coolingDownUntil) {
    this.clearAccountCooldown(account);
    return false;
  }
  return true;
}

clearAccountCooldown(account: ManagedAccount): void {
  delete account.coolingDownUntil;
  delete account.cooldownReason;
}

// Usage in main loop
if (shouldCooldown) {
  accountManager.markAccountCoolingDown(account, cooldownMs, "auth-failure");
  accountManager.markRateLimited(account, cooldownMs, family, headerStyle, model);
  pushDebug(`token-refresh-failed: cooldown ${cooldownMs}ms after ${failures} failures`);
}
```

**Cooldown Triggers**:

- `auth-failure`: Token refresh failed
- `project-error`: Project context resolution failed
- `network-error`: All endpoints failed
- `rate-limit`: Rate limit exceeded

**Why This Matters**: Prevents repeated failed requests to problematic accounts while providing diagnostic info.

---

### 4.130 Capacity Exhausted Backoff with Progressive Tiers (opencode-antigravity-auth)

**Pattern**: Special handling for "no capacity" errors with progressive backoff.

**Source File**: `src/plugin.ts`

**Implementation**:

```typescript
const CAPACITY_BACKOFF_TIERS_MS = [5000, 10000, 20000, 30000, 60000];

function getCapacityBackoffDelay(consecutiveFailures: number): number {
  const index = Math.min(consecutiveFailures, CAPACITY_BACKOFF_TIERS_MS.length - 1);
  return CAPACITY_BACKOFF_TIERS_MS[Math.max(0, index)] ?? 5000;
}

// In request handling loop
if (isCapacityExhausted) {
  const failures = account.consecutiveFailures ?? 0;
  const capacityBackoffMs = getCapacityBackoffDelay(failures);
  account.consecutiveFailures = failures + 1;

  const backoffFormatted = formatWaitTime(capacityBackoffMs);
  pushDebug(`capacity exhausted on account ${account.index}, backoff=${capacityBackoffMs}ms (failure #${failures + 1})`);

  await showToast(`⏳ Server at capacity. Waiting ${backoffFormatted}... (attempt ${failures + 1})`, "warning");
  await sleep(capacityBackoffMs, abortSignal);
  continue; // Retry same account
}
```

**Capacity Detection**:

```typescript
const isCapacityExhausted = bodyInfo.reason === "MODEL_CAPACITY_EXHAUSTED" || (typeof bodyInfo.message === "string" && bodyInfo.message.toLowerCase().includes("no capacity"));
```

**Backoff Progression**: 5s → 10s → 20s → 30s → 60s

**Why This Matters**: Capacity exhaustion is transient (unlike quota exhaustion) - staying with same account is the right strategy.

---

### 4.131 Typed Error Classes with Context (opencode-antigravity-auth)

**Pattern**: Custom error classes that carry structured context for better debugging.

**Source File**: `src/plugin/errors.ts`

**Implementation**:

```typescript
export class EmptyResponseError extends Error {
  readonly provider: string;
  readonly model: string;
  readonly attempts: number;

  constructor(provider: string, model: string, attempts: number, message?: string) {
    super(message ?? `The model returned an empty response after ${attempts} attempts. ` + `This may indicate a temporary service issue. Please try again.`);
    this.name = "EmptyResponseError";
    this.provider = provider;
    this.model = model;
    this.attempts = attempts;
  }
}

export class ToolIdMismatchError extends Error {
  readonly expectedIds: string[];
  readonly foundIds: string[];

  constructor(expectedIds: string[], foundIds: string[], message?: string) {
    super(message ?? `Tool ID mismatch: expected [${expectedIds.join(", ")}] but found [${foundIds.join(", ")}]`);
    this.name = "ToolIdMismatchError";
    this.expectedIds = expectedIds;
    this.foundIds = foundIds;
  }
}

// Usage
throw new EmptyResponseError("antigravity", prepared.effectiveModel ?? "unknown", currentAttempts);
```

**Benefits**:

- `instanceof` checks for specific error types
- Structured context (model, attempts, IDs) for debugging
- Clear, actionable error messages

**Why This Matters**: Enables error-specific handling and better debugging without parsing error message strings.

---

### 4.132 Fresh Account Tracking for Hybrid Strategy (opencode-antigravity-auth)

**Pattern**: Track which accounts have been "touched" for each quota to enable hybrid selection.

**Source File**: `src/plugin/accounts.ts`

**Implementation**:

```typescript
export interface ManagedAccount {
  touchedForQuota: Record<string, number>;  // quotaKey -> timestamp
}

markTouchedForQuota(account: ManagedAccount, quotaKey: string): void {
  account.touchedForQuota[quotaKey] = nowMs();
}

isFreshForQuota(account: ManagedAccount, quotaKey: string): boolean {
  const touchedAt = account.touchedForQuota[quotaKey];
  if (!touchedAt) return true;  // Never touched = fresh

  // Consider fresh if rate limit reset since last touch
  const resetTime = account.rateLimitResetTimes[quotaKey as QuotaKey];
  if (resetTime && touchedAt < resetTime) return true;

  return false;
}

getFreshAccountsForQuota(quotaKey: string, family: ModelFamily, model?: string | null): ManagedAccount[] {
  return this.accounts.filter(acc => {
    clearExpiredRateLimits(acc);
    return this.isFreshForQuota(acc, quotaKey) &&
           !isRateLimitedForFamily(acc, family, model) &&
           !this.isAccountCoolingDown(acc);
  });
}

// Hybrid strategy usage
if (strategy === 'hybrid') {
  const freshAccounts = this.getFreshAccountsForQuota(quotaKey, family, model);
  if (freshAccounts.length > 0) {
    const fresh = freshAccounts[0];
    fresh.lastUsed = nowMs();
    this.markTouchedForQuota(fresh, quotaKey);
    return fresh;
  }
}
```

**Hybrid Strategy Goal**: Touch all fresh accounts first to synchronize their rate limit reset timers, then switch to sticky behavior.

**Why This Matters**: Optimizes for having staggered rate limit windows across accounts.

---

### 4.133 Streaming Token Speed Measurement with Sliding Window (claude-code-router)

**Pattern**: Real-time tokens-per-second calculation using sliding window for streaming responses.

**Source File**: `packages/core/src/plugins/token-speed.ts`

**Implementation**:

```typescript
interface TokenStats {
  requestId: string;
  sessionId?: string;
  startTime: number;
  firstTokenTime?: number;
  lastTokenTime: number;
  tokenCount: number;
  tokensPerSecond: number;
  timeToFirstToken?: number;
  stream: boolean;
  tokenTimestamps: number[]; // Store timestamps for per-second calculation
}

// In streaming mode: sliding window calculation (count tokens in last 1 second)
const doOutput = async (isFinal: boolean) => {
  const stats = requestStats.get(requestId);
  if (!stats) return;

  const now = performance.now();

  if (!isFinal) {
    // Sliding window: count tokens in last 1 second
    const oneSecondAgo = now - 1000;
    stats.tokenTimestamps = stats.tokenTimestamps.filter((ts) => ts > oneSecondAgo);
    stats.tokensPerSecond = stats.tokenTimestamps.length;
  } else {
    // Final: average speed over entire request
    const duration = (stats.lastTokenTime - stats.startTime) / 1000;
    if (duration > 0) {
      stats.tokensPerSecond = Math.round(stats.tokenCount / duration);
    }
  }
};

// Token counting with proper estimation
function estimateTokens(text: string): number {
  // Rough estimation: English ~4 chars/token, Chinese ~1.5 chars/token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}
```

**Key Metrics Tracked**:

- `timeToFirstToken`: Latency before first content arrives
- `tokensPerSecond`: Real-time during streaming, average for final
- `tokenCount`: Total tokens generated

**Why This Matters**: Enables performance monitoring and optimization of streaming LLM responses.

---

### 4.134 Multi-Fallback JSON Argument Parser (claude-code-router)

**Pattern**: Graceful degradation through multiple JSON parsing strategies.

**Source File**: `packages/core/src/utils/toolArgumentsParser.ts`

**Implementation**:

```typescript
import JSON5 from "json5";
import { jsonrepair } from "jsonrepair";

export function parseToolArguments(argsString: string, logger?: any): string {
  // Handle empty/null input
  if (!argsString || argsString.trim() === "" || argsString === "{}") {
    return "{}";
  }

  try {
    // First attempt: Standard JSON parsing
    JSON.parse(argsString);
    logger?.debug(`Tool arguments standard JSON parsing successful`);
    return argsString;
  } catch (jsonError: any) {
    try {
      // Second attempt: JSON5 parsing for relaxed syntax
      const args = JSON5.parse(argsString);
      logger?.debug(`Tool arguments JSON5 parsing successful`);
      return JSON.stringify(args);
    } catch (json5Error: any) {
      try {
        // Third attempt: Safe JSON repair without code execution
        const repairedJson = jsonrepair(argsString);
        logger?.debug(`Tool arguments safely repaired`);
        return repairedJson;
      } catch (repairError: any) {
        // All parsing attempts failed - return safe fallback
        logger?.error(`JSON parsing failed: ${jsonError.message}. ` + `JSON5 parsing failed: ${json5Error.message}. ` + `JSON repair failed: ${repairError.message}.`);
        return "{}"; // Safe empty object as fallback
      }
    }
  }
}
```

**Parsing Strategy**:

1. Standard `JSON.parse()` - Strict, fastest
2. `JSON5.parse()` - Relaxed syntax (trailing commas, unquoted keys)
3. `jsonrepair()` - Attempts to fix malformed JSON
4. Empty object - Safe fallback when all else fails

**Why This Matters**: LLM tool call arguments are often malformed - graceful degradation prevents crashes.

---

### 4.135 SSE Stream Parser Transform (claude-code-router)

**Pattern**: Web Streams API transform for parsing Server-Sent Events.

**Source File**: `packages/core/src/utils/sse/SSEParser.transform.ts`

**Implementation**:

```typescript
export class SSEParserTransform extends TransformStream<string, any> {
  private buffer = "";
  private currentEvent: Record<string, any> = {};

  constructor() {
    super({
      transform: (chunk: string, controller) => {
        this.buffer += chunk;
        const lines = this.buffer.split("\n");

        // Keep last line (may be incomplete)
        this.buffer = lines.pop() || "";

        for (const line of lines) {
          const event = this.processLine(line);
          if (event) {
            controller.enqueue(event);
          }
        }
      },
      flush: (controller) => {
        // Process remaining content in buffer
        if (this.buffer.trim()) {
          const events: any[] = [];
          this.processLine(this.buffer.trim(), events);
          events.forEach((event) => controller.enqueue(event));
        }

        // Push last event (if any)
        if (Object.keys(this.currentEvent).length > 0) {
          controller.enqueue(this.currentEvent);
        }
      },
    });
  }

  private processLine(line: string, events?: any[]): any | null {
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

**SSE Protocol Fields Handled**:

- `event:` - Event type name
- `data:` - JSON payload (with `[DONE]` sentinel handling)
- `id:` - Event ID for reconnection
- `retry:` - Reconnection delay hint

**Why This Matters**: Native Streams API integration enables efficient SSE processing without buffering entire responses.

---

### 4.136 Pluggable Output Handler Registry (claude-code-router)

**Pattern**: Unified output routing to multiple destinations (console, webhook, file).

**Source File**: `packages/core/src/plugins/output/output-manager.ts`

**Implementation**:

```typescript
class OutputManager {
  private handlers: Map<string, OutputHandler> = new Map();
  private defaultOptions: OutputOptions = {};

  registerHandlers(configs: OutputHandlerConfig[]): void {
    for (const config of configs) {
      if (config.enabled === false) continue;

      const handler = this.createHandler(config);
      const name = config.type + "_" + Date.now();
      this.registerHandler(name, handler);
    }
  }

  private createHandler(config: OutputHandlerConfig): OutputHandler {
    switch (config.type) {
      case "console":
        return new ConsoleOutputHandler(config.config);
      case "webhook":
        return new WebhookOutputHandler(config.config);
      case "temp-file":
        return new TempFileOutputHandler(config.config);
      default:
        throw new Error(`Unknown output handler type: ${config.type}`);
    }
  }

  async output(data: any, options?: OutputOptions): Promise<{ success: string[]; failed: string[] }> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const results = { success: [] as string[], failed: [] as string[] };

    // Send data to all handlers in parallel
    const promises = Array.from(this.handlers.entries()).map(async ([name, handler]) => {
      try {
        const success = await handler.output(data, mergedOptions);
        if (success) {
          results.success.push(name);
        } else {
          results.failed.push(name);
        }
      } catch (error) {
        results.failed.push(name);
      }
    });

    await Promise.all(promises);
    return results;
  }

  async outputToType(type: string, data: any, options?: OutputOptions) {
    const targetHandlers = Array.from(this.handlers.entries())
      .filter(([_, handler]) => handler.type === type)
      .map(([name]) => name);
    return this.outputTo(targetHandlers, data, options);
  }
}

export const outputManager = new OutputManager();
```

**Handler Types**:

- `console`: Colored terminal output
- `temp-file`: Session-based JSON files
- `webhook`: HTTP POST to external endpoints

**Why This Matters**: Enables flexible metrics and logging pipelines without hardcoding destinations.

---

### 4.137 Fastify Plugin Manager with Dynamic Enable/Disable (claude-code-router)

**Pattern**: Runtime plugin registration and lifecycle management for Fastify.

**Source File**: `packages/core/src/plugins/plugin-manager.ts`

**Implementation**:

```typescript
interface PluginMetadata {
  name: string;
  enabled: boolean;
  options: any;
}

class PluginManager {
  private plugins: Map<string, PluginMetadata> = new Map();
  private pluginInstances: Map<string, CCRPlugin> = new Map();

  registerPlugin(plugin: CCRPlugin, options: any = {}): void {
    this.pluginInstances.set(plugin.name, plugin);
    this.plugins.set(plugin.name, {
      name: plugin.name,
      enabled: options.enabled !== false,
      options,
    });
  }

  async enablePlugin(name: string, fastify: FastifyInstance): Promise<void> {
    const metadata = this.plugins.get(name);
    const plugin = this.pluginInstances.get(name);
    if (!metadata || !plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (metadata.enabled) {
      await fastify.register(plugin.register, metadata.options);
    }
  }

  async enablePlugins(fastify: FastifyInstance): Promise<void> {
    for (const [name, metadata] of this.plugins) {
      if (metadata.enabled) {
        try {
          await this.enablePlugin(name, fastify);
        } catch (error) {
          fastify.log?.error(`Failed to enable plugin ${name}: ${error}`);
        }
      }
    }
  }

  // Dynamic enable/disable at runtime
  setPluginEnabled(name: string, enabled: boolean): void {
    const metadata = this.plugins.get(name);
    if (metadata) {
      metadata.enabled = enabled;
    }
  }

  isPluginEnabled(name: string): boolean {
    return this.plugins.get(name)?.enabled || false;
  }
}

export const pluginManager = new PluginManager();
```

**Plugin Lifecycle**:

1. `registerPlugin()` - Add plugin with options
2. `enablePlugins()` - Batch registration to Fastify
3. `setPluginEnabled()` - Runtime toggle
4. `removePlugin()` - Cleanup

**Why This Matters**: Enables modular feature flags and runtime feature toggles.

---

### 4.138 Go Signature Cache with Sliding TTL (CLIProxyAPI)

**Pattern**: Concurrent-safe signature cache using sync.Map with sliding expiration.

**Source File**: `internal/cache/signature_cache.go`

**Implementation**:

```go
const (
  SignatureCacheTTL        = 3 * time.Hour
  SignatureTextHashLen     = 16  // 16 hex chars = 64-bit key space
  MinValidSignatureLen     = 50
  SessionCleanupInterval   = 10 * time.Minute
)

// signatureCache stores signatures by sessionId -> textHash -> SignatureEntry
var signatureCache sync.Map

type sessionCache struct {
  mu      sync.RWMutex
  entries map[string]SignatureEntry
}

func hashText(text string) string {
  h := sha256.Sum256([]byte(text))
  return hex.EncodeToString(h[:])[:SignatureTextHashLen]
}

func GetCachedSignature(sessionID, text string) string {
  val, ok := signatureCache.Load(sessionID)
  if !ok {
    return ""
  }
  sc := val.(*sessionCache)

  textHash := hashText(text)
  now := time.Now()

  sc.mu.Lock()
  entry, exists := sc.entries[textHash]
  if !exists {
    sc.mu.Unlock()
    return ""
  }
  if now.Sub(entry.Timestamp) > SignatureCacheTTL {
    delete(sc.entries, textHash)
    sc.mu.Unlock()
    return ""
  }

  // Refresh TTL on access (sliding expiration)
  entry.Timestamp = now
  sc.entries[textHash] = entry
  sc.mu.Unlock()

  return entry.Signature
}

// Background cleanup goroutine
func startSessionCleanup() {
  go func() {
    ticker := time.NewTicker(SessionCleanupInterval)
    defer ticker.Stop()
    for range ticker.C {
      purgeExpiredSessions()
    }
  }()
}

func purgeExpiredSessions() {
  now := time.Now()
  signatureCache.Range(func(key, value any) bool {
    sc := value.(*sessionCache)
    sc.mu.Lock()
    // Remove expired entries
    for k, entry := range sc.entries {
      if now.Sub(entry.Timestamp) > SignatureCacheTTL {
        delete(sc.entries, k)
      }
    }
    isEmpty := len(sc.entries) == 0
    sc.mu.Unlock()
    // Remove session if empty
    if isEmpty {
      signatureCache.Delete(key)
    }
    return true
  })
}
```

**Key Design Decisions**:

1. **sync.Map** for session-level concurrency
2. **RWMutex** per session for entry-level concurrency
3. **Sliding TTL**: Reset timestamp on access, not just creation
4. **Background cleanup**: Remove empty sessions periodically

**Why This Matters**: Efficient concurrent caching without global locks.

---

### 4.139 Log Directory Size Enforcement (CLIProxyAPI)

**Pattern**: Background log rotation with configurable max size and protected file.

**Source File**: `internal/logging/log_dir_cleaner.go`

**Implementation**:

```go
const logDirCleanerInterval = time.Minute

func runLogDirCleaner(ctx context.Context, logDir string, maxBytes int64, protectedPath string) {
  ticker := time.NewTicker(logDirCleanerInterval)
  defer ticker.Stop()

  cleanOnce := func() {
    deleted, err := enforceLogDirSizeLimit(logDir, maxBytes, protectedPath)
    if err != nil {
      log.WithError(err).Warn("failed to enforce log directory size limit")
      return
    }
    if deleted > 0 {
      log.Debugf("removed %d old log file(s) to enforce log directory size limit", deleted)
    }
  }

  cleanOnce()
  for {
    select {
    case <-ctx.Done():
      return
    case <-ticker.C:
      cleanOnce()
    }
  }
}

func enforceLogDirSizeLimit(logDir string, maxBytes int64, protectedPath string) (int, error) {
  entries, err := os.ReadDir(logDir)
  if err != nil {
    return 0, err
  }

  type logFile struct {
    path    string
    size    int64
    modTime time.Time
  }

  var files []logFile
  var total int64

  for _, entry := range entries {
    if entry.IsDir() || !isLogFileName(entry.Name()) {
      continue
    }
    info, err := entry.Info()
    if err != nil || !info.Mode().IsRegular() {
      continue
    }
    path := filepath.Join(logDir, entry.Name())
    files = append(files, logFile{path: path, size: info.Size(), modTime: info.ModTime()})
    total += info.Size()
  }

  if total <= maxBytes {
    return 0, nil
  }

  // Sort by modification time (oldest first)
  sort.Slice(files, func(i, j int) bool {
    return files[i].modTime.Before(files[j].modTime)
  })

  deleted := 0
  for _, file := range files {
    if total <= maxBytes {
      break
    }
    // Skip protected file (current log)
    if protectedPath != "" && filepath.Clean(file.path) == protectedPath {
      continue
    }
    if err := os.Remove(file.path); err != nil {
      log.Warnf("failed to remove old log file: %s", filepath.Base(file.path))
      continue
    }
    total -= file.size
    deleted++
  }

  return deleted, nil
}

func isLogFileName(name string) bool {
  lower := strings.ToLower(strings.TrimSpace(name))
  return strings.HasSuffix(lower, ".log") || strings.HasSuffix(lower, ".log.gz")
}
```

**Key Design Decisions**:

1. **Protected file**: Current log file is never deleted
2. **Oldest first**: Sort by mtime, delete oldest until under limit
3. **Context-aware**: Graceful shutdown via context cancellation
4. **Safe patterns**: Only delete `.log` and `.log.gz` files

**Why This Matters**: Prevents disk exhaustion in long-running proxy servers.

---

### 4.140 RFC 7636 PKCE Code Generation (CLIProxyAPI)

**Pattern**: Cryptographically secure PKCE code verifier and challenge generation.

**Source File**: `internal/auth/claude/pkce.go`

**Implementation**:

```go
// PKCECodes contains the code verifier and challenge for OAuth PKCE flow
type PKCECodes struct {
  CodeVerifier  string
  CodeChallenge string
}

// GeneratePKCECodes generates a PKCE code verifier and challenge pair
// following RFC 7636 specifications for OAuth 2.0 PKCE extension.
func GeneratePKCECodes() (*PKCECodes, error) {
  // Generate code verifier: 43-128 characters, URL-safe
  codeVerifier, err := generateCodeVerifier()
  if err != nil {
    return nil, fmt.Errorf("failed to generate code verifier: %w", err)
  }

  // Generate code challenge using S256 method
  codeChallenge := generateCodeChallenge(codeVerifier)

  return &PKCECodes{
    CodeVerifier:  codeVerifier,
    CodeChallenge: codeChallenge,
  }, nil
}

// generateCodeVerifier creates a cryptographically random string
// of 128 characters using URL-safe base64 encoding
func generateCodeVerifier() (string, error) {
  // Generate 96 random bytes (will result in 128 base64 characters)
  bytes := make([]byte, 96)
  _, err := rand.Read(bytes)
  if err != nil {
    return "", fmt.Errorf("failed to generate random bytes: %w", err)
  }

  // Encode to URL-safe base64 without padding
  return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(bytes), nil
}

// generateCodeChallenge creates a SHA256 hash of the code verifier
// and encodes it using URL-safe base64 encoding without padding
func generateCodeChallenge(codeVerifier string) string {
  hash := sha256.Sum256([]byte(codeVerifier))
  return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(hash[:])
}
```

**RFC 7636 Compliance**:

- **Code verifier**: 128 characters (96 bytes → 128 base64 chars)
- **Code challenge method**: S256 (SHA-256 hash)
- **Encoding**: URL-safe Base64 without padding

**Why This Matters**: PKCE prevents authorization code interception attacks in public clients.

---

### 4.141 JWT Claims Parser without Signature Verification (CLIProxyAPI)

**Pattern**: Extract claims from JWT tokens after external validation.

**Source File**: `internal/auth/codex/jwt_parser.go`

**Implementation**:

```go
type JWTClaims struct {
  AtHash        string        `json:"at_hash"`
  Aud           []string      `json:"aud"`
  AuthProvider  string        `json:"auth_provider"`
  AuthTime      int           `json:"auth_time"`
  Email         string        `json:"email"`
  EmailVerified bool          `json:"email_verified"`
  Exp           int           `json:"exp"`
  CodexAuthInfo CodexAuthInfo `json:"https://api.openai.com/auth"`
  Iat           int           `json:"iat"`
  Iss           string        `json:"iss"`
  Jti           string        `json:"jti"`
  Sid           string        `json:"sid"`
  Sub           string        `json:"sub"`
}

type CodexAuthInfo struct {
  ChatgptAccountID               string          `json:"chatgpt_account_id"`
  ChatgptPlanType                string          `json:"chatgpt_plan_type"`
  ChatgptUserID                  string          `json:"chatgpt_user_id"`
  Organizations                  []Organizations `json:"organizations"`
  UserID                         string          `json:"user_id"`
}

// ParseJWTToken parses a JWT token string and extracts its claims
// WITHOUT performing cryptographic signature verification.
func ParseJWTToken(token string) (*JWTClaims, error) {
  parts := strings.Split(token, ".")
  if len(parts) != 3 {
    return nil, fmt.Errorf("invalid JWT token format: expected 3 parts, got %d", len(parts))
  }

  // Decode the claims (payload) part
  claimsData, err := base64URLDecode(parts[1])
  if err != nil {
    return nil, fmt.Errorf("failed to decode JWT claims: %w", err)
  }

  var claims JWTClaims
  if err = json.Unmarshal(claimsData, &claims); err != nil {
    return nil, fmt.Errorf("failed to unmarshal JWT claims: %w", err)
  }

  return &claims, nil
}

// base64URLDecode decodes a Base64 URL-encoded string, adding padding if necessary.
func base64URLDecode(data string) ([]byte, error) {
  switch len(data) % 4 {
  case 2:
    data += "=="
  case 3:
    data += "="
  }
  return base64.URLEncoding.DecodeString(data)
}

func (c *JWTClaims) GetUserEmail() string {
  return c.Email
}

func (c *JWTClaims) GetAccountID() string {
  return c.CodexAuthInfo.ChatgptAccountID
}
```

**Use Case**: After OpenAI's OAuth server validates the token, this extracts user info (email, account ID, subscription type) without re-verifying.

**Why This Matters**: Enables user identification and quota tracking from OpenAI Codex tokens.

---

### 4.142 Request/Response Logging Middleware with Body Restoration (CLIProxyAPI)

**Pattern**: Capture request body for logging while preserving it for handlers.

**Source File**: `internal/api/middleware/request_logging.go`

**Implementation**:

```go
func RequestLoggingMiddleware(logger logging.RequestLogger) gin.HandlerFunc {
  return func(c *gin.Context) {
    if logger == nil || c.Request.Method == http.MethodGet {
      c.Next()
      return
    }

    path := c.Request.URL.Path
    if !shouldLogRequest(path) {
      c.Next()
      return
    }

    // Capture request information
    requestInfo, err := captureRequestInfo(c)
    if err != nil {
      c.Next()
      return
    }

    // Create response writer wrapper
    wrapper := NewResponseWriterWrapper(c.Writer, logger, requestInfo)
    if !logger.IsEnabled() {
      wrapper.logOnErrorOnly = true  // Only log on upstream errors
    }
    c.Writer = wrapper

    // Process the request
    c.Next()

    // Finalize logging after request processing
    wrapper.Finalize(c)
  }
}

func captureRequestInfo(c *gin.Context) (*RequestInfo, error) {
  // Capture URL with sensitive query parameters masked
  maskedQuery := util.MaskSensitiveQuery(c.Request.URL.RawQuery)
  url := c.Request.URL.Path
  if maskedQuery != "" {
    url += "?" + maskedQuery
  }

  // Capture headers
  headers := make(map[string][]string)
  for key, values := range c.Request.Header {
    headers[key] = values
  }

  // Capture request body
  var body []byte
  if c.Request.Body != nil {
    bodyBytes, err := io.ReadAll(c.Request.Body)
    if err != nil {
      return nil, err
    }

    // Restore the body for the actual request processing
    c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
    body = bodyBytes
  }

  return &RequestInfo{
    URL:       url,
    Method:    c.Request.Method,
    Headers:   headers,
    Body:      body,
    RequestID: logging.GetGinRequestID(c),
  }, nil
}

// shouldLogRequest determines whether the request should be logged.
// Skips management endpoints to avoid leaking secrets.
func shouldLogRequest(path string) bool {
  if strings.HasPrefix(path, "/v0/management") || strings.HasPrefix(path, "/management") {
    return false  // Skip - may contain secrets
  }
  if strings.HasPrefix(path, "/api") {
    return strings.HasPrefix(path, "/api/provider")
  }
  return true
}
```

**Key Design Decisions**:

1. **Body restoration**: Read body, then wrap in new `NopCloser` buffer
2. **Sensitive masking**: Query parameters masked, management endpoints skipped
3. **Conditional logging**: `logOnErrorOnly` mode when logging disabled
4. **Response wrapping**: Capture response for correlation

**Why This Matters**: Enables debugging and auditing without breaking request processing.

---

### 4.143 Tokenizer Caching by Provider and Model (claude-code-router)

**Pattern**: Cache tokenizer instances to avoid repeated initialization overhead.

**Source File**: `packages/core/src/plugins/token-speed.ts`

**Implementation**:

```typescript
// Cache tokenizers by provider and model to avoid repeated initialization
const tokenizerCache = new Map<string, ITokenizer>();

const getTokenizerForRequest = async (request: any): Promise<ITokenizer | null> => {
  const tokenizerService = (fastify as any).tokenizerService;
  if (!tokenizerService) {
    fastify.log?.warn("TokenizerService not available");
    return null;
  }

  if (!request.provider || !request.model) {
    return null;
  }
  const providerName = request.provider;
  const modelName = request.model;

  // Create cache key
  const cacheKey = `${providerName}:${modelName}`;

  // Check cache first
  if (tokenizerCache.has(cacheKey)) {
    return tokenizerCache.get(cacheKey)!;
  }

  // Get tokenizer config for this model
  const tokenizerConfig = tokenizerService.getTokenizerConfigForModel(providerName, modelName);

  if (!tokenizerConfig) {
    fastify.log?.debug(`No tokenizer config for ${providerName}:${modelName}, using fallback`);
    return null;
  }

  try {
    // Create and cache tokenizer
    const tokenizer = await tokenizerService.getTokenizer(tokenizerConfig);
    tokenizerCache.set(cacheKey, tokenizer);
    fastify.log?.info(`Created tokenizer for ${providerName}:${modelName} - ${tokenizer.name}`);
    return tokenizer;
  } catch (error: any) {
    fastify.log?.warn(`Failed to create tokenizer for ${providerName}:${modelName}: ${error.message}`);
    return null;
  }
};
```

**Cache Key Format**: `provider:model` (e.g., `anthropic:claude-opus-4-5-thinking`, `google:gemini-2.5-pro`)

**Fallback Strategy**: Use heuristic token estimation when no tokenizer config available.

**Why This Matters**: Tokenizer initialization can be expensive; caching amortizes the cost across requests.

---

### 4.144 Stream Tee for Stats Collection Without Blocking (claude-code-router)

**Pattern**: Duplicate streaming response for metrics collection without affecting client delivery.

**Source File**: `packages/core/src/plugins/token-speed.ts`

**Implementation**:

```typescript
// Handle streaming responses
if (payload instanceof ReadableStream) {
  // Mark this request as streaming
  requestStats.set(requestId, {
    requestId,
    sessionId,
    startTime,
    lastTokenTime: startTime,
    tokenCount: 0,
    tokensPerSecond: 0,
    tokenTimestamps: [],
    stream: true,
  });

  // Tee the stream: one for stats, one for the client
  const [originalStream, statsStream] = payload.tee();

  // Process stats in background
  const processStats = async () => {
    let outputTimer: NodeJS.Timeout | null = null;

    try {
      // Decode byte stream to text, then parse SSE events
      const eventStream = statsStream.pipeThrough(new TextDecoderStream()).pipeThrough(new SSEParserTransform());
      const reader = eventStream.getReader();

      // Start timer immediately - output every 1 second
      outputTimer = setInterval(async () => {
        const stats = requestStats.get(requestId);
        if (stats) {
          await doOutput(false);
        }
      }, 1000);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Process SSE event for token counting...
        if (data.event === "content_block_delta" && data.data?.delta) {
          const text = data.data.delta.text || data.data.delta.thinking || "";
          if (text) {
            const tokenCount = estimateTokens(text);
            stats.tokenCount += tokenCount;
            // Record timestamps for sliding window
            for (let i = 0; i < tokenCount; i++) {
              stats.tokenTimestamps.push(now);
            }
          }
        }

        if (data.event === "message_stop") {
          clearInterval(outputTimer);
          await doOutput(true); // Final stats
          requestStats.delete(requestId);
        }
      }
    } catch (error) {
      if (outputTimer) clearInterval(outputTimer);
    }
  };

  // Start background processing without blocking
  processStats().catch((error) => {
    fastify.log?.warn(`Background stats processing failed: ${error.message}`);
  });

  // Return original stream to client
  return originalStream;
}
```

**Key Insight**: `ReadableStream.tee()` creates two independent streams from one source - client gets unmodified data, stats collection happens in parallel.

**Why This Matters**: Enables real-time metrics without adding latency to the response path.

---

### 4.145 LRU Cache for Session Token Usage (claude-code-router)

**Pattern**: Simple LRU cache using Map's insertion order guarantees.

**Source File**: `packages/core/src/utils/cache.ts`

**Implementation**:

```typescript
export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V>;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cache = new Map<K, V>();
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key) as V;
    // Move to end to mark as recently used
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key: K, value: V): void {
    if (this.cache.has(key)) {
      // If key exists, delete it to update its position
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // If cache is full, delete the least recently used item
      const leastRecentlyUsedKey = this.cache.keys().next().value;
      if (leastRecentlyUsedKey !== undefined) {
        this.cache.delete(leastRecentlyUsedKey);
      }
    }
    this.cache.set(key, value);
  }

  values(): V[] {
    return Array.from(this.cache.values());
  }
}

export const sessionUsageCache = new LRUCache<string, Usage>(100);
```

**Key Insight**: JavaScript `Map` preserves insertion order, so `keys().next().value` always returns the oldest entry. Delete-then-insert moves an entry to the end.

**Why This Matters**: Tracks token usage per session with bounded memory (100 sessions max).

---

### 4.146 Response Rewriter with Model Name Substitution (CLIProxyAPI)

**Pattern**: Intercept and modify JSON responses to restore original model names.

**Source File**: `internal/api/modules/amp/response_rewriter.go`

**Implementation**:

```go
// ResponseRewriter wraps a gin.ResponseWriter to intercept and modify the response body
// It's used to rewrite model names in responses when model mapping is used
type ResponseRewriter struct {
  gin.ResponseWriter
  body          *bytes.Buffer
  originalModel string
  isStreaming   bool
}

// Write intercepts response writes and buffers them for model name replacement
func (rw *ResponseRewriter) Write(data []byte) (int, error) {
  // Detect streaming on first write
  if rw.body.Len() == 0 && !rw.isStreaming {
    contentType := rw.Header().Get("Content-Type")
    rw.isStreaming = strings.Contains(contentType, "text/event-stream") ||
      strings.Contains(contentType, "stream")
  }

  if rw.isStreaming {
    n, err := rw.ResponseWriter.Write(rw.rewriteStreamChunk(data))
    if err == nil {
      if flusher, ok := rw.ResponseWriter.(http.Flusher); ok {
        flusher.Flush()
      }
    }
    return n, err
  }
  return rw.body.Write(data)
}

// modelFieldPaths lists all JSON paths where model name may appear
var modelFieldPaths = []string{"model", "modelVersion", "response.modelVersion", "message.model"}

// rewriteModelInResponse replaces all occurrences of the mapped model with the original model
// It also suppresses "thinking" blocks if "tool_use" is present for Amp client compatibility
func (rw *ResponseRewriter) rewriteModelInResponse(data []byte) []byte {
  // 1. Amp Compatibility: Suppress thinking blocks if tool use is detected
  if gjson.GetBytes(data, `content.#(type=="tool_use")`).Exists() {
    filtered := gjson.GetBytes(data, `content.#(type!="thinking")#`)
    if filtered.Exists() {
      data, _ = sjson.SetBytes(data, "content", filtered.Value())
    }
  }

  // 2. Rewrite model names in all known paths
  if rw.originalModel == "" {
    return data
  }
  for _, path := range modelFieldPaths {
    if gjson.GetBytes(data, path).Exists() {
      data, _ = sjson.SetBytes(data, path, rw.originalModel)
    }
  }
  return data
}

// rewriteStreamChunk rewrites model names in SSE stream chunks
func (rw *ResponseRewriter) rewriteStreamChunk(chunk []byte) []byte {
  lines := bytes.Split(chunk, []byte("\n"))
  for i, line := range lines {
    if bytes.HasPrefix(line, []byte("data: ")) {
      jsonData := bytes.TrimPrefix(line, []byte("data: "))
      if len(jsonData) > 0 && jsonData[0] == '{' {
        rewritten := rw.rewriteModelInResponse(jsonData)
        lines[i] = append([]byte("data: "), rewritten...)
      }
    }
  }
  return bytes.Join(lines, []byte("\n"))
}
```

**Key Features**:

1. **Automatic streaming detection**: Checks Content-Type on first write
2. **Model name restoration**: Client sees original requested model, not internal mapping
3. **Amp compatibility hack**: Removes thinking blocks when tool_use is present

**Why This Matters**: Enables transparent model aliasing - clients don't see internal routing details.

---

### 4.147 Git-Backed Token Store with Squash Commits (CLIProxyAPI)

**Pattern**: Use Git repository as a versioned, synced credential store.

**Source File**: `internal/store/gitstore.go`

**Implementation**:

```go
// GitTokenStore persists token records and auth metadata using git as the backing storage.
type GitTokenStore struct {
  mu        sync.Mutex
  dirLock   sync.RWMutex
  baseDir   string
  repoDir   string
  configDir string
  remote    string
  username  string
  password  string
}

// EnsureRepository prepares the local git working tree by cloning or opening the repository.
func (s *GitTokenStore) EnsureRepository() error {
  // Clone if .git doesn't exist
  if _, err := os.Stat(gitDir); errors.Is(err, fs.ErrNotExist) {
    if _, errClone := git.PlainClone(repoDir, &git.CloneOptions{Auth: authMethod, URL: s.remote}); errClone != nil {
      // Handle empty remote - init fresh and create remote
      if errors.Is(errClone, transport.ErrEmptyRemoteRepository) {
        repo, _ := git.PlainInit(repoDir, false)
        repo.CreateRemote(&config.RemoteConfig{Name: "origin", URLs: []string{s.remote}})
        // Create placeholder files
        ensureEmptyFile(filepath.Join(authDir, ".gitkeep"))
        ensureEmptyFile(filepath.Join(configDir, ".gitkeep"))
      }
    }
  } else {
    // Pull latest changes
    worktree.Pull(&git.PullOptions{Auth: authMethod, RemoteName: "origin"})
  }
}

// Save persists token and commits to git
func (s *GitTokenStore) Save(ctx context.Context, auth *cliproxyauth.Auth) (string, error) {
  // Write file atomically
  tmp := path + ".tmp"
  os.WriteFile(tmp, raw, 0o600)
  os.Rename(tmp, path)

  // Commit and push
  return path, s.commitAndPushLocked(fmt.Sprintf("Update auth %s", auth.ID), relPath)
}

// rewriteHeadAsSingleCommit rewrites the current branch tip to a single-parentless commit
// This keeps history minimal (only current state matters)
func (s *GitTokenStore) rewriteHeadAsSingleCommit(repo *git.Repository, branch plumbing.ReferenceName, commitHash plumbing.Hash, message string, signature *object.Signature) error {
  commitObj, _ := repo.CommitObject(commitHash)
  squashed := &object.Commit{
    Author:       *signature,
    Committer:    *signature,
    Message:      message,
    TreeHash:     commitObj.TreeHash,
    ParentHashes: nil,  // No parents = orphan commit
    Encoding:     commitObj.Encoding,
  }
  mem := &plumbing.MemoryObject{}
  mem.SetType(plumbing.CommitObject)
  squashed.Encode(mem)
  newHash, _ := repo.Storer.SetEncodedObject(mem)
  repo.Storer.SetReference(plumbing.NewHashReference(branch, newHash))
  return nil
}
```

**Key Design Decisions**:

1. **Git as sync layer**: Automatic multi-device sync via remote
2. **Squash on every commit**: No history - only current state matters (secrets!)
3. **Force push**: Branch is always rewritten with single commit
4. **Atomic writes**: Temp file + rename for local saves
5. **Pull before operations**: Always sync with remote first

**Why This Matters**: Enables team credential sharing via Git without leaking history of old tokens.

---

### 4.148 JSON Deep Equality Without Marshaling (CLIProxyAPI)

**Pattern**: Compare JSON objects by structure to detect actual changes.

**Source File**: `internal/store/gitstore.go`

**Implementation**:

```go
func jsonEqual(a, b []byte) bool {
  var objA any
  var objB any
  if err := json.Unmarshal(a, &objA); err != nil {
    return false
  }
  if err := json.Unmarshal(b, &objB); err != nil {
    return false
  }
  return deepEqualJSON(objA, objB)
}

func deepEqualJSON(a, b any) bool {
  switch valA := a.(type) {
  case map[string]any:
    valB, ok := b.(map[string]any)
    if !ok || len(valA) != len(valB) {
      return false
    }
    for key, subA := range valA {
      subB, ok1 := valB[key]
      if !ok1 || !deepEqualJSON(subA, subB) {
        return false
      }
    }
    return true
  case []any:
    sliceB, ok := b.([]any)
    if !ok || len(valA) != len(sliceB) {
      return false
    }
    for i := range valA {
      if !deepEqualJSON(valA[i], sliceB[i]) {
        return false
      }
    }
    return true
  case float64:
    valB, ok := b.(float64)
    return ok && valA == valB
  case string:
    valB, ok := b.(string)
    return ok && valA == valB
  case bool:
    valB, ok := b.(bool)
    return ok && valA == valB
  case nil:
    return b == nil
  default:
    return false
  }
}
```

**Use Case**: Before writing a file, check if the content actually changed:

```go
if existing, err := os.ReadFile(path); err == nil {
  if jsonEqual(existing, raw) {
    return path, nil  // Skip write if unchanged
  }
}
```

**Why This Matters**: Avoids unnecessary git commits when token metadata hasn't actually changed.

---

### 4.149 Thinking Block Suppression for Amp Compatibility (CLIProxyAPI)

**Pattern**: Remove thinking blocks when tool_use is present for client compatibility.

**Source File**: `internal/api/modules/amp/response_rewriter.go`

**Implementation**:

```go
// rewriteModelInResponse replaces all occurrences of the mapped model with the original model in JSON
// It also suppresses "thinking" blocks if "tool_use" is present to ensure Amp client compatibility
func (rw *ResponseRewriter) rewriteModelInResponse(data []byte) []byte {
  // 1. Amp Compatibility: Suppress thinking blocks if tool use is detected
  // The Amp client struggles when both thinking and tool_use blocks are present
  if gjson.GetBytes(data, `content.#(type=="tool_use")`).Exists() {
    filtered := gjson.GetBytes(data, `content.#(type!="thinking")#`)
    if filtered.Exists() {
      originalCount := gjson.GetBytes(data, "content.#").Int()
      filteredCount := filtered.Get("#").Int()

      if originalCount > filteredCount {
        data, err = sjson.SetBytes(data, "content", filtered.Value())
        if err == nil {
          log.Debugf("Suppressed %d thinking blocks due to tool usage", originalCount-filteredCount)
        }
      }
    }
  }
  // ... model rewriting continues
}
```

**Problem Solved**: The Amp client (another Claude Code client) has issues parsing responses that contain both thinking and tool_use blocks.

**GJSON Query Breakdown**:

- `content.#(type=="tool_use")` - Find any content block where type equals "tool_use"
- `content.#(type!="thinking")#` - Get all content blocks where type is NOT "thinking"

**Why This Matters**: Enables Claude thinking mode with Amp clients that can't handle mixed content.

---

### 4.150 Base64 Data URL Normalization (claude-code-router)

**Pattern**: Normalize various base64 image formats to consistent data URLs.

**Source File**: `packages/core/src/utils/image.ts`

**Implementation**:

```typescript
export const formatBase64 = (data: string, media_type: string) => {
  if (data.includes("base64")) {
    data = data.split("base64").pop() as string;
    if (data.startsWith(",")) {
      data = data.slice(1);
    }
  }
  return `data:${media_type};base64,${data}`;
};
```

**Input Formats Handled**:

- `data:image/png;base64,iVBOR...` → Extracts `iVBOR...`
- `base64,iVBOR...` → Extracts `iVBOR...`
- `iVBOR...` → Uses as-is

**Output**: Always `data:{media_type};base64,{data}`

**Why This Matters**: LLM providers accept images in different formats - normalization ensures consistency.

---

### 4.151 Thinking Recovery via Turn Closure (opencode-antigravity-auth)

**Pattern**: When thinking blocks are corrupted/stripped during context compaction, recover by closing the current turn and starting fresh.

**Source File**: `src/plugin/thinking-recovery.ts`

**Philosophy**: "Let it crash and start again" - Instead of trying to fix corrupted state, abandon the corrupted turn and let Claude generate fresh thinking.

**Implementation**:

```typescript
/**
 * Analyzes conversation state to detect tool use loops and thinking mode issues.
 */
export function analyzeConversationState(contents: any[]): ConversationState {
  const state: ConversationState = {
    inToolLoop: false,
    turnStartIdx: -1,
    turnHasThinking: false,
    lastModelIdx: -1,
    lastModelHasThinking: false,
    lastModelHasToolCalls: false,
  };

  // Find the last "real" user message (not a tool result)
  let lastRealUserIdx = -1;
  for (let i = 0; i < contents.length; i++) {
    const msg = contents[i];
    if (msg?.role === "user" && !isToolResultMessage(msg)) {
      lastRealUserIdx = i;
    }
  }

  // Track if this is the turn start (first model message after user message)
  for (let i = 0; i < contents.length; i++) {
    const msg = contents[i];
    if ((msg?.role === "model" || msg?.role === "assistant") && i > lastRealUserIdx) {
      if (state.turnStartIdx === -1) {
        state.turnStartIdx = i;
        state.turnHasThinking = messageHasThinking(msg);
      }
      state.lastModelIdx = i;
    }
  }

  // We're in a tool loop if conversation ends with a tool result
  const lastMsg = contents[contents.length - 1];
  if (lastMsg?.role === "user" && isToolResultMessage(lastMsg)) {
    state.inToolLoop = true;
  }

  return state;
}

/**
 * Closes an incomplete tool loop by injecting synthetic messages to start a new turn.
 */
export function closeToolLoopForThinking(contents: any[]): any[] {
  // Strip any old/corrupted thinking first
  const strippedContents = stripAllThinkingBlocks(contents);

  // Count tool results from the end of the conversation
  const toolResultCount = countTrailingToolResults(strippedContents);

  // Build synthetic model message content based on tool count
  let syntheticModelContent: string;
  if (toolResultCount === 0) {
    syntheticModelContent = "[Processing previous context.]";
  } else if (toolResultCount === 1) {
    syntheticModelContent = "[Tool execution completed.]";
  } else {
    syntheticModelContent = `[${toolResultCount} tool executions completed.]`;
  }

  // Inject synthetic MODEL message to complete the non-thinking turn
  const syntheticModel = {
    role: "model",
    parts: [{ text: syntheticModelContent }],
  };

  // Inject synthetic USER message to start a NEW turn
  const syntheticUser = {
    role: "user",
    parts: [{ text: "[Continue]" }],
  };

  return [...strippedContents, syntheticModel, syntheticUser];
}
```

**Trigger Detection**:

```typescript
export function needsThinkingRecovery(state: ConversationState): boolean {
  return state.inToolLoop && !state.turnHasThinking;
}
```

**Why This Matters**: Context compaction can strip thinking blocks, corrupting the conversation state. This recovery mechanism lets Claude start a fresh turn with new thinking.

---

### 4.152 Compacted Thinking Turn Detection (opencode-antigravity-auth)

**Pattern**: Heuristically detect when thinking blocks were stripped by context compaction.

**Source File**: `src/plugin/thinking-recovery.ts`

**Problem**: Distinguish between "never had thinking" vs "thinking was stripped".

**Implementation**:

```typescript
/**
 * Detects if a message looks like it was compacted from a thinking-enabled turn.
 *
 * Heuristics:
 * 1. Has functionCall parts (typical thinking flow produces tool calls)
 * 2. No thinking parts (thought: true)
 * 3. No text content before functionCall (thinking responses usually have text)
 */
export function looksLikeCompactedThinkingTurn(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false;

  const parts = msg.parts || [];
  if (parts.length === 0) return false;

  // Check if message has function calls
  const hasFunctionCall = parts.some((p: any) => p && typeof p === "object" && p.functionCall);
  if (!hasFunctionCall) return false;

  // Check for thinking blocks
  const hasThinking = parts.some((p: any) => p?.thought === true || p?.type === "thinking" || p?.type === "redacted_thinking");
  if (hasThinking) return false;

  // Check for text content before functionCall
  const hasTextBeforeFunctionCall = parts.some((p: any, idx: number) => {
    const firstFuncIdx = parts.findIndex((fp: any) => fp?.functionCall);
    if (idx >= firstFuncIdx) return false;
    return "text" in p && typeof p.text === "string" && p.text.trim().length > 0 && !p.thought;
  });

  // If we have functionCall but no text before it, likely compacted
  return !hasTextBeforeFunctionCall;
}
```

**Why This Matters**: Enables automatic recovery when thinking mode was previously enabled but compaction stripped the thinking blocks.

---

### 4.153 Disk-Persistent Signature Cache with Dual TTL (opencode-antigravity-auth)

**Pattern**: Two-tier caching with short memory TTL and longer disk TTL, plus background persistence.

**Source File**: `src/plugin/cache/signature-cache.ts`

**Implementation**:

```typescript
export class SignatureCache {
  private cache: Map<string, CacheEntry> = new Map();
  private memoryTtlMs: number; // Short TTL for memory
  private diskTtlMs: number; // Longer TTL for disk
  private writeIntervalMs: number;
  private dirty: boolean = false;
  private writeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SignatureCacheConfig) {
    this.memoryTtlMs = config.memory_ttl_seconds * 1000;
    this.diskTtlMs = config.disk_ttl_seconds * 1000;
    this.writeIntervalMs = config.write_interval_seconds * 1000;

    if (config.enabled) {
      this.loadFromDisk();
      this.startBackgroundTasks();
    }
  }

  retrieve(key: string): string | null {
    const entry = this.cache.get(key);
    if (entry) {
      const age = Date.now() - entry.timestamp;
      if (age <= this.memoryTtlMs) {
        this.stats.memoryHits++;
        return entry.value;
      }
      // Expired from memory, remove it
      this.cache.delete(key);
    }
    this.stats.misses++;
    return null;
  }

  /**
   * Save cache to disk with atomic write pattern.
   * Merges with existing disk entries that haven't expired.
   */
  private saveToDisk(): boolean {
    // Step 1: Load existing disk entries (if any)
    let existingEntries: Record<string, CacheEntry> = {};
    if (existsSync(this.cacheFilePath)) {
      const content = readFileSync(this.cacheFilePath, "utf-8");
      const data = JSON.parse(content) as CacheData;
      existingEntries = data.entries || {};
    }

    // Step 2: Filter existing disk entries by disk_ttl
    const validDiskEntries: Record<string, CacheEntry> = {};
    for (const [key, entry] of Object.entries(existingEntries)) {
      if (Date.now() - entry.timestamp <= this.diskTtlMs) {
        validDiskEntries[key] = entry;
      }
    }

    // Step 3: Merge - memory entries take precedence
    const mergedEntries = { ...validDiskEntries };
    for (const [key, entry] of this.cache.entries()) {
      mergedEntries[key] = { value: entry.value, timestamp: entry.timestamp };
    }

    // Step 4: Atomic write (temp file + rename)
    const tmpPath = join(tmpdir(), `cache-${Date.now()}.tmp`);
    writeFileSync(tmpPath, JSON.stringify(cacheData, null, 2), "utf-8");
    renameSync(tmpPath, this.cacheFilePath);
  }

  private startBackgroundTasks(): void {
    // Periodic disk writes
    this.writeTimer = setInterval(() => {
      if (this.dirty) this.saveToDisk();
    }, this.writeIntervalMs);

    // Periodic memory cleanup (every 30 minutes)
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 30 * 60 * 1000);
  }
}
```

**Features**:

1. **Dual TTL**: Short memory TTL (fast access), longer disk TTL (persistence across restarts)
2. **Dirty tracking**: Only write to disk when data changed
3. **Merge on save**: Don't lose disk entries that are still valid
4. **Atomic writes**: temp file + rename pattern prevents corruption

---

### 4.154 Custom Error Types for API Recovery (opencode-antigravity-auth)

**Pattern**: Typed error classes with structured metadata for retry logic.

**Source File**: `src/plugin/errors.ts`

**Implementation**:

```typescript
/**
 * Error thrown when Antigravity returns an empty response after retry attempts.
 */
export class EmptyResponseError extends Error {
  readonly provider: string;
  readonly model: string;
  readonly attempts: number;

  constructor(provider: string, model: string, attempts: number, message?: string) {
    super(message ?? `The model returned an empty response after ${attempts} attempts. ` + `This may indicate a temporary service issue. Please try again.`);
    this.name = "EmptyResponseError";
    this.provider = provider;
    this.model = model;
    this.attempts = attempts;
  }
}

/**
 * Error thrown when tool ID matching fails and cannot be recovered.
 */
export class ToolIdMismatchError extends Error {
  readonly expectedIds: string[];
  readonly foundIds: string[];

  constructor(expectedIds: string[], foundIds: string[], message?: string) {
    super(message ?? `Tool ID mismatch: expected [${expectedIds.join(", ")}] but found [${foundIds.join(", ")}]`);
    this.name = "ToolIdMismatchError";
    this.expectedIds = expectedIds;
    this.foundIds = foundIds;
  }
}
```

**Why This Matters**: Structured errors enable intelligent retry logic - the caller can check `error.attempts` and decide whether to retry or give up.

---

### 4.155 Cache Control Stripping Transformer (claude-code-router)

**Pattern**: Remove `cache_control` fields for providers that don't support prompt caching.

**Source File**: `packages/core/src/transformer/cleancache.transformer.ts`

**Implementation**:

```typescript
export class CleancacheTransformer implements Transformer {
  name = "cleancache";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (Array.isArray(request.messages)) {
      request.messages.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          (msg.content as MessageContent[]).forEach((item) => {
            if ((item as TextContent).cache_control) {
              delete (item as TextContent).cache_control;
            }
          });
        } else if (msg.cache_control) {
          delete msg.cache_control;
        }
      });
    }
    return request;
  }
}
```

**Why This Matters**: Anthropic uses `cache_control` for prompt caching, but other providers reject unknown fields. This transformer sanitizes requests for compatibility.

---

### 4.156 Streaming Tool Argument Accumulator (claude-code-router)

**Pattern**: Buffer streaming tool call arguments across chunks, then parse the complete JSON.

**Source File**: `packages/core/src/transformer/enhancetool.transformer.ts`

**Implementation**:

```typescript
interface ToolCall {
  index?: number;
  name?: string;
  id?: string;
  arguments?: string; // Accumulated across chunks
}

let currentToolCall: ToolCall = {};

// In stream processing:
if (data.choices?.[0]?.delta?.tool_calls?.length) {
  const toolCallDelta = data.choices[0].delta.tool_calls[0];

  // Initialize on first chunk
  if (typeof currentToolCall.index === "undefined") {
    currentToolCall = {
      index: toolCallDelta.index,
      name: toolCallDelta.function?.name || "",
      id: toolCallDelta.id || "",
      arguments: toolCallDelta.function?.arguments || "",
    };
    // Send first chunk with empty arguments
    toolCallDelta.function.arguments = "";
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    return;
  }

  // Accumulate arguments on continuation chunks
  if (currentToolCall.index === toolCallDelta.index) {
    if (toolCallDelta.function?.arguments) {
      currentToolCall.arguments += toolCallDelta.function.arguments;
    }
    // Don't send intermediate chunks - wait for complete JSON
    return;
  }
}

// On finish_reason === "tool_calls", parse and send complete tool call
if (data.choices?.[0]?.finish_reason === "tool_calls") {
  let finalArgs = "";
  try {
    finalArgs = parseToolArguments(currentToolCall.arguments || "", this.logger);
  } catch {
    finalArgs = currentToolCall.arguments || "";
  }

  const delta = {
    role: "assistant",
    tool_calls: [
      {
        function: { name: currentToolCall.name, arguments: finalArgs },
        id: currentToolCall.id,
        index: currentToolCall.index,
        type: "function",
      },
    ],
  };
  // Send complete parsed tool call
}
```

**Why This Matters**: Streaming tool calls arrive as JSON fragments. Accumulating and parsing them ensures valid JSON even when the model produces slightly malformed output.

---

### 4.157 Thinking Budget to Level Mapping (claude-code-router)

**Pattern**: Convert numeric token budget to discrete thinking level.

**Source File**: `packages/core/src/utils/thinking.ts`

**Implementation**:

```typescript
export const getThinkLevel = (thinking_budget: number): ThinkLevel => {
  if (thinking_budget <= 0) return "none";
  if (thinking_budget <= 1024) return "low";
  if (thinking_budget <= 8192) return "medium";
  return "high";
};
```

**Thresholds**:

| Budget    | Level  |
| --------- | ------ |
| ≤0        | none   |
| 1-1024    | low    |
| 1025-8192 | medium |
| >8192     | high   |

**Why This Matters**: Some providers (like OpenRouter) use discrete levels instead of token budgets. This normalizes Anthropic's budget to a provider-agnostic level.

---

### 4.158 Generic Stream Rewriting Pipeline (claude-code-router)

**Pattern**: Transform a ReadableStream with an async processor function.

**Source File**: `packages/server/src/utils/rewriteStream.ts`

**Implementation**:

```typescript
/**
 * Read source readablestream and return a new readablestream.
 * Processor processes source data and pushes returned new value to new stream.
 * No push if no return value.
 */
export const rewriteStream = (stream: ReadableStream, processor: (data: any, controller: ReadableStreamController<any>) => Promise<any>): ReadableStream => {
  const reader = stream.getReader();

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }

          const processed = await processor(value, controller);
          if (processed !== undefined) {
            controller.enqueue(processed);
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
};
```

**Usage**:

```typescript
const transformedStream = rewriteStream(originalStream, async (chunk, controller) => {
  const text = new TextDecoder().decode(chunk);
  const modified = text.replace(/oldModel/g, "newModel");
  return new TextEncoder().encode(modified);
});
```

**Why This Matters**: Clean abstraction for any stream transformation - SSE rewriting, content filtering, model name substitution, etc.

---

### 4.159 Scenario-Based Smart Router (claude-code-router)

**Pattern**: Route requests to different models based on context, token count, and request type.

**Source File**: `packages/core/src/utils/router.ts`

**Scenario Types**:

```typescript
export type RouterScenarioType = "default" | "background" | "think" | "longContext" | "webSearch";

export interface RouterFallbackConfig {
  default?: string[];
  background?: string[];
  think?: string[];
  longContext?: string[];
  webSearch?: string[];
}
```

**Routing Logic**:

```typescript
const getUseModel = async (req, tokenCount, configService, lastUsage) => {
  // Priority 1: Provider,model format (explicit override)
  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    return { model: `${provider},${model}`, scenarioType: "default" };
  }

  // Priority 2: Long context threshold
  const longContextThreshold = Router?.longContextThreshold || 60000;
  const lastUsageThreshold = lastUsage?.input_tokens > longContextThreshold && tokenCount > 20000;
  if ((tokenCount > longContextThreshold || lastUsageThreshold) && Router?.longContext) {
    return { model: Router.longContext, scenarioType: "longContext" };
  }

  // Priority 3: Subagent model injection via system prompt
  if (req.body?.system?.[1]?.text?.startsWith("<CCR-SUBAGENT-MODEL>")) {
    const model = req.body.system[1].text.match(/<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s);
    if (model) {
      req.body.system[1].text = req.body.system[1].text.replace(`<CCR-SUBAGENT-MODEL>${model[1]}</CCR-SUBAGENT-MODEL>`, "");
      return { model: model[1], scenarioType: "default" };
    }
  }

  // Priority 4: Background model for Haiku variants
  if (req.body.model?.includes("claude") && req.body.model?.includes("haiku") && Router?.background) {
    return { model: Router.background, scenarioType: "background" };
  }

  // Priority 5: Web search model
  if (req.body.tools?.some((tool) => tool.type?.startsWith("web_search")) && Router?.webSearch) {
    return { model: Router.webSearch, scenarioType: "webSearch" };
  }

  // Priority 6: Thinking model
  if (req.body.thinking && Router?.think) {
    return { model: Router.think, scenarioType: "think" };
  }

  // Default
  return { model: Router?.default, scenarioType: "default" };
};
```

**Why This Matters**: Intelligent routing reduces costs (cheap models for simple tasks) while ensuring quality (expensive models for complex tasks).

---

### 4.160 LRU Cache Using Map Insertion Order (claude-code-router)

**Pattern**: Implement LRU cache using JavaScript Map's guaranteed insertion order.

**Source File**: `packages/core/src/utils/cache.ts`

**Implementation**:

```typescript
class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V>;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cache = new Map<K, V>();
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key) as V;
    // Move to end to mark as recently used
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key: K, value: V): void {
    if (this.cache.has(key)) {
      // If key exists, delete it to update its position
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // If cache is full, delete the least recently used item
      const leastRecentlyUsedKey = this.cache.keys().next().value;
      if (leastRecentlyUsedKey !== undefined) {
        this.cache.delete(leastRecentlyUsedKey);
      }
    }
    this.cache.set(key, value);
  }
}
```

**Key Insight**: JavaScript Map maintains insertion order. The first key from `keys().next()` is the oldest (least recently used).

**Why This Matters**: Zero-dependency LRU implementation that's fast and memory-efficient.

---

### 4.161 Sensitive Field Auto-Sanitization (claude-code-router)

**Pattern**: Automatically detect and replace sensitive fields with environment variable placeholders.

**Source File**: `packages/shared/src/preset/sensitiveFields.ts`

**Sensitive Field Detection**:

```typescript
const SENSITIVE_PATTERNS = ["api_key", "apikey", "apiKey", "APIKEY", "api_secret", "apisecret", "apiSecret", "secret", "SECRET", "token", "TOKEN", "auth_token", "password", "PASSWORD", "passwd", "private_key", "privateKey", "access_key", "accessKey"];

function isSensitiveField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();
  return SENSITIVE_PATTERNS.some((pattern) => lowerFieldName.includes(pattern.toLowerCase()));
}
```

**Auto-Replacement**:

```typescript
function sanitizeObject(config: any, path: string = "", sanitizedCount: number = 0) {
  for (const [key, value] of Object.entries(config)) {
    if (isSensitiveField(key) && typeof value === "string") {
      // If value is already an environment variable, keep unchanged
      if (isEnvPlaceholder(value)) {
        sanitizedObj[key] = value;
      } else {
        // Replace with environment variable placeholder
        const envVarName = generateEnvVarName("global", entityName, key);
        sanitizedObj[key] = `\${${envVarName}}`;
        sanitizedCount++;
      }
    }
  }
}

// Generates: DEEPSEEK_API_KEY, CUSTOM_TRANSFORMER_SECRET, etc.
export function generateEnvVarName(fieldType: string, entityName: string, fieldName: string): string {
  const prefix = entityName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const field = fieldName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return prefix === field ? prefix : `${prefix}_${field}`;
}
```

**Why This Matters**: Enables safe config sharing - export a preset without exposing API keys.

---

### 4.162 DeepSeek Reasoning Content Transformer (claude-code-router)

**Pattern**: Convert DeepSeek's `reasoning_content` format to Anthropic's thinking block format.

**Source File**: `packages/core/src/transformer/deepseek.transformer.ts`

**Implementation**:

```typescript
// In streaming response processing:
if (data.choices?.[0]?.delta?.reasoning_content) {
  // Accumulate reasoning content
  reasoningContent += data.choices[0].delta.reasoning_content;

  // Transform to Anthropic thinking format
  const thinkingChunk = {
    ...data,
    choices: [
      {
        ...data.choices[0],
        delta: {
          ...data.choices[0].delta,
          thinking: {
            content: data.choices[0].delta.reasoning_content,
          },
        },
      },
    ],
  };
  delete thinkingChunk.choices[0].delta.reasoning_content;
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));
  return;
}

// When reasoning is complete (delta has content but no reasoning_content)
if (data.choices?.[0]?.delta?.content && reasoningContent && !isReasoningComplete) {
  isReasoningComplete = true;
  const signature = Date.now().toString();

  // Send complete thinking block
  const thinkingChunk = {
    ...data,
    choices: [
      {
        ...data.choices[0],
        delta: {
          content: null,
          thinking: {
            content: reasoningContent,
            signature: signature, // Generate synthetic signature
          },
        },
      },
    ],
  };
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));
}
```

**Why This Matters**: Enables using DeepSeek's reasoning models with Claude Code clients that expect Anthropic format.

---

### 4.163 Full OpenAI to Anthropic Streaming Converter (claude-code-router)

**Pattern**: Convert OpenAI-format streaming responses to Anthropic SSE format in real-time.

**Source File**: `packages/core/src/transformer/anthropic.transformer.ts`

**Stream State Machine**:

```typescript
const convertOpenAIStreamToAnthropic = async (openaiStream: ReadableStream) => {
  let hasStarted = false;
  let hasTextContentStarted = false;
  let isThinkingStarted = false;
  let currentContentBlockIndex = -1;
  let contentIndex = 0;

  const toolCalls = new Map<number, any>();
  const toolCallIndexToContentBlockIndex = new Map<number, number>();

  // Atomic content block index allocation
  const assignContentBlockIndex = (): number => {
    const currentIndex = contentIndex;
    contentIndex++;
    return currentIndex;
  };

  // Process each OpenAI chunk
  for await (const chunk of openaiStream) {
    // 1. Send message_start on first chunk
    if (!hasStarted) {
      hasStarted = true;
      safeEnqueue({
        type: "message_start",
        message: { id: messageId, role: "assistant", content: [] },
      });
    }

    // 2. Handle thinking blocks
    if (choice?.delta?.thinking) {
      if (!isThinkingStarted) {
        const thinkingBlockIndex = assignContentBlockIndex();
        safeEnqueue({ type: "content_block_start", index: thinkingBlockIndex, content_block: { type: "thinking", thinking: "" } });
        currentContentBlockIndex = thinkingBlockIndex;
        isThinkingStarted = true;
      }

      if (choice.delta.thinking.signature) {
        safeEnqueue({ type: "content_block_delta", delta: { type: "signature_delta", signature: choice.delta.thinking.signature } });
        safeEnqueue({ type: "content_block_stop", index: currentContentBlockIndex });
      } else {
        safeEnqueue({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: choice.delta.thinking.content } });
      }
    }

    // 3. Handle text content
    if (choice?.delta?.content) {
      if (!hasTextContentStarted) {
        const textBlockIndex = assignContentBlockIndex();
        safeEnqueue({ type: "content_block_start", index: textBlockIndex, content_block: { type: "text", text: "" } });
        currentContentBlockIndex = textBlockIndex;
        hasTextContentStarted = true;
      }
      safeEnqueue({ type: "content_block_delta", delta: { type: "text_delta", text: choice.delta.content } });
    }

    // 4. Handle tool calls with index tracking
    if (choice?.delta?.tool_calls) {
      for (const toolCall of choice.delta.tool_calls) {
        const toolCallIndex = toolCall.index ?? 0;
        if (!toolCallIndexToContentBlockIndex.has(toolCallIndex)) {
          const newContentBlockIndex = assignContentBlockIndex();
          toolCallIndexToContentBlockIndex.set(toolCallIndex, newContentBlockIndex);
          safeEnqueue({ type: "content_block_start", index: newContentBlockIndex, content_block: { type: "tool_use", id: toolCall.id, name: toolCall.function?.name } });
          currentContentBlockIndex = newContentBlockIndex;
        }
        if (toolCall.function?.arguments) {
          safeEnqueue({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: toolCall.function.arguments } });
        }
      }
    }

    // 5. Handle finish_reason
    if (choice?.finish_reason) {
      const stopReasonMapping = {
        stop: "end_turn",
        length: "max_tokens",
        tool_calls: "tool_use",
      };
      safeEnqueue({
        type: "message_delta",
        delta: {
          stop_reason: stopReasonMapping[choice.finish_reason] || "end_turn",
        },
      });
    }
  }

  safeEnqueue({ type: "message_stop" });
};
```

**Why This Matters**: Enables Claude Code to work with any OpenAI-compatible provider by converting responses on the fly.

---

### 4.164 Session to Project Mapping with LRU Cache (claude-code-router)

**Pattern**: Find which Claude project a session belongs to, with caching.

**Source File**: `packages/core/src/utils/router.ts`

**Implementation**:

```typescript
// Memory cache for sessionId to project name mapping
// Uses LRU cache with max 1000 entries
const sessionProjectCache = new LRUCache<string, string>({ max: 1000 });

export const searchProjectBySession = async (sessionId: string): Promise<string | null> => {
  // Check cache first
  if (sessionProjectCache.has(sessionId)) {
    const result = sessionProjectCache.get(sessionId);
    return result || null;
  }

  try {
    const dir = await opendir(CLAUDE_PROJECTS_DIR);
    const folderNames: string[] = [];

    // Collect all folder names
    for await (const dirent of dir) {
      if (dirent.isDirectory()) {
        folderNames.push(dirent.name);
      }
    }

    // Concurrently check each project folder for sessionId.jsonl file
    const checkPromises = folderNames.map(async (folderName) => {
      const sessionFilePath = join(CLAUDE_PROJECTS_DIR, folderName, `${sessionId}.jsonl`);
      try {
        const fileStat = await stat(sessionFilePath);
        return fileStat.isFile() ? folderName : null;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(checkPromises);

    // Return the first existing project directory name
    for (const result of results) {
      if (result) {
        sessionProjectCache.set(sessionId, result);
        return result;
      }
    }

    // Cache not found result (empty string means previously searched but not found)
    sessionProjectCache.set(sessionId, "");
    return null;
  } catch {
    sessionProjectCache.set(sessionId, "");
    return null;
  }
};
```

**Why This Matters**: Enables per-project configuration - different projects can use different models or settings.

---

### 4.165 HuggingFace Tokenizer with Lazy Download and Local Caching (claude-code-router)

**Pattern**: Download tokenizer files from HuggingFace Hub on first use, cache locally for subsequent uses.

**Source File**: `packages/core/src/tokenizer/huggingface-tokenizer.ts`

**Implementation**:

```typescript
export class HuggingFaceTokenizer implements ITokenizer {
  readonly type = "huggingface";
  private tokenizer: any = null;
  private readonly cacheDir: string;
  private readonly safeModelName: string;

  constructor(modelId: string, logger: any, options: HFTokenizerOptions = {}) {
    this.cacheDir = options.cacheDir || join(homedir(), ".claude-code-router", ".huggingface");
    // Safe filename from model ID
    this.safeModelName = modelId.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private getCachePaths() {
    const modelDir = join(this.cacheDir, this.safeModelName);
    return {
      modelDir,
      tokenizerJson: join(modelDir, "tokenizer.json"),
      tokenizerConfig: join(modelDir, "tokenizer_config.json"),
    };
  }

  private async loadFromCache(): Promise<{ tokenizerJson: any; tokenizerConfig: any } | null> {
    const paths = this.getCachePaths();
    if (!existsSync(paths.tokenizerJson) || !existsSync(paths.tokenizerConfig)) {
      return null;
    }
    const [tokenizerJsonContent, tokenizerConfigContent] = await Promise.all([fs.readFile(paths.tokenizerJson, "utf-8"), fs.readFile(paths.tokenizerConfig, "utf-8")]);
    return {
      tokenizerJson: JSON.parse(tokenizerJsonContent),
      tokenizerConfig: JSON.parse(tokenizerConfigContent),
    };
  }

  private async downloadAndCache(): Promise<{ tokenizerJson: any; tokenizerConfig: any }> {
    const urls = {
      json: `https://huggingface.co/${this.modelId}/resolve/main/tokenizer.json`,
      config: `https://huggingface.co/${this.modelId}/resolve/main/tokenizer_config.json`,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout || 30000);

    try {
      const [jsonRes, configRes] = await Promise.all([fetch(urls.json, { signal: controller.signal }), fetch(urls.config, { signal: controller.signal })]);

      const [tokenizerJson, tokenizerConfig] = await Promise.all([jsonRes.json(), configRes.ok ? configRes.json() : Promise.resolve({})]);

      // Cache for next time
      this.ensureDir(paths.modelDir);
      await Promise.all([fs.writeFile(paths.tokenizerJson, JSON.stringify(tokenizerJson, null, 2)), fs.writeFile(paths.tokenizerConfig, JSON.stringify(tokenizerConfig, null, 2))]);

      return { tokenizerJson, tokenizerConfig };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async initialize(): Promise<void> {
    const tokenizerData = (await this.loadFromCache()) || (await this.downloadAndCache());
    this.tokenizer = new Tokenizer(tokenizerData.tokenizerJson, tokenizerData.tokenizerConfig);
  }
}
```

**Why This Matters**: Enables accurate token counting for any HuggingFace model without bundling tokenizer files.

---

### 4.166 Pluggable Tokenizer Service with Fallback (claude-code-router)

**Pattern**: Multi-type tokenizer abstraction with automatic fallback to a safe default.

**Source File**: `packages/core/src/services/tokenizer.ts`

**Tokenizer Types**:

| Type        | Implementation       | Use Case                      |
| ----------- | -------------------- | ----------------------------- |
| tiktoken    | TiktokenTokenizer    | OpenAI-compatible (default)   |
| huggingface | HuggingFaceTokenizer | Open-source models            |
| api         | ApiTokenizer         | Provider's token counting API |

**Implementation**:

```typescript
export class TokenizerService {
  private tokenizers: Map<string, ITokenizer> = new Map();
  private fallbackTokenizer?: ITokenizer;

  async initialize(): Promise<void> {
    // Initialize fallback tokenizer (tiktoken with cl100k_base)
    this.fallbackTokenizer = new TiktokenTokenizer("cl100k_base");
    await this.fallbackTokenizer.initialize();
    this.tokenizers.set("fallback", this.fallbackTokenizer);
  }

  async getTokenizer(config: TokenizerConfig): Promise<ITokenizer> {
    const cacheKey = this.getCacheKey(config);

    // Check cache first
    if (this.tokenizers.has(cacheKey)) {
      return this.tokenizers.get(cacheKey)!;
    }

    try {
      let tokenizer: ITokenizer;
      switch (config.type) {
        case "tiktoken":
          tokenizer = new TiktokenTokenizer(config.encoding || "cl100k_base");
          break;
        case "huggingface":
          tokenizer = new HuggingFaceTokenizer(config.model!, this.logger);
          break;
        case "api":
          tokenizer = new ApiTokenizer(config, this.logger);
          break;
        default:
          throw new Error(`Unknown tokenizer type: ${config.type}`);
      }

      await tokenizer.initialize();
      this.tokenizers.set(cacheKey, tokenizer);
      return tokenizer;
    } catch (error) {
      // Return fallback tokenizer on any initialization error
      return this.fallbackTokenizer!;
    }
  }

  private getCacheKey(config: TokenizerConfig): string {
    switch (config.type) {
      case "tiktoken":
        return `tiktoken:${config.encoding || "cl100k_base"}`;
      case "huggingface":
        return `hf:${config.model}`;
      case "api":
        return `api:${config.url}`;
      default:
        return `unknown:${JSON.stringify(config)}`;
    }
  }
}
```

**Why This Matters**: Accurate token counting for routing decisions, with graceful degradation.

---

### 4.167 Gemini Path Bridge for AMP CLI (CLIProxyAPI)

**Pattern**: Rewrite non-standard API paths to standard format using middleware.

**Source File**: `internal/api/modules/amp/gemini_bridge.go`

**Problem**: AMP CLI uses different paths than standard Gemini API.

- AMP format: `/publishers/google/models/gemini-3-pro:streamGenerateContent`
- Standard format: `/models/gemini-3-pro:streamGenerateContent`

**Implementation**:

```go
// createGeminiBridgeHandler creates a handler that bridges AMP CLI's non-standard Gemini paths
func createGeminiBridgeHandler(handler gin.HandlerFunc) gin.HandlerFunc {
    return func(c *gin.Context) {
        // Get the full path from the catch-all parameter
        path := c.Param("path")

        // Extract model:method from AMP CLI path format
        const modelsPrefix = "/models/"
        if idx := strings.Index(path, modelsPrefix); idx >= 0 {
            // Extract everything after modelsPrefix
            actionPart := path[idx+len(modelsPrefix):]

            // Check if model was mapped by FallbackHandler
            if mappedModel, exists := c.Get(MappedModelContextKey); exists {
                if strModel, ok := mappedModel.(string); ok && strModel != "" {
                    // Replace the model part in the action
                    if colonIdx := strings.Index(actionPart, ":"); colonIdx > 0 {
                        method := actionPart[colonIdx:] // ":method"
                        actionPart = strModel + method
                    }
                }
            }

            // Set this as the :action parameter that the Gemini handler expects
            c.Params = append(c.Params, gin.Param{Key: "action", Value: actionPart})

            handler(c)
            return
        }

        c.JSON(400, gin.H{"error": "Invalid Gemini API path format"})
    }
}
```

**Why This Matters**: Enables compatibility with multiple client path conventions.

---

### 4.168 Multi-Source Secret with Precedence and Caching (CLIProxyAPI)

**Pattern**: Load secrets from multiple sources with configurable precedence and TTL caching.

**Source File**: `internal/api/modules/amp/secret.go`

**Precedence Order**:

1. Explicit config value (highest priority)
2. Environment variable (`AMP_API_KEY`)
3. File-based secret (`~/.local/share/amp/secrets.json`)

**Implementation**:

```go
type MultiSourceSecret struct {
    explicitKey string
    envKey      string
    filePath    string
    cacheTTL    time.Duration

    mu    sync.RWMutex
    cache *cachedSecret
}

type cachedSecret struct {
    value     string
    expiresAt time.Time
}

func (s *MultiSourceSecret) Get(ctx context.Context) (string, error) {
    // Precedence 1: Explicit config key (highest priority, no caching needed)
    if s.explicitKey != "" {
        return s.explicitKey, nil
    }

    // Precedence 2: Environment variable
    if envValue := strings.TrimSpace(os.Getenv(s.envKey)); envValue != "" {
        return envValue, nil
    }

    // Precedence 3: File-based secret (lowest priority, cached)
    // Check cache first
    s.mu.RLock()
    if s.cache != nil && time.Now().Before(s.cache.expiresAt) {
        value := s.cache.value
        s.mu.RUnlock()
        return value, nil
    }
    s.mu.RUnlock()

    // Cache miss or expired - read from file
    key, err := s.readFromFile()
    if err != nil {
        s.updateCache("")  // Cache empty result to avoid repeated file reads
        return "", err
    }

    s.updateCache(key)
    return key, nil
}

func (s *MultiSourceSecret) readFromFile() (string, error) {
    content, err := os.ReadFile(s.filePath)
    if err != nil {
        if os.IsNotExist(err) {
            return "", nil  // Missing file is not an error
        }
        return "", err
    }

    var secrets map[string]string
    json.Unmarshal(content, &secrets)
    return secrets["apiKey@https://ampcode.com/"], nil
}
```

**Why This Matters**: Flexible secret management that works in development (env var), production (config), and CLI tools (file).

---

### 4.169 Per-Client API Key Mapping (CLIProxyAPI)

**Pattern**: Map incoming client API keys to different upstream API keys.

**Source File**: `internal/api/modules/amp/secret.go`

**Use Case**: Multiple users with different API keys, each routed to a different upstream account.

**Implementation**:

```go
type MappedSecretSource struct {
    defaultSource SecretSource
    mu            sync.RWMutex
    lookup        map[string]string // clientKey -> upstreamKey
}

func (s *MappedSecretSource) Get(ctx context.Context) (string, error) {
    // Try to get client API key from request context
    clientKey := getClientAPIKeyFromContext(ctx)
    if clientKey != "" {
        s.mu.RLock()
        if upstreamKey, ok := s.lookup[clientKey]; ok && upstreamKey != "" {
            s.mu.RUnlock()
            return upstreamKey, nil
        }
        s.mu.RUnlock()
    }

    // Fall back to default source
    return s.defaultSource.Get(ctx)
}

func (s *MappedSecretSource) UpdateMappings(entries []config.AmpUpstreamAPIKeyEntry) {
    newLookup := make(map[string]string)

    for _, entry := range entries {
        upstreamKey := strings.TrimSpace(entry.UpstreamAPIKey)
        if upstreamKey == "" {
            continue
        }
        for _, clientKey := range entry.APIKeys {
            trimmedKey := strings.TrimSpace(clientKey)
            if _, exists := newLookup[trimmedKey]; exists {
                log.Warnf("amp upstream-api-keys: client API key appears in multiple entries")
                continue
            }
            newLookup[trimmedKey] = upstreamKey
        }
    }

    s.mu.Lock()
    s.lookup = newLookup
    s.mu.Unlock()
}
```

**Configuration**:

```yaml
amp:
  upstream-api-keys:
    - upstream_api_key: "real-api-key-1"
      api_keys: ["user1-key", "user2-key"]
    - upstream_api_key: "real-api-key-2"
      api_keys: ["user3-key"]
```

---

### 4.170 Service Account Private Key Normalization (CLIProxyAPI)

**Pattern**: Sanitize and convert PEM-formatted private keys between PKCS#1 and PKCS#8 formats.

**Source File**: `internal/auth/vertex/keyutil.go`

**Problems Solved**:

1. Line ending inconsistencies (CRLF vs LF)
2. ANSI escape sequences in pasted content
3. Invalid UTF-8 bytes
4. PKCS#8 vs PKCS#1 format differences

**Implementation**:

```go
func sanitizePrivateKey(raw string) (string, error) {
    pk := strings.ReplaceAll(raw, "\r\n", "\n")
    pk = strings.ReplaceAll(pk, "\r", "\n")
    pk = stripANSIEscape(pk)           // Remove terminal escape codes
    pk = strings.ToValidUTF8(pk, "")   // Remove invalid UTF-8
    pk = strings.TrimSpace(pk)

    // Try PEM decode
    if block, _ := pem.Decode([]byte(pk)); block == nil {
        // Attempt to reconstruct from the textual payload
        if reconstructed, err := rebuildPEM(pk); err == nil {
            pk = reconstructed
        } else {
            return "", fmt.Errorf("private_key is not valid pem: %w", err)
        }
    }

    block, _ := pem.Decode([]byte(pk))
    rsaBlock, err := ensureRSAPrivateKey(block)
    if err != nil {
        return "", err
    }
    return string(pem.EncodeToMemory(rsaBlock)), nil
}

func ensureRSAPrivateKey(block *pem.Block) (*pem.Block, error) {
    if block.Type == "RSA PRIVATE KEY" {
        // Already PKCS#1 format
        if _, err := x509.ParsePKCS1PrivateKey(block.Bytes); err != nil {
            return nil, fmt.Errorf("private_key invalid rsa: %w", err)
        }
        return block, nil
    }

    if block.Type == "PRIVATE KEY" {
        // PKCS#8 format - convert to PKCS#1
        key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
        if err != nil {
            return nil, fmt.Errorf("private_key invalid pkcs8: %w", err)
        }
        rsaKey, ok := key.(*rsa.PrivateKey)
        if !ok {
            return nil, fmt.Errorf("private_key is not an RSA key")
        }
        der := x509.MarshalPKCS1PrivateKey(rsaKey)
        return &pem.Block{Type: "RSA PRIVATE KEY", Bytes: der}, nil
    }

    // Try auto-detection: PKCS#1 first, then PKCS#8
    if rsaKey, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
        der := x509.MarshalPKCS1PrivateKey(rsaKey)
        return &pem.Block{Type: "RSA PRIVATE KEY", Bytes: der}, nil
    }
    if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
        if rsaKey, ok := key.(*rsa.PrivateKey); ok {
            der := x509.MarshalPKCS1PrivateKey(rsaKey)
            return &pem.Block{Type: "RSA PRIVATE KEY", Bytes: der}, nil
        }
    }
    return nil, fmt.Errorf("private_key uses unsupported format")
}
```

**Why This Matters**: Handles the chaos of user-provided service account keys from various sources.

---

### 4.171 Local OAuth Callback Server with Timeout and Manual Fallback (CLIProxyAPI)

**Pattern**: Start a local HTTP server for OAuth callbacks, with timeout and manual URL paste fallback.

**Source File**: `internal/auth/gemini/gemini_auth.go`

**Implementation**:

```go
func (g *GeminiAuth) getTokenFromWeb(ctx context.Context, config *oauth2.Config, opts *WebLoginOptions) (*oauth2.Token, error) {
    codeChan := make(chan string, 1)
    errChan := make(chan error, 1)

    // Create local callback server
    mux := http.NewServeMux()
    server := &http.Server{Addr: ":8085", Handler: mux}

    mux.HandleFunc("/oauth2callback", func(w http.ResponseWriter, r *http.Request) {
        if err := r.URL.Query().Get("error"); err != "" {
            errChan <- fmt.Errorf("authentication failed: %s", err)
            return
        }
        code := r.URL.Query().Get("code")
        if code == "" {
            errChan <- fmt.Errorf("code not found")
            return
        }
        fmt.Fprint(w, "<h1>Authentication successful!</h1><p>You can close this window.</p>")
        codeChan <- code
    })

    // Start server in background
    go func() {
        if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
            errChan <- err
        }
    }()

    // Open browser or print URL
    authURL := config.AuthCodeURL("state-token", oauth2.AccessTypeOffline)
    if !opts.NoBrowser && browser.IsAvailable() {
        browser.OpenURL(authURL)
    } else {
        util.PrintSSHTunnelInstructions(8085)
        fmt.Printf("Please open this URL:\n\n%s\n", authURL)
    }

    // Wait for callback with timeout and manual fallback
    timeoutTimer := time.NewTimer(5 * time.Minute)
    manualPromptTimer := time.NewTimer(15 * time.Second)

    for {
        select {
        case code := <-codeChan:
            server.Shutdown(ctx)
            return config.Exchange(ctx, code)
        case err := <-errChan:
            return nil, err
        case <-manualPromptTimer.C:
            // Offer manual URL paste after 15 seconds
            if opts.Prompt != nil {
                input, _ := opts.Prompt("Paste the callback URL (or Enter to keep waiting): ")
                parsed, _ := misc.ParseOAuthCallback(input)
                if parsed != nil && parsed.Code != "" {
                    server.Shutdown(ctx)
                    return config.Exchange(ctx, parsed.Code)
                }
            }
        case <-timeoutTimer.C:
            return nil, fmt.Errorf("oauth flow timed out")
        }
    }
}
```

**Features**:

1. **Browser detection**: Falls back to URL display if no browser available
2. **SSH tunnel instructions**: Helps users on remote servers
3. **Manual fallback**: After 15 seconds, offers to accept pasted callback URL
4. **5-minute timeout**: Prevents hanging indefinitely

---

### 4.172 Interactive Model Selector CLI (claude-code-router)

**Pattern**: Interactive terminal UI for selecting and configuring models.

**Source File**: `packages/cli/src/utils/modelSelector.ts`

**Features**:

```typescript
// ANSI color constants for terminal styling
const BOLDCYAN = "\x1B[1m\x1B[36m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";

// Display current configuration with formatting
function displayCurrentConfig(config: Config): void {
  console.log(`${BOLDCYAN}Current Configuration${RESET}`);

  const formatModel = (routerValue?: string) => {
    if (!routerValue) return `${DIM}Not configured${RESET}`;
    const [provider, model] = routerValue.split(",");
    return `${YELLOW}${provider}${RESET} | ${model}`;
  };

  console.log(`Default Model: ${formatModel(config.Router.default)}`);
  if (config.Router.think) {
    console.log(`Think Model: ${formatModel(config.Router.think)}`);
  }
}

// Transformer configuration with validation
async function configureTransformers(): Promise<TransformerConfig | undefined> {
  const transformers: Array<string | [string, any]> = [];

  while (await confirm({ message: "Add transformer?" })) {
    const transformer = await select({
      message: "Select transformer:",
      choices: AVAILABLE_TRANSFORMERS.map((t) => ({ name: t, value: t })),
    });

    // Some transformers need options
    if (transformer === "maxtoken") {
      const maxTokens = await input({
        message: "Max tokens:",
        default: "30000",
        validate: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num <= 0) return "Please enter a valid positive number";
          return true;
        },
      });
      transformers.push(["maxtoken", { max_tokens: parseInt(maxTokens) }]);
    } else {
      transformers.push(transformer);
    }
  }

  return { use: transformers };
}
```

**Router Types**:

| Type        | Description                      |
| ----------- | -------------------------------- |
| default     | Primary model for most requests  |
| background  | Model for subagent tasks (Haiku) |
| think       | Model for thinking/reasoning     |
| longContext | Model for large context          |
| webSearch   | Model with search capability     |
| image       | Model for vision tasks           |

---

### 4.173 429 Retry Delay Parsing from Google API Errors (Antigravity-Manager)

**Pattern**: Extract retry delay from Google API error responses with multiple fallback locations.

**Source File**: `src-tauri/src/proxy/upstream/retry.rs`

**Problem**: Google API errors include retry delay in different formats/locations.

**Implementation (Rust)**:

```rust
/// Parse Duration strings like "1.5s", "200ms", "1h16m0.667s"
pub fn parse_duration_ms(duration_str: &str) -> Option<u64> {
    static DURATION_RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"([\d.]+)\s*(ms|s|m|h)").unwrap()
    });

    let mut total_ms: f64 = 0.0;
    let mut matched = false;

    for cap in DURATION_RE.captures_iter(duration_str) {
        matched = true;
        let value: f64 = cap[1].parse().ok()?;
        let unit = &cap[2];

        match unit {
            "ms" => total_ms += value,
            "s" => total_ms += value * 1000.0,
            "m" => total_ms += value * 60.0 * 1000.0,
            "h" => total_ms += value * 60.0 * 60.0 * 1000.0,
            _ => {}
        }
    }

    if !matched { return None; }
    Some(total_ms.round() as u64)
}

/// Extract retry delay from 429 error body
pub fn parse_retry_delay(error_text: &str) -> Option<u64> {
    let json: Value = serde_json::from_str(error_text).ok()?;
    let details = json.get("error")?.get("details")?.as_array()?;

    // Method 1: RetryInfo.retryDelay
    for detail in details {
        if let Some(type_str) = detail.get("@type").and_then(|v| v.as_str()) {
            if type_str.contains("RetryInfo") {
                if let Some(retry_delay) = detail.get("retryDelay").and_then(|v| v.as_str()) {
                    return parse_duration_ms(retry_delay);
                }
            }
        }
    }

    // Method 2: metadata.quotaResetDelay
    for detail in details {
        if let Some(quota_delay) = detail
            .get("metadata")
            .and_then(|m| m.get("quotaResetDelay"))
            .and_then(|v| v.as_str())
        {
            return parse_duration_ms(quota_delay);
        }
    }

    None
}
```

**Example Error**:

```json
{
  "error": {
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.RetryInfo",
        "retryDelay": "1.203608125s"
      }
    ]
  }
}
```

**Why This Matters**: Google APIs tell you exactly how long to wait. Parsing and respecting this avoids wasting requests.

---

### 4.174 Async Rate Limiter with Minimum Interval (Antigravity-Manager)

**Pattern**: Ensure minimum time between API calls using async/await.

**Source File**: `src-tauri/src/proxy/common/rate_limiter.rs`

**Implementation (Rust)**:

```rust
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration, Instant};

pub struct RateLimiter {
    min_interval: Duration,
    last_call: Arc<Mutex<Option<Instant>>>,
}

impl RateLimiter {
    pub fn new(min_interval_ms: u64) -> Self {
        Self {
            min_interval: Duration::from_millis(min_interval_ms),
            last_call: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn wait(&self) {
        let mut last = self.last_call.lock().await;
        if let Some(last_time) = *last {
            let elapsed = last_time.elapsed();
            if elapsed < self.min_interval {
                sleep(self.min_interval - elapsed).await;
            }
        }
        *last = Some(Instant::now());
    }
}
```

**Usage**:

```rust
let limiter = RateLimiter::new(500);  // 500ms between calls

// First call - returns immediately
limiter.wait().await;

// Second call - waits until 500ms has passed since first call
limiter.wait().await;
```

**Why This Matters**: Prevents rate limiting by enforcing minimum intervals, especially useful for APIs with per-second quotas.

---

### 4.175 Double-Layer Signature Cache in Rust (Antigravity-Manager)

**Pattern**: Two-layer cache for thinking signatures with TTL and lazy cleanup.

**Source File**: `src-tauri/src/proxy/signature_cache.rs`

**Layers**:

| Layer | Key         | Value        | Purpose                             |
| ----- | ----------- | ------------ | ----------------------------------- |
| 1     | tool_use_id | signature    | Recover signatures for tool calls   |
| 2     | signature   | model_family | Prevent cross-model signature reuse |

**Implementation (Rust)**:

```rust
const SIGNATURE_TTL: Duration = Duration::from_secs(2 * 60 * 60);  // 2 hours
const MIN_SIGNATURE_LENGTH: usize = 50;

#[derive(Clone)]
struct CacheEntry<T> {
    data: T,
    timestamp: SystemTime,
}

impl<T> CacheEntry<T> {
    fn is_expired(&self) -> bool {
        self.timestamp.elapsed().unwrap_or(Duration::ZERO) > SIGNATURE_TTL
    }
}

pub struct SignatureCache {
    /// Layer 1: Tool Use ID -> Thinking Signature
    tool_signatures: Mutex<HashMap<String, CacheEntry<String>>>,

    /// Layer 2: Signature -> Model Family
    thinking_families: Mutex<HashMap<String, CacheEntry<String>>>,
}

impl SignatureCache {
    /// Global singleton instance
    pub fn global() -> &'static SignatureCache {
        static INSTANCE: OnceLock<SignatureCache> = OnceLock::new();
        INSTANCE.get_or_init(SignatureCache::new)
    }

    pub fn cache_tool_signature(&self, tool_use_id: &str, signature: String) {
        if signature.len() < MIN_SIGNATURE_LENGTH { return; }

        if let Ok(mut cache) = self.tool_signatures.lock() {
            cache.insert(tool_use_id.to_string(), CacheEntry::new(signature));

            // Lazy cleanup when cache grows large
            if cache.len() > 1000 {
                cache.retain(|_, v| !v.is_expired());
            }
        }
    }

    pub fn get_tool_signature(&self, tool_use_id: &str) -> Option<String> {
        if let Ok(cache) = self.tool_signatures.lock() {
            if let Some(entry) = cache.get(tool_use_id) {
                if !entry.is_expired() {
                    return Some(entry.data.clone());
                }
            }
        }
        None
    }
}
```

**Why This Matters**: Enables signature recovery when clients strip thinking blocks, and prevents using Claude signatures on Gemini models.

---

### 4.176 Account Scheduling Modes for Prompt Caching (Antigravity-Manager)

**Pattern**: Configurable scheduling strategies balancing cache hits vs availability.

**Source File**: `src-tauri/src/proxy/sticky_config.rs`

**Modes**:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum SchedulingMode {
    /// Cache-first: Lock to same account, wait on rate limit (maximizes cache hits)
    CacheFirst,
    /// Balance: Lock to same account, switch on rate limit (balances cache + availability)
    Balance,
    /// Performance-first: Round-robin (maximizes throughput, no caching benefit)
    PerformanceFirst,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StickySessionConfig {
    pub mode: SchedulingMode,
    pub max_wait_seconds: u64,  // Max wait time in CacheFirst mode
}

impl Default for StickySessionConfig {
    fn default() -> Self {
        Self {
            mode: SchedulingMode::Balance,
            max_wait_seconds: 60,
        }
    }
}
```

**Trade-offs**:

| Mode             | Cache Hits | Availability | Use Case                      |
| ---------------- | ---------- | ------------ | ----------------------------- |
| CacheFirst       | High       | Lower        | Long sessions, cost-sensitive |
| Balance          | Medium     | Medium       | General use (default)         |
| PerformanceFirst | None       | Highest      | High concurrency, short tasks |

**Why This Matters**: Prompt caching only works when requests hit the same account. Sticky sessions maximize cache hits.

---

### 4.177 Thinking Recovery via Synthetic Message Injection in Rust (Antigravity-Manager)

**Pattern**: Recover from broken tool loops by injecting synthetic messages.

**Source File**: `src-tauri/src/proxy/mappers/claude/thinking_utils.rs`

**Problem**: When clients strip thinking blocks from ToolUse messages, the API rejects ToolResult messages because "Assistant message must start with thinking."

**Detection**:

```rust
#[derive(Debug, Default)]
pub struct ConversationState {
    pub in_tool_loop: bool,
    pub last_assistant_idx: Option<usize>,
}

pub fn analyze_conversation_state(messages: &[Message]) -> ConversationState {
    let mut state = ConversationState::default();

    // Find last assistant message index
    for (i, msg) in messages.iter().enumerate().rev() {
        if msg.role == "assistant" {
            state.last_assistant_idx = Some(i);
            break;
        }
    }

    // Check if last message is a ToolResult
    if let Some(last_msg) = messages.last() {
        if last_msg.role == "user" {
            if let MessageContent::Array(blocks) = &last_msg.content {
                if blocks.iter().any(|b| matches!(b, ContentBlock::ToolResult { .. })) {
                    state.in_tool_loop = true;
                }
            }
        }
    }

    state
}
```

**Recovery**:

```rust
pub fn close_tool_loop_for_thinking(messages: &mut Vec<Message>) {
    let state = analyze_conversation_state(messages);

    if !state.in_tool_loop { return; }

    // Check if last assistant message has thinking block
    let mut has_thinking = false;
    if let Some(idx) = state.last_assistant_idx {
        if let Some(msg) = messages.get(idx) {
            if let MessageContent::Array(blocks) = &msg.content {
                has_thinking = blocks.iter().any(|b| matches!(b, ContentBlock::Thinking { .. }));
            }
        }
    }

    // If in tool loop but no thinking, inject synthetic messages
    if !has_thinking {
        tracing::info!("[Thinking-Recovery] Injecting synthetic messages.");

        messages.push(Message {
            role: "assistant".to_string(),
            content: MessageContent::Array(vec![
                ContentBlock::Text {
                    text: "[System: Tool loop recovered.]".to_string()
                }
            ])
        });
        messages.push(Message {
            role: "user".to_string(),
            content: MessageContent::Array(vec![
                ContentBlock::Text {
                    text: "Please continue with the next step.".to_string()
                }
            ])
        });
    }
}
```

**Why This Matters**: Enables graceful recovery when context compaction corrupts thinking state.

---

### 4.178 Content-Based Session Fingerprinting (Antigravity-Manager)

**Pattern**: Generate stable session IDs from request content for sticky routing.

**Source File**: `src-tauri/src/proxy/session_manager.rs`

**Strategy**:

1. Use `metadata.user_id` if available (highest priority)
2. Fall back to SHA-256 hash of first meaningful user message

**Implementation (Rust)**:

```rust
pub struct SessionManager;

impl SessionManager {
    /// Generate stable session fingerprint from Claude request
    pub fn extract_session_id(request: &ClaudeRequest) -> String {
        // Priority 1: Use metadata.user_id if available
        if let Some(metadata) = &request.metadata {
            if let Some(user_id) = &metadata.user_id {
                if !user_id.is_empty() && !user_id.contains("session-") {
                    return user_id.clone();
                }
            }
        }

        // Priority 2: Content fingerprint (SHA256)
        let mut hasher = Sha256::new();

        // Mix in model name for differentiation
        hasher.update(request.model.as_bytes());

        let mut content_found = false;
        for msg in &request.messages {
            if msg.role != "user" { continue; }

            let text = match &msg.content {
                MessageContent::String(s) => s.clone(),
                MessageContent::Array(blocks) => {
                    blocks.iter()
                        .filter_map(|block| match block {
                            ContentBlock::Text { text } => Some(text.as_str()),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                }
            };

            let clean_text = text.trim();
            // Skip short messages (probes) or system-tagged messages
            if clean_text.len() > 10 && !clean_text.contains("<system-reminder>") {
                hasher.update(clean_text.as_bytes());
                content_found = true;
                break;  // Only use first meaningful message as anchor
            }
        }

        if !content_found {
            // Fallback: hash last message
            if let Some(last_msg) = request.messages.last() {
                hasher.update(format!("{:?}", last_msg.content).as_bytes());
            }
        }

        let hash = format!("{:x}", hasher.finalize());
        let sid = format!("sid-{}", &hash[..16]);
        sid
    }
}
```

**Why This Matters**: Enables sticky routing to the same account for prompt caching, even without explicit session IDs.

---

### 4.179 Multi-Account Token Manager with Tier-Based Priority (Antigravity-Manager)

**Pattern**: Sophisticated token pool with subscription tier sorting and sticky session support.

**Source File**: `src-tauri/src/proxy/token_manager.rs`

**Key Features**:

| Feature          | Description                                             |
| ---------------- | ------------------------------------------------------- |
| Tier Priority    | ULTRA > PRO > FREE (premium tiers deplete first)        |
| Sticky Sessions  | Session-to-account binding for cache optimization       |
| 60-Second Lock   | Maintain same account for prompt caching                |
| Optimistic Reset | Clear all rate limits when all accounts blocked briefly |

**Token Selection Algorithm (Rust)**:

```rust
// 1. Sort tokens by subscription tier (ULTRA > PRO > FREE)
tokens_snapshot.sort_by(|a, b| {
    let tier_priority = |tier: &Option<String>| match tier.as_deref() {
        Some("ULTRA") => 0,
        Some("PRO") => 1,
        Some("FREE") => 2,
        _ => 3,
    };
    tier_priority(&a.subscription_tier).cmp(&tier_priority(&b.subscription_tier))
});

// 2. Check session binding first (for cache hits)
if !rotate && session_id.is_some() && scheduling.mode != SchedulingMode::PerformanceFirst {
    if let Some(bound_id) = self.session_accounts.get(sid) {
        // Reuse bound account if not rate-limited
        let reset_sec = self.rate_limit_tracker.get_remaining_wait(&bound_token.email);
        if reset_sec == 0 {
            target_token = Some(bound_token.clone());
        }
    }
}

// 3. Apply 60-second window lock for non-session requests
if last_time.elapsed().as_secs() < 60 && !attempted.contains(&account_id) {
    if !self.is_rate_limited(&found.email) {
        target_token = Some(found.clone());
    }
}
```

**Optimistic Reset**:

```rust
// When all accounts are rate-limited but wait time is short (<=2s)
if wait_sec <= 2 {
    tokio::time::sleep(Duration::from_millis(500)).await;
    let retry_token = tokens_snapshot.iter()
        .find(|t| !attempted.contains(&t.account_id) && !self.is_rate_limited(&t.account_id));

    if retry_token.is_none() {
        // Layer 2: Optimistic reset all rate limits
        self.rate_limit_tracker.clear_all();
    }
}
```

**Why This Matters**: Maximizes throughput while preserving prompt cache benefits through intelligent account selection.

---

### 4.180 Intelligent Rate Limit Tracker with Multi-Reason Classification (Antigravity-Manager)

**Pattern**: Comprehensive rate limit handling with reason-specific default timeouts and exponential backoff.

**Source File**: `src-tauri/src/proxy/rate_limit.rs`

**Reason Classification**:

```rust
pub enum RateLimitReason {
    QuotaExhausted,         // Daily quota used up
    RateLimitExceeded,      // Per-minute limit hit
    ModelCapacityExhausted, // No GPU instances available
    ServerError,            // 5xx errors
    Unknown,
}
```

**Reason-Specific Defaults**:

| Reason                 | Default Timeout     | Rationale            |
| ---------------------- | ------------------- | -------------------- |
| QuotaExhausted         | 60s → 5m → 30m → 2h | Exponential backoff  |
| RateLimitExceeded      | 30s                 | Short-lived          |
| ModelCapacityExhausted | 15s                 | Temporary capacity   |
| ServerError            | 20s                 | Soft avoidance       |
| Unknown                | 60s                 | Conservative default |

**Duration Parsing (Supports "2h1m1s" format)**:

```rust
fn parse_duration_string(&self, s: &str) -> Option<u64> {
    let re = Regex::new(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?").ok()?;
    let caps = re.captures(s)?;

    let hours = caps.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
    let minutes = caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
    let seconds = caps.get(3).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
    let milliseconds = caps.get(4).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);

    Some(hours * 3600 + minutes * 60 + seconds.ceil() as u64 + (milliseconds + 999) / 1000)
}
```

**Why This Matters**: Properly classifying rate limit reasons enables optimal retry strategies and prevents unnecessary lockouts.

---

### 4.181 Protobuf Parser for Token Extraction (Antigravity-Manager)

**Pattern**: Extract OAuth tokens from Chrome extension storage using lightweight Protobuf parsing.

**Source File**: `src-tauri/src/utils/protobuf.rs`

**Use Case**: Extract refresh tokens from Antigravity Chrome extension's IndexedDB backup.

**Structure**:

```
AgentManagerInitState (Protobuf message)
└── Field 6: OAuthTokenInfo
    ├── Field 1: access_token
    ├── Field 2: token_type ("Bearer")
    ├── Field 3: refresh_token  ← Target
    └── Field 4: expiry (Timestamp)
```

**Implementation (Rust)**:

```rust
/// Read Protobuf Varint
pub fn read_varint(data: &[u8], offset: usize) -> Result<(u64, usize), String> {
    let mut result = 0u64;
    let mut shift = 0;
    let mut pos = offset;

    loop {
        if pos >= data.len() {
            return Err("Incomplete data".to_string());
        }
        let byte = data[pos];
        result |= ((byte & 0x7F) as u64) << shift;
        pos += 1;
        if byte & 0x80 == 0 { break; }
        shift += 7;
    }

    Ok((result, pos))
}

/// Find length-delimited field content
pub fn find_field(data: &[u8], target_field: u32) -> Result<Option<Vec<u8>>, String> {
    let mut offset = 0;

    while offset < data.len() {
        let (tag, new_offset) = read_varint(data, offset)?;
        let wire_type = (tag & 7) as u8;
        let field_num = (tag >> 3) as u32;

        if field_num == target_field && wire_type == 2 {
            let (length, content_offset) = read_varint(data, new_offset)?;
            return Ok(Some(data[content_offset..content_offset + length as usize].to_vec()));
        }

        offset = skip_field(data, new_offset, wire_type)?;
    }

    Ok(None)
}
```

**Token Extraction**:

```rust
// From Base64-encoded backup blob
let blob = base64::decode(backup_data)?;

// Navigate: Root -> Field 6 (OAuthTokenInfo) -> Field 3 (refresh_token)
let oauth_data = find_field(&blob, 6)?.ok_or("Missing OAuth data")?;
let refresh_bytes = find_field(&oauth_data, 3)?.ok_or("Missing refresh token")?;
let refresh_token = String::from_utf8(refresh_bytes)?;
```

**Why This Matters**: Enables importing accounts from Antigravity Chrome extension backups without full Protobuf libraries.

---

### 4.182 V1 Data Migration with Format Auto-Detection (Antigravity-Manager)

**Pattern**: Import accounts from multiple legacy data formats with automatic detection.

**Source File**: `src-tauri/src/modules/migration.rs`

**Supported Formats**:

| Format             | Detection                                   | Source                  |
| ------------------ | ------------------------------------------- | ----------------------- |
| V1 Protobuf Backup | `jetskiStateSync.agentManagerInitState` key | Chrome extension backup |
| V2 JSON Token      | `token.refresh_token` field                 | Direct export           |

**Migration Flow**:

```rust
pub async fn import_from_v1() -> Result<Vec<Account>, String> {
    let v1_dir = dirs::home_dir()?.join(".antigravity-agent");

    // Try multiple possible index files
    let index_files = vec!["antigravity_accounts.json", "accounts.json"];

    for index_filename in index_files {
        let v1_accounts_path = v1_dir.join(index_filename);
        if !v1_accounts_path.exists() { continue; }

        for (id, acc_info) in accounts_map {
            // Format 1: Direct JSON token
            if let Some(token_data) = backup_json.get("token") {
                if let Some(rt) = token_data.get("refresh_token").and_then(|v| v.as_str()) {
                    refresh_token_opt = Some(rt.to_string());
                }
            }

            // Format 2: Protobuf blob (V1 Chrome extension)
            if refresh_token_opt.is_none() {
                if let Some(state_b64) = backup_json.get("jetskiStateSync.agentManagerInitState") {
                    let blob = base64::decode(state_b64)?;
                    if let Some(oauth_data) = protobuf::find_field(&blob, 6)? {
                        if let Some(refresh_bytes) = protobuf::find_field(&oauth_data, 3)? {
                            refresh_token_opt = Some(String::from_utf8(refresh_bytes)?);
                        }
                    }
                }
            }

            // Validate and import
            if let Some(refresh_token) = refresh_token_opt {
                let token_resp = oauth::refresh_access_token(&refresh_token).await?;
                account::upsert_account(email, None, token_data)?;
            }
        }
    }
}
```

**Why This Matters**: Enables seamless migration from older Antigravity versions without manual token extraction.

---

### 4.183 Gemini Tool Argument Remapping (Antigravity-Manager)

**Pattern**: Remap Gemini's tool parameter names to Claude Code's expected schema.

**Source File**: `src-tauri/src/proxy/mappers/claude/streaming.rs`

**Known Remappings**:

| Gemini Parameter | Claude Code Parameter | Tools      |
| ---------------- | --------------------- | ---------- |
| `query`          | `pattern`             | Grep, Glob |
| `paths` (array)  | `path` (string)       | Grep, Glob |
| `path`           | `file_path`           | Read       |

**Implementation (Rust)**:

```rust
fn remap_function_call_args(tool_name: &str, args: &mut serde_json::Value) {
    if let Some(obj) = args.as_object_mut() {
        match tool_name.to_lowercase().as_str() {
            "grep" | "glob" => {
                // Remap query → pattern
                if let Some(query) = obj.remove("query") {
                    if !obj.contains_key("pattern") {
                        obj.insert("pattern".to_string(), query);
                    }
                }

                // Remap paths (array) → path (string)
                if !obj.contains_key("path") {
                    if let Some(paths) = obj.remove("paths") {
                        let path_str = if let Some(arr) = paths.as_array() {
                            arr.get(0).and_then(|v| v.as_str()).unwrap_or(".").to_string()
                        } else if let Some(s) = paths.as_str() {
                            s.to_string()
                        } else {
                            ".".to_string()
                        };
                        obj.insert("path".to_string(), json!(path_str));
                    } else {
                        obj.insert("path".to_string(), json!("."));
                    }
                }
            }
            "read" => {
                // Remap path → file_path
                if let Some(path) = obj.remove("path") {
                    if !obj.contains_key("file_path") {
                        obj.insert("file_path".to_string(), path);
                    }
                }
            }
            _ => {}
        }
    }
}
```

**Why This Matters**: Gemini models may use different parameter names than Claude Code expects, causing tool call failures without remapping.

---

### 4.184 SSE Streaming State Machine with Parse Error Recovery (Antigravity-Manager)

**Pattern**: Robust SSE streaming transformer with graceful degradation on parse errors.

**Source File**: `src-tauri/src/proxy/mappers/claude/streaming.rs`

**State Machine**:

```rust
pub struct StreamingState {
    block_type: BlockType,           // None, Text, Thinking, Function
    pub block_index: usize,          // Current content block index
    pub message_start_sent: bool,    // Track if message_start was emitted
    pub message_stop_sent: bool,     // Track if message_stop was emitted
    used_tool: bool,                 // Any tool calls made
    signatures: SignatureManager,     // Pending signature buffer
    trailing_signature: Option<String>,  // Signature for next block

    // Error recovery state
    parse_error_count: usize,
    last_valid_state: Option<BlockType>,
}
```

**Error Recovery**:

```rust
pub fn handle_parse_error(&mut self, raw_data: &str) -> Vec<Bytes> {
    let mut chunks = Vec::new();

    self.parse_error_count += 1;

    // Safely close current block
    if self.block_type != BlockType::None {
        self.last_valid_state = Some(self.block_type);
        chunks.extend(self.end_block());
    }

    // Signal error to client after too many failures
    if self.parse_error_count > 5 {
        chunks.push(self.emit("error", json!({
            "type": "error",
            "error": {
                "type": "overloaded_error",
                "message": "Stream connection unstable. Please retry."
            }
        })));
    }

    chunks
}
```

**Why This Matters**: Parse errors during streaming shouldn't crash the entire request; graceful recovery keeps the conversation usable.

---

### 4.185 API Key Auth Middleware with Mode Selection (Antigravity-Manager)

**Pattern**: Flexible authentication middleware with configurable enforcement modes.

**Source File**: `src-tauri/src/proxy/middleware/auth.rs`

**Auth Modes**:

```rust
pub enum ProxyAuthMode {
    Off,             // No authentication required
    AllExceptHealth, // All routes except /healthz
    All,             // All routes including health checks
}
```

**Implementation (Axum Middleware)**:

```rust
pub async fn auth_middleware(
    State(security): State<Arc<RwLock<ProxySecurityConfig>>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Allow CORS preflight
    if request.method() == Method::OPTIONS {
        return Ok(next.run(request).await);
    }

    let security = security.read().await.clone();
    let effective_mode = security.effective_auth_mode();

    // Check mode exemptions
    if matches!(effective_mode, ProxyAuthMode::Off) {
        return Ok(next.run(request).await);
    }
    if matches!(effective_mode, ProxyAuthMode::AllExceptHealth) && path == "/healthz" {
        return Ok(next.run(request).await);
    }

    // Extract API key from header
    let api_key = request.headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer ").or(Some(s)))
        .or_else(|| {
            request.headers().get("x-api-key").and_then(|h| h.to_str().ok())
        });

    // Verify
    if api_key.map(|k| k == security.api_key).unwrap_or(false) {
        Ok(next.run(request).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}
```

**Why This Matters**: Configurable auth modes enable both secure production deployments and easy local development.

---

### 4.186 Request/Response Logging Middleware with Token Extraction (Antigravity-Manager)

**Pattern**: Comprehensive request logging with usage token extraction from streaming responses.

**Source File**: `src-tauri/src/proxy/middleware/monitor.rs`

**Log Structure**:

```rust
pub struct ProxyRequestLog {
    pub id: String,
    pub timestamp: i64,
    pub method: String,
    pub url: String,
    pub status: u16,
    pub duration: u64,
    pub model: Option<String>,
    pub mapped_model: Option<String>,
    pub account_email: Option<String>,
    pub error: Option<String>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}
```

**Token Extraction from Streams**:

```rust
// For SSE streams, capture last 8KB and parse usage from final event
if content_type.contains("text/event-stream") {
    let mut last_few_bytes = Vec::new();

    while let Some(chunk) = stream.next().await {
        // Keep rolling buffer of last 8KB
        if last_few_bytes.len() > 8192 {
            last_few_bytes.drain(0..last_few_bytes.len()-8192);
        }
        last_few_bytes.extend_from_slice(&chunk);
        tx.send(chunk).await;
    }

    // Parse usage from final SSE event
    for line in String::from_utf8(last_few_bytes).lines().rev() {
        if line.starts_with("data: ") && line.contains("\"usage\"") {
            let json = serde_json::from_str(line.trim_start_matches("data: "))?;
            // Support both OpenAI and Gemini field names
            log.input_tokens = json.get("usage")
                .or(json.get("usageMetadata"))
                .and_then(|u| u.get("prompt_tokens")
                    .or(u.get("input_tokens"))
                    .or(u.get("promptTokenCount")))
                .and_then(|v| v.as_u64().map(|n| n as u32));
        }
    }
}
```

**Why This Matters**: Token usage tracking enables cost monitoring and quota management across multiple accounts.

---

### 4.187 Project ID Resolution with Mock Fallback (Antigravity-Manager)

**Pattern**: Fetch Cloud AI Companion project ID with fallback to generated mock ID.

**Source File**: `src-tauri/src/proxy/project_resolver.rs`

**Resolution Strategy**:

```rust
pub async fn fetch_project_id(access_token: &str) -> Result<String, String> {
    let url = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";

    let response = client.post(url)
        .bearer_auth(access_token)
        .header("User-Agent", "antigravity/1.11.9 windows/amd64")
        .json(&json!({ "metadata": { "ideType": "ANTIGRAVITY" } }))
        .send().await?;

    let data: Value = response.json().await?;

    // Extract cloudaicompanionProject
    if let Some(project_id) = data.get("cloudaicompanionProject").and_then(|v| v.as_str()) {
        return Ok(project_id.to_string());
    }

    // Fallback: Generate mock project ID for ineligible accounts
    let mock_id = generate_mock_project_id();
    Ok(mock_id)
}

/// Generate random project ID: {adjective}-{noun}-{5-char-random}
pub fn generate_mock_project_id() -> String {
    let adjectives = ["useful", "bright", "swift", "calm", "bold"];
    let nouns = ["fuze", "wave", "spark", "flow", "core"];

    let adj = adjectives[rng.gen_range(0..adjectives.len())];
    let noun = nouns[rng.gen_range(0..nouns.len())];

    let random: String = (0..5)
        .map(|_| "abcdefghijklmnopqrstuvwxyz0123456789".chars().nth(rng.gen()).unwrap())
        .collect();

    format!("{}-{}-{}", adj, noun, random)
}
```

**Why This Matters**: Some accounts may not have official Cloud AI Companion access; mock IDs enable basic functionality.

---

### 4.188 Base64 Signature Decoding for Cross-Platform Compatibility (Antigravity-Manager)

**Pattern**: Decode Base64-encoded signatures from Gemini to raw format for Claude.

**Source File**: `src-tauri/src/proxy/mappers/claude/streaming.rs`

**Problem**: Gemini sends thinking signatures Base64-encoded, but Claude expects raw format.

**Solution**:

```rust
fn process(&mut self, part: &GeminiPart) -> Vec<Bytes> {
    // Decode Base64 signature if present
    let signature = part.thought_signature.as_ref().map(|sig| {
        use base64::Engine;
        match base64::engine::general_purpose::STANDARD.decode(sig) {
            Ok(decoded_bytes) => {
                match String::from_utf8(decoded_bytes) {
                    Ok(decoded_str) => {
                        tracing::debug!(
                            "[Streaming] Decoded base64 signature (len {} -> {})",
                            sig.len(), decoded_str.len()
                        );
                        decoded_str
                    },
                    Err(_) => sig.clone()  // Not valid UTF-8, keep as-is
                }
            },
            Err(_) => sig.clone()  // Not base64, keep as-is
        }
    });

    // ... use decoded signature
}
```

**Why This Matters**: Signature format mismatches cause thinking block validation failures in multi-turn conversations.

---

## References

- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) - v6, Go
- [Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager) - v3.3.21, Rust/React
- [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) - beta, TypeScript
- [claude-code-router](https://github.com/musistudio/claude-code-router) - TypeScript
- [claude-code-proxy](https://github.com/1rgs/claude-code-proxy) - Python/LiteLLM
