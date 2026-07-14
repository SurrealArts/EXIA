![version](https://img.shields.io/badge/version-1.0.0-blue)

# EXIA: Discord Moderation Bot

EXIA is a modular auto-moderation bot for Discord, built with **Node.js 22** and **Discord.js v14**. It uses a weighted pressure system to escalate sanctions (warn → mute → kick → ban) based on configurable threat detection modules, all backed by a persistent SQLite database.

---

## Features

- **Modular Threat Detection:** Four modules — User Profile (account age/avatar checks with multiplier), Velocity (token-bucket rate limiting), Honeypot Trap (fast-track ban channel), Regex Sandbox (configurable pattern matching via worker threads)
- **Raid Protection:** Automatic escalation (3 stages) based on sanction spike thresholds; manual override via `/raid`
- **Pressure System:** Per-user/guild in-memory pressure scores with 60-second decay cycle; fast-track (instant ban) on critical module triggers
- **Configuration Profiles:** Snapshot, restore, export, and import full guild configs — Standard profile applied automatically on first use
- **Telemetry Queue:** Batched embed logging to a configurable channel, grouped by action/flag/command categories
- **Sanction DMs:** Users receive a direct message explaining the reason before any warn, mute, kick, or ban
- **Modular Architecture:** Adding a new module requires changes to exactly 6 files (module, event, index, configuration.js choices, allModuleNames, database.js)

---

## Deployment

### Prerequisites

- **Node.js 22** (for local dev) or **Docker** (for containerized deployment)
- A **Discord bot token** and **client ID** from the [Discord Developer Portal](https://discord.com/developers/applications) with the following intents enabled:
  - `GUILDS`, `GUILD_MESSAGES`, `MESSAGE_CONTENT`, `GUILD_MEMBERS`, `GUILD_MESSAGE_REACTIONS`, `GUILD_MODERATION`

### 1. Environment Setup

Create a `.env` file from `.env.example`:

```env
CLIENT_ID=your_client_id
TOKEN=your_bot_token
VERSION=1.0.0

LOG_WITH_TIME=true
LOG_TIMEZONE=UTC
```

### 2. Docker Deployment

```bash
docker compose up -d --build
```

The bot registers 5 slash commands globally on startup:
- `/config` — Manage modules, thresholds, regex rules, honeypot, log channel, and view config
- `/actions` — Appeal/rejoin links, manual ban, refresh member scan
- `/profiles` — Create, list, apply, export, import, and remove config profiles (Standard locked)
- `/raid` — Set raid stage (0–3), check current status
- `/debug` — Full system state: modules, thresholds, active pressure scores, telemetry queue

SQLite data persists in a named Docker volume (`exia_data`).

### 3. Local Development

```bash
pnpm install
pnpm run dev
```

Graceful shutdown on `SIGINT`/`SIGTERM` with proper client destruction.

---

## Data

All data is stored in `data/exia.db` (SQLite, WAL mode). WAL files (`.db-wal`) contain the latest writes — standard SQLite viewers must merge WAL to show current state.

## License

Copyright (C) 2026 Bovination Productions, MIT License.
