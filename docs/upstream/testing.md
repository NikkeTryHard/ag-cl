## Test Coverage Comparison

### Summary

| Metric             | Upstream           | ag-cl      | Difference |
| ------------------ | ------------------ | ---------- | ---------- |
| Test files         | 11                 | 79         | +68        |
| Test lines         | ~2,429             | ~15,000+   | +12,500+   |
| Test cases         | ~50                | 1,616+     | +1,566     |
| Test framework     | Custom CJS scripts | Vitest     | Different  |
| Coverage reporting | No                 | Yes (85%+) | +85%       |

### Upstream Test Structure

Upstream uses custom CommonJS integration tests requiring a running server:

| Test File                                     | Lines | Purpose                       |
| --------------------------------------------- | ----- | ----------------------------- |
| `run-all.cjs`                                 | 122   | Test runner script            |
| `test-caching-streaming.cjs`                  | 181   | Prompt caching with streaming |
| `test-cross-model-thinking.cjs`               | 461   | Cross-model thinking resume   |
| `test-empty-response-retry.cjs`               | 122   | Empty response retry logic    |
| `test-images.cjs`                             | 150   | Image/document support        |
| `test-interleaved-thinking.cjs`               | 185   | Interleaved thinking blocks   |
| `test-multiturn-thinking-tools.cjs`           | 244   | Multi-turn tool conversations |
| `test-multiturn-thinking-tools-streaming.cjs` | 180   | Streaming multi-turn tools    |
| `test-oauth-no-browser.cjs`                   | 217   | OAuth no-browser flow         |
| `test-schema-sanitizer.cjs`                   | 269   | Schema sanitization           |
| `test-thinking-signatures.cjs`                | 204   | Thinking signature validation |

### Our Test Structure

We use Vitest with comprehensive test categories:

| Category    | Files | Description                            |
| ----------- | ----- | -------------------------------------- |
| Unit        | 57    | Function/module isolation tests        |
| Fuzz        | 2     | Property-based testing with fast-check |
| Contract    | 1     | API schema validation                  |
| Snapshot    | 2     | Format consistency tests               |
| Golden      | 1     | Known good request/response pairs      |
| Chaos       | 2     | Network failure simulation             |
| Load        | 1     | Concurrent handling stress tests       |
| Security    | 1     | Input sanitization, token masking      |
| Types       | 1     | TypeScript type correctness            |
| Integration | 1     | End-to-end with real server            |

### Key Differences

1. **Test Isolation**: We have unit tests that mock dependencies; upstream relies on integration tests
2. **Coverage**: We track and enforce 85%+ coverage; upstream has no coverage tracking
3. **CI/CD**: Our tests run in CI; upstream tests require manual execution
4. **Fuzz Testing**: We use fast-check for property-based testing; upstream has none
5. **Chaos Testing**: We simulate network failures; upstream doesn't test failure scenarios

### Tests We Derived From Upstream

We created equivalent unit tests for upstream's integration tests:

| Upstream Test                       | Our Equivalent                               |
| ----------------------------------- | -------------------------------------------- |
| `test-thinking-signatures.cjs`      | `tests/unit/format/signature-cache.test.ts`  |
| `test-schema-sanitizer.cjs`         | `tests/unit/format/schema-sanitizer.test.ts` |
| `test-multiturn-thinking-tools.cjs` | `tests/unit/cloudcode/sse-streamer.test.ts`  |
| `test-cross-model-thinking.cjs`     | `tests/unit/format/thinking-utils.test.ts`   |
