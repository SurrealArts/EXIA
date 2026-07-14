import { clog } from "../utils/clog.js";

const PRESSURE_DECAY_INTERVAL_MS = 60_000;
const PRESSURE_DECAY_AMOUNT = 5;
const FAST_TRACK_PRESSURE = 9999;
const MAX_PRESSURE = 9999;

/**
 * In-memory pressure scores per guild+user, with timestamps for decay.
 * @type {Map<string, { pressure: number, lastUpdated: number }>}
 */
const pressureScores = new Map();

/**
 * Sanction Mutex: Set of userIds currently being processed.
 * @type {Set<string>}
 */
const processingMutex = new Set();

const DEFAULT_THRESHOLDS = [
  { tier: 1, pressure: 25, action: "warn" },
  { tier: 2, pressure: 50, action: "mute" },
  { tier: 3, pressure: 75, action: "kick" },
  { tier: 4, pressure: 100, action: "ban" },
];

let decayInterval = null;

export function startDecayTimer() {
  if (decayInterval) {
    return;
  }

  decayInterval = setInterval(() => {
    const now = Date.now();
    let decayed = 0;
    let removed = 0;

    for (const [key, entry] of pressureScores.entries()) {
      const elapsed = now - entry.lastUpdated;
      const cycles = Math.floor(elapsed / PRESSURE_DECAY_INTERVAL_MS);
      const decay = cycles * PRESSURE_DECAY_AMOUNT;

      if (decay > 0) {
        const before = entry.pressure;
        entry.pressure = Math.max(0, entry.pressure - decay);
        entry.lastUpdated = now;
        decayed++;
        clog(
          console.log,
          `[src/core/pressureEngine.js] Decay: ${key} pressure ${before} → ${entry.pressure} (${decay} decay, ${elapsed}ms idle)`,
        );

        if (entry.pressure <= 0) {
          pressureScores.delete(key);
          removed++;
          clog(
            console.log,
            `[src/core/pressureEngine.js] Decay: ${key} pressure reached 0, removed from active scores`,
          );
        }
      }
    }

    if (decayed > 0) {
      clog(
        console.log,
        `[src/core/pressureEngine.js] Decay cycle: ${decayed} entries decayed, ${removed} removed, ${pressureScores.size} active remaining`,
      );
    }
  }, PRESSURE_DECAY_INTERVAL_MS);

  if (decayInterval && typeof decayInterval.unref === "function") {
    decayInterval.unref();
  }
}

export function stopDecayTimer() {
  if (decayInterval) {
    clearInterval(decayInterval);
    decayInterval = null;
  }
}

/**
 * Applies pressure to a user in a guild.
 * @param {string} guildId
 * @param {string} userId
 * @param {number} weight
 * @param {boolean} [isCritical=false]
 * @param {Array<{tier:number, pressure:number, action:string}>} [thresholds] - Per-guild thresholds from DB
 * @returns {{ totalPressure: number, action: string|null, tier: number|null }}
 */
