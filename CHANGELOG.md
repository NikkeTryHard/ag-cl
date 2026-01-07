# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-01-06

### Added

- Upstream sync bookmark system using `upstream-synced` git tag
- New npm scripts: `upstream:mark`, `upstream:status` for tracking sync position
- Explicit test type patterns in vitest config (load, type tests)

### Fixed

- UTF-8 charset in OAuth callback HTML responses (ported from upstream)
- Reduced default rate limit cooldown from 60s to 10s (match upstream)

### Changed

- Updated CLAUDE.md with test strategy documentation

## [1.0.2] - 2026-01-06

### Added

- Upstream remote tracking for syncing with original JS repository
- npm scripts: `upstream:fetch`, `upstream:log`, `upstream:diff`, `upstream:diff-full`
- "No temporary docs" rule in CLAUDE.md

### Changed

- Moved `ANTIGRAVITY_API_SPEC.md` to `docs/` folder
- Reorganized documentation structure

## [1.0.1] - 2026-01-06

### Fixed

- `bin/cli.js` now correctly points to `dist/` instead of `src/`
- Package renamed to `ag-cl` for npm availability

### Changed

- Updated package-lock.json with correct package name

## [1.0.0] - 2026-01-05

### Added

- Complete TypeScript rewrite of [antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy)
- Multi-account management with automatic failover
- Model fallback on quota exhaustion (`--fallback` flag)
- Streaming and non-streaming API support
- Headless OAuth mode (`--no-browser`) for servers
- SQLite-based account storage
- Rate limit parsing and smart cooldown
- Cross-model thinking signature handling

### Testing

- Unit tests with Vitest
- Fuzz testing with fast-check
- Contract tests for API schema validation
- Snapshot tests for response format stability
- Golden file tests for known good responses
- Chaos tests for network failure resilience
- Security tests for input validation
- Type tests for exported types correctness
- Benchmark tests for performance regression
- 96%+ code coverage

### Documentation

- Comprehensive CLAUDE.md with CLI reference
- ANTIGRAVITY_API_SPEC.md with API documentation

[1.0.3]: https://github.com/NikkeTryHard/ag-cl/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/NikkeTryHard/ag-cl/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/NikkeTryHard/ag-cl/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/NikkeTryHard/ag-cl/releases/tag/v1.0.0
