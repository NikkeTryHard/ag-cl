# Upstream Sync Report

> Last synced: 2026-01-11 | Upstream: v2.0.12 | ag-cl: v1.3.0
> Upstream: [badri-s2001/antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy)
> Stars: 1616 | Forks: 198 | Open Issues: 10

---

## Quick Status

| Metric            | Value                  |
| ----------------- | ---------------------- |
| Commits behind    | 71                     |
| Features to adopt | 4                      |
| WebUI-only (skip) | 15+                    |
| Latest release    | v2.0.12 (Jan 15, 2026) |

---

## Version Tracking

| Project      | Version | Notes                                       |
| ------------ | ------- | ------------------------------------------- |
| **Upstream** | v2.0.12 | Onboarding fixes, tier detection, quota fix |
| **ag-cl**    | v1.3.0  | TypeScript rewrite, TUI, share mode         |

### Upstream Release History

| Version | Date       | Key Changes                                           |
| ------- | ---------- | ----------------------------------------------------- |
| v2.0.12 | 2026-01-15 | Tier ID handling, project ID fix, free tier detection |
| v2.0.1  | 2026-01-11 | stopReason fix, WebUI health checks                   |
| v2.0.0  | 2026-01-10 | WebUI dashboard, 5xx fallback                         |
| v1.2.16 | 2026-01-09 | Schema uppercase fix                                  |
| v1.2.15 | 2026-01-09 | System prompt filtering                               |
| v1.2.14 | 2026-01-08 | Optimistic 429 reset                                  |
| v1.2.12 | 2026-01-08 | Empty response retry                                  |

---

## Implementation Status

| Feature                       | Upstream     | ag-cl | Notes                          |
| ----------------------------- | ------------ | ----- | ------------------------------ |
| stopReason fix                | ✅ v2.0.1    | ✅    | Tool use preservation          |
| 5xx fallback                  | ✅ v2.0.0    | ✅    | Server error retry             |
| Empty response retry          | ✅ v1.2.12   | ✅    | Large thinking budgets         |
| Optimistic 429 reset          | ✅ v1.2.14   | ✅    | Rate limit handling            |
| System prompt filtering       | ✅ v1.2.15   | ✅    | Remove anthropic prompts       |
| Schema uppercase              | ✅ v1.2.16   | ✅    | Case normalization             |
| --no-browser OAuth            | ✅ PR #50    | ✅    | Headless server auth           |
| Model fallback                | ✅ PR #41    | ✅    | On quota exhaustion            |
| Quota reset trigger           | ✅ PR #44    | ✅    | `/trigger-reset` endpoint      |
| OAuth timeout                 | ✅ Issue #68 | ✅    | 15s fetch timeout              |
| Cross-model signatures        | ✅ Issue #42 | ✅    | `stripInvalidThinkingBlocks()` |
| Unsigned thinking blocks      | ✅ PR #120   | ⏳    | Handle in tool loops           |
| Parallel tool inlineData      | ✅ PR #91    | ⏳    | Defer to end of array          |
| Model fallback pre-exhaustion | ✅ 2a0c110   | ⏳    | Before RESOURCE_EXHAUSTED      |
| Accurate quota reporting      | ✅ 77363c6   | ⏳    | Project ID handling            |
| Auto-onboarding               | ✅ 44632dc   | ❌    | Accounts without projects      |
| WebUI dashboard               | ✅ v2.0.0    | ❌    | We have TUI instead            |
| macOS menu bar app            | ✅ PR #127   | ❌    | Desktop integration            |
| count_tokens endpoint         | ❌ reverted  | ❌    | Caused regression (896bf81)    |

---

## Recent Upstream Changes

### To Adopt (Priority)

