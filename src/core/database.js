import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { clog } from "../utils/clog.js";

const LOG_TAG = "[src/core/database.js]";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const dbPath = path.join(DATA_DIR, "exia.db");

/** @type {Database.Database} */
let db;

export function initDatabase() {
  if (db) {
    return db;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  createTables();
  runMigrations();

  clog(console.log, `${LOG_TAG} Database initialized at ` + dbPath);
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS GuildConfiguration (
      guild_id TEXT PRIMARY KEY,
      log_channel_id TEXT,
      appeal_link TEXT,
      rejoin_link TEXT,
      honeypot_channel_id TEXT,
      active_profile TEXT DEFAULT 'Standard',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ModuleWeights (
      guild_id TEXT NOT NULL,
      module_name TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 0,
      is_critical INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, module_name)
    );

    CREATE TABLE IF NOT EXISTS ThresholdActions (
      guild_id TEXT NOT NULL,
      pressure_tier INTEGER NOT NULL,
      action TEXT NOT NULL,
      message_delete_seconds INTEGER DEFAULT 120,
      pressure INTEGER NOT NULL DEFAULT 25,
      PRIMARY KEY (guild_id, pressure_tier)
    );

    CREATE TABLE IF NOT EXISTS RegexRules (
      guild_id TEXT NOT NULL,
      rule_identifier TEXT NOT NULL,
      pattern TEXT NOT NULL,
      threat_weight INTEGER NOT NULL DEFAULT 10,
      is_critical INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, rule_identifier)
    );

    CREATE TABLE IF NOT EXISTS ConfigProfiles (
      guild_id TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      profile_data TEXT NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, profile_name)
    );

    CREATE TABLE IF NOT EXISTS RaidState (
      guild_id TEXT PRIMARY KEY,
      stage INTEGER NOT NULL DEFAULT 0,
      backup_json TEXT,
      started_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_module_weights_guild ON ModuleWeights(guild_id);
    CREATE INDEX IF NOT EXISTS idx_threshold_tier ON ThresholdActions(pressure_tier);
    CREATE INDEX IF NOT EXISTS idx_regex_rules_guild ON RegexRules(guild_id);
  `);
}

/**
 * Applies incremental schema migrations for databases created before schema changes.
 */
function runMigrations() {
  const gcColumns = db
    .prepare("PRAGMA table_info(GuildConfiguration)")
    .all()
    .map((c) => c.name);

  if (!gcColumns.includes("active_profile")) {
    db.exec("ALTER TABLE GuildConfiguration ADD COLUMN active_profile TEXT DEFAULT 'Standard'");
    clog(
      console.log,
      `${LOG_TAG} Migration (v1): added active_profile column to GuildConfiguration`,
    );
  } else {
    clog(console.log, `${LOG_TAG} Migration (v1): active_profile column already exists, skipping`);
  }

  const taColumns = db
    .prepare("PRAGMA table_info(ThresholdActions)")
    .all()
    .map((c) => c.name);

  if (!taColumns.includes("pressure")) {
    db.exec("ALTER TABLE ThresholdActions ADD COLUMN pressure INTEGER NOT NULL DEFAULT 25");
    clog(console.log, `${LOG_TAG} Migration (v2): added pressure column to ThresholdActions`);
  } else {
    clog(console.log, `${LOG_TAG} Migration (v2): pressure column already exists, skipping`);
  }

  if (!gcColumns.includes("language")) {
    db.exec("ALTER TABLE GuildConfiguration ADD COLUMN language TEXT DEFAULT 'en'");
    clog(console.log, `${LOG_TAG} Migration (v4): added language column to GuildConfiguration`);
  } else {
    clog(console.log, `${LOG_TAG} Migration (v4): language column already exists, skipping`);
  }

  const profiles = db
    .prepare(
      "SELECT guild_id, profile_name, profile_data FROM ConfigProfiles WHERE profile_name = 'Standard'",
    )
    .all();

  for (const row of profiles) {
    try {
      const data = JSON.parse(row.profile_data);
      let changed = false;

      if (data.modules && data.modules.length > 0 && data.modules[0].name !== undefined) {
        data.modules = data.modules.map((m) => ({
          module_name: m.name,
          weight: m.weight,
          is_critical: m.critical ?? 0,
          is_enabled: m.enabled ?? 1,
        }));
        changed = true;
      }

      if (data.thresholds && data.thresholds.length > 0 && data.thresholds[0].tier !== undefined) {
        data.thresholds = data.thresholds.map((t) => ({
          pressure_tier: t.tier,
          action: t.action,
          message_delete_seconds: t.deleteSec ?? 120,
          pressure: t.pressure ?? 25,
        }));
        changed = true;
      }

      if (!data.regex || !data.regex.some((r) => r.rule_identifier === "Anti-invites")) {
        const antiInvites = {
          rule_identifier: "Anti-invites",
          pattern:
            "(?:(?:https?:\\/\\/)?(?:www\\.)?discord(?:app)?\\.(?:(?:com|gg)\\/invite\\/[a-zA-Z0-9-_]+)|(?:https?:\\/\\/)?(?:www\\.)?discord\\.gg\\/[a-zA-Z0-9-_]+)",
          threat_weight: 50,
          is_critical: 0,
        };
        data.regex = [...(data.regex || []), antiInvites];
        changed = true;
      }

      delete data.guildConfig;

      if (changed) {
        db.prepare(
          "UPDATE ConfigProfiles SET profile_data = ? WHERE guild_id = ? AND profile_name = ?",
        ).run(JSON.stringify(data), row.guild_id, row.profile_name);
        clog(
          console.log,
          `${LOG_TAG} Migration (v3): migrated Standard profile JSON for guild ${row.guild_id} — normalized keys, added Anti-invites regex, removed guildConfig`,
        );
      }
    } catch (e) {
      clog(
        console.warn,
        `${LOG_TAG} Migration (v3): skipped malformed Standard profile JSON for guild ${row.guild_id}: ${e.message}`,
      );
    }
  }

  if (profiles.length === 0) {
    clog(console.log, `${LOG_TAG} Migration (v3): no Standard profiles to migrate`);
  }
}

/**
 * Creates the Standard profile for a specific guild.
 * Called when a guild first uses the bot.
 * @param {string} guildId
 */
export function ensureStandardProfile(guildId) {
  const existing = db
    .prepare(
      "SELECT profile_name FROM ConfigProfiles WHERE guild_id = ? AND profile_name = 'Standard'",
    )
    .get(guildId);

  if (existing) {
    return;
  }

  const modules = [
    { module_name: "user_profile", weight: 15, is_critical: 0, is_enabled: 1 },
    { module_name: "velocity", weight: 10, is_critical: 0, is_enabled: 1 },
    { module_name: "honeypot", weight: 0, is_critical: 1, is_enabled: 1 },
    { module_name: "regex", weight: 10, is_critical: 0, is_enabled: 1 },
  ];

  const thresholds = [
    {
      pressure_tier: 1,
      action: "warn",
      message_delete_seconds: 120,
      pressure: 25,
    },
    {
      pressure_tier: 2,
      action: "mute",
      message_delete_seconds: 120,
      pressure: 50,
    },
    {
      pressure_tier: 3,
      action: "kick",
      message_delete_seconds: 5,
      pressure: 75,
    },
    {
      pressure_tier: 4,
      action: "ban",
      message_delete_seconds: 0,
      pressure: 100,
    },
  ];

  const regexRules = [
    {
      rule_identifier: "Anti-invites",
      pattern:
        "(?:(?:https?:\\/\\/)?(?:www\\.)?discord(?:app)?\\.(?:(?:com|gg)\\/invite\\/[a-zA-Z0-9-_]+)|(?:https?:\\/\\/)?(?:www\\.)?discord\\.gg\\/[a-zA-Z0-9-_]+)",
      threat_weight: 50,
      is_critical: 0,
    },
  ];

  const profileData = JSON.stringify({
    modules,
    thresholds,
    regex: regexRules,
  });

  db.prepare(
    "INSERT INTO ConfigProfiles (guild_id, profile_name, profile_data, is_locked) VALUES (?, 'Standard', ?, 1)",
  ).run(guildId, profileData);

  clog(
    console.log,
    `${LOG_TAG} Standard profile seeded for guild ${guildId} — 4 modules, 4 thresholds, 1 regex rule (Anti-invites)`,
  );
}

/**
 * Applies the Standard profile to a guild's active configuration tables.
 * Called on first guild message so the bot works without manual setup.
 * @param {string} guildId
 */
export function applyStandardProfile(guildId) {
  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO GuildConfiguration (guild_id, active_profile) VALUES (?, 'Standard')`,
    ).run(guildId);

    db.prepare("DELETE FROM ModuleWeights WHERE guild_id = ?").run(guildId);
    const insMod = db.prepare(
      "INSERT INTO ModuleWeights (guild_id, module_name, weight, is_critical, is_enabled) VALUES (?, ?, ?, ?, ?)",
    );
    const mods = [
      {
        module_name: "user_profile",
        weight: 15,
        is_critical: 0,
        is_enabled: 1,
      },
      { module_name: "velocity", weight: 10, is_critical: 0, is_enabled: 1 },
      { module_name: "honeypot", weight: 0, is_critical: 1, is_enabled: 1 },
      { module_name: "regex", weight: 10, is_critical: 0, is_enabled: 1 },
    ];
    for (const m of mods) {
      insMod.run(guildId, m.module_name, m.weight, m.is_critical, m.is_enabled);
    }

    db.prepare("DELETE FROM ThresholdActions WHERE guild_id = ?").run(guildId);
    const insThr = db.prepare(
      "INSERT INTO ThresholdActions (guild_id, pressure_tier, action, message_delete_seconds, pressure) VALUES (?, ?, ?, ?, ?)",
    );
    const thresholds = [
      {
        pressure_tier: 1,
        action: "warn",
        message_delete_seconds: 120,
        pressure: 25,
      },
      {
        pressure_tier: 2,
        action: "mute",
        message_delete_seconds: 120,
        pressure: 50,
      },
      {
        pressure_tier: 3,
        action: "kick",
        message_delete_seconds: 5,
        pressure: 75,
      },
      {
        pressure_tier: 4,
        action: "ban",
        message_delete_seconds: 0,
        pressure: 100,
      },
    ];
    for (const t of thresholds) {
      insThr.run(guildId, t.pressure_tier, t.action, t.message_delete_seconds, t.pressure);
    }

    db.prepare("DELETE FROM RegexRules WHERE guild_id = ?").run(guildId);
    const insRegex = db.prepare(
      "INSERT INTO RegexRules (guild_id, rule_identifier, pattern, threat_weight, is_critical) VALUES (?, ?, ?, ?, ?)",
    );
    insRegex.run(
      guildId,
      "Anti-invites",
      "(?:(?:https?:\\/\\/)?(?:www\\.)?discord(?:app)?\\.(?:(?:com|gg)\\/invite\\/[a-zA-Z0-9-_]+)|(?:https?:\\/\\/)?(?:www\\.)?discord\\.gg\\/[a-zA-Z0-9-_]+)",
      50,
      0,
    );
  });

  transaction();
  ensureStandardProfile(guildId);
  clog(
    console.log,
    `${LOG_TAG} Standard profile applied for guild ${guildId} — modules/thresholds/regex written to active tables`,
  );
}

export function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}
