import { describe, it, expect } from "vitest";
import { auditProfile } from "./userProfile.js";

/**
 * Creates a minimal mock GuildMember.
 * @param {object} opts
 * @param {number} opts.accountAgeDays  - account age in days (negative = future)
 * @param {boolean} opts.hasAvatar
 * @returns {{ user: { createdTimestamp: number, avatar: string|null }, member: object }}
 */
function makeMember({ accountAgeDays = 365, hasAvatar = true } = {}) {
  const createdTimestamp = Date.now() - accountAgeDays * 24 * 60 * 60 * 1000;
  return {
    user: {
      createdTimestamp,
      avatar: hasAvatar ? "abc123" : null,
    },
  };
}

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
