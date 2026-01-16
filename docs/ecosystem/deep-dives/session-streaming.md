### 4.35 Empty Response Retry Logic

**Source**: `opencode-antigravity-auth/src/plugin.ts`

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

**Source**: `opencode-antigravity-auth/src/plugin.ts`

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

**Source**: `opencode-antigravity-auth/src/plugin.ts`

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

**Source**: `CLIProxyAPI/internal/translator/antigravity/claude/antigravity_claude_response.go`

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

**Location**: `internal/registry/model_registry.go`

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

**Location**: `internal/api/modules/amp/model_mapping.go`

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

**Location**: `sdk/translator/pipeline.go`

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

**Location**: `sdk/translator/registry.go`

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

**Location**: `sdk/api/handlers/stream_forwarder.go`

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

**Location**: `sdk/cliproxy/auth/conductor.go`

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

**Location**: `sdk/cliproxy/usage/manager.go`

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

**Location**: `sdk/cliproxy/service.go`

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
