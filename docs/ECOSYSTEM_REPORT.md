# Ecosystem Report

> This documentation has been modularized for better navigation.

**→ [Go to docs/ecosystem/README.md](ecosystem/README.md)**

---

## Quick Links

| Document                              | Description                           |
| ------------------------------------- | ------------------------------------- |
| [Overview](ecosystem/README.md)       | Executive summary, 5 project analyses |
| [Patterns](ecosystem/patterns.md)     | Cross-project pattern analysis        |
| [Roadmap](ecosystem/roadmap.md)       | Priority implementation roadmap       |
| [Matrix](ecosystem/matrix.md)         | Feature comparison matrix             |
| [References](ecosystem/references.md) | Project links                         |

### Deep Dives (Implementation Details)

| Document                                                             | Description                              | Lines |
| -------------------------------------------------------------------- | ---------------------------------------- | ----- |
| [Core Strategies](ecosystem/deep-dives/core-strategies.md)           | Warmup, dual quota, signatures, recovery | 5,854 |
| [Rate Limiting](ecosystem/deep-dives/rate-limiting.md)               | Backoff, quota fallback, tiered limits   | 505   |
| [Session & Streaming](ecosystem/deep-dives/session-streaming.md)     | Auth queues, token refresh, streaming    | 1,703 |
| [Protocol Translation](ecosystem/deep-dives/protocol-translation.md) | SSE parsing, schema cleaning, bridging   | 3,167 |
| [Resilience](ecosystem/deep-dives/resilience.md)                     | Error handling, session recovery         | 3,838 |
| [Extensions](ecosystem/deep-dives/extensions.md)                     | Tokenizers, MCP, CLI utilities           | 2,548 |

---

## File Structure

```
docs/ecosystem/
├── README.md              # 446 lines - Overview & project summaries
├── patterns.md            # 45 lines - Cross-project patterns
├── roadmap.md             # 57 lines - Implementation roadmap
├── matrix.md              # 35 lines - Feature matrix
├── references.md          # 7 lines - Project links
└── deep-dives/
    ├── core-strategies.md      # 5,854 lines
    ├── rate-limiting.md        # 505 lines
    ├── session-streaming.md    # 1,703 lines
    ├── protocol-translation.md # 3,167 lines
    ├── resilience.md           # 3,838 lines
    └── extensions.md           # 2,548 lines
                                ─────────────
                                18,205 lines total (no content lost)
```
