import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import {
  applyPressure,
  acquireMutex,
  releaseMutex,
  isMutexed,
  getPressure,
  startDecayTimer,
  stopDecayTimer,
  getThresholdAction,
  resetPressureState,
} from "./pressureEngine.js";

beforeEach(() => {
  resetPressureState();
});

afterEach(() => {
  resetPressureState();
});

describe("applyPressure", () => {
  it("adds pressure for a guild+user pair", () => {
    const result = applyPressure("guild1", "user1", 10);
    expect(result.totalPressure).toBe(10);
    expect(result.action).toBeNull();
    expect(result.tier).toBeNull();
  });

  it("accumulates pressure across multiple calls", () => {
    applyPressure("guild1", "user1", 10);
    const result = applyPressure("guild1", "user1", 20);
    expect(result.totalPressure).toBe(30);
  });

  it("isolates pressure per guild", () => {
    applyPressure("guild1", "user1", 50);
    const result = applyPressure("guild2", "user1", 10);
    expect(result.totalPressure).toBe(10);
  });

  it("isolates pressure per user", () => {
    applyPressure("guild1", "user1", 50);
    const result = applyPressure("guild1", "user2", 10);
    expect(result.totalPressure).toBe(10);
  });

  it("clamps pressure at MAX_PRESSURE (9999)", () => {
    const result = applyPressure("guild1", "user1", 20000);
    expect(result.totalPressure).toBe(9999);
  });

  it("returns warn action at tier-1 threshold (25+)", () => {
    const result = applyPressure("guild1", "user1", 25);
    expect(result.totalPressure).toBe(25);
    expect(result.action).toBe("warn");
    expect(result.tier).toBe(1);
  });

  it("returns mute action at tier-2 threshold (50+)", () => {
    applyPressure("guild1", "user1", 25);
    const result = applyPressure("guild1", "user1", 25);
    expect(result.totalPressure).toBe(50);
    expect(result.action).toBe("mute");
    expect(result.tier).toBe(2);
  });

  it("returns kick action at tier-3 threshold (75+)", () => {
    const result = applyPressure("guild1", "user1", 75);
    expect(result.totalPressure).toBe(75);
    expect(result.action).toBe("kick");
    expect(result.tier).toBe(3);
  });

  it("returns ban action at tier-4 threshold (100+)", () => {
    applyPressure("guild1", "user1", 100);
    const result = applyPressure("guild1", "user1", 0);
    expect(result.totalPressure).toBe(100);
    expect(result.action).toBe("ban");
    expect(result.tier).toBe(4);
  });
});

describe("fast-track (critical)", () => {
  it("sets pressure to 9999 and returns ban", () => {
    const result = applyPressure("guild1", "user1", 0, true);
    expect(result.totalPressure).toBe(9999);
    expect(result.action).toBe("ban");
    expect(result.tier).toBe(4);
  });

  it("overrides any existing pressure", () => {
    applyPressure("guild1", "user1", 10);
    const result = applyPressure("guild1", "user1", 0, true);
    expect(result.totalPressure).toBe(9999);
  });
});

describe("sanction mutex", () => {
  it("acquireMutex returns true for un-mutexed user", () => {
    expect(acquireMutex("user1")).toBe(true);
  });

  it("acquireMutex returns false for already-mutexed user", () => {
    acquireMutex("user1");
    expect(acquireMutex("user1")).toBe(false);
  });

  it("isMutexed reflects mutex state", () => {
    expect(isMutexed("user1")).toBe(false);
    acquireMutex("user1");
    expect(isMutexed("user1")).toBe(true);
  });

  it("releaseMutex clears the mutex", () => {
    acquireMutex("user1");
    releaseMutex("user1");
    expect(isMutexed("user1")).toBe(false);
  });

  it("pressure stacks but action is null when under mutex", () => {
    acquireMutex("user1");
    const result = applyPressure("guild1", "user1", 100);
    expect(result.totalPressure).toBe(100);
    expect(result.action).toBeNull();
    expect(result.tier).toBeNull();
  });

  it("pressure accumulates correctly across multiple mutexed calls", () => {
    const first = applyPressure("guild1", "user1", 30);
    expect(first.totalPressure).toBe(30);
    acquireMutex("user1");
    const result = applyPressure("guild1", "user1", 40);
    expect(result.totalPressure).toBe(70);
    expect(result.action).toBeNull();
  });

  it("mutex applies per-user, not per-guild", () => {
    acquireMutex("user1");
    const r1 = applyPressure("guild1", "user1", 50);
    const r2 = applyPressure("guild2", "user2", 50);
    expect(r1.action).toBeNull();
    expect(r2.action).toBe("mute");
  });

  it("first pressurizes then mutexed stacking suppresses lower thresholds", () => {
    const first = applyPressure("guild1", "user1", 26);
    expect(first.action).toBe("warn");
    acquireMutex("user1");
    const second = applyPressure("guild1", "user1", 26);
    expect(second.action).toBeNull();
    expect(second.totalPressure).toBe(52);
  });
});

