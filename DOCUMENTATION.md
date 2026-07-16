# EXIA — Full Project Documentation

**Version:** 1.1.0  
**Stack:** Node.js 26 + Discord.js v14 + better-sqlite3 (SQLite, WAL mode)  
**Package Manager:** pnpm 11.12 (ESM-only)  
**Entry Point:** `src/index.js`

---

## Table of Contents

1. [Project Layout](#1-project-layout)
2. [Environment & Build Toolchain](#2-environment--build-toolchain)
3. [Core Engine](#3-core-engine)
   - 3.1 Database (`src/core/database.js`)
   - 3.2 Pressure Engine (`src/core/pressureEngine.js`)
   - 3.3 Locale (`src/core/locale.js`)
   - 3.4 Configuration (`src/config/config.js`)
4. [Events](#4-events)
   - 4.1 Message Create (`src/events/messageCreate.js`)
   - 4.2 Interaction Create (`src/events/interactionCreate.js`)
   - 4.3 Guild Member Add (`src/events/guildMemberAdd.js`)
   - 4.4 Modal Submit (`src/events/modalSubmit.js`)
5. [Modules](#5-modules)
   - 5.1 Velocity Bucket (`src/modules/velocityBucket.js`)
   - 5.2 Regex Sandbox (`src/modules/regexSandbox.js` + `regexWorker.js`)
   - 5.3 Honeypot Trap (`src/modules/honeypotTrap.js`)
   - 5.4 User Profile (`src/modules/userProfile.js`)
   - 5.5 Raid Protection (`src/modules/raidProtection.js`)
6. [Commands](#6-commands)
   - 6.1 Configuration (`src/commands/configuration.js`)
   - 6.2 Appeals (`src/commands/appeals.js`)
   - 6.3 Profiles (`src/commands/profiles.js`)
   - 6.4 Raid (`src/commands/raid.js`)
   - 6.5 Debug (`src/commands/debug.js`)
   - 6.6 Language (`src/commands/language.js`)
7. [Utilities](#7-utilities)
   - 7.1 CLOG (`src/utils/clog.js`)
   - 7.2 Telemetry Queue (`src/utils/telemetryQueue.js`)
   - 7.3 Query Cache (`src/utils/queryCache.js`)
8. [Communication Flow](#8-communication-flow)
9. [Running the Application](#9-running-the-application)

---

## 1. Project Layout

```
EXIA/
├── .github/
│   ├── workflows/
│   │   └── docker-image.yml          # GitHub Actions: Docker build + push to ghcr.io
│   └── dependabot.yml                # Weekly npm + Docker dependency updates
├── data/                             # SQLite database directory (gitignored)
├── scripts/
│   └── bump-version.js               # Version bump script
├── src/
│   ├── index.js                      # Entry point: client init, command registration, auto-refresh
│   ├── commands/
│   │   ├── appeals.js                # /actions command builder (appeal, rejoin, ban, refresh)
│   │   ├── configuration.js          # /config command builder (modules, thresholds, regex, etc.)
│   │   ├── debug.js                  # /debug command builder
│   │   ├── language.js               # /language command builder
│   │   ├── profiles.js               # /profiles command builder (list, create, apply, etc.)
│   │   └── raid.js                   # /raid command builder (stage, status)
│   ├── config/
│   │   └── config.js                 # dotenv-flow loader, env validation, exports
│   ├── core/
│   │   ├── database.js               # SQLite init, 7 tables, migrations, Standard profile
│   │   ├── locale.js                 # i18n: t(), getGuildLanguage(), resolveInteractionLang()
│   │   ├── locale.test.js            # Vitest suite for locale
│   │   ├── pressureEngine.js         # In-memory pressure scores, decay, mutex, fast-track
│   │   └── pressureEngine.test.js    # Vitest suite for pressure engine
│   ├── events/
│   │   ├── guildMemberAdd.js         # On-join user_profile audit + telemetry enqueue
│   │   ├── interactionCreate.js      # All slash command routing + autocomplete + debug
│   │   ├── messageCreate.js          # Full message pipeline: modules, multiplier, sanctions
│   │   └── modalSubmit.js            # Regex create/edit modal handling
│   ├── locales/
│   │   ├── en.json                   # English locale strings
│   │   └── ja.json                   # Japanese locale strings
│   ├── modules/
│   │   ├── honeypotTrap.js           # Fast-track ban on restricted channel messages
│   │   ├── honeypotTrap.test.js      # Vitest suite for honeypot
│   │   ├── raidProtection.js         # 3-stage raid escalation, permission backup/restore
│   │   ├── raidProtection.test.js    # Vitest suite for raid protection
│   │   ├── regexSandbox.js           # Worker-thread regex evaluation with timeout
│   │   ├── regexSandbox.test.js      # Vitest suite for regex sandbox
│   │   ├── regexWorker.js            # Worker thread: receives {pattern, content}, returns {matched}
│   │   ├── regexWorker.test.js       # Vitest suite for regex worker
│   │   ├── userProfile.js            # Account age/avatar audit → {multiplier, reasons}
│   │   ├── userProfile.test.js       # Vitest suite for user profile
│   │   ├── velocityBucket.js         # Token-bucket rate limiter + multi-channel detection
│   │   └── velocityBucket.test.js    # Vitest suite for velocity bucket
│   └── utils/
│       ├── clog.js                   # Timestamped colored console logging utility
│       ├── queryCache.js             # TTL-based query cache with LRU eviction
│       ├── queryCache.test.js        # Vitest suite for query cache
│       ├── telemetryQueue.js         # Batched embed log queue + flusher
│       └── telemetryQueue.test.js    # Vitest suite for telemetry queue
├── .dockerignore                     # Docker build exclusion patterns
├── .env.example                      # Required environment variables template
├── .gitignore                        # Git exclusion patterns
├── .prettierignore                   # Prettier exclusion patterns
├── .prettierrc.json                  # Prettier config
├── CHANGELOG.ja.md                   # Japanese changelog
├── CHANGELOG.md                      # Version changelog
├── docker-compose.yml                # Single-service compose with named volume
├── Dockerfile                        # Multi-stage Docker build (build → final slim)
├── DOCUMENTATION.ja.md               # Japanese documentation
├── DOCUMENTATION.md                  # This file
├── entrypoint.sh                     # Container entrypoint: creates /app/data, runs CMD
├── eslint.config.js                  # ESLint flat config
├── LICENSE                           # MIT License
├── package.json                      # Project manifest, scripts, dependencies
├── pnpm-lock.yaml                    # Lockfile
├── pnpm-workspace.yaml               # Pnpm workspace config (single project)
├── README.ja.md                      # Japanese user-facing guide
└── README.md                         # User-facing intro and deployment guide
```

---

## 2. Environment & Build Toolchain

### Runtime

- **Node.js:** 26 (LTS)
- **Package Manager:** pnpm 11.12 (via `corepack`)
- **Module System:** ESM (`"type": "module"` in package.json)

### Dependencies

| Package          | Version  | Purpose                                                   |
| ---------------- | -------- | --------------------------------------------------------- |
| `discord.js`     | ^14.26.5 | Discord API client + interaction framework                |
| `better-sqlite3` | ^12.11.1 | Synchronous SQLite3 binding (WAL mode)                    |
| `dotenv-flow`    | ^4.1.0   | `.env` loading with environment-specific override support |
| `pino`           | ^10.3.1  | Structured JSON logger (removed in v1.1.0)                |

### Dev Dependencies

| Package           | Purpose               |
| ----------------- | --------------------- |
| `eslint` ^10.7.0  | Linting (flat config) |
| `prettier` ^3.9.5 | Code formatting       |
| `vitest` ^4.1.10  | Test runner           |
| `globals` ^17.7.0 | ESLint globals        |

### Scripts

| Command               | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `pnpm start`          | `node src/index.js` — production start                      |
| `pnpm dev`            | `node --watch src/index.js` — hot-reload dev                |
| `pnpm debug`          | `node --watch src/index.js --debug` — dev with --debug flag |
| `pnpm lint`           | `prettier --check . && eslint .` — format check + lint      |
| `pnpm prettier-write` | `prettier --write .` — auto-format                          |
| `pnpm test`           | `vitest` — run test suite                                   |
| `pnpm test:watch`     | `vitest --watch` — watch mode                               |

### CI/CD (GitHub Actions)

Workflow: `.github/workflows/docker-image.yml`

- **Trigger:** Push to `main` or PR to `main`
- **Build + Push** (single job): Checks out repo, sets up Docker Buildx, logs into GHCR, extracts metadata via `docker/metadata-action`, builds and pushes image to `ghcr.io/surrealarts/exia:latest`
- Cache: GitHub Actions cache (type=gha) for layers

### Dependabot

`.github/dependabot.yml` schedules weekly updates on Monday 09:00 UTC for:

- **npm** ecosystem (root directory) — production and dev dependencies grouped separately, minor/patch only
- **docker** ecosystem (root directory)

---

## 3. Core Engine

### 3.1 Database (`src/core/database.js`)

Initializes a **better-sqlite3** connection in **WAL mode** with foreign keys enabled. The database file is `data/exia.db`.

#### Initialization Flow

1. `initDatabase()` called from `src/index.js` on startup
2. Ensures `data/` directory exists (`mkdirSync` recursive)
3. Opens database at `data/exia.db`
4. Sets `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`
5. Calls `createTables()` — creates 7 tables if not exist
6. Calls `runMigrations()` — applies incremental schema migrations

#### Tables

| Table                  | Primary Key                                                               | Description                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **GuildConfiguration** | `guild_id TEXT`                                                           | Per-guild settings: log_channel_id, appeal_link, rejoin_link, honeypot_channel_id, active_profile, timestamps |
| **ModuleWeights**      | `(guild_id, module_name)`                                                 | Module toggles: weight (INT), is_critical (BOOL), is_enabled (BOOL)                                           |
| **ThresholdActions**   | `(guild_id, pressure_tier)`                                               | Pressure → action mapping: action (TEXT), message_delete_seconds (INT), pressure (INT)                        |
| **RegexRules**         | `(guild_id, rule_identifier)`                                             | Custom regex patterns: pattern (TEXT), threat_weight (INT), is_critical (BOOL)                                |
| **ConfigProfiles**     | `(guild_id, profile_name)`                                                | Named config snapshots: profile_data (JSON TEXT), is_locked (BOOL)                                            |
| **RaidState**          | `guild_id TEXT`                                                           | Active raid stage, permission backup JSON blob, started_at                                                    |
| **Indexes**            | `idx_module_weights_guild`, `idx_threshold_tier`, `idx_regex_rules_guild` | Performance indexes                                                                                           |

#### Migrations (`runMigrations()`)

Runs at every startup. Checks `PRAGMA table_info` for column existence before altering:

- **v1:** Adds `active_profile` column to `GuildConfiguration` (default `'Standard'`)
- **v2:** Adds `pressure` column to `ThresholdActions` (default `25`)
- **v3:** Migrates existing `ConfigProfiles` with `profile_name = 'Standard'`:
  - Normalizes `modules[].name` → `module_name`, `modules[].critical` → `is_critical`, `modules[].enabled` → `is_enabled`
  - Normalizes `thresholds[].tier` → `pressure_tier`, `thresholds[].deleteSec` → `message_delete_seconds`
  - Adds "Anti-invites" regex rule if not present
  - Removes legacy `guildConfig` key

#### Standard Profile

`ensureStandardProfile(guildId)` — Creates a locked Standard profile for a guild if none exists:

- **4 modules:** user_profile (15), velocity (10), honeypot (0, critical), regex (10)
- **4 thresholds:** T1 warn 25p, T2 mute 50p, T3 kick 75p, T4 ban 100p
- **1 regex rule:** Anti-invites — matches Discord invite URLs, weight 50
- Profile is locked (`is_locked = 1`) — cannot be removed

`applyStandardProfile(guildId)` — Writes Standard profile data into the active configuration tables (GuildConfiguration, ModuleWeights, ThresholdActions, RegexRules). Called on first guild message when no guild configuration exists. Executes within a transaction.

#### Helpers

`getDatabase()` — Returns the singleton db instance. Throws if `initDatabase()` was not called first.

### 3.2 Pressure Engine (`src/core/pressureEngine.js`)

In-memory pressure tracking with per-guild/user isolation. No database writes for scores — purely in-memory for performance.

#### Key Constants

| Constant                     | Value                  | Description                               |
| ---------------------------- | ---------------------- | ----------------------------------------- |
| `PRESSURE_DECAY_INTERVAL_MS` | 60,000 (60s)           | Decay cycle interval                      |
| `PRESSURE_DECAY_AMOUNT`      | 5                      | Pressure points removed per cycle         |
| `FAST_TRACK_PRESSURE`        | 9999                   | Instant max pressure for critical modules |
| `MAX_PRESSURE`               | 9999                   | Absolute cap                              |
| `DEFAULT_THRESHOLDS`         | 4 tiers (25/50/75/100) | Fallback if no DB thresholds              |

#### Data Structures

```js
// pressureScores: Map<"guildId:userId", { pressure: number, lastUpdated: number }>
const pressureScores = new Map();

// processingMutex: Set<userId> — prevents concurrent sanctions on same user
const processingMutex = new Set();
```

#### `applyPressure(guildId, userId, weight, isCritical, thresholds)`

1. **Fast-track:** If `isCritical === true`, sets pressure to 9999, returns `{ action: "ban", tier: 4 }`
2. **Mutex check:** If user is currently being sanctioned, pressure still accumulates but `action` and `tier` are returned as `null` (no recursive sanction)
3. **Normal flow:** Adds weight to existing entry or creates new one. Caps at MAX_PRESSURE.
4. **Threshold evaluation:** Calls `getHighestThreshold(totalPressure, thresholds)` — iterates thresholds in order, returns the highest tier where `pressure >= threshold.pressure`
5. Returns `{ totalPressure, action, tier }` — action is null if no threshold met

#### Decay System

`startDecayTimer()` — 60-second interval:

1. Iterates all pressure scores
2. For each entry, calculates elapsed time since lastUpdate
3. Applies `(elapsed / 60s) * 5` decay
4. Removes entries that reach 0
5. Interval is unreffed (does not keep process alive)

#### Mutex

| Function               | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `acquireMutex(userId)` | Returns true if acquired, false if already held |
| `releaseMutex(userId)` | Releases the mutex                              |
| `isMutexed(userId)`    | Check without acquiring                         |

#### Query Helpers

| Function                                | Description                                                          |
| --------------------------------------- | -------------------------------------------------------------------- |
| `getThresholdAction(db, guildId, tier)` | Looks up DB threshold action by tier, falls back to defaults         |
| `getPressure(guildId, userId)`          | Returns current pressure (or 0)                                      |
| `getAllPressureScores()`                | Returns `[{ guildId, userId, pressure, lastUpdated }]` for debugging |
| `resetPressureState()`                  | Clears all state, stops decay timer (used by tests)                  |

### 3.3 Locale (`src/core/locale.js`)

i18n system providing per-guild language support. Locale files are stored in `src/locales/` as JSON key-value maps.

#### Key Exports

| Export                     | Description                                                           |
| -------------------------- | --------------------------------------------------------------------- |
| `t(lang, key, vars?)`      | Translate a key for the given language, optionally interpolating vars |
| `getGuildLanguage(db, id)` | Get the configured language for a guild (default `"en"`)              |
| `resolveInteractionLang()` | Resolve language from interaction (guild setting or user locale)      |

#### Translation

```js
t("ja", "telemetry.flag.refresh", {
  user: "<@123>",
  userId: "123",
  reasons: "spam",
  multiplier: 2.0,
});
```

- Falls back to key if translation is missing
- Interpolates `{{var}}` placeholders with supplied variables
- Supported locales: `en` (English), `ja` (Japanese)

### 3.4 Configuration (`src/config/config.js`)

Loads `.env` via `dotenv-flow` from the project root. Exports:

| Export        | Source          | Description                                    |
| ------------- | --------------- | ---------------------------------------------- |
| `clientid`    | `CLIENT_ID`     | Discord application client ID                  |
| `token`       | `TOKEN`         | Discord bot token                              |
| `version`     | `VERSION`       | Bot version string                             |
| `logWithTime` | `LOG_WITH_TIME` | Boolean for timestamped logs (default true)    |
| `logTimezone` | `LOG_TIMEZONE`  | IANA timezone for log timestamps (default UTC) |

`validateConfig()` runs on import — exits with code 1 if `CLIENT_ID` or `TOKEN` are missing, warns if `VERSION` is missing.

---

## 4. Events

### 4.1 Message Create (`src/events/messageCreate.js`)

The main message processing pipeline. Fires on every guild message (excluding bot messages, DMs).

#### Pipeline Flow

```
messageCreate
  ↓
1. Database bootstrap (applyStandardProfile if no guild config)
  ↓
2. Honeypot check → fast-track if triggered
  ↓
3. user_profile audit → multiplier calculation
  ↓
4. Velocity check (unless fast-track) → token consumption, multi-channel detection
  ↓
5. Regex evaluation (unless fast-track or sticker-only) → worker thread per rule
  ↓
6. Profile reason collection → appends to flagReasons
  ↓
7. Sanction execution if any module triggered an action
  ↓
8. Telemetry enqueue for all flag reasons
```

#### **1. Bootstrap**

Queries `GuildConfiguration` by guild ID. If no row exists, calls `applyStandardProfile(guildId)` which writes the Standard profile to active tables. Then loads module weight map disabled modules filtered out).

#### **2. Honeypot Check**

Calls `checkHoneypot(message, db)` (see §5.3). If triggered and not whitelisted, calls `applyPressure(..., isCritical=true)` which fast-tracks to ban. Records reason: `"sent a message in a restricted channel"`.

#### **3. User Profile Audit**

Calls `auditProfile(message.member)` (see §5.4). If the user_profile module is enabled, the returned multiplier is applied to velocity and regex weights. If disabled, multiplier is 1.0.

#### **4. Velocity Check**

Calls `consumeToken(guildId, userId, channelId)` (see §5.1). If exceeded:

- Multi-channel: pressure = 30 (independent of module weight)
- Token exhaustion: pressure = module weight (or 5 if no module)
- Both cases: weight is multiplied by multiplier, then `applyPressure` is called

#### **5. Regex Evaluation**

Iterates all DB regex rules for the guild. For each rule, calls `evaluateRegex(pattern, content)` (see §5.2) via worker thread. On match:

- Weight = `rule.threat_weight * multiplier`
- Calls `applyPressure` with the weight
- Breaks on first match

#### **6. Profile Reasons**

All profile reasons (e.g., "account too young", "no avatar set") are appended to flagReasons.

#### **7. Sanction Execution** (`executeSanction`)

Called if `highestAction.action` is non-null:

1. Checks `member.moderatable` — aborts if false (role hierarchy prevents action)
2. Looks up `message_delete_seconds` from ThresholdActions for the tier
3. Acquires mutex — if held, skips (another sanction already in progress)
4. **Deletes the triggering message**
5. Sends DM user with reason text before the action:
   - **warn:** DMs warning text, sends timed notice in channel
   - **mute:** DMs reason + 10-minute duration, applies 10-minute timeout, sends timed notice
   - **kick:** DMs reason + rejoin link, kicks member
   - **ban:** DMs reason + appeal contact, bans member with `deleteMessageSeconds` (clamped to 0–604800)
6. Enqueues action telemetry
7. Releases mutex in `finally` block

#### `sendTimedNotice(message, text, deleteSeconds)`

Sends a notice to the channel that auto-deletes after N seconds.

#### `safeExecute(fn)`

Wraps any Discord API call in try/catch — returns null on failure (prevents crashes from API errors).

### 4.2 Interaction Create (`src/events/interactionCreate.js`)

Routes all slash commands, autocomplete interactions, and the debug handler.

#### Routing Table

| Interaction   | Handler                 |
| ------------- | ----------------------- |
| Autocomplete  | `handleAutocomplete`    |
| `/config *`   | `handleConfigCommand`   |
| `/actions *`  | `handleActionsCommand`  |
| `/language`   | `handleLanguageCommand` |
| `/profiles *` | `handleProfilesCommand` |
| `/raid *`     | `handleRaidCommand`     |
| `/debug`      | `handleDebugCommand`    |

#### Autocomplete (`handleAutocomplete`)

- **profiles (apply/remove):** Queries `ConfigProfiles` by guild ID and partial name match
- **config regex (edit/delete):** Queries `RegexRules` by guild ID and partial identifier match

#### Config Command (`handleConfigCommand`)

Full subcommand routing (see §6.1 for command builder):

| Subcommand          | Description                                                                       |
| ------------------- | --------------------------------------------------------------------------------- |
| `modules toggle`    | Enables/disables a module (upsert into ModuleWeights)                             |
| `modules weight`    | Sets module weight (upsert)                                                       |
| `modules critical`  | Toggles critical flag                                                             |
| `thresholds assign` | Sets pressure tier → action mapping                                               |
| `regex create`      | Opens modal for new rule creation                                                 |
| `regex list`        | Lists all rules as plain text                                                     |
| `regex edit`        | Opens modal pre-filled with rule data                                             |
| `regex delete`      | Deletes rule by identifier                                                        |
| `honeypot set`      | Sets honeypot channel                                                             |
| `logchannel set`    | Sets telemetry log channel                                                        |
| `view`              | Full embed: general config, module status, thresholds, regex, pressure→action map |

The `/config view` embed:

- Displays profile name, log channel, appeal/rejoin links, honeypot channel
- Module fields: 3 columns per module (emoji+name, weight, critical)
  - `regex` shows weight as min~max range of rule weights
  - `user_profile` shows "Multiplier" as value and tier breakdown
- Thresholds table with tier, pressure, action, delete-seconds
- Regex rules list (pattern truncated to 50 chars)
- Pressure → Action Map showing each tier's range

#### Actions Command (`handleActionsCommand`)

| Subcommand | Description                                                                  |
| ---------- | ---------------------------------------------------------------------------- |
| `appeal`   | Sets appeal contact info (shown in ban DM)                                   |
| `rejoin`   | Sets rejoin invite link (shown in kick DM)                                   |
| `ban`      | Manual ban with optional message deletion (permission check: BanMembers)     |
| `refresh`  | Scans all cached guild members with `auditProfile`, enqueues flagged results |

The `refresh` handler defers reply (may take time), iterates `interaction.guild.members.cache`, calls `auditProfile` on each non-bot member, and enqueues flag telemetry entries for those with reasons.

#### Profiles Command (`handleProfilesCommand`)

| Subcommand | Description                                                         |
| ---------- | ------------------------------------------------------------------- |
| `list`     | Embed listing all profiles, with 📌 for active and 🔒 for locked    |
| `current`  | Plain text: active profile name                                     |
| `create`   | Snapshots current config into a new profile                         |
| `apply`    | Applies a saved profile (Standard uses `applyStandardProfile`)      |
| `export`   | Base64-encodes current config snapshot                              |
| `import`   | Decodes and previews an encoded config                              |
| `remove`   | Deletes a profile (locked profiles like Standard cannot be removed) |

#### Raid Command (`handleRaidCommand`)

| Subcommand | Description                            |
| ---------- | -------------------------------------- |
| `stage`    | Sets raid stage 0–3 via `setRaidStage` |
| `status`   | Shows current raid stage               |

#### Debug Command (`handleDebugCommand`)

Full system state embed:

- Profile, raid stage, member count, queue length, uptime
- Module table: name, weight/critical/enabled (regex shows weight range, user_profile shows tiers)
- Thresholds: tier → pressure/action/delete-seconds
- Regex rules: identifier, weight, critical
- Active pressure scores: user mentions, pressure, seconds since update

### 4.3 Guild Member Add (`src/events/guildMemberAdd.js`)

Fires when a new member joins a guild:

1. Skips bot users
2. Checks if `user_profile` module is enabled for the guild
3. If enabled, calls `auditProfile(member)`
4. If profile has reasons (young account, no avatar), enqueues a flag telemetry entry

### 4.4 Modal Submit (`src/events/modalSubmit.js`)

Handles regex modal submissions.

#### Create Modal (`customId: "regex_create_modal"`)

Fields: `rule_identifier` (short text), `pattern` (paragraph), `threat_weight` (short text, optional)

1. Validates both identifier and pattern are present
2. Tests pattern with `new RegExp(pattern)` — rejects invalid regex
3. Upserts into RegexRules (insert or update on conflict)

#### Edit Modal (`customId: "regex_edit_modal_<identifier>"`)

Fields: `pattern` (paragraph, pre-filled), `threat_weight` (short text, pre-filled), `is_critical` (short text: "yes"/"no", pre-filled)

1. Extracts identifier from customId suffix
2. Validates pattern present and valid regex
3. Updates the existing rule (pattern, threat_weight, is_critical)

---

## 5. Modules

### 5.1 Velocity Bucket (`src/modules/velocityBucket.js`)

Token-bucket rate limiter. Each user (per guild) has a token bucket. Tokents refill at 1/second up to a capacity of 20.

#### Constants

| Constant                     | Value | Description                                 |
| ---------------------------- | ----- | ------------------------------------------- |
| `DEFAULT_BUCKET_CAPACITY`    | 20    | Max tokens per bucket                       |
| `DEFAULT_REFILL_RATE`        | 1     | Tokens added per refill cycle               |
| `DEFAULT_REFILL_INTERVAL_MS` | 1000  | Refill cycle interval                       |
| `TOKEN_COST_PER_ACTION`      | 1     | Tokens consumed per message                 |
| `EXCEED_PRESSURE`            | 5     | Pressure applied when bucket empty          |
| `MULTI_CHANNEL_PRESSURE`     | 30    | Pressure for multi-channel rapid-fire       |
| `MULTI_CHANNEL_WINDOW_MS`    | 10000 | Lookback window for multi-channel detection |
| `MULTI_CHANNEL_THRESHOLD`    | 3     | Number of channels in window to trigger     |

#### Data Structures

```js
// buckets: Map<"guildId:userId", { tokens: number, lastRefill: number }>
const buckets = new Map();

// channelActivity: Map<"guild:user", Map<channelId: string, lastSeen: timestamp>>
const channelActivity = new Map();
```

#### `consumeToken(guildId, userId, channelId)`

1. Gets or creates bucket (initial tokens = capacity)
2. Applies pending refills based on elapsed time
3. Tracks channel activity — counts active channels in 10s window
4. If ≥3 channels active → returns `{ exceeded: true, pressure: 30, multiChannel: true }`
5. If tokens are insufficient → returns `{ exceeded: true, pressure: 5, multiChannel: false }`
6. Otherwise: consumes 1 token, returns `{ exceeded: false, pressure: 0, remaining: tokens }`

#### Timer

`startRefillTimer()` — 1-second interval, refills all buckets by 1 token, removes buckets that reach capacity.  
`stopRefillTimer()` — Clears interval.  
Both timers are unreffed.

#### Test Helpers

`resetBucket(guildId, userId)` — Clears bucket and channel activity for a user.  
`resetAllBuckets()` — Clears all state, stops timer (used by tests).

### 5.2 Regex Sandbox (`src/modules/regexSandbox.js` + `regexWorker.js`)

Evaluates regex patterns against message content inside a **Worker thread** for safety. Prevents ReDoS attacks and regex exploits.

#### `evaluateRegex(pattern, content, options)`

1. **Guard clause:** If content is empty, immediately returns `{ matched: false }` — no worker spawned
2. Creates a Worker from `regexWorker.js` with `{ pattern, content }` as `workerData`
3. Sets a timeout (default 2000ms) — if worker does not respond in time, terminates it and returns `{ matched: false, error: "Regex evaluation timed out" }`
4. On worker `message` → resolves with `{ matched: result.matched }`
5. On worker `error` → resolves with `{ matched: true, fastTrack: true, error: err.message }` (conservative: treat error as match)
6. On worker `exit` with non-zero code → resolves similarly

#### Worker (`regexWorker.js`)

Receives `workerData.pattern` and `workerData.content`, creates `new RegExp(pattern, "gi")`, tests `regex.test(content)`, posts result back to parent. If the regex throws (invalid pattern, catastrophic backtracking), catches and posts `{ matched: true, fastTrack: true }`.

### 5.3 Honeypot Trap (`src/modules/honeypotTrap.js`)

Triggers a fast-track ban when a non-admin user sends a message in a designated honeypot channel.

#### `checkHoneypot(message, db)`

1. Queries `GuildConfiguration` for `honeypot_channel_id`
2. If no honeypot configured → `{ triggered: false }`
3. If message channel is not the honeypot channel → `{ triggered: false }`
4. If author has Administrator permission → `{ triggered: true, whitelisted: true }` (bypass)
5. Otherwise → `{ triggered: true, whitelisted: false }`

The caller (messageCreate.js) only acts on `triggered && !whitelisted`.

### 5.4 User Profile (`src/modules/userProfile.js`)

Audits a GuildMember's account age and avatar status to produce a pressure multiplier and human-readable reasons.

#### `auditProfile(member)`

Checks two conditions:

- **Account age:** `createdTimestamp < 7 days` → reason: "account too young (X.X days < 7 days)"
- **Avatar:** `member.user.avatar === null` → reason: "no avatar set"

**Multiplier tiers:**

| Condition                        | Multiplier |
| -------------------------------- | ---------- |
| Normal (has avatar, ≥7 days old) | 1.0x       |
| No avatar only                   | 1.2x       |
| Young account only               | 1.5x       |
| Both (young + no avatar)         | 2.0x       |

Returns `{ multiplier: number, reasons: string[] }`.

When `user_profile` module is enabled, velocity and regex weights are multiplied by the multiplier. Disabled → multiplier is forced to 1.0.

### 5.5 Raid Protection (`src/modules/raidProtection.js`)

Three-stage raid escalation system with automatic detection and manual override.

#### States

Raid state is stored in two places:

- **In-memory:** `Map<guildId, { stage, spikeCount, spikeWindowStart }>` — for fast access
- **Database:** `RaidState` table — persists stage and permission backup across restarts

#### Stage Definitions

| Stage            | Effect                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 (Inactive)     | All changes reverted                                                                                                                               |
| 1 (Slowmode 30m) | Backs up permissions, sets 1800s slowmode on all text channels                                                                                     |
| 2 (Slowmode 2h)  | If coming from 0, backs up permissions. Sets 7200s slowmode on all text channels                                                                   |
| 3 (Lockdown)     | Restores from backup, disables `SEND_MESSAGES` for @everyone on all text channels, creates `#raid-temp-channel` with send permissions for everyone |

#### `setRaidStage(guild, targetStage, db)`

1. No-op if current === target
2. Calls `executeStageTransition(guild, fromStage, toStage, db)`:
   - **0→1:** backupPermissions + setSlowmode(1800)
   - **0/1→2:** backupPermissions (if from 0) + setSlowmode(7200)
   - **any→3:** restoreFromBackup + disableEveryoneSend + ensureRaidChannel
   - **any→0:** revertAll (restoreFromBackup + clearSlowmode + delete temp channel + delete RaidState row)
3. Updates in-memory state
4. Persists to DB

#### Auto-Detection

`startRaidDetection()` — 30-second interval that monitors spike counts:

| Stage | Spike Threshold  | Escalates To |
| ----- | ---------------- | ------------ |
| 0     | 10 spikes in 60s | Stage 1      |
| 1     | 20 spikes in 60s | Stage 2      |
| 2     | 30 spikes in 60s | Stage 3      |

- Spikes are recorded via `recordSpike(guildId)` called from `messageCreate.js` whenever a sanction executes
- When a threshold is exceeded, `escalate()` is called internally (no permission checks)
- Window resets after 60s of inactivity

#### `recordSpike(guildId)`

Increments spike count for a guild, creating a new state entry if none exists.

#### Permission Backup/Restore

`backupPermissions(guild, db)`: Iterates all text channels, captures each channel's permission overwrites (id, type, allow bitfield, deny bitfield) plus `rateLimitPerUser`, stores as JSON in `RaidState.backup_json`.

`restoreFromBackup(guild, db)`: Parses backup JSON, iterates channels, resets `SendMessages` and `ViewChannel` overwrites to null (inherited) for each overwrite entry.

#### Helper Functions

| Function                      | Description                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `setSlowmode(guild, seconds)` | Sets slowmode on all text channels                                                   |
| `clearSlowmode(guild)`        | Resets slowmode to 0                                                                 |
| `disableEveryoneSend(guild)`  | Sets `SendMessages: false` for @everyone on all text channels                        |
| `ensureRaidChannel(guild)`    | Creates `#raid-temp-channel` if not exists (ViewChannel + SendMessages for everyone) |
| `revertAll(guild, db)`        | Restores permissions, clears slowmode, deletes temp channel, deletes RaidState row   |
| `getRaidStage(guildId)`       | Returns current stage from memory (default 0)                                        |

---

## 6. Commands

### 6.1 Configuration (`src/commands/configuration.js`)

Slash command builder: `/config` (Administrator permission required).

**Subcommand groups:** `modules`, `thresholds`, `regex`, `honeypot`, `logchannel`
**Direct subcommand:** `view`

Command structure:

```
/config modules toggle <module> <enabled>
/config modules weight <module> <value>
/config modules critical <module> <critical>
/config thresholds assign <tier> <pressure> [delete_seconds]
/config regex create
/config regex list
/config regex edit <identifier>
/config regex delete <identifier>
/config honeypot set <channel>
/config logchannel set <channel>
/config view
```

Module choices: `user_profile`, `velocity`, `honeypot`, `regex`  
Tier choices: 1 (warn), 2 (mute), 3 (kick), 4 (ban)

### 6.2 Appeals (`src/commands/appeals.js`)

Slash command builder: `/actions` (BanMembers permission required).

```
/actions appeal <message>
/actions rejoin <link>
/actions ban <user> [delete_past_hours]
/actions refresh
```

### 6.3 Profiles (`src/commands/profiles.js`)

Slash command builder: `/profiles` (Administrator permission required).

```
/profiles list
/profiles current
/profiles create <name>
/profiles apply <name>      (autocomplete)
/profiles export
/profiles import <encoded>
/profiles remove <name>     (autocomplete)
```

### 6.4 Raid (`src/commands/raid.js`)

Slash command builder: `/raid` (Administrator permission required).

```
/raid stage <0|1|2|3>
/raid status
```

Stage choices with descriptions:

- 0: Stage 0 — Inactive
- 1: Stage 1 — Slowmode 30m
- 2: Stage 2 — Slowmode 2h
- 3: Stage 3 — Lockdown

### 6.5 Debug (`src/commands/debug.js`)

Slash command builder: `/debug` (no permission restriction).

Returns a full system state embed showing modules, thresholds, regex rules, active pressure scores, raid state, telemetry queue length, uptime, and member count.

### 6.6 Language (`src/commands/language.js`)

Slash command builder: `/language` (Administrator permission required).

```
/language <language>
```

Language choices: `en` (English), `ja` (日本語). Persists the guild's language preference to the database. All subsequent embeds and telemetry use the selected language.

---

## 7. Utilities

### 7.1 CLOG (`src/utils/clog.js`)

A colored, timestamped console logging wrapper. Replaces direct `console.log`/`console.warn`/`console.error` calls throughout the codebase.

#### Usage

```js
clog(console.log, "message");
clog(console.warn, "warning: %s", detail);
clog(console.error, "error:", err);
```

#### Behavior

- Prepends timestamp: `YYYY-MM-DD HH:mm:ss.SSS [INFO] message`
- Timestamp respects `LOG_TIMEZONE` env var (default UTC), disabled if `LOG_WITH_TIME=false`
- Color coding: INFO=blue, WARN=yellow, ERROR=red (ANSI escape codes)
- All args forwarded to the original console function

### 7.2 Telemetry Queue (`src/utils/telemetryQueue.js`)

Batched embed logging system. Queues entries in memory and flushes every 5 seconds to each guild's configured log channel.

#### Queue Categories

| Category  | Content                                                  |
| --------- | -------------------------------------------------------- |
| `action`  | Sanctions executed (warn/mute/kick/ban)                  |
| `flag`    | User flags (profile audit on join/refresh, auto-refresh) |
| `command` | Command usage (not currently enqueued by any handler)    |

#### `startTelemetryFlusher(client)`

Starts a 5-second interval that:

1. Queries all guilds with `log_channel_id` set
2. For each guild: drains all queues, formats as `• **CATEGORY** message`
3. Sends as a Discord embed (title "EXIA Telemetry", timestamped)
4. Handles field limits: max 25 bullet points or 1024 characters per message, auto-chunks

#### `enqueue(category, message)`

Adds an entry to the named queue. Silently ignores invalid categories.

#### `getQueueLength()`

Returns total pending entries across all queues (used by /debug).

### 7.3 Query Cache (`src/utils/queryCache.js`)

TTL-based in-memory query cache for database reads. Reduces redundant SQLite queries on hot paths.

| Export              | Description                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `cachedGet(db, fn)` | Execute `fn(db)` and cache result by function identity + DB state |
| `cachedAll(db, fn)` | Same as `cachedGet` but for multi-row results                     |
| `invalidateCache()` | Clear all cached entries                                          |

- **Max entries:** 10,000 (oldest evicted via `evictIfNeeded()`)
- **TTL:** 5 minutes per entry
- Used by: `messageCreate.js` (module weights, thresholds), `interactionCreate.js` (guild config), `guildMemberAdd.js` (module weight check)

---

## 8. Communication Flow

### Message Processing Pipeline

```
Discord Gateway
    ↓
client.on(Events.MessageCreate)
    ↓
handleMessageCreate(message)
    ↓
1. Bootstrap: get/create guild config + module weights + thresholds
    ↓
2. honeypotTrap.checkHoneypot(message, db)
    ↓ triggered? → applyPressure(isCritical=true) → fastTrack=true
    ↓
3. userProfile.auditProfile(member) → { multiplier, reasons }
    ↓
4. velocityBucket.consumeToken(guildId, userId, channelId)
    ↓ exceeded? → weight *= multiplier → applyPressure
    ↓
5. regexSandbox.evaluateRegex(pattern, content) [worker thread]
    ↓ matched? → weight = rule.threat_weight * multiplier → applyPressure
    ↓
6. Collect profile.reasons into flagReasons
    ↓
7. highestAction.action exists?
    ├── Yes → executeSanction:
    │   ├── delete message
    │   ├── DM user with reason(s)
    │   ├── apply action (warn/mute/kick/ban)
    │   ├── recordSpike(guildId)
    │   └── enqueue(action, ...)
    └── No  → skip
    ↓
8. flagReasons.length > 0? → enqueue(flag, ...)
    ↓
Done. ← message handler returns
```

### Interaction Routing

```
Discord Gateway
    ↓
client.on(Events.InteractionCreate)
    ↓
handleInteractionCreate(interaction)
    ↓
isAutocomplete?
├── Yes → handleAutocomplete(interaction)
│   ├── profiles apply/remove → query ConfigProfiles → respond
│   └── config regex edit/delete → query RegexRules → respond
└── No → isChatInputCommand?
    ├── Yes → switch(interaction.commandName)
    │   ├── "config"    → handleConfigCommand(interaction, db)
    │   ├── "actions"   → handleActionsCommand(interaction, db)
    │   ├── "language"  → handleLanguageCommand(interaction, db)
    │   ├── "profiles"  → handleProfilesCommand(interaction, db)
    │   ├── "raid"      → handleRaidCommand(interaction, db)
    │   └── "debug"     → handleDebugCommand(interaction, db)
    └── No → ignore
```

### Raid Detection Flow

```
recordSpike(guildId) [called from executeSanction]
    ↓
raidState Map: increment spikeCount
    ↓
startRaidDetection() [30s interval]
    ↓
for each guild with stage < 3:
    ↓
    window expired (>60s)?
    ├── Yes → reset spikeCount to 0, reset windowStart
    └── No  → spikeCount ≥ threshold?
        ├── Yes → escalate(guildId, nextStage)
        │   ├── executeStageTransition (apply slowmode/lockdown)
        │   ├── updateMemoryState
        │   ├── persistRaidState to DB
        │   └── enqueue(action, "Raid auto-escalated...")
        └── No  → continue
```

---

## 9. Running the Application

### Prerequisites

- Node.js 26 + pnpm 11.12 (via corepack)
- Docker (optional, for containerized deployment)
- Discord bot token and client ID with intents: Guilds, GuildMessages, MessageContent, GuildMembers, GuildMessageReactions, GuildModeration

### Quick Start (Local)

```bash
cp .env.example .env
# Edit .env with your CLIENT_ID and TOKEN
pnpm install
pnpm dev
```

### Docker

```bash
docker compose up -d --build
```

The bot registers 6 slash commands globally on `ClientReady`. SQLite data persists in the `exia_data` named volume.

### Testing

```bash
pnpm test          # Run all tests
pnpm test:watch    # Watch mode
pnpm lint          # Prettier check + ESLint
```

Current test suites (110 tests total):

- `pressureEngine.test.js` — applyPressure, decay, mutex, fast-track, multi-guild isolation
- `velocityBucket.test.js` — token consumption, refill, multi-channel detection, auto-removal
- `regexSandbox.test.js` — pattern matching, empty content guard, timeout
- `honeypotTrap.test.js` — channel detection, admin whitelist, no-config case
- `userProfile.test.js` — multiplier tiers, reason generation
- `telemetryQueue.test.js` — enqueue, flush, chunking, field limits
- `locale.test.js` — translation, fallback, interpolation, guild language resolution
- `queryCache.test.js` — caching, eviction, invalidation
- `raidProtection.test.js` — stage transitions, auto-detection, permission backup/restore, spike window

### Shutdown

Graceful shutdown on `SIGINT`/`SIGTERM`: destroys Discord client, exits cleanly. Unhandled rejections and client errors are logged but do not crash the process.
