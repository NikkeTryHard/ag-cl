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

### Usage Scaling / Token Report Manipulation (Antigravity-Manager)

**Source**: `src-tauri/src/proxy/mappers/claude/collector.rs` (PR #603, v3.3.27)

**Problem**: Claude Code and similar clients assume a 200k token context limit. When proxying to Gemini models (which support 1M+ tokens), clients incorrectly trigger context compression, creating a "death loop" of unnecessary compression cycles.

**Solution**: Report scaled token counts to trick client's compression check mechanism.

**Algorithm**:

```rust
fn scale_usage(input_tokens: u32, cache_tokens: u32) -> (u32, u32) {
    let total = input_tokens + cache_tokens;

    if total <= 30_000 {
        // Below threshold: report actual values
        return (input_tokens, cache_tokens);
    }

    // Apply square-root scaling for large contexts
    // 1M tokens → ~1000 (sqrt) → scaled to ~40k reported
    let scale_factor = (total as f64).sqrt() / total as f64;

    (
        (input_tokens as f64 * scale_factor) as u32,
        (cache_tokens as f64 * scale_factor) as u32,
    )
}
```

**Behavior Matrix** (values from PR #603 description):

| Real Tokens | Reported Tokens | Compression |
| ----------- | --------------- | ----------- |
| 30,000      | 30,000          | None        |
| 100,000     | ~31,600         | 3.2x        |
| 500,000     | ~35,400         | 14x         |
| 1,000,000   | ~40,000         | 25x         |

> Note: The algorithm shown is illustrative. Actual implementation may use additional scaling factors to achieve the reported values.

**Scope**:

| Aspect                | Behavior                                               |
| --------------------- | ------------------------------------------------------ |
| **Target models**     | Gemini (Pro/Flash) via Claude API format               |
| **Claude models**     | Unaffected (native format, no scaling)                 |
| **Supported clients** | Claude Code, Cursor, Windsurf                          |
| **Configuration**     | `enable_usage_scaling` toggle in Experimental Settings |
| **Hot reload**        | Yes, changes apply immediately                         |

**ag-cl Implementation Notes**:

- Only apply when converting Gemini UsageMetadata to Claude format
- Skip for native Claude model responses
- Consider making threshold configurable (default: 30,000)
- Log original vs scaled values at debug level

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
