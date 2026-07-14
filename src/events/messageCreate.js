import { getDatabase, applyStandardProfile } from "../core/database.js";
import {
  applyPressure,
  acquireMutex,
  releaseMutex,
} from "../core/pressureEngine.js";
import { consumeToken } from "../modules/velocityBucket.js";
import { checkHoneypot } from "../modules/honeypotTrap.js";
import { evaluateRegex } from "../modules/regexSandbox.js";
import { auditProfile } from "../modules/userProfile.js";
import { recordSpike } from "../modules/raidProtection.js";
import { enqueue } from "../utils/telemetryQueue.js";
import { clog } from "../utils/clog.js";

/**
 * @param {import('discord.js').Message} message
 */
export default async function handleMessageCreate(message) {
  if (message.author.bot) {
    return;
  }
  if (!message.guild) {
    return;
  }

  const db = getDatabase();
  const guildId = message.guildId;
  const userId = message.author.id;

  const guildConfig = db
    .prepare("SELECT * FROM GuildConfiguration WHERE guild_id = ?")
    .get(guildId);

  if (!guildConfig) {
    applyStandardProfile(guildId);

    guildConfig = {
      log_channel_id: null,
      appeal_link: null,
      rejoin_link: null,
      honeypot_channel_id: null,
      active_profile: "Standard",
    };
  }

  const moduleWeights = db
    .prepare(
      "SELECT * FROM ModuleWeights WHERE guild_id = ? AND is_enabled = 1",
    )
    .all(guildId);

  const weightMap = new Map(
    moduleWeights.map((m) => [
      m.module_name,
      { weight: m.weight, is_critical: m.is_critical },
    ]),
  );

  const dbThresholds = db
    .prepare(
      "SELECT pressure_tier AS tier, pressure, action FROM ThresholdActions WHERE guild_id = ? ORDER BY pressure_tier",
    )
    .all(guildId);

  const thresholds = dbThresholds.length > 0 ? dbThresholds : null;

  let highestAction = null;
  let isFastTrack = false;
  const flagReasons = [];

  clog(
    console.log,
    `[src/events/messageCreate.js] Processing message from ${message.author.tag} (${userId}) in channel #${message.channel.name || message.channelId} | content: "${(message.content || "").slice(0, 100)}" | stickers: ${message.stickers?.size || 0}`,
  );

  const honey = checkHoneypot(message, db);
  clog(
    console.log,
    `[src/events/messageCreate.js] Honeypot check — triggered: ${honey.triggered}, whitelisted: ${honey.whitelisted}`,
  );
  if (honey.triggered && !honey.whitelisted) {
    highestAction = applyPressure(guildId, userId, 0, true);
    isFastTrack = true;
    flagReasons.push("sent a message in a restricted channel");
    clog(
      console.warn,
      `[src/events/messageCreate.js] FAST-TRACK: Honeypot triggered — user ${userId} flagged for honeypot violation`,
    );
  }

  const profileMod = weightMap.get("user_profile");
  const profileEnabled = profileMod && profileMod.weight >= 0;
  const profile = auditProfile(message.member);
  const multiplier = profileEnabled ? profile.multiplier : 1.0;
  clog(
    console.log,
    `[src/events/messageCreate.js] user_profile module enabled: ${profileEnabled} | multiplier: ${multiplier}x | profile reasons: [${profile.reasons.join(", ")}]`,
  );

  if (!isFastTrack) {
    const velResult = consumeToken(guildId, userId, message.channelId);
    clog(
      console.log,
      `[src/events/messageCreate.js] Velocity check — tokens: ${velResult.tokens}, exceeded: ${velResult.exceeded}, multiChannel: ${velResult.multiChannel}`,
    );
    if (velResult.exceeded) {
      const mod = weightMap.get("velocity");
      const rawWeight = velResult.multiChannel
        ? velResult.pressure
        : mod
          ? mod.weight
          : velResult.pressure;
      const weight = Math.round(rawWeight * multiplier);
      const critical = mod?.is_critical ?? false;
      clog(
        console.log,
        `[src/events/messageCreate.js] Velocity exceeded — rawWeight: ${rawWeight}, multiplier: ${multiplier}x, finalWeight: ${weight}, critical: ${critical}`,
      );

      const velocityResult = applyPressure(
        guildId,
        userId,
        weight,
        critical,
        thresholds,
      );
      clog(
        console.log,
        `[src/events/messageCreate.js] Velocity pressure result — action: ${velocityResult.action || "none"}, tier: ${velocityResult.tier || "N/A"}`,
      );
      if (velocityResult.action) {
        highestAction = velocityResult;
      }
      flagReasons.push(
        velResult.multiChannel
          ? "sent messages in too many channels too quickly"
          : "sent messages too quickly",
      );
    }
  }

  if (!isFastTrack && message.content && !message.stickers?.size) {
    const regexRules = db
      .prepare("SELECT * FROM RegexRules WHERE guild_id = ?")
      .all(guildId);
    clog(
      console.log,
      `[src/events/messageCreate.js] Regex check — ${regexRules.length} rules configured`,
    );

    for (const rule of regexRules) {
      clog(
        console.log,
        `[src/events/messageCreate.js]   Evaluating rule "${rule.rule_identifier}" — pattern: ${rule.pattern.slice(0, 60)}`,
      );
      const evalResult = await evaluateRegex(rule.pattern, message.content);

      if (evalResult.matched) {
        const weight = Math.round(rule.threat_weight * multiplier);
        const critical = rule.is_critical === 1;
        clog(
          console.log,
          `[src/events/messageCreate.js]   RULE MATCHED — threat_weight: ${rule.threat_weight}, multiplier: ${multiplier}x, finalWeight: ${weight}, critical: ${critical}`,
        );

        const regexResult = applyPressure(
          guildId,
          userId,
          weight,
          critical,
          thresholds,
        );
        clog(
          console.log,
          `[src/events/messageCreate.js]   Regex pressure result — action: ${regexResult.action || "none"}, tier: ${regexResult.tier || "N/A"}`,
        );
        if (regexResult.action) {
          highestAction = regexResult;
        }
        flagReasons.push(
          `sent a message matching the "${rule.rule_identifier}" pattern`,
        );
        break;
      }
    }
  }

  if (profile.reasons.length > 0) {
    const profileReasons = profile.reasons.map((r) => r.toLowerCase());
    flagReasons.push(...profileReasons);
    clog(
      console.log,
      `[src/events/messageCreate.js] Profile flags: ${profileReasons.join("; ")}`,
    );
  }

  if (highestAction && highestAction.action) {
    clog(
      console.log,
      `[src/events/messageCreate.js] Executing sanction — action: ${highestAction.action}, tier: ${highestAction.tier}`,
    );
    recordSpike(guildId);
    await executeSanction(message, highestAction, db, guildConfig, flagReasons);
  } else {
    clog(
      console.log,
      `[src/events/messageCreate.js] No sanction triggered — highestAction: ${highestAction ? JSON.stringify(highestAction) : "null"}`,
    );
  }

  if (flagReasons.length > 0) {
    enqueue("flag", `<@${userId}> flagged — ${flagReasons.join("; ")}`);
    clog(
      console.log,
      `[src/events/messageCreate.js] Enqueued flag for ${userId}: ${flagReasons.join("; ")}`,
    );
  }
}

