import { clog } from "../utils/clog.js";
import { t } from "../core/locale.js";

const LOG_TAG = "[src/modules/userProfile.js]";

const MIN_ACCOUNT_AGE_DAYS = 7;

/** @type {Map<string, { reasons: string[], flaggedAt: number }>} */
const profileFlags = new Map();
const MAX_PROFILE_FLAG_ENTRIES = 10_000;

function getKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * Audits a member's profile and tracks the user_profile flag state.
 * Returns the audit result plus the flag state transition:
 *  - "new":     conditions present and not previously flagged (flag once)
 *  - "active":  conditions still present, already flagged (do not re-flag)
 *  - "cleared": conditions gone, previously flagged (flag cleared)
 *  - "none":    conditions gone, never flagged
 *
 * @param {import('discord.js').GuildMember} member
 * @param {string} lang
 * @param {string} guildId
 * @returns {{ multiplier: number, reasons: string[], state: 'new'|'active'|'cleared'|'none' }}
 */
export function auditAndTrackProfile(member, lang, guildId) {
  const { multiplier, reasons } = auditProfile(member, lang);
  const key = getKey(guildId, member.user.id);

  if (reasons.length > 0) {
    if (profileFlags.has(key)) {
      return { multiplier, reasons: [], state: "active" };
    }

    profileFlags.set(key, { reasons: [...reasons], flaggedAt: Date.now() });
    evictIfNeeded();

    clog(
      console.log,
      `${LOG_TAG} ${member.user.id} newly flagged — reasons: [${reasons.join(", ")}], multiplier: ${multiplier}x`,
    );
    return { multiplier, reasons: [...reasons], state: "new" };
  }

  if (profileFlags.has(key)) {
    const prior = profileFlags.get(key);
    profileFlags.delete(key);
    clog(
      console.log,
      `${LOG_TAG} ${member.user.id} profile flag cleared — was: [${prior.reasons.join(", ")}]`,
    );
    return { multiplier, reasons: [...prior.reasons], state: "cleared" };
  }

  return { multiplier, reasons: [], state: "none" };
}

function evictIfNeeded() {
  if (profileFlags.size <= MAX_PROFILE_FLAG_ENTRIES) {
    return;
  }
  const sorted = [...profileFlags.entries()].sort((a, b) => a[1].flaggedAt - b[1].flaggedAt);
  const toEvict = sorted.slice(0, profileFlags.size - MAX_PROFILE_FLAG_ENTRIES);
  for (const [key] of toEvict) {
    profileFlags.delete(key);
  }
  clog(
    console.warn,
    `${LOG_TAG} Capped profile flags: evicted ${toEvict.length} oldest, ${profileFlags.size} remaining`,
  );
}

/** Resets all in-memory profile flag state (used by tests). */
export function resetProfileFlags() {
  profileFlags.clear();
}

export function auditProfile(member, lang = "en") {
  const reasons = [];
  const userId = member.user.id;

  const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);

  const isYoung = accountAge < MIN_ACCOUNT_AGE_DAYS;
  const noAvatar = !member.user.avatar;

  clog(
    console.log,
    `${LOG_TAG} Auditing ${userId} — account age: ${accountAge.toFixed(2)} days, avatar: ${noAvatar ? "missing" : "present"}, isYoung: ${isYoung}`,
  );

  if (isYoung) {
    reasons.push(
      t(lang, "profile.reason.young", {
        age: accountAge.toFixed(1),
        minDays: MIN_ACCOUNT_AGE_DAYS,
      }),
    );
  }

  if (noAvatar) {
    reasons.push(t(lang, "profile.reason.noAvatar"));
  }

  let multiplier;
  if (isYoung && noAvatar) {
    multiplier = 2.0;
  } else if (isYoung) {
    multiplier = 1.5;
  } else if (noAvatar) {
    multiplier = 1.2;
  } else {
    multiplier = 1.0;
  }

  clog(
    console.log,
    `${LOG_TAG} ${userId} result — multiplier: ${multiplier}x, reasons: [${reasons.join(", ")}]`,
  );

  return { multiplier, reasons };
}
