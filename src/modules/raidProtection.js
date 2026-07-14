import { PermissionFlagsBits, ChannelType } from "discord.js";
import { clog } from "../utils/clog.js";
import { enqueue } from "../utils/telemetryQueue.js";

const SPIKE_WINDOW_MS = 60_000;
const AUTO_ESCALATION = {
  0: { spikeThreshold: 10, nextStage: 1 },
  1: { spikeThreshold: 20, nextStage: 2 },
  2: { spikeThreshold: 30, nextStage: 3 },
};

const raidState = new Map();

let autoDetectionInterval = null;

export function startRaidDetection() {
  if (autoDetectionInterval) {
    clog(
      console.log,
      `[src/modules/raidProtection.js] Auto-detection timer already running, skipping`,
    );
    return;
  }

  autoDetectionInterval = setInterval(() => {
    const now = Date.now();
    let escalated = 0;
    for (const [guildId, state] of raidState.entries()) {
      if (state.stage >= 3) {
        continue;
      }

      const elapsed = now - state.spikeWindowStart;
      if (elapsed > SPIKE_WINDOW_MS) {
        clog(
          console.log,
          `[src/modules/raidProtection.js] Detection: guild ${guildId} window expired (${elapsed}ms > ${SPIKE_WINDOW_MS}ms), resetting spike count from ${state.spikeCount} to 0`,
        );
        state.spikeCount = 0;
        state.spikeWindowStart = now;
        continue;
      }

      const rule = AUTO_ESCALATION[state.stage];
      clog(
        console.log,
        `[src/modules/raidProtection.js] Detection: guild ${guildId} stage=${state.stage}, spikes=${state.spikeCount}, threshold=${rule?.spikeThreshold || "N/A"}, elapsed=${elapsed}ms`,
      );
      if (rule && state.spikeCount >= rule.spikeThreshold) {
        clog(
          console.warn,
          `[src/modules/raidProtection.js] AUTO-ESCALATION: guild ${guildId} stage ${state.stage} → ${rule.nextStage} (${state.spikeCount} spikes ≥ ${rule.spikeThreshold} threshold)`,
        );
        escalated++;
        escalate(guildId, rule.nextStage);
      }
    }
    if (escalated === 0) {
      clog(
        console.log,
        `[src/modules/raidProtection.js] Detection cycle: ${raidState.size} guilds checked, no escalation needed`,
      );
    }
  }, 30_000);

  if (
    autoDetectionInterval &&
    typeof autoDetectionInterval.unref === "function"
  ) {
    autoDetectionInterval.unref();
  }
  clog(
    console.log,
    `[src/modules/raidProtection.js] Auto-detection timer started (${30_000}ms interval)`,
  );
}

/**
 * Records a pressure spike for raid detection.
 * @param {string} guildId
 */
export function recordSpike(guildId) {
  let state = raidState.get(guildId);
  if (!state) {
    state = { stage: 0, spikeCount: 0, spikeWindowStart: Date.now() };
    raidState.set(guildId, state);
    clog(
      console.log,
      `[src/modules/raidProtection.js] First spike recorded for guild ${guildId} — new raid state initialized`,
    );
  }
  state.spikeCount++;
  clog(
    console.log,
    `[src/modules/raidProtection.js] Spike recorded for guild ${guildId} — total: ${state.spikeCount} in current window`,
  );
}

/**
 * Gets the current raid stage for a guild.
 * @param {string} guildId
 * @returns {number}
 */
export function getRaidStage(guildId) {
  return raidState.get(guildId)?.stage ?? 0;
}

/**
 * Sets the raid stage for a guild (manual override).
 * @param {import('discord.js').Guild} guild
 * @param {number} targetStage
 * @param {import('better-sqlite3').Database} db
 * @returns {Promise<boolean>} Whether the operation succeeded
 */
export async function setRaidStage(guild, targetStage, db) {
  const current = getRaidStage(guild.id);

  if (current === targetStage) {
    return true;
  }

  try {
    await executeStageTransition(guild, current, targetStage, db);
    updateMemoryState(guild.id, targetStage);
    persistRaidState(db, guild.id, targetStage);

    clog(
      console.log,
      `[src/modules/raidProtection.js] Stage changed: ${current} → ${targetStage} for guild ${guild.id} (${guild.name})`,
    );
    enqueue("action", `Raid stage changed: ${current} → ${targetStage}`);
    return true;
  } catch (err) {
    clog(console.error, `[RAID] Stage transition failed:`, err);
    return false;
  }
}

/**
 * Executes the transition actions between stages.
 * @param {import('discord.js').Guild} guild
 * @param {number} fromStage
 * @param {number} toStage
 * @param {import('better-sqlite3').Database} db
 */
async function executeStageTransition(guild, fromStage, toStage, db) {
  if (toStage === 0) {
    await revertAll(guild, db);
    return;
  }

  if (toStage === 1 && fromStage === 0) {
    await backupPermissions(guild, db);
    await setSlowmode(guild, 1800);
    return;
  }

  if (toStage === 2 && (fromStage === 0 || fromStage === 1)) {
    if (fromStage === 0) {
      await backupPermissions(guild, db);
    }
    await setSlowmode(guild, 7200);
    return;
  }

  if (toStage === 3) {
    await restoreFromBackup(guild, db);
    await disableEveryoneSend(guild);
    await ensureRaidChannel(guild);
    return;
  }
}

/**
 * Stage 0: Revert all changes.
 */
