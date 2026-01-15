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

