import { getDatabase, applyStandardProfile } from "../core/database.js";
import { applyPressure, acquireMutex, releaseMutex } from "../core/pressureEngine.js";
import { consumeToken } from "../modules/velocityBucket.js";
import { checkHoneypot } from "../modules/honeypotTrap.js";
import { evaluateRegex } from "../modules/regexSandbox.js";
import { auditProfile } from "../modules/userProfile.js";
import { checkMentionGuard } from "../modules/mentionGuard.js";
import { recordSpike } from "../modules/raidProtection.js";
import { enqueue } from "../utils/telemetryQueue.js";
import { cachedGet, cachedAll } from "../utils/queryCache.js";
import { clog } from "../utils/clog.js";
import { t, getGuildLanguage } from "../core/locale.js";

const LOG_TAG = "[src/events/messageCreate.js]";

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
  const lang = getGuildLanguage(db, guildId);

  const guildConfigRow = cachedGet(
    db,
    "SELECT * FROM GuildConfiguration WHERE guild_id = ?",
    guildId,
  );
  let guildConfig = guildConfigRow;

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

  const moduleWeights = cachedAll(
    db,
    "SELECT * FROM ModuleWeights WHERE guild_id = ? AND is_enabled = 1",
    guildId,
  );

  const weightMap = new Map(
    moduleWeights.map((m) => [m.module_name, { weight: m.weight, is_critical: m.is_critical }]),
  );

  const dbThresholds = cachedAll(
    db,
    "SELECT pressure_tier AS tier, pressure, action FROM ThresholdActions WHERE guild_id = ? ORDER BY pressure_tier",
    guildId,
  );

  const thresholds = dbThresholds.length > 0 ? dbThresholds : null;

  let highestAction = null;
  let isFastTrack = false;
  const flagReasons = [];

  clog(
    console.log,
    `${LOG_TAG} Processing message from ${message.author.tag} (${userId}) in channel #${message.channel.name || message.channelId} | content: "${(message.content || "").slice(0, 100)}" | stickers: ${message.stickers?.size || 0}`,
  );

  const honey = checkHoneypot(message, guildConfig);
  clog(
    console.log,
    `${LOG_TAG} Honeypot check — triggered: ${honey.triggered}, whitelisted: ${honey.whitelisted}`,
  );
  if (honey.triggered && !honey.whitelisted) {
    highestAction = applyPressure(guildId, userId, 0, true);
    isFastTrack = true;
    flagReasons.push(t(lang, "flag.reason.honeypot"));
    clog(
      console.warn,
      `${LOG_TAG} FAST-TRACK: Honeypot triggered — user ${userId} flagged for honeypot violation`,
    );
  }

  const profileMod = weightMap.get("user_profile");
  const profileMember = message.member;
  const profile = profileMember
    ? auditProfile(profileMember, lang)
    : { multiplier: 1, reasons: [] };
  const profileEnabled = profileMod && profileMod.weight >= 0 && profileMember !== null;
  const multiplier = profileEnabled ? profile.multiplier : 1.0;
  clog(
    console.log,
    `${LOG_TAG} user_profile module enabled: ${profileEnabled} | multiplier: ${multiplier}x | profile reasons: [${profile.reasons.join(", ")}]`,
  );

  if (!isFastTrack) {
    const mentionCheck = checkMentionGuard(message, lang);
    clog(
      console.log,
      `${LOG_TAG} MentionGuard — triggered: ${mentionCheck.triggered}, multiplier: ${mentionCheck.multiplier}x, reasons: [${mentionCheck.reasons.join(", ")}]`,
    );
    if (mentionCheck.triggered) {
      const mod = weightMap.get("mention_guard");
      if (mod) {
        const rawWeight = mod.weight;
        const weight = Math.round(rawWeight * mentionCheck.multiplier);
        const critical = mod?.is_critical ?? false;
        clog(
          console.log,
          `${LOG_TAG} MentionGuard triggered — rawWeight: ${rawWeight}, mentionMult: ${mentionCheck.multiplier}x, finalWeight: ${weight}, critical: ${critical}`,
        );

        const mentionResult = applyPressure(guildId, userId, weight, critical, thresholds);
        clog(
          console.log,
          `${LOG_TAG} MentionGuard pressure result — action: ${mentionResult.action || "none"}, tier: ${mentionResult.tier || "N/A"}`,
        );
        if (mentionResult.action) {
          highestAction = mentionResult;
        }
        flagReasons.push(...mentionCheck.reasons);
      }
    }
  }

  if (!isFastTrack) {
    const velResult = consumeToken(guildId, userId, message.channelId);
    clog(
      console.log,
      `${LOG_TAG} Velocity check — tokens: ${velResult.remaining}, exceeded: ${velResult.exceeded}, multiChannel: ${velResult.multiChannel}`,
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
        `${LOG_TAG} Velocity exceeded — rawWeight: ${rawWeight}, multiplier: ${multiplier}x, finalWeight: ${weight}, critical: ${critical}`,
      );

      const velocityResult = applyPressure(guildId, userId, weight, critical, thresholds);
      clog(
        console.log,
        `${LOG_TAG} Velocity pressure result — action: ${velocityResult.action || "none"}, tier: ${velocityResult.tier || "N/A"}`,
      );
      if (velocityResult.action) {
        highestAction = velocityResult;
      }
      flagReasons.push(
        velResult.multiChannel ? t(lang, "flag.reason.multiChannel") : t(lang, "flag.reason.speed"),
      );
    }
  }

  if (!isFastTrack && message.content && !message.stickers?.size) {
    const regexRules = cachedAll(db, "SELECT * FROM RegexRules WHERE guild_id = ?", guildId);
    clog(console.log, `${LOG_TAG} Regex check — ${regexRules.length} rules configured`);

    for (const rule of regexRules) {
      clog(
        console.log,
        `${LOG_TAG} Evaluating rule "${rule.rule_identifier}" — pattern: ${rule.pattern.slice(0, 60)}`,
      );
      const evalResult = await evaluateRegex(rule.pattern, message.content);

      if (evalResult.matched) {
        const weight = Math.round(rule.threat_weight * multiplier);
        const critical = rule.is_critical === 1;
        clog(
          console.log,
          `${LOG_TAG} RULE MATCHED — threat_weight: ${rule.threat_weight}, multiplier: ${multiplier}x, finalWeight: ${weight}, critical: ${critical}`,
        );

        const regexResult = applyPressure(guildId, userId, weight, critical, thresholds);
        clog(
          console.log,
          `${LOG_TAG} Regex pressure result — action: ${regexResult.action || "none"}, tier: ${regexResult.tier || "N/A"}`,
        );
        if (regexResult.action) {
          highestAction = regexResult;
        }
        flagReasons.push(t(lang, "flag.reason.regex", { ruleIdentifier: rule.rule_identifier }));
        break;
      }
    }
  }

  if (profile.reasons.length > 0) {
    const profileReasons = [...profile.reasons];
    flagReasons.push(...profileReasons);
    clog(console.log, `${LOG_TAG} Profile flags: ${profileReasons.join("; ")}`);
  }

  if (highestAction && highestAction.action) {
    clog(
      console.log,
      `${LOG_TAG} Executing sanction — action: ${highestAction.action}, tier: ${highestAction.tier}`,
    );
    recordSpike(guildId);
    await executeSanction(message, highestAction, db, guildConfig, flagReasons);
  } else {
    clog(
      console.log,
      `${LOG_TAG} No sanction triggered — highestAction: ${highestAction ? JSON.stringify(highestAction) : "null"}`,
    );
  }

  if (flagReasons.length > 0) {
    enqueue(
      "flag",
      message.guild.id,
      t(lang, "reply.flag.enqueue", { userId, reasons: flagReasons.join("; ") }),
    );
    clog(console.log, `${LOG_TAG} Enqueued flag for ${userId}: ${flagReasons.join("; ")}`);
  }
}