async function revertAll(guild, db) {
  await restoreFromBackup(guild, db);
  await clearSlowmode(guild);

  const existing = guild.channels.cache.find(
    (c) => c.name === "raid-temp-channel" && c.type === ChannelType.GuildText,
  );
  if (existing) {
    try {
      await existing.delete("Raid mode ended");
    } catch {
      // ignore
    }
  }

  db.prepare("DELETE FROM RaidState WHERE guild_id = ?").run(guild.id);
}

/**
 * Stage 1 & 2: Set slowmode on all text channels.
 * @param {import('discord.js').Guild} guild
 * @param {number} seconds
 */
async function setSlowmode(guild, seconds) {
  const channels = guild.channels.cache.filter(
    (c) => c.isTextBased() && c.type === ChannelType.GuildText,
  );

  const promises = [];
  for (const [, channel] of channels) {
    promises.push(
      channel
        .edit({ rateLimitPerUser: seconds, reason: "EXIA raid protection" })
        .catch(() => {}),
    );
  }
  await Promise.allSettled(promises);
}

/**
 * Clears slowmode on all channels.
 */
async function clearSlowmode(guild) {
  const channels = guild.channels.cache.filter(
    (c) => c.isTextBased() && c.type === ChannelType.GuildText,
  );
  const promises = [];
  for (const [, channel] of channels) {
    promises.push(
      channel
        .edit({ rateLimitPerUser: 0, reason: "EXIA raid protection ended" })
        .catch(() => {}),
    );
  }
  await Promise.allSettled(promises);
}

/**
 * Stage 3: Disable SEND_MESSAGES for @everyone in all text channels.
 */
async function disableEveryoneSend(guild) {
  const everyone = guild.roles.everyone;
  const channels = guild.channels.cache.filter(
    (c) => c.isTextBased() && c.type === ChannelType.GuildText,
  );

  const promises = [];
  for (const [, channel] of channels) {
    promises.push(
      channel.permissionOverwrites
        .edit(
          everyone,
          { SendMessages: false },
          { reason: "EXIA raid lockdown" },
        )
        .catch(() => {}),
    );
  }
  await Promise.allSettled(promises);
}

/**
 * Stage 3: Create or ensure the raid temp channel exists.
 */
async function ensureRaidChannel(guild) {
  const existing = guild.channels.cache.find(
    (c) => c.name === "raid-temp-channel" && c.type === ChannelType.GuildText,
  );
  if (existing) {
    return;
  }

  try {
    await guild.channels.create({
      name: "raid-temp-channel",
      type: ChannelType.GuildText,
      reason: "EXIA raid lockdown",
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
      ],
    });
  } catch {
    // ignore
  }
}

/**
 * Backs up all channel permission overwrites to the database.
 */
async function backupPermissions(guild, db) {
  const backup = [];

  for (const [, channel] of guild.channels.cache) {
    if (!channel.isTextBased() && channel.type !== ChannelType.GuildText) {
      continue;
    }

    const overwrites = [];
    for (const [, overwrite] of channel.permissionOverwrites.cache) {
      overwrites.push({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
      });
    }

    backup.push({
      channelId: channel.id,
      channelName: channel.name,
      rateLimitPerUser: channel.rateLimitPerUser,
      overwrites,
    });
  }

  db.prepare(
    `INSERT INTO RaidState (guild_id, stage, backup_json, started_at)
     VALUES (?, 0, ?, datetime('now'))
     ON CONFLICT(guild_id) DO UPDATE SET backup_json = ?`,
  ).run(guild.id, JSON.stringify(backup), JSON.stringify(backup));
}

/**
 * Restores channel permission overwrites from the backup.
 */
async function restoreFromBackup(guild, db) {
  const row = db
    .prepare("SELECT backup_json FROM RaidState WHERE guild_id = ?")
    .get(guild.id);

  if (!row?.backup_json) {
    return;
  }

  /** @type {Array} */
  const backup = JSON.parse(row.backup_json);

  for (const entry of backup) {
    const channel = guild.channels.cache.get(entry.channelId);
    if (!channel) {
      continue;
    }

    try {
      for (const ow of entry.overwrites) {
        await channel.permissionOverwrites
          .edit(ow.id, {
            SendMessages: null,
            ViewChannel: null,
          })
          .catch(() => {});
      }
    } catch {
      // skip
    }
  }
}

/**
 * Escalates to a higher stage (internal, no permission checks).
 */
async function escalate(guildId, targetStage) {
  const { getDatabase } = await import("../core/database.js");
  const { client } = await import("../index.js");

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return;
  }

  const db = getDatabase();
  await executeStageTransition(
    guild,
    raidState.get(guildId)?.stage ?? 0,
    targetStage,
    db,
  );
  updateMemoryState(guildId, targetStage);
  persistRaidState(db, guildId, targetStage);

  enqueue("action", `Raid auto-escalated to stage ${targetStage}`);
  clog(
    console.log,
    `[src/modules/raidProtection.js] escalate() complete — guild ${guildId} now at stage ${targetStage}`,
  );
}

function updateMemoryState(guildId, stage) {
  const state = raidState.get(guildId) || {
    spikeCount: 0,
    spikeWindowStart: Date.now(),
  };
  state.stage = stage;
  state.spikeCount = 0;
  state.spikeWindowStart = Date.now();
  raidState.set(guildId, state);
}

function persistRaidState(db, guildId, stage) {
  db.prepare(
    `INSERT INTO RaidState (guild_id, stage, started_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(guild_id) DO UPDATE SET stage = ?, started_at = datetime('now')`,
  ).run(guildId, stage, stage);
}
