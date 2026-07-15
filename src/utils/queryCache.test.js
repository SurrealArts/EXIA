import { describe, it, expect, beforeEach } from "vitest";
import { cachedGet, cachedAll, invalidateCache } from "./queryCache.js";

function makeMockDb() {
  let callCount = 0;
  const db = {
    prepare: () => ({
      get: (...params) => {
        callCount++;
        return { id: 1, value: "hello", params };
      },
      all: (...params) => {
        callCount++;
        return [{ id: 1, value: "hello", params }];
      },
    }),
    _callCount: () => callCount,
  };
  return db;
}

describe("queryCache", () => {
  let db;

  beforeEach(() => {
    db = makeMockDb();
    invalidateCache();
  });

  it("caches cachedGet results across calls", () => {
    const r1 = cachedGet(db, "SELECT * FROM t WHERE id = ?", 1);
    const r2 = cachedGet(db, "SELECT * FROM t WHERE id = ?", 1);
    expect(r1).toEqual(r2);
    expect(db._callCount()).toBe(1);
  });

  it("caches cachedAll results across calls", () => {
    const r1 = cachedAll(db, "SELECT * FROM t WHERE gid = ?", "g1");
    const r2 = cachedAll(db, "SELECT * FROM t WHERE gid = ?", "g1");
    expect(r1).toEqual(r2);
    expect(db._callCount()).toBe(1);
  });

  it("differentiates cache keys by params", () => {
    cachedGet(db, "SELECT * FROM t WHERE id = ?", 1);
    cachedGet(db, "SELECT * FROM t WHERE id = ?", 2);
    expect(db._callCount()).toBe(2);
  });

  it("differentiates cache keys by SQL", () => {
    cachedGet(db, "SELECT * FROM t WHERE id = ?", 1);
    cachedGet(db, "SELECT * FROM u WHERE id = ?", 1);
    expect(db._callCount()).toBe(2);
  });

  it("differentiates get vs all for same SQL", () => {
    cachedGet(db, "SELECT * FROM t WHERE id = ?", 1);
    cachedAll(db, "SELECT * FROM t WHERE id = ?", 1);
    expect(db._callCount()).toBe(2);
  });

  it("invalidateCache clears entries", () => {
    cachedGet(db, "SELECT * FROM t WHERE id = ?", 1);
    invalidateCache();
    cachedGet(db, "SELECT * FROM t WHERE id = ?", 1);
    expect(db._callCount()).toBe(2);
  });
});
