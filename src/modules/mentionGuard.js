import { PermissionFlagsBits } from "discord.js";
import { clog } from "../utils/clog.js";
import { t } from "../core/locale.js";

const LOG_TAG = "[src/modules/mentionGuard.js]";

const MENTION_BASE_MULTIPLIER = 3.0;
const MAX_MENTION_MULTIPLIER = 5.0;
const CLEAN_DECAY_PER_MESSAGE = 0.1;

const EXEMPT_PERMISSIONS = PermissionFlagsBits.ManageMessages;

/** @type {Map<string, { multiplier: number, cleanStreak: number }>} */
const mentionState = new Map();
const MAX_STATE_ENTRIES = 10_000;

function getKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * Checks a message for @everyone, @here, or role mentions.
 * Applies internal multiplier decay/growth and returns whether a
 * mention_guard sanction should be applied.
 *
 * @param {import('discord.js').Message} message
 * @param {string} lang
 * @returns {{ triggered: boolean, multiplier: number, reasons: string[] }}
 */
export function checkMentionGuard(message, lang) {
  const userId = message.author.id;
  const guildId = message.guildId;
  const key = getKey(guildId, userId);

  const hasEveryone = message.mentions.everyone;
  const hasHere = message.mentions.here;
  const hasRoleMention = message.mentions.roles.size > 0;
  const hasMention = hasEveryone || hasHere || hasRoleMention;

  const member = message.member;
  const isExempt =
    member &&
    (member.permissions.has(EXEMPT_PERMISSIONS) || member.permissions.has("Administrator"));

  clog(
    console.log,
    `${LOG_TAG} <@${userId}> check — hasEveryone: ${hasEveryone}, hasHere: ${hasHere}, hasRoleMention: ${hasRoleMention}, isExempt: ${isExempt}`,
  );

  if (isExempt || !hasMention) {
    const entry = mentionState.get(key);
    if (entry) {
      const before = entry.multiplier;
      entry.cleanStreak++;
      entry.multiplier = Math.max(
        1.0,
        entry.multiplier - entry.cleanStreak * CLEAN_DECAY_PER_MESSAGE,
      );

      clog(
        console.log,
        `${LOG_TAG} <@${userId}> decay — cleanStreak: ${entry.cleanStreak}, multiplier: ${before} → ${entry.multiplier}`,
      );

      if (entry.multiplier <= 1.0) {
        mentionState.delete(key);
        clog(console.log, `${LOG_TAG} <@${userId}> multiplier reached 1.0, state removed`);
      }
    }

    if (mentionState.size > MAX_STATE_ENTRIES) {
      const sorted = [...mentionState.entries()].sort((a, b) => {
        const aCleans = a[1].cleanStreak;
        const bCleans = b[1].cleanStreak;
        return aCleans - bCleans;
      });
      const toEvict = sorted.slice(0, mentionState.size - MAX_STATE_ENTRIES);
      for (const [evictKey] of toEvict) {
        mentionState.delete(evictKey);
      }
      clog(
        console.warn,
        `${LOG_TAG} Capped mention state: evicted ${toEvict.length} oldest, ${mentionState.size} remaining`,
      );
    }

    return { triggered: false, multiplier: 1.0, reasons: [] };
  }

  const entry = mentionState.get(key);
  const newMultiplier = entry
    ? Math.min(MAX_MENTION_MULTIPLIER, entry.multiplier + 1.0)
    : MENTION_BASE_MULTIPLIER;

  if (entry) {
    entry.multiplier = newMultiplier;
    entry.cleanStreak = 0;
  } else {
    mentionState.set(key, { multiplier: newMultiplier, cleanStreak: 0 });
  }

  const reasons = [];
  if (hasEveryone) {
    reasons.push(t(lang, "flag.reason.mentionEveryone"));
  }
  if (hasHere) {
    reasons.push(t(lang, "flag.reason.mentionHere"));
  }
  for (const [, role] of message.mentions.roles) {
    reasons.push(t(lang, "flag.reason.mentionRole", { roleName: role.name }));
  }

  clog(
    console.warn,
    `${LOG_TAG} <@${userId}> TRIGGERED — multiplier: ${entry ? entry.multiplier.toFixed(1) : "1.0"} → ${newMultiplier.toFixed(1)}x, reasons: [${reasons.join(", ")}]`,
  );

  return { triggered: true, multiplier: newMultiplier, reasons };
}

/** Returns the current mention multiplier for a user (always ≥ 1.0). */
export function getMentionMultiplier(guildId, userId) {
  const entry = mentionState.get(getKey(guildId, userId));
  return entry ? entry.multiplier : 1.0;
}

/** Debug: returns all state entries. */
export function getAllMentionState(guildId) {
  const result = [];
  for (const [key, entry] of mentionState.entries()) {
    const [gKey, uId] = key.split(":");
    if (gKey === guildId) {
      result.push({ userId: uId, multiplier: entry.multiplier, cleanStreak: entry.cleanStreak });
    }
  }
  return result;
}

/** Resets all in-memory state (used by tests). */
export function resetMentionState() {
  mentionState.clear();
}