export function applyPressure(
  guildId,
  userId,
  weight,
  isCritical = false,
  thresholds = DEFAULT_THRESHOLDS,
) {
  const key = `${guildId}:${userId}`;

  if (isCritical) {
    clog(
      console.warn,
      `[src/core/pressureEngine.js] FAST-TRACK: ${userId} — setting pressure to ${FAST_TRACK_PRESSURE} (action: ban, tier: 4)`,
    );
    pressureScores.set(key, {
      pressure: FAST_TRACK_PRESSURE,
      lastUpdated: Date.now(),
    });
    return {
      totalPressure: FAST_TRACK_PRESSURE,
      action: "ban",
      tier: 4,
    };
  }

  if (processingMutex.has(userId)) {
    const entry = pressureScores.get(key);
    if (entry) {
      const before = entry.pressure;
      entry.pressure = Math.min(MAX_PRESSURE, entry.pressure + weight);
      entry.lastUpdated = Date.now();
      clog(
        console.log,
        `[src/core/pressureEngine.js] MUTEXED: ${userId} — stacking ${weight}p: ${before} → ${entry.pressure} (no action — under sanction)`,
      );
    } else {
      pressureScores.set(key, {
        pressure: Math.min(MAX_PRESSURE, weight),
        lastUpdated: Date.now(),
      });
      clog(
        console.log,
        `[src/core/pressureEngine.js] MUTEXED: ${userId} — new entry with ${weight}p (no action — under sanction)`,
      );
    }
    return {
      totalPressure: entry ? entry.pressure : weight,
      action: null,
      tier: null,
    };
  }

  const existing = pressureScores.get(key);

  if (existing) {
    const before = existing.pressure;
    existing.pressure = Math.min(MAX_PRESSURE, existing.pressure + weight);
    existing.lastUpdated = Date.now();
    clog(
      console.log,
      `[src/core/pressureEngine.js] ${userId}: adding ${weight}p — ${before} → ${existing.pressure}`,
    );
  } else {
    pressureScores.set(key, {
      pressure: Math.min(MAX_PRESSURE, weight),
      lastUpdated: Date.now(),
    });
    clog(
      console.log,
      `[src/core/pressureEngine.js] ${userId}: new pressure entry with ${weight}p`,
    );
  }

  const totalPressure = pressureScores.get(key).pressure;
  const threshold = getHighestThreshold(totalPressure, thresholds);
  clog(
    console.log,
    `[src/core/pressureEngine.js] ${userId}: total=${totalPressure}, threshold=${threshold ? `${threshold.pressure}p → ${threshold.action} (tier ${threshold.tier})` : "none"}`,
  );

  return {
    totalPressure,
    action: threshold ? threshold.action : null,
    tier: threshold ? threshold.tier : null,
  };
}

/**
 * Acquires the sanction mutex for a user.
 * @param {string} userId
 * @returns {boolean}
 */
export function acquireMutex(userId) {
  if (processingMutex.has(userId)) {
    return false;
  }
  processingMutex.add(userId);
  return true;
}

/**
 * Releases the sanction mutex for a user.
 * @param {string} userId
 */
export function releaseMutex(userId) {
  processingMutex.delete(userId);
}

/**
 * @param {string} userId
 * @returns {boolean}
 */
export function isMutexed(userId) {
  return processingMutex.has(userId);
}

/**
 * @param {number} pressure
 * @param {Array<{tier:number, pressure:number, action:string}>} [thresholds]
 * @returns {{ tier: number, pressure: number, action: string }|null}
 */
function getHighestThreshold(pressure, thresholds = DEFAULT_THRESHOLDS) {
  let result = null;
  for (const t of thresholds) {
    if (pressure >= t.pressure) {
      result = t;
    }
  }
  return result;
}

/**
 * Looks up threshold action details from DB for a given tier.
 * @param {import('better-sqlite3').Database} db
 * @param {string} guildId
 * @param {number} tier
 * @returns {{ action: string, tier: number, message_delete_seconds: number, pressure: number }|null}
 */
export function getThresholdAction(db, guildId, tier) {
  const row = db
    .prepare(
      `SELECT pressure_tier, action, message_delete_seconds, pressure
       FROM ThresholdActions
       WHERE guild_id = ? AND pressure_tier = ?`,
    )
    .get(guildId, tier);

  if (row) {
    return {
      action: row.action,
      tier: row.pressure_tier,
      message_delete_seconds: row.message_delete_seconds,
      pressure: row.pressure,
    };
  }

  const fallback = DEFAULT_THRESHOLDS.find((t) => t.tier === tier);
  return fallback ? { ...fallback, message_delete_seconds: 120 } : null;
}

/**
 * @param {string} guildId
 * @param {string} userId
 * @returns {number}
 */
export function getPressure(guildId, userId) {
  const entry = pressureScores.get(`${guildId}:${userId}`);
  return entry ? entry.pressure : 0;
}

/**
 * Returns all current pressure scores (for debugging).
 * @returns {Array<{ guildId: string, userId: string, pressure: number }>}
 */
export function getAllPressureScores() {
  const result = [];
  for (const [key, entry] of pressureScores.entries()) {
    const [guildId, userId] = key.split(":");
    result.push({
      guildId,
      userId,
      pressure: entry.pressure,
      lastUpdated: entry.lastUpdated,
    });
  }
  return result;
}

/** Resets all in-memory state (used by tests). */
export function resetPressureState() {
  pressureScores.clear();
  processingMutex.clear();
  stopDecayTimer();
}
