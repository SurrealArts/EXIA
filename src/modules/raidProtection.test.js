import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";

// ─── Hoisted shared state for vi.mock ───────────────────────────────────────

const mockState = vi.hoisted(() => {
  let currentDb = undefined;
  const guildCache = new Map();
  return {
    setDb: (db) => {
      currentDb = db;
    },
    getDb: () => currentDb,
    guildCache,
  };
});

vi.mock("../utils/telemetryQueue.js", () => ({
  enqueue: vi.fn(),
}));

vi.mock("../index.js", () => ({
  client: {
    guilds: { cache: mockState.guildCache },
  },
}));

vi.mock("../core/database.js", () => ({
  getDatabase: () => mockState.getDb(),
}));

// ─── Module under test ──────────────────────────────────────────────────────

import {
  recordSpike,
  getRaidStage,
  getRaidState,
  setRaidStage,
  startRaidDetection,
  resetRaidState,
} from "./raidProtection.js";

// ─── Factory helpers ────────────────────────────────────────────────────────

function makeChannel(id, name, opts = {}) {
  const overwrites = new Map();
  if (opts.overwrites) {
    for (const ow of opts.overwrites) {
      overwrites.set(ow.id, ow);
    }
  }
  return {
    id,
    name,
    type: 0,
    isTextBased: () => true,
    rateLimitPerUser: opts.rateLimitPerUser ?? 0,
    edit: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    permissionOverwrites: {
      cache: overwrites,
      edit: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function makeChannelCache(channelArray) {
  const map = new Map(channelArray.map((c) => [c.id, c]));
  const self = {
    get: (id) => map.get(id),
    size: map.size,
    filter: (fn) => makeChannelCache(channelArray.filter(fn)),
    find: (fn) => channelArray.find(fn),
    forEach: (fn) => channelArray.forEach(fn),
    [Symbol.iterator]: function* () {
      for (const ch of channelArray) {
        yield [ch.id, ch];
      }
    },
  };
  return self;
}

function makeGuild(id = "guild1") {
  const general = makeChannel("general_id", "general");
  const chat = makeChannel("chat_id", "chat");
  const cache = makeChannelCache([general, chat]);
  const guild = {
    id,
    name: `Guild ${id}`,
    channels: {
      cache,
      create: vi
        .fn()
        .mockResolvedValue(makeChannel("raid-temp", "raid-temp-channel")),
    },
    roles: {
      everyone: { id: "everyone_role" },
    },
  };
  return guild;
}

function makeDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS RaidState (
      guild_id TEXT PRIMARY KEY,
      stage INTEGER NOT NULL DEFAULT 0,
      backup_json TEXT,
      started_at TEXT
    );
  `);
  return db;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("recordSpike / getRaidStage / getRaidState", () => {
  afterEach(() => {
    resetRaidState();
  });

  it("returns stage 0 and null state for unknown guild", () => {
    expect(getRaidStage("unknown")).toBe(0);
    expect(getRaidState("unknown")).toBeNull();
  });

  it("records spikes and increments count", () => {
    recordSpike("guild1");
    recordSpike("guild1");
    recordSpike("guild1");
    const state = getRaidState("guild1");
    expect(state).not.toBeNull();
    expect(state.spikeCount).toBe(3);
    expect(state.stage).toBe(0);
  });

  it("initialises spike window on first spike", () => {
    recordSpike("guild1");
    const state = getRaidState("guild1");
    expect(state.spikeWindowStart).toBeGreaterThan(0);
  });

  it("isolates spike counts per guild", () => {
    recordSpike("guild1");
    recordSpike("guild1");
    recordSpike("guild2");
    expect(getRaidState("guild1").spikeCount).toBe(2);
    expect(getRaidState("guild2").spikeCount).toBe(1);
  });

  it("resets spike count after stage transition", async () => {
    const guild = makeGuild("guild1");
    const db = makeDb();
    mockState.guildCache.set("guild1", guild);
    mockState.setDb(db);

    recordSpike("guild1");
    recordSpike("guild1");
    await setRaidStage(guild, 1, db);

    const state = getRaidState("guild1");
    expect(state.stage).toBe(1);
    expect(state.spikeCount).toBe(0);

    mockState.guildCache.delete("guild1");
    db.close();
  });
});

describe("setRaidStage — stage transitions", () => {
  let guild;
  let db;

  beforeEach(() => {
    guild = makeGuild("guild1");
    db = makeDb();
    mockState.guildCache.set("guild1", guild);
    mockState.setDb(db);
  });

  afterEach(() => {
    resetRaidState();
    mockState.guildCache.delete("guild1");
    db.close();
  });

  it("stage 0→1: backs up permissions and sets 1800s slowmode", async () => {
    await setRaidStage(guild, 1, db);

    expect(getRaidStage("guild1")).toBe(1);

    for (const [, ch] of guild.channels.cache) {
      expect(ch.edit).toHaveBeenCalledWith(
        expect.objectContaining({ rateLimitPerUser: 1800 }),
      );
    }

    const row = db
      .prepare("SELECT backup_json FROM RaidState WHERE guild_id = ?")
      .get("guild1");
    expect(row).toBeDefined();
    expect(JSON.parse(row.backup_json).length).toBeGreaterThan(0);
  });

  it("stage 1→2: updates slowmode to 7200s without re-backing-up", async () => {
    await setRaidStage(guild, 1, db);
    vi.clearAllMocks();

    await setRaidStage(guild, 2, db);

    expect(getRaidStage("guild1")).toBe(2);
    for (const [, ch] of guild.channels.cache) {
      expect(ch.edit).toHaveBeenCalledWith(
        expect.objectContaining({ rateLimitPerUser: 7200 }),
      );
    }
  });

  it("stage 3: disables everyone send and creates temp channel", async () => {
    await setRaidStage(guild, 3, db);

    expect(getRaidStage("guild1")).toBe(3);

    for (const [, ch] of guild.channels.cache) {
      expect(ch.permissionOverwrites.edit).toHaveBeenCalledWith(
        expect.objectContaining({ id: "everyone_role" }),
        expect.objectContaining({ SendMessages: false }),
        expect.objectContaining({ reason: "EXIA raid lockdown" }),
      );
    }

    expect(guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "raid-temp-channel" }),
    );
  });

  it("stage any→0: reverts all changes", async () => {
    await setRaidStage(guild, 1, db);
    vi.clearAllMocks();

    await setRaidStage(guild, 0, db);

    expect(getRaidStage("guild1")).toBe(0);

    for (const [, ch] of guild.channels.cache) {
      expect(ch.edit).toHaveBeenCalledWith(
        expect.objectContaining({ rateLimitPerUser: 0 }),
      );
    }

    const row = db
      .prepare("SELECT * FROM RaidState WHERE guild_id = ?")
      .get("guild1");
    expect(row).toBeDefined();
    expect(row.stage).toBe(0);
  });

  it("returns true for same-stage transition (no-op)", async () => {
    expect(await setRaidStage(guild, 0, db)).toBe(true);
    expect(getRaidStage("guild1")).toBe(0);
  });

  it("returns false when channel operations fail", async () => {
    const emptyGuild = {
      id: "empty",
      name: "Empty",
      channels: {
        cache: new Map(),
        create: vi.fn().mockRejectedValue(new Error("no perms")),
      },
      roles: { everyone: { id: "x" } },
    };
    mockState.guildCache.set("empty", emptyGuild);

    expect(await setRaidStage(emptyGuild, 1, db)).toBe(false);

    mockState.guildCache.delete("empty");
  });
});

describe("auto-detection timer", () => {
  let guild;
  let db;

  beforeEach(() => {
    vi.useFakeTimers();
    guild = makeGuild("guild1");
    db = makeDb();
    mockState.guildCache.set("guild1", guild);
    mockState.setDb(db);
    startRaidDetection();
  });

  afterEach(() => {
    resetRaidState();
    mockState.guildCache.delete("guild1");
    db.close();
    vi.useRealTimers();
  });

  it("escalates from stage 0→1 after 10 spikes within window", async () => {
    startRaidDetection();

    for (let i = 0; i < 10; i++) {
      recordSpike("guild1");
    }
    expect(getRaidStage("guild1")).toBe(0);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getRaidStage("guild1")).toBe(1);
  });

  it("escalates from stage 1→2 after 20 spikes within window", async () => {
    await spikeAndDetect("guild1", 10);
    expect(getRaidStage("guild1")).toBe(1);

    for (let i = 0; i < 20; i++) {
      recordSpike("guild1");
    }
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getRaidStage("guild1")).toBe(2);
  });

  it("escalates from stage 2→3 after 30 spikes within window", async () => {
    await spikeAndDetect("guild1", 10);
    await spikeAndDetect("guild1", 20);
    expect(getRaidStage("guild1")).toBe(2);

    for (let i = 0; i < 30; i++) {
      recordSpike("guild1");
    }
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getRaidStage("guild1")).toBe(3);
  });

  it("stays at stage 3 after more spikes (no escalation beyond 3)", async () => {
    await spikeAndDetect("guild1", 10);
    await spikeAndDetect("guild1", 20);
    await spikeAndDetect("guild1", 30);
    expect(getRaidStage("guild1")).toBe(3);

    for (let i = 0; i < 100; i++) {
      recordSpike("guild1");
    }
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getRaidStage("guild1")).toBe(3);
  });

  it("resets spike window after 60s of inactivity without escalation", async () => {
    startRaidDetection();
    for (let i = 0; i < 9; i++) {
      recordSpike("guild1");
    }

    await vi.advanceTimersByTimeAsync(90_000);
    expect(getRaidStage("guild1")).toBe(0);
  });

  it("does not escalate with insufficient spikes", async () => {
    startRaidDetection();
    recordSpike("guild1");
    recordSpike("guild1");

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getRaidStage("guild1")).toBe(0);
  });

  it("escalates from stage 0→3 in sequence (10+20+30 spikes)", async () => {
    await spikeAndDetect("guild1", 10);
    await spikeAndDetect("guild1", 20);
    await spikeAndDetect("guild1", 30);
    expect(getRaidStage("guild1")).toBe(3);
  });
});

// ─── Helper ─────────────────────────────────────────────────────────────────

async function spikeAndDetect(guildId, count) {
  for (let i = 0; i < count; i++) {
    recordSpike(guildId);
  }
  await vi.advanceTimersByTimeAsync(30_000);
}
