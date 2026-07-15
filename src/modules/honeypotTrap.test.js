import { describe, it, expect } from "vitest";
import { checkHoneypot } from "./honeypotTrap.js";

describe("checkHoneypot", () => {
  function makeMessage({ channelId, isAdmin = false, guildId = "guild1" }) {
    return {
      guildId,
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
    const result = checkHoneypot(message, { honeypot_channel_id: null });
    expect(result.triggered).toBe(false);
    expect(result.whitelisted).toBe(false);
  });

  it("returns not triggered when message is in a different channel", () => {
    const message = makeMessage({ channelId: "general" });
    const result = checkHoneypot(message, { honeypot_channel_id: "honey_channel" });
    expect(result.triggered).toBe(false);
  });

  it("returns triggered + whitelisted for admin in honeypot", () => {
    const message = makeMessage({ channelId: "honey_channel", isAdmin: true });
    const result = checkHoneypot(message, { honeypot_channel_id: "honey_channel" });
    expect(result.triggered).toBe(true);
    expect(result.whitelisted).toBe(true);
  });

  it("returns triggered + not whitelisted for non-admin in honeypot", () => {
    const message = makeMessage({ channelId: "honey_channel", isAdmin: false });
    const result = checkHoneypot(message, { honeypot_channel_id: "honey_channel" });
    expect(result.triggered).toBe(true);
    expect(result.whitelisted).toBe(false);
  });

  it("isolates honeypot config per guild", () => {
    const message = {
      guildId: "guild2",
      channelId: "honey_channel",
      member: null,
    };
    const result = checkHoneypot(message, { honeypot_channel_id: "honey_channel" });
    expect(result.triggered).toBe(true);
  });

  it("handles missing member gracefully (null)", () => {
    const message = {
      guildId: "guild1",
      channelId: "honey_channel",
      author: { id: "user1" },
      member: null,
    };
    const result = checkHoneypot(message, { honeypot_channel_id: "honey_channel" });
    expect(result.triggered).toBe(true);
    expect(result.whitelisted).toBe(false);
  });

  it("returns not triggered when guildConfig has no honeypot_channel_id", () => {
    const message = makeMessage({ channelId: "honey_channel" });
    const result = checkHoneypot(message, {});
    expect(result.triggered).toBe(false);
  });
});