- [ ] **Unsigned thinking blocks** (PR #120) - Handle in tool loops
- [ ] **Parallel tool inlineData** (PR #91) - Defer to end of array
- [ ] **Model fallback pre-exhaustion** (2a0c110) - Try fallback before RESOURCE_EXHAUSTED
- [ ] **Accurate quota reporting** (77363c6) - Pass project ID for non-free tiers

### To Evaluate

- [ ] Auto-onboarding (44632dc) - For accounts without projects
- [ ] Improved tier detection (9809337) - paidTier priority
- [ ] MCP tools - Image generation & web search (PR #130)

### WebUI Only (Skip)

- macOS menu bar app, config presets, dashboard enhancements
- Translation support (ID, PT-BR)
- Manual OAuth for WebUI
- Connection health checks

---

## Open PRs

| #   | Title                                | Author       | Priority     |
| --- | ------------------------------------ | ------------ | ------------ |
| 131 | Manual OAuth authorization for WebUI | mintfog      | Skip (WebUI) |
| 130 | MCP tools (Image Gen & Web Search)   | Rudra-ravi   | Evaluate     |
| 124 | Indonesian translation               | IrvanFza     | Skip (WebUI) |
| 108 | PT-BR translation                    | pedrofariasx | Skip (WebUI) |
| 15  | Map model/project 404s               | jroth1111    | Evaluate     |

---

## Open Issues

| #   | Title                                      | Relevance          |
| --- | ------------------------------------------ | ------------------ |
| 128 | Fresh tier accounts 429 RESOURCE_EXHAUSTED | Fixed in v2.0.12   |
| 126 | GLM Z.AI support                           | Low priority       |
| 118 | Claude CLI settings warning                | Consider           |
| 111 | Max accounts limit config                  | We have this (TUI) |
| 88  | HTTP 500 on large conversations (99+ msgs) | API limitation     |
| 91  | Tool use concurrency (parallel images)     | Monitor            |

---

## Known Bugs & Workarounds

| Bug                         | Status                  | Workaround                       |
| --------------------------- | ----------------------- | -------------------------------- |
| stopReason override         | ✅ Fixed (v2.0.1)       | `stopReason = null` init         |
| Image interleaving (PR #79) | Closed without fix      | Avoid multiple images in results |
| Tool concurrency (#91)      | Open - cannot reproduce | Sequential tool calls            |
| 403 PERMISSION_DENIED (#80) | Account-specific        | Contact Google support           |

---

## Feature Gap Analysis

### Features We Implemented (From Upstream)

| Feature                     | Upstream Source | Our Implementation             |
| --------------------------- | --------------- | ------------------------------ |
| Schema uppercase conversion | PR #83          | `schema-sanitizer.ts` Phase 5  |
| OAuth timeout               | Issue #68       | `fetchWithTimeout()` helper    |
| Optimistic 429 reset        | PR #72          | `selection.ts` + buffer delay  |
| Daily endpoint fix          | 5f6ce1b         | `constants.ts`                 |
| Enum stringification        | Issue #70       | `schema-sanitizer.ts` Phase 4b |
| System prompt filtering     | 4c5236d         | `request-builder.ts` [ignore]  |
| 5xx fallback                | PR #90          | `fallback-utils.ts` + handlers |
| Empty response retry        | PR #64          | `streaming-handler.ts`         |

### Features We Have That Upstream Lacks

| Feature                  | Our Implementation                | Notes                |
| ------------------------ | --------------------------------- | -------------------- |
| TypeScript codebase      | Full TypeScript                   | Type safety          |
| Comprehensive test suite | Unit, fuzz, contract, chaos, etc. | 1,767+ tests         |
| SQLite quota snapshots   | `quota-storage.ts`                | Persistent storage   |
| Burn rate calculation    | `burn-rate.ts`                    | Usage analytics      |
| TUI interface            | React/Ink                         | Alternative to WebUI |
| Discriminated unions     | `FallbackDecision` type           | Better type safety   |
| Share mode               | Cloudflare tunnel                 | Remote access        |

### Features Upstream Has That We Skip

| Feature               | Reason                      |
| --------------------- | --------------------------- |
| Web UI Dashboard      | We have TUI alternative     |
| macOS menu bar app    | Desktop-specific            |
| Native module rebuild | Not applicable (TypeScript) |
| Usage history JSON    | We use SQLite               |

---

## Architecture Differences

| Area     | Upstream          | ag-cl                   |
| -------- | ----------------- | ----------------------- |
| Language | JavaScript        | TypeScript              |
| UI       | WebUI (Alpine.js) | TUI (React/Ink)         |
| Config   | JSON files        | SQLite + JSON           |
| Auth     | Single account    | Multi-account pool      |
| Quota    | Basic tracking    | Burn rate + predictions |
| Sharing  | None              | Cloudflare tunnel       |
| Tests    | Minimal           | Comprehensive (1,767+)  |

---

## Sync Commands

```bash
npm run upstream:status   # Check sync position
npm run upstream:log      # New commits since sync
npm run upstream:diff     # File-level changes
npm run upstream:diff-full # Full diff
npm run upstream:mark     # Update bookmark after review
```

---

## Key Commits to Review

| Commit  | Description                                          | Priority |
| ------- | ---------------------------------------------------- | -------- |
| 9ffb83a | fix: improve onboarding flow for non-free tier       | Medium   |
| 2a0c110 | fix: try model fallback before RESOURCE_EXHAUSTED    | High     |
| 77363c6 | fix: accurate quota reporting with project ID        | High     |
| fa29de7 | fix: handle unsigned thinking blocks (#120)          | High     |
| 772dabe | fix: defer inlineData parts for parallel tools (#91) | High     |
| 896bf81 | revert: remove count_tokens endpoint                 | Note     |
| 44632dc | feat: add automatic user onboarding                  | Medium   |

---

## Notes

- Upstream uses `v*` tags; we use `ag-v*` prefix to avoid confusion
- Our versioning is independent (TypeScript rewrite diverged at v1.0.0)
- We track upstream via `upstream-synced` bookmark tag
- v2.0.12 fixes tier ID handling for paid tiers (uses raw API tier IDs consistently)