describe("getPressure", () => {
  it("returns 0 for untracked user", () => {
    expect(getPressure("guild1", "nobody")).toBe(0);
  });

  it("returns current pressure after apply", () => {
    applyPressure("guild1", "user1", 42);
    expect(getPressure("guild1", "user1")).toBe(42);
  });
});

describe("decay timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("decays pressure after timer interval", () => {
    applyPressure("guild1", "user1", 30);
    expect(getPressure("guild1", "user1")).toBe(30);

    startDecayTimer();
    vi.advanceTimersByTime(60_000);
    expect(getPressure("guild1", "user1")).toBe(25);

    vi.advanceTimersByTime(60_000);
    expect(getPressure("guild1", "user1")).toBe(20);

    stopDecayTimer();
  });

  it("removes entry when pressure reaches 0", () => {
    applyPressure("guild1", "user1", 5);
    startDecayTimer();
    vi.advanceTimersByTime(60_000);
    expect(getPressure("guild1", "user1")).toBe(0);
    stopDecayTimer();
  });

  it("does not decay below 0", () => {
    applyPressure("guild1", "user1", 3);
    startDecayTimer();
    vi.advanceTimersByTime(60_000);
    expect(getPressure("guild1", "user1")).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(getPressure("guild1", "user1")).toBe(0);
    stopDecayTimer();
  });
});

describe("getThresholdAction (DB-dependent)", () => {
  let db;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE ThresholdActions (
        guild_id TEXT NOT NULL,
        pressure_tier INTEGER NOT NULL,
        action TEXT NOT NULL,
        message_delete_seconds INTEGER DEFAULT 5,
        pressure INTEGER NOT NULL DEFAULT 25,
        PRIMARY KEY (guild_id, pressure_tier)
      );
      INSERT INTO ThresholdActions (guild_id, pressure_tier, action, message_delete_seconds, pressure)
      VALUES ('guild1', 1, 'warn', 5, 25);
      INSERT INTO ThresholdActions (guild_id, pressure_tier, action, message_delete_seconds, pressure)
      VALUES ('guild1', 2, 'mute', 10, 50);
      INSERT INTO ThresholdActions (guild_id, pressure_tier, action, message_delete_seconds, pressure)
      VALUES ('guild1', 3, 'kick', 5, 75);
      INSERT INTO ThresholdActions (guild_id, pressure_tier, action, message_delete_seconds, pressure)
      VALUES ('guild1', 4, 'ban', 0, 100);
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("returns configured action for matching tier", () => {
    const result = getThresholdAction(db, "guild1", 1);
    expect(result.action).toBe("warn");
    expect(result.tier).toBe(1);
    expect(result.message_delete_seconds).toBe(5);
    expect(result.pressure).toBe(25);
  });

  it("returns highest matching tier when multiple qualify", () => {
    const result = getThresholdAction(db, "guild1", 4);
    expect(result.action).toBe("ban");
    expect(result.tier).toBe(4);
  });

  it("returns fallback defaults if tier not in DB", () => {
    const result = getThresholdAction(db, "guild2", 4);
    expect(result).not.toBeNull();
    expect(result.action).toBe("ban");
    expect(result.tier).toBe(4);
  });

  it("isolates per guild", () => {
    const result1 = getThresholdAction(db, "guild1", 1);
    const result2 = getThresholdAction(db, "guild2", 1);
    expect(result1.action).toBe("warn");
    expect(result2.action).toBe("warn");
  });
});
