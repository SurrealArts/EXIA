![version](https://img.shields.io/badge/version-1.1.0-blue)

> **🌐 Language:** [English](README.md) · [日本語](README.ja.md)  
> **📄 Documentation:** [English](DOCUMENTATION.md) · [日本語](DOCUMENTATION.ja.md)  
> **📋 Changelog:** [English](CHANGELOG.md) · [日本語](CHANGELOG.ja.md)

# EXIA: Discord Moderation Bot

EXIA is a modular auto-moderation bot for Discord, built with **Node.js 26** and **Discord.js v14**. It uses a weighted pressure system to escalate sanctions (warn → mute → kick → ban) based on configurable threat detection modules, all backed by a persistent SQLite database. This project inherits and takes inspiration from existing anti-spam and moderation methods. Many thanks to [User319183/Discord-Anti-Spam-Bot](https://github.com/User319183/Discord-Anti-Spam-Bot), [Michael-J-Scofield/discord-anti-spam](https://github.com/Michael-J-Scofield/discord-anti-spam), and [Elaina69/Auto-Ban](https://github.com/Elaina69/Auto-Ban).

AI Disclaimer Notice:
Unit tests, comments, documentation, readme, and changelog files are created by Generative AI, improved from human-written notes. Code is written by myself (human), which is reviewed and improved upon by Generative AI. Translations are obtained via DeepL Translator.

Personal notes at the end of the README file.

---

## Features

- **i18n / Multi-Language:** Built-in locale system with per-guild language selection via `/language`; Japanese and English supported
- **Raid Protection:** Automatic escalation (3 stages) based on sanction spike thresholds; manual override via `/raid`
- **Pressure System:** Per-user/guild in-memory pressure scores with 60-second decay cycle; fast-track (instant ban) on critical module triggers
- **Configuration Profiles:** Snapshot, restore, export, and import full guild configs — Standard profile applied automatically on first use
- **Telemetry Queue:** Batched embed logging to a configurable channel, grouped by action/flag/command categories
- **Sanctions via DM:** Users receive a direct message explaining the reason before any warn, mute, kick, or ban

---

## Threat Detection Modules

Each module contributes pressure to the system based on its configuration. As more modules are added, they will be appended here too.

### Velocity Bucket

Token-bucket rate limiter. Tracks message frequency per user and detects rapid-fire multi-channel spam. Applies pressure when the message rate exceeds the bucket capacity.

### Regex Sandbox

Evaluates message content against custom regex patterns inside a Worker thread (ReDoS-safe). Matches configurable rules such as invite URLs, blacklisted terms, or other pattern-based content.

### Honeypot Trap

Designates a restricted channel; any non-admin who sends a message there triggers an instant ban via the pressure system's fast-track mechanism.

### User Profile

Audits a user's account age and avatar status. Produces a multiplier (1.0x - 2.0x) that amplifies pressure from other modules when the account is young, has no avatar, or both.

### Mention Guard

Detects @everyone, @here, and role mentions from non-moderator users. Applies a dynamic multiplier (3.0x - 5.0x) that escalates on repeat offenses and decays when the user sends clean messages. Exempts users with Manage Messages permission.

---

## Deployment

### Prerequisites

- **Node.js 26** (for local dev) or **Docker** (for containerized deployment)
- A **Discord bot token** and **client ID** from the [Discord Developer Portal](https://discord.com/developers/applications) with the following intents enabled:
  - `Presence Intent`, `Server Members Intent`, `Message Content Intent`
- **Bot permissions:** Use the [Discord Permission Calculator](https://discordapi.com/permissions.html) with the following required default permissions, or invite the bot with permission integer `274878000150`:
  - `View Channels`, `Manage Channels`, `KickMembers`, `BanMembers`,
  - `Send Messages`, `Send Messages in Threads`, `EmbedLinks`, `Manage Messages`, `Read Message History`

### 1. Environment Setup

Create a `.env` file from `.env.example`:

```env
CLIENT_ID=your_client_id
TOKEN=your_bot_token
VERSION=1.1.0

LOG_WITH_TIME=true
LOG_TIMEZONE=UTC
```

### 2. Docker Deployment

```bash
docker compose up -d --build
```

The bot registers 6 slash commands globally on startup:

- `/config` — Manage modules, thresholds, regex rules, honeypot, log channel, and view config
- `/actions` — Appeal/rejoin links, manual ban, refresh member scan
- `/language` — Set the guild's preferred language
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

# Personal Notes

I've been worried for some time about using multiple different discord bots that each have their own issues catching certain cases. I created this project to merge these as an attempt to 'universalize' these methods into one bot, but it seems more like an amalgamation to me the more I think about scaling up. That's why I loosely categorize these methods as "modules". But more into consideration of another inspiration: I have created a "weighted notification system" that's a set of protocols and weighted decision making. This project takes architectural inspiration from that. In the future, I will put a dedicated section to make entries of repositories that contributed to some ideas of some methods I've come up with.

Oh, and also... I made this architecture unique from the open-source discord bot template I've been doing for quite a while. I know I'm not known to update on past projects, but this is a start for what I may be able to return back to easily, especially with the extreme verbose-ness I've added to this code when it runs.

# License

MIT License — see [LICENSE](./LICENSE) for details.
