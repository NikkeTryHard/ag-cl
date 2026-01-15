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