/**
 * @param {import('discord.js').Message} message
 * @param {{ action: string, tier: number, message_delete_seconds?: number }} threshold
 * @param {import('better-sqlite3').Database} db
 * @param {object} guildConfig
 * @param {string[]} flagReasons
 */
async function executeSanction(
  message,
  threshold,
  db,
  guildConfig,
  flagReasons,
) {
  const { action, tier } = threshold;
  const userId = message.author.id;

  clog(
    console.log,
    `[src/events/messageCreate.js] executeSanction — action: ${action}, tier: ${tier}, user: ${userId}, reasons: [${flagReasons.join(", ")}]`,
  );

  const member = message.member;
  if (!member) {
    clog(
      console.log,
      `[src/events/messageCreate.js]   Abort: member object is null`,
    );
    return;
  }

  if (member.moderatable === false) {
    clog(
      console.log,
      `[src/events/messageCreate.js]   Abort: ${userId} is not moderatable (role hierarchy prevents action)`,
    );
    return;
  }

  const tierRow = db
    .prepare(
      "SELECT message_delete_seconds FROM ThresholdActions WHERE guild_id = ? AND pressure_tier = ?",
    )
    .get(message.guildId, tier);

  const deleteSeconds = tierRow?.message_delete_seconds ?? 120;
  clog(
    console.log,
    `[src/events/messageCreate.js]   deleteSeconds: ${deleteSeconds}`,
  );

  if (!acquireMutex(userId)) {
    clog(
      console.log,
      `[src/events/messageCreate.js]   Mutex held for ${userId}, skipping — another sanction already in progress`,
    );
    return;
  }
  clog(
    console.log,
    `[src/events/messageCreate.js]   Mutex acquired for ${userId}`,
  );

  try {
    clog(
      console.log,
      `[src/events/messageCreate.js]   Deleting triggering message ${message.id}`,
    );
    await safeExecute(() => message.delete());

    const reasonText =
      flagReasons.length > 0
        ? flagReasons.join("; ")
        : "you triggered the moderation system";

    switch (action) {
      case "warn": {
        clog(
          console.log,
          `[src/events/messageCreate.js]   Executing WARN for ${userId}`,
        );
        await safeExecute(() =>
          member
            .send(
              `⚠️ **Warning** in **${message.guild.name}**\nReason: ${reasonText}`,
            )
            .catch(() =>
              clog(
                console.log,
                `[src/events/messageCreate.js]   Could not DM ${userId} — DMs likely disabled`,
              ),
            ),
        );
        await safeExecute(() =>
          sendTimedNotice(
            message,
            `⚠️ Warning issued (Tier ${tier}) — auto-deletes <t:${Math.floor((Date.now() + deleteSeconds * 1000) / 1000)}:R>`,
            deleteSeconds,
          ),
        );
        clog(
          console.log,
          `[src/events/messageCreate.js]   WARN complete for ${userId}`,
        );
        break;
      }

      case "mute": {
        clog(
          console.log,
          `[src/events/messageCreate.js]   Executing MUTE for ${userId} — timeout: 10 minutes`,
        );
        await safeExecute(() =>
          member
            .send(
              `🔇 **Muted** in **${message.guild.name}**\nReason: ${reasonText}\nDuration: 10 minutes from now`,
            )
            .catch(() =>
              clog(
                console.log,
                `[src/events/messageCreate.js]   Could not DM ${userId} — DMs likely disabled`,
              ),
            ),
        );
        await safeExecute(() =>
          member.timeout(60_000 * 10, `EXIA auto-moderation Tier ${tier}`),
        );
        await safeExecute(() =>
          sendTimedNotice(
            message,
            `🔇 Muted for 10 minutes (Tier ${tier}) — auto-deletes <t:${Math.floor((Date.now() + deleteSeconds * 1000) / 1000)}:R>`,
            deleteSeconds,
          ),
        );
        clog(
          console.log,
          `[src/events/messageCreate.js]   MUTE complete for ${userId}`,
        );
        break;
      }

      case "kick": {
        clog(
          console.log,
          `[src/events/messageCreate.js]   Executing KICK for ${userId}`,
        );
        const rejoinLink =
          guildConfig.rejoin_link || "Contact an admin for a rejoin link";
        await safeExecute(() =>
          member
            .send(
              `You have been kicked from **${message.guild.name}**.\nReason: ${reasonText}\nRejoin: ${rejoinLink}`,
            )
            .catch(() =>
              clog(
                console.log,
                `[src/events/messageCreate.js]   Could not DM ${userId} — DMs likely disabled`,
              ),
            ),
        );
        await safeExecute(() =>
          member.kick(`EXIA auto-moderation Tier ${tier}`),
        );
        clog(
          console.log,
          `[src/events/messageCreate.js]   KICK complete for ${userId}`,
        );
        break;
      }

      case "ban": {
        clog(
          console.log,
          `[src/events/messageCreate.js]   Executing BAN for ${userId}`,
        );
        const appealContact =
          guildConfig.appeal_link || "Add an admin to appeal";
        await safeExecute(() =>
          member
            .send(
              `You have been banned from **${message.guild.name}**.\nReason: ${reasonText}\nTo appeal: ${appealContact}`,
            )
            .catch(() =>
              clog(
                console.log,
                `[src/events/messageCreate.js]   Could not DM ${userId} — DMs likely disabled`,
              ),
            ),
        );
        const banDeleteSeconds = Math.min(
          deleteSeconds > 120 ? deleteSeconds : 86400,
          604800,
        );
        clog(
          console.log,
          `[src/events/messageCreate.js]   Ban deleteMessageSeconds: ${banDeleteSeconds}`,
        );
        await safeExecute(() =>
          member.ban({
            reason: `EXIA auto-moderation Tier ${tier}`,
            deleteMessageSeconds: banDeleteSeconds,
          }),
        );
        clog(
          console.log,
          `[src/events/messageCreate.js]   BAN complete for ${userId}`,
        );
        break;
      }
    }

    enqueue("action", `**${action}** on <@${userId}> — ${reasonText}`);
    clog(
      console.log,
      `[src/events/messageCreate.js] Sanction ${action} on ${userId} completed successfully`,
    );
  } catch (err) {
    clog(
      console.error,
      `[src/events/messageCreate.js] Sanction ${action} on ${userId} FAILED — ${err?.message || err}`,
    );
  } finally {
    releaseMutex(userId);
    clog(
      console.log,
      `[src/events/messageCreate.js]   Mutex released for ${userId}`,
    );
  }
}

/**
 * Wraps a Discord API call in a try/catch and checks permissions first.
 * @param {() => Promise<any>} fn
 * @returns {Promise<any|null>}
 */
async function safeExecute(fn) {
  try {
    return await fn();
  } catch (err) {
    clog(
      console.error,
      `[src/events/messageCreate.js] Action failed:`,
      err?.message || err,
    );
    return null;
  }
}

/**
 * Sends a message that auto-deletes after N seconds.
 * @param {import('discord.js').Message} message
 * @param {string} text
 * @param {number} deleteSeconds
 */
async function sendTimedNotice(message, text, deleteSeconds) {
  try {
    const sent = await message.channel.send(`${message.author}, ${text}`);
    setTimeout(async () => {
      try {
        await sent.delete();
      } catch {
        // already deleted
      }
    }, deleteSeconds * 1000);
  } catch {
    // channel inaccessible
  }
}
