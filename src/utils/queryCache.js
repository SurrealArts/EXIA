const cache = new Map();
const DEFAULT_TTL_MS = 300_000;
const MAX_ENTRIES = 10_000;

/**
 * Minimal TTL cache for DB queries on the hot path.
 * @param {import('better-sqlite3').Database} db
 * @param {string} sql
 * @param  {...any} params
 * @returns {any}
 */
export function cachedGet(db, sql, ...params) {
  const key = `G:${sql}|${params.join("|")}`;
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.ts < DEFAULT_TTL_MS) {
    return entry.value;
  }
  const value = db.prepare(sql).get(...params);
  evictIfNeeded();
  cache.set(key, { value, ts: now });
  return value;
}

function evictIfNeeded() {
  if (cache.size <= MAX_ENTRIES) {
    return;
  }
  const sorted = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  const toEvict = sorted.slice(0, cache.size - MAX_ENTRIES);
  for (const [k] of toEvict) {
    cache.delete(k);
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} sql
 * @param  {...any} params
 * @returns {any[]}
 */
export function cachedAll(db, sql, ...params) {
  const key = `A:${sql}|${params.join("|")}`;
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.ts < DEFAULT_TTL_MS) {
    return entry.value;
  }
  const value = db.prepare(sql).all(...params);
  evictIfNeeded();
  cache.set(key, { value, ts: now });
  return value;
}

export function invalidateCache() {
  cache.clear();
}
