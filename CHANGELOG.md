# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-07-15

### Added

- Full i18n/locale system with per-guild language support (`src/core/locale.js`, `src/locales/`)
- New `/language` command for per-guild language switching
- Query cache with TTL and LRU eviction (`src/utils/queryCache.js`)
- Locale and query cache test suites
- Japanese translations for README and documentation (`README.ja.md`, `DOCUMENTATION.ja.md`)
- Prettier configuration (`.prettierrc.json`, `.prettierignore`)
- Version bump script (`scripts/bump-version.js`)
- `CHANGELOG.md`

### Changed

- All command definitions use `setDescriptionLocalizations()` for native Discord i18n
- All embeds, modals, and replies use `t(lang, key)` instead of hardcoded strings
- All events (guildMemberAdd, interactionCreate, messageCreate, modalSubmit) fully localized
- Telemetry embed title uses guild's configured language
- Telemetry queue: per-guild queues, cache-based channel lookup, chunked message flushing
- Raid protection: capped Maps (`MAX_RAID_STATE_ENTRIES`), `Promise.allSettled` restore, `setClient()` eliminates circular dep
- Regex sandbox: worker pool with dead-worker replacement
- Regex worker: `gi` → `i` flag for single-match semantics
- Pressure engine: `MAX_PRESSURE_ENTRIES` cap, improved decay timer
- Velocity bucket: capped Maps, lazy refill, multi-channel detection
- Honeypot trap: accepts `guildConfig` instead of raw `db`
- Database: `invalidateCache()` on all admin write paths
- `index.js`: non-blocking `setImmediate` per-guild auto-refresh, localized enqueue, exports only `{ client }`
- ESLint: `no-undef: error` with `env: { node: true }`
- Upgrade base image from `node:22-slim` to `node:26-slim`

### Fixed

- Circular dependency between raidProtection and telemetryQueue
- Dead regex workers not being replaced by pool
- Cache not invalidated after guild config write operations
- Regex worker using `gi` flags causing unintended multi-matches
- Telemetry flusher using `.fetch()` instead of `.cache.get()`
- CI pipeline running tests after Docker build instead of before
- Pin `pnpm@11.12.0` for reproducible builds

### Removed

- `src/core/logger.js` (dead pino-based logger)

## [1.0.0] - 2026-07-14

### Added

- Initial release of Exia Discord bot
- Flag-based user moderation with telemetry logging
- Raid protection system with automatic stage escalation
- Regex-based message filtering with sandboxed worker pool
- Pressure engine for rate-limiting and abuse detection
- Multi-language support via locale system
- Per-guild configuration (thresholds, weights, honeypot, log channels)
- SQLite database with migration system and query caching
- CI/CD pipeline with Docker image build and test step
- Dependabot configuration for automated dependency updates

[Unreleased]: https://github.com/anomalyco/exia/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/anomalyco/exia/releases/tag/v1.1.0
[1.0.0]: https://github.com/anomalyco/exia/releases/tag/v1.0.0
