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

