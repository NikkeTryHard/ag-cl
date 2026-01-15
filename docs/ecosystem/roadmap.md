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

