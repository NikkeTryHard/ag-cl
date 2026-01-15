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

