import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  consumeToken,
  resetBucket,
  startRefillTimer,
  stopRefillTimer,
  resetAllBuckets,
} from "./velocityBucket.js";

beforeEach(() => {
  resetAllBuckets();
});

afterEach(() => {
  resetAllBuckets();
});

describe("consumeToken", () => {
  it("starts with full capacity (20 tokens)", () => {
    const result = consumeToken("guild1", "user1");
    expect(result.exceeded).toBe(false);
    expect(result.pressure).toBe(0);
    expect(result.remaining).toBe(19);
  });

  it("consumes tokens one at a time", () => {
    consumeToken("guild1", "user1");
    const r2 = consumeToken("guild1", "user1");
    expect(r2.remaining).toBe(18);
  });

  it("returns exceeded=true when bucket is empty", () => {
    for (let i = 0; i < 20; i++) {
      consumeToken("guild1", "user1");
    }
    const result = consumeToken("guild1", "user1");
    expect(result.exceeded).toBe(true);
    expect(result.pressure).toBe(5);
    expect(result.remaining).toBe(0);
    expect(result.multiChannel).toBe(false);
  });

  it("returns higher pressure for multi-channel rapid-fire", () => {
    const guildId = "guild1";
    const userId = "user1";
    for (let i = 0; i < 20; i++) {
      consumeToken(guildId, userId, `channel${i % 5}`);
    }
    const result = consumeToken(guildId, userId, "channel99");
    expect(result.exceeded).toBe(true);
    expect(result.pressure).toBe(30);
    expect(result.multiChannel).toBe(true);
  });

  it("isolates buckets per user", () => {
    for (let i = 0; i < 20; i++) {
      consumeToken("guild1", "user1");
    }
    const result = consumeToken("guild1", "user2");
    expect(result.exceeded).toBe(false);
    expect(result.remaining).toBe(19);
  });

  it("isolates buckets per guild", () => {
    for (let i = 0; i < 20; i++) {
      consumeToken("guild1", "user1");
    }
    const result = consumeToken("guild2", "user1");
    expect(result.exceeded).toBe(false);
    expect(result.remaining).toBe(19);
  });
});

describe("resetBucket", () => {
  it("resets a specific user's bucket", () => {
    for (let i = 0; i < 20; i++) {
      consumeToken("guild1", "user1");
    }
    resetBucket("guild1", "user1");
    const result = consumeToken("guild1", "user1");
    expect(result.exceeded).toBe(false);
    expect(result.remaining).toBe(19);
  });
});

describe("token refill", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refills one token per second", () => {
    for (let i = 0; i < 20; i++) {
      consumeToken("guild1", "user1");
    }

    startRefillTimer();
    vi.advanceTimersByTime(1_000);

    const r1 = consumeToken("guild1", "user1");
    expect(r1.exceeded).toBe(false);
    expect(r1.remaining).toBe(0);

    vi.advanceTimersByTime(1_000);
    const r2 = consumeToken("guild1", "user1");
    expect(r2.remaining).toBe(0);

    stopRefillTimer();
  });

  it("caps refill at bucket capacity", () => {
    consumeToken("guild1", "user1");
    consumeToken("guild1", "user1");

    startRefillTimer();
    vi.advanceTimersByTime(20_000);

    const result = consumeToken("guild1", "user1");
    expect(result.remaining).toBe(19);

    stopRefillTimer();
  });
});
