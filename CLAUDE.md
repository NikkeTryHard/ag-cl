# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

- **No temporary documentation files.** Do not create standalone markdown files for notes, specs, or tracking. All persistent documentation belongs in `docs/` or in this file.

## Project Overview

Antigravity Claude Proxy is a Node.js proxy server that exposes an Anthropic-compatible API backed by Antigravity's Cloud Code service. It enables using Claude and Gemini models with Claude Code CLI.

## Related Projects

### Claude Code Proxies

| Project                                                                             | Description                                   |
| ----------------------------------------------------------------------------------- | --------------------------------------------- |
| [antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy) | Original JavaScript implementation (upstream) |
| [claude-code-proxy](https://github.com/1rgs/claude-code-proxy)                      | Anthropic API proxy using LiteLLM             |
| [claude-code-router](https://github.com/musistudio/claude-code-router)              | Claude Code router implementation             |
| [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)                         | CLI proxy API implementation                  |
| [CLIProxyAPIPlus](https://github.com/router-for-me/CLIProxyAPIPlus)                 | Extended CLI proxy API                        |
| [Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager)                | Exposes endpoint with fallbacks               |

### Authentication

| Project                                                                             | Description                          |
| ----------------------------------------------------------------------------------- | ------------------------------------ |
| [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) | OpenCode plugin for Antigravity auth |

## OAuth Reference

### Gemini CLI OAuth

| Item           | Value                                 |
| -------------- | ------------------------------------- |
| Token location | `~/.gemini/oauth_creds.json`          |
| Endpoint       | `https://cloudcode-pa.googleapis.com` |

### Claude Code OAuth (different system)

| Item           | Value                                   |
| -------------- | --------------------------------------- |
| Token location | `~/.claude/.credentials.json`           |
| Access tokens  | `sk-ant-oat01-*` (8 hour expiry)        |
| Refresh tokens | `sk-ant-ort01-*`                        |
| API endpoint   | `https://api.anthropic.com/v1/messages` |

### Token Formats

- **Refresh tokens**: Start with `1//`, long-lived
- **Access tokens**: Start with `ya29.`, ~1 hour expiry

### Where to Find Refresh Tokens

| Source                    | Location                                             |
| ------------------------- | ---------------------------------------------------- |
| Gemini CLI                | `~/.gemini/oauth_creds.json` (`refresh_token` field) |
| opencode-antigravity-auth | `~/.config/opencode/`                                |

### OAuth Error Reference

| Error                | Cause                 | Solution                |
| -------------------- | --------------------- | ----------------------- |
| `invalid_grant`      | Token revoked/expired | Re-authenticate         |
| `invalid_client`     | Wrong OAuth client    | Use correct credentials |
| `RESOURCE_EXHAUSTED` | Rate limit            | Wait or switch accounts |
| `401 Unauthorized`   | Access token expired  | Auto-refreshed          |

---

## CLI Commands Reference

**IMPORTANT**: Always use these npm scripts instead of raw commands. They ensure correct paths and configuration.

### Development

```bash
npm run build              # Compile TypeScript to dist/
npm run dev                # Watch mode with auto-reload
npm run typecheck          # Type check without emitting
npm run lint               # ESLint check
npm run lint:fix           # ESLint auto-fix
```

### Server

```bash
npm start                              # Start server (port 8080)
npm start -- --port 3000               # Custom port
npm start -- --fallback                # Enable model fallback on quota exhaustion
npm start -- --debug                   # Debug logging
npm start -- --log-level debug         # Log level: silent|error|warn|info|debug|trace
npm start -- --log-file proxy.log      # Log to file
npm start -- --json-logs               # JSON output for parsing
npm start -- --silent                  # Suppress output except errors
npm run start:prod                     # Production mode (from dist/)
```

### Account Management

```bash
npm run init               # Interactive setup wizard
npm run accounts           # Interactive account menu
npm run accounts:add       # Add account (OAuth or refresh token)
npm run accounts:add -- --no-browser      # Headless OAuth (manual URL)
npm run accounts:add -- --refresh-token   # Use refresh token directly
npm run accounts:list      # List all accounts
npm run accounts:remove    # Remove account interactively
npm run accounts:verify    # Verify all account tokens
npm run accounts:clear     # Remove all accounts

# With environment variable
REFRESH_TOKEN=1//xxx npm run accounts:add -- --refresh-token
```

### Testing

#### Unit Tests (Vitest)

```bash
npm test                               # Run all unit tests
npm test -- path/to/file.test.ts       # Run single test file
npm test -- --grep "pattern"           # Run tests matching pattern
npm run test:watch                     # Watch mode
npm run test:coverage                  # With coverage report (opens html)
npm run test:bench                     # Performance benchmarks
```

#### Integration Tests (require running server)

```bash
# Start server first: npm start
npm run test:integration     # All integration tests
npm run test:signatures      # Thinking signature validation
npm run test:multiturn       # Multi-turn tool conversations
npm run test:streaming       # SSE streaming tests
npm run test:interleaved     # Interleaved thinking blocks
npm run test:images          # Image/document support
npm run test:caching         # Prompt caching
npm run test:crossmodel      # Cross-model thinking compatibility
npm run test:oauth           # OAuth no-browser flow
```

### Debugging

```bash
npm start -- --debug                   # Enable debug mode
npm start -- --log-level trace         # Maximum verbosity
npm test -- --reporter=verbose         # Verbose test output
npm test -- --no-coverage              # Skip coverage for faster runs
```

### Upstream Sync

This is a TypeScript rewrite of [antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy). Track upstream changes with:

```bash
npm run upstream:status     # Show bookmark position vs upstream HEAD
npm run upstream:log        # Show new commits since last bookmark
npm run upstream:diff       # File-level summary of changes since bookmark
npm run upstream:diff-full  # Full diff of changes since bookmark
npm run upstream:mark       # Update bookmark to current upstream HEAD
```

The `upstream-synced` git tag acts as a bookmark. After reviewing upstream changes, run `npm run upstream:mark` to update it.

## Test Strategy

`npm test` runs all test types except load tests (which require a running server) and benchmarks. Load tests are skipped by default and run with `RUN_LOAD_TESTS=true npm run test:load`.

### Current Test Types

| Type        | Location             | Purpose                               | Command                                 |
| ----------- | -------------------- | ------------------------------------- | --------------------------------------- |
| Unit        | `tests/unit/`        | Individual functions, mocked deps     | `npm test`                              |
| Fuzz        | `tests/fuzz/`        | Random input, edge cases (fast-check) | `npm test`                              |
| Contract    | `tests/contract/`    | API schema validation                 | `npm test`                              |
| Snapshot    | `tests/snapshot/`    | Detect unintended format changes      | `npm test`                              |
| Golden File | `tests/golden/`      | Known good request/response pairs     | `npm test`                              |
| Chaos       | `tests/chaos/`       | Network failures, malformed responses | `npm test`                              |
| Load        | `tests/load/`        | Concurrent handling, stress testing   | `RUN_LOAD_TESTS=true npm run test:load` |
| Security    | `tests/security/`    | Input sanitization, token handling    | `npm test`                              |
| Type        | `tests/types/`       | Exported types correctness            | `npm test`                              |
| Benchmark   | `tests/bench/`       | Performance regression                | `npm run test:bench`                    |
| Integration | `tests/integration/` | End-to-end with real server           | `npm run test:integration`              |

### Test File Naming Conventions

```
tests/unit/**/*.test.ts               # Unit tests
tests/fuzz/**/*.fuzz.test.ts          # Fuzz/property tests
tests/contract/**/*.contract.test.ts  # Contract tests
tests/snapshot/**/*.snap.test.ts      # Snapshot tests
tests/golden/**/*.golden.test.ts      # Golden file tests
tests/chaos/**/*.chaos.test.ts        # Chaos/fault injection tests
tests/load/**/*.load.test.ts          # Load/stress tests
tests/security/**/*.security.test.ts  # Security tests
tests/types/**/*.type.test.ts         # Type tests
tests/bench/**/*.bench.ts             # Benchmarks
tests/integration/*.cjs               # Integration tests
```

## Project Structure

```
src/
├── cli/              # Commander CLI commands
├── auth/             # OAuth, token extraction
├── account-manager/  # Multi-account management
├── cloudcode/        # Google Cloud Code API
├── format/           # Anthropic <-> Google converters
├── utils/            # Helpers, logging
├── server.ts         # Express server
└── constants.ts      # Configuration

docs/
└── ANTIGRAVITY_API_SPEC.md  # Antigravity API specification

tests/
├── unit/             # Vitest unit tests
├── fuzz/             # Property-based tests
├── contract/         # API contract tests
├── snapshot/         # Snapshot tests
├── golden/           # Golden file tests
├── chaos/            # Chaos/fault injection tests
├── load/             # Load/stress tests
├── security/         # Security tests
├── types/            # Type correctness tests
├── bench/            # Benchmarks
├── integration/      # Integration tests (.cjs)
├── fixtures/         # Test data files
├── snapshots/        # Snapshot files
└── helpers/          # Test utilities
```
