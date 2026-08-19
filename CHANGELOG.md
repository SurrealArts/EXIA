# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.2] - 2026-08-19

### Added

- Mention whitelist: new `/config mention-whitelist` command group (`user add/remove`, `role add/remove`, `list`) — whitelisted users can ping any role without triggering mention guard flags, and whitelisted roles can be pinged by anyone
- New `MentionUserWhitelist` and `MentionRoleWhitelist` database tables (auto-created on startup via `CREATE TABLE IF NOT EXISTS`) with `idx_mention_user_whitelist_guild` / `idx_mention_role_whitelist_guild` indexes
- `/config view` embed now displays the mention whitelists for the guild
- 14 new unit tests for mention guard whitelists, user profile flag tracking, and paced multi-channel detection (total test count: 139)

### Fixed

- `user_profile` flags no longer re-trigger on every message for persistent conditions (e.g. genuine users without an avatar). Flags are now tracked in memory per guild/user (`new` / `active` / `cleared` states): a condition is flagged once, still amplifies pressure via the multiplier while active, and a `reply.flag.cleared` telemetry entry is enqueued when it resolves
- `/actions refresh`, `guildMemberAdd`, and startup auto-refresh now use the same tracked state — new flags and cleared flags are counted/reported separately instead of re-flagging users on every scan
- Paced multi-channel spam (e.g. GIFs sent across 3+ channels a few seconds apart) evaded the multi-channel detection's 10-second lookback window. `MULTI_CHANNEL_WINDOW_MS` extended from 10s to 20s, and a multi-channel trigger now consumes a token, preventing the trigger from double-stacking with token-exhaustion pressure

### Changed

- `pnpm` updated from 11.12.0 to 11.22.0 (global binary + `packageManager` pin); dependency overrides moved to `pnpm-workspace.yaml` (`undici`, `vite`, `allowBuilds` for better-sqlite3)

### Security

- Override `undici` to `^6.28.0`, fixing 3 Dependabot advisories: GHSA-v3r7-h72x-cjcm (cookie attribute injection), GHSA-8xcm-r25x-g524 (response desynchronization via retry interceptor), GHSA-m8rv-5g2x-5cg5 (CRLF injection via blob-like body type)
- `vitest` updated from 4.1.10 to 4.1.11 with a `vite` override to `^8.2.1`, pulling `postcss` 8.5.17 → 8.5.26 and fixing 2 advisories: GHSA-r28c-9q8g-f849 (path traversal via sourceMappingURL, high) and GHSA-fxqj-rqcc-2cmp (incomplete fix, medium)

## [1.3.1] - 2026-07-27

### Fixed

- Skip pressure application for unmoderatable users (mods/admins) in regex and velocity modules — prevents persistent pressure buildup when the bot cannot timeout the target due to role hierarchy

## [1.3.0] - 2026-07-18

### Added

- New `/help` command: shows bot version (EXIA + discord.js), summary of all 7 slash commands, and links to documentation
- Version line in `/debug` embed: displays EXIA version and discord.js version

### Changed

- Command count updated from 6 to 7 in README and DOCUMENTATION

## [1.2.1] - 2026-07-17

### Security

- Update `discord.js` from 14.26.5 to 14.27.0, pulling in `undici` 6.27.0 (was 6.24.1) to fix 4 Dependabot advisories: GHSA-35p6-xmwp-9g52 (response queue poisoning), GHSA-vxpw-j846-p89q (WebSocket DoS), GHSA-p88m-4jfj-68fv (header injection), GHSA-g8m3-5g58-fq7m (cookie SameSite downgrade)

### Changed

- Code-style formatting applied to documentation and source files (Prettier)

## [1.2.0] - 2026-07-17

### Added

- New `mention_guard` module: detects `@everyone`/`@here`/`@role` mentions from non-moderators with a dynamic escalating multiplier (3.0x–5.0x) that decays on clean messages
- 15 unit tests for mentionGuard module (total test count: 125)
- Japanese translation for Mention Guard section in README.ja.md

### Changed

- `/debug` command now requires Administrator permission (was unrestricted)
- Standard profile expanded from 4 to 5 modules (`mention_guard`, weight: 10)
- Pipeline extended: mention guard check runs after user_profile audit, before velocity check
- `/config view` and `/debug` display effective pressure range for mention_guard
- Documentation updated across README and DOCUMENTATION (EN and JA)

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

[Unreleased]: https://github.com/SurrealArts/EXIA/compare/v1.3.2...HEAD
[1.3.2]: https://github.com/SurrealArts/EXIA/releases/tag/v1.3.2
[1.3.1]: https://github.com/SurrealArts/EXIA/releases/tag/v1.3.1
[1.3.0]: https://github.com/SurrealArts/EXIA/releases/tag/v1.3.0
[1.2.1]: https://github.com/SurrealArts/EXIA/releases/tag/v1.2.1
[1.2.0]: https://github.com/SurrealArts/EXIA/releases/tag/v1.2.0
[1.1.0]: https://github.com/SurrealArts/EXIA/releases/tag/v1.1.0
[1.0.0]: https://github.com/SurrealArts/EXIA/releases/tag/v1.0.0
