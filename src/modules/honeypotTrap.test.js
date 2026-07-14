import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { checkHoneypot } from "./honeypotTrap.js";

describe("checkHoneypot", () => {
  let db;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE GuildConfiguration (
        guild_id TEXT PRIMARY KEY,
        honeypot_channel_id TEXT
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * @param {object} opts
   * @param {string} opts.channelId
   * @param {boolean} [opts.isAdmin=false]
   * @returns {import('discord.js').Message}
   */
  function makeMessage({ channelId, isAdmin = false }) {
    return {
      guildId: "guild1",
      channelId,
      author: { id: "user1" },
      member: {
        permissions: {
          has(perm) {
            return isAdmin && perm === "Administrator";
          },
        },
      },
    };
  }

  it("returns not triggered when no honeypot is configured", () => {
    const message = makeMessage({ channelId: "123" });
    const result = checkHoneypot(message, db);
    expect(result.triggered).toBe(false);
    expect(result.whitelisted).toBe(false);
  });

  it("returns not triggered when message is in a different channel", () => {
    db.prepare(
      "INSERT INTO GuildConfiguration (guild_id, honeypot_channel_id) VALUES (?, ?)",
    ).run("guild1", "honey_channel");

    const message = makeMessage({ channelId: "general" });
    const result = checkHoneypot(message, db);
    expect(result.triggered).toBe(false);
  });

  it("returns triggered + whitelisted for admin in honeypot", () => {
    db.prepare(
      "INSERT INTO GuildConfiguration (guild_id, honeypot_channel_id) VALUES (?, ?)",
    ).run("guild1", "honey_channel");

    const message = makeMessage({ channelId: "honey_channel", isAdmin: true });
    const result = checkHoneypot(message, db);
    expect(result.triggered).toBe(true);
    expect(result.whitelisted).toBe(true);
  });

  it("returns triggered + not whitelisted for non-admin in honeypot", () => {
    db.prepare(
      "INSERT INTO GuildConfiguration (guild_id, honeypot_channel_id) VALUES (?, ?)",
    ).run("guild1", "honey_channel");

    const message = makeMessage({ channelId: "honey_channel", isAdmin: false });
    const result = checkHoneypot(message, db);
    expect(result.triggered).toBe(true);
    expect(result.whitelisted).toBe(false);
  });

  it("isolates honeypot config per guild", () => {
    db.prepare(
      "INSERT INTO GuildConfiguration (guild_id, honeypot_channel_id) VALUES (?, ?)",
    ).run("guild1", "honey_channel");

    const message = {
      guildId: "guild2",
      channelId: "honey_channel",
      member: null,
    };
    const result = checkHoneypot(message, db);
    expect(result.triggered).toBe(false);
  });

  it("handles missing member gracefully (null)", () => {
    db.prepare(
      "INSERT INTO GuildConfiguration (guild_id, honeypot_channel_id) VALUES (?, ?)",
    ).run("guild1", "honey_channel");

    const message = {
      guildId: "guild1",
      channelId: "honey_channel",
      author: { id: "user1" },
      member: null,
    };
    const result = checkHoneypot(message, db);
    expect(result.triggered).toBe(true);
    expect(result.whitelisted).toBe(false);
  });
});