/**
 * @param {import('discord.js').Message} message
 * @param {{ action: string, tier: number, message_delete_seconds?: number }} threshold
 * @param {import('better-sqlite3').Database} db
 * @param {object} guildConfig
 * @param {string[]} flagReasons
 */
async function executeSanction(message, threshold, db, guildConfig, flagReasons) {
  const { action, tier } = threshold;
  const userId = message.author.id;
  const lang = getGuildLanguage(db, message.guildId);

  clog(
    console.log,
    `${LOG_TAG} executeSanction — action: ${action}, tier: ${tier}, user: ${userId}, reasons: [${flagReasons.join(", ")}]`,
  );

  const member = message.member;
  if (!member) {
    clog(console.log, `${LOG_TAG} Abort: member object is null`);
    return;
  }

  if (member.moderatable === false) {
    clog(
      console.log,
      `${LOG_TAG} Abort: ${userId} is not moderatable (role hierarchy prevents action)`,
    );
    return;
  }

  const tierRow = cachedGet(
    db,
    "SELECT message_delete_seconds FROM ThresholdActions WHERE guild_id = ? AND pressure_tier = ?",
    message.guildId,
    tier,
  );

  const deleteSeconds = tierRow?.message_delete_seconds ?? 120;
  clog(console.log, `${LOG_TAG} deleteSeconds: ${deleteSeconds}`);

  if (!acquireMutex(userId)) {
    clog(
      console.log,
      `${LOG_TAG} Mutex held for ${userId}, skipping — another sanction already in progress`,
    );
    return;
  }
  clog(console.log, `${LOG_TAG} Mutex acquired for ${userId}`);

  try {
    clog(console.log, `${LOG_TAG} Deleting triggering message ${message.id}`);
    await safeExecute(() => message.delete());

    const reasonText =
      flagReasons.length > 0 ? flagReasons.join("; ") : t(lang, "sanction.defaultReason");

    switch (action) {
      case "warn": {
        clog(console.log, `${LOG_TAG} Executing WARN for ${userId}`);
        await safeExecute(() =>
          member
            .send(
              t(lang, "sanction.warn.dm", { guildName: message.guild.name, reason: reasonText }),
            )
            .catch(() =>
              clog(console.log, `${LOG_TAG} Could not DM ${userId} — DMs likely disabled`),
            ),
        );
        await safeExecute(() =>
          sendTimedNotice(
            message,
            t(lang, "sanction.notice.warn", {
              tier,
              timestamp: Math.floor((Date.now() + deleteSeconds * 1000) / 1000),
            }),
            deleteSeconds,
          ),
        );
        clog(console.log, `${LOG_TAG} WARN complete for ${userId}`);
        break;
      }

      case "mute": {
        clog(console.log, `${LOG_TAG} Executing MUTE for ${userId} — timeout: 10 minutes`);
        await safeExecute(() =>
          member
            .send(
              t(lang, "sanction.mute.dm", { guildName: message.guild.name, reason: reasonText }),
            )
            .catch(() =>
              clog(console.log, `${LOG_TAG} Could not DM ${userId} — DMs likely disabled`),
            ),
        );
        await safeExecute(() =>
          member.timeout(60_000 * 10, t(lang, "sanction.auditReason", { tier })),
        );
        await safeExecute(() =>
          sendTimedNotice(
            message,
            t(lang, "sanction.notice.mute", {
              tier,
              timestamp: Math.floor((Date.now() + deleteSeconds * 1000) / 1000),
            }),
            deleteSeconds,
          ),
        );
        clog(console.log, `${LOG_TAG} MUTE complete for ${userId}`);
        break;
      }

      case "kick": {
        clog(console.log, `${LOG_TAG} Executing KICK for ${userId}`);
        const rejoinLink = guildConfig.rejoin_link || t(lang, "sanction.fallback.rejoinLink");
        await safeExecute(() =>
          member
            .send(
              t(lang, "sanction.kick.dm", {
                guildName: message.guild.name,
                reason: reasonText,
                rejoinLink,
              }),
            )
            .catch(() =>
              clog(console.log, `${LOG_TAG} Could not DM ${userId} — DMs likely disabled`),
            ),
        );
        await safeExecute(() => member.kick(t(lang, "sanction.auditReason", { tier })));
        clog(console.log, `${LOG_TAG} KICK complete for ${userId}`);
        break;
      }

      case "ban": {
        clog(console.log, `${LOG_TAG} Executing BAN for ${userId}`);
        const appealContact = guildConfig.appeal_link || t(lang, "sanction.fallback.appealContact");
        await safeExecute(() =>
          member
            .send(
              t(lang, "sanction.ban.dm", {
                guildName: message.guild.name,
                reason: reasonText,
                appealContact,
              }),
            )
            .catch(() =>
              clog(console.log, `${LOG_TAG} Could not DM ${userId} — DMs likely disabled`),
            ),
        );
        const banDeleteSeconds = Math.min(deleteSeconds > 120 ? deleteSeconds : 86400, 604800);
        clog(console.log, `${LOG_TAG} Ban deleteMessageSeconds: ${banDeleteSeconds}`);
        await safeExecute(() =>
          member.ban({
            reason: t(lang, "sanction.auditReason", { tier }),
            deleteMessageSeconds: banDeleteSeconds,
          }),
        );
        clog(console.log, `${LOG_TAG} BAN complete for ${userId}`);
        break;
      }
    }

    enqueue(
      "action",
      message.guild.id,
      t(lang, "reply.sanction.enqueue", { action, userId, reason: reasonText }),
    );
    clog(console.log, `${LOG_TAG} Sanction ${action} on ${userId} completed successfully`);
  } catch (err) {
    clog(
      console.error,
      `${LOG_TAG} Sanction ${action} on ${userId} FAILED — ${err?.message || err}`,
    );
  } finally {
    releaseMutex(userId);
    clog(console.log, `${LOG_TAG} Mutex released for ${userId}`);
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
    clog(console.error, `${LOG_TAG} Action failed:`, err?.message || err);
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
