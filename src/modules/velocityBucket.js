import { clog } from "../utils/clog.js";

const LOG_TAG = "[src/modules/velocityBucket.js]";

const DEFAULT_BUCKET_CAPACITY = 20;
const DEFAULT_REFILL_RATE = 1;
const DEFAULT_REFILL_INTERVAL_MS = 1_000;
const TOKEN_COST_PER_ACTION = 1;
const EXCEED_PRESSURE = 5;
const MULTI_CHANNEL_PRESSURE = 30;
const MULTI_CHANNEL_WINDOW_MS = 10_000;
const MULTI_CHANNEL_THRESHOLD = 3;
const MAX_BUCKETS = 50_000;
const MAX_CHANNEL_ACTIVITY_ENTRIES = 50_000;

/** @type {Map<string, { tokens: number, lastRefill: number }>} */
const buckets = new Map();

/** @type {Map<string, Map<string, number>>} Maps "guild:user" -> { channelId: lastSeen } */
const channelActivity = new Map();

let refillInterval = null;

export function startRefillTimer() {
  if (refillInterval) {
    return;
  }

  refillInterval = setInterval(() => {
    const now = Date.now();
    let refilled = 0;
    for (const [key, bucket] of buckets.entries()) {
      bucket.tokens = Math.min(DEFAULT_BUCKET_CAPACITY, bucket.tokens + DEFAULT_REFILL_RATE);
      bucket.lastRefill = now;
      refilled++;

      if (bucket.tokens >= DEFAULT_BUCKET_CAPACITY) {
        buckets.delete(key);
        clog(
          console.log,
          `${LOG_TAG} Refill: ${key} reached capacity ${DEFAULT_BUCKET_CAPACITY}, removed from active buckets`,
        );
      }
    }
    if (buckets.size > MAX_BUCKETS) {
      const sorted = [...buckets.entries()].sort((a, b) => a[1].lastRefill - b[1].lastRefill);
      const toEvict = sorted.slice(0, buckets.size - MAX_BUCKETS);
      for (const [key] of toEvict) {
        buckets.delete(key);
        channelActivity.delete(key);
      }
      clog(
        console.warn,
        `${LOG_TAG} Capped buckets: evicted ${toEvict.length} oldest, ${buckets.size} remaining`,
      );
    }

    if (channelActivity.size > MAX_CHANNEL_ACTIVITY_ENTRIES) {
      const sorted = [...channelActivity.entries()].sort((a, b) => {
        const aLatest = Math.max(...a[1].values());
        const bLatest = Math.max(...b[1].values());
        return aLatest - bLatest;
      });
      const toEvict = sorted.slice(0, channelActivity.size - MAX_CHANNEL_ACTIVITY_ENTRIES);
      for (const [key] of toEvict) {
        channelActivity.delete(key);
      }
      clog(
        console.warn,
        `${LOG_TAG} Capped channelActivity: evicted ${toEvict.length} oldest, ${channelActivity.size} remaining`,
      );
    }

    if (refilled > 0) {
      clog(
        console.log,
        `${LOG_TAG} Refill cycle: ${refilled} buckets refilled (+${DEFAULT_REFILL_RATE} token each), ${buckets.size} active buckets remaining`,
      );
    }
  }, DEFAULT_REFILL_INTERVAL_MS);

  if (refillInterval && typeof refillInterval.unref === "function") {
    refillInterval.unref();
  }
}

export function stopRefillTimer() {
  if (refillInterval) {
    clearInterval(refillInterval);
    refillInterval = null;
  }
}

/**
 * Consumes a token from the user's bucket.
 * Tracks channel activity to detect multi-channel rapid-firing.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} [channelId]
 * @returns {{ exceeded: boolean, pressure: number, remaining: number, multiChannel: boolean }}
 */
export function consumeToken(guildId, userId, channelId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();

  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: DEFAULT_BUCKET_CAPACITY, lastRefill: now };
    buckets.set(key, bucket);
    clog(
      console.log,
      `${LOG_TAG} New bucket created for ${key} — initial tokens: ${DEFAULT_BUCKET_CAPACITY}`,
    );
  }

  const elapsed = now - bucket.lastRefill;
  const refills = Math.floor(elapsed / DEFAULT_REFILL_INTERVAL_MS);
  if (refills > 0) {
    const before = bucket.tokens;
    bucket.tokens = Math.min(
      DEFAULT_BUCKET_CAPACITY,
      bucket.tokens + refills * DEFAULT_REFILL_RATE,
    );
    bucket.lastRefill = now;
    clog(
      console.log,
      `${LOG_TAG} ${key} refilled: ${before} → ${bucket.tokens} (${refills} refill cycles, elapsed ${elapsed}ms)`,
    );
  }

  let multiChannel = false;
  if (channelId) {
    let channels = channelActivity.get(key);
    if (!channels) {
      channels = new Map();
      channelActivity.set(key, channels);
    }
    channels.set(channelId, now);

    const cutoff = now - MULTI_CHANNEL_WINDOW_MS;
    let active = 0;
    for (const [ch, ts] of channels) {
      if (ts >= cutoff) {
        active++;
      } else {
        channels.delete(ch);
      }
    }
    clog(
      console.log,
      `${LOG_TAG} ${key} channel activity: ${active} active channels in ${MULTI_CHANNEL_WINDOW_MS / 1000}s window (threshold: ${MULTI_CHANNEL_THRESHOLD})`,
    );
    if (active >= MULTI_CHANNEL_THRESHOLD) {
      multiChannel = true;
      clog(
        console.warn,
        `${LOG_TAG} MULTI-CHANNEL DETECTED for ${key} — ${active} channels in ${MULTI_CHANNEL_WINDOW_MS / 1000}s window, applying ${MULTI_CHANNEL_PRESSURE} pressure`,
      );
    }
  }

  if (multiChannel) {
    clog(
      console.log,
      `${LOG_TAG} ${key} — multi-channel rapid-fire: exceeded=true, pressure=${MULTI_CHANNEL_PRESSURE}, tokens remaining=${bucket.tokens}`,
    );
    return {
      exceeded: true,
      pressure: MULTI_CHANNEL_PRESSURE,
      remaining: bucket.tokens,
      multiChannel: true,
    };
  }

  if (bucket.tokens < TOKEN_COST_PER_ACTION) {
    clog(
      console.log,
      `${LOG_TAG} ${key} — token exhaustion: tokens=${bucket.tokens}, cost=${TOKEN_COST_PER_ACTION}, exceeded=true, pressure=${EXCEED_PRESSURE}`,
    );
    return {
      exceeded: true,
      pressure: EXCEED_PRESSURE,
      remaining: bucket.tokens,
      multiChannel: false,
    };
  }

  bucket.tokens -= TOKEN_COST_PER_ACTION;
  clog(
    console.log,
    `${LOG_TAG} ${key} — token consumed: ${bucket.tokens + 1} → ${bucket.tokens}, exceeded=false`,
  );
  return {
    exceeded: false,
    pressure: 0,
    remaining: bucket.tokens,
    multiChannel: false,
  };
}

export function resetBucket(guildId, userId) {
  const key = `${guildId}:${userId}`;
  buckets.delete(key);
  channelActivity.delete(key);
}

/** Resets all bucket state (used by tests). */
export function resetAllBuckets() {
  buckets.clear();
  channelActivity.clear();
  stopRefillTimer();
}
