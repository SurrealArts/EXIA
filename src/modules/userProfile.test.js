import { describe, it, expect, beforeEach } from "vitest";
import { auditProfile, auditAndTrackProfile, resetProfileFlags } from "./userProfile.js";

/**
 * Creates a minimal mock GuildMember.
 * @param {object} opts
 * @param {number} opts.accountAgeDays  - account age in days (negative = future)
 * @param {boolean} opts.hasAvatar
 * @param {string} opts.id
 * @returns {{ user: { id: string, createdTimestamp: number, avatar: string|null }, member: object }}
 */
function makeMember({ accountAgeDays = 365, hasAvatar = true, id = "user_1" } = {}) {
  const createdTimestamp = Date.now() - accountAgeDays * 24 * 60 * 60 * 1000;
  return {
    user: {
      id,
      createdTimestamp,
      avatar: hasAvatar ? "abc123" : null,
    },
  };
}

const GUILD_ID = "guild_1";

describe("auditProfile", () => {
  it("returns 1.0 multiplier for old account with avatar", () => {
    const { multiplier, reasons } = auditProfile(makeMember());
    expect(multiplier).toBe(1.0);
    expect(reasons).toHaveLength(0);
  });

  it("returns 1.5 multiplier for young account (< 7 days)", () => {
    const member = makeMember({ accountAgeDays: 1 });
    const { multiplier, reasons } = auditProfile(member);
    expect(multiplier).toBe(1.5);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/too young/i);
  });

  it("returns 1.2 multiplier for account with no avatar", () => {
    const member = makeMember({ hasAvatar: false });
    const { multiplier, reasons } = auditProfile(member);
    expect(multiplier).toBe(1.2);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/no avatar/i);
  });

  it("accumulates multiplier for both young account and no avatar", () => {
    const member = makeMember({ accountAgeDays: 1, hasAvatar: false });
    const { multiplier, reasons } = auditProfile(member);
    expect(multiplier).toBe(2.0);
    expect(reasons).toHaveLength(2);
  });

  it("returns exactly 7 days as not young (boundary)", () => {
    const member = makeMember({ accountAgeDays: 7 });
    const { multiplier } = auditProfile(member);
    expect(multiplier).toBe(1.0);
  });

  it("returns 1.5 for account just below 7 days", () => {
    const member = makeMember({ accountAgeDays: 6.999 });
    const { multiplier } = auditProfile(member);
    expect(multiplier).toBe(1.5);
  });
});

describe("auditAndTrackProfile", () => {
  beforeEach(() => {
    resetProfileFlags();
  });

  it("returns state=new on first flag with reasons and multiplier", () => {
    const member = makeMember({ accountAgeDays: 1, hasAvatar: false });
    const result = auditAndTrackProfile(member, "en", GUILD_ID);
    expect(result.state).toBe("new");
    expect(result.reasons).toHaveLength(2);
    expect(result.multiplier).toBe(2.0);
  });

  it("returns state=active while conditions persist, without re-flagging reasons", () => {
    const member = makeMember({ accountAgeDays: 1, hasAvatar: false });
    const first = auditAndTrackProfile(member, "en", GUILD_ID);
    expect(first.state).toBe("new");

    const second = auditAndTrackProfile(member, "en", GUILD_ID);
    expect(second.state).toBe("active");
    expect(second.reasons).toHaveLength(0);
    expect(second.multiplier).toBe(2.0);
  });

  it("returns state=cleared with prior reasons when conditions resolve", () => {
    const flagged = makeMember({ accountAgeDays: 1, hasAvatar: false });
    auditAndTrackProfile(flagged, "en", GUILD_ID);

    const cleared = makeMember({ accountAgeDays: 365, hasAvatar: true });
    const result = auditAndTrackProfile(cleared, "en", GUILD_ID);
    expect(result.state).toBe("cleared");
    expect(result.reasons).toHaveLength(2);
    expect(result.multiplier).toBe(1.0);
  });

  it("returns state=none when never flagged and clean", () => {
    const member = makeMember({ accountAgeDays: 365, hasAvatar: true });
    const result = auditAndTrackProfile(member, "en", GUILD_ID);
    expect(result.state).toBe("none");
    expect(result.reasons).toHaveLength(0);
  });

  it("stays active while any condition persists after partial resolution", () => {
    const flagged = makeMember({ accountAgeDays: 1, hasAvatar: false });
    auditAndTrackProfile(flagged, "en", GUILD_ID);

    const stillFlagged = makeMember({ accountAgeDays: 365, hasAvatar: false });
    const result = auditAndTrackProfile(stillFlagged, "en", GUILD_ID);
    expect(result.state).toBe("active");
    expect(result.reasons).toHaveLength(0);
    expect(result.multiplier).toBe(1.2);
  });

  it("tracks users independently per guild", () => {
    auditAndTrackProfile(
      makeMember({ accountAgeDays: 1, hasAvatar: false, id: "user_a" }),
      "en",
      GUILD_ID,
    );

    const cleanOther = auditAndTrackProfile(
      makeMember({ accountAgeDays: 365, hasAvatar: true, id: "user_b" }),
      "en",
      GUILD_ID,
    );
    expect(cleanOther.state).toBe("none");

    const stillFlagged = auditAndTrackProfile(
      makeMember({ accountAgeDays: 1, hasAvatar: false, id: "user_a" }),
      "en",
      GUILD_ID,
    );
    expect(stillFlagged.state).toBe("active");
  });

  it("re-flags as new after reset", () => {
    const member = makeMember({ accountAgeDays: 1, hasAvatar: false });
    auditAndTrackProfile(member, "en", GUILD_ID);
    resetProfileFlags();
    const result = auditAndTrackProfile(member, "en", GUILD_ID);
    expect(result.state).toBe("new");
  });
});
