import { describe, it, expect, beforeEach } from "vitest";
import {
  checkMentionGuard,
  getMentionMultiplier,
  getAllMentionState,
  resetMentionState,
} from "./mentionGuard.js";

const GUILD_ID = "guild_1";
const USER_ID = "user_1";

/**
 * Creates a minimal mock Discord Message.
 * @param {object} opts
 * @param {boolean} opts.everyone
 * @param {boolean} opts.here
 * @param {string[]} opts.roleMentions - role names
 * @param {bigint} [opts.permissions] - member permissions bitfield
 */
function makeMessage({ everyone = false, here = false, roleMentions = [], permissions = 0n } = {}) {
  const roles = new Map();
  for (const name of roleMentions) {
    roles.set(name, { name });
  }
  return {
    author: { id: USER_ID },
    guildId: GUILD_ID,
    mentions: {
      everyone,
      here,
      roles,
    },
    member: {
      permissions: {
        has(perm) {
          if (typeof perm === "bigint") {
            return (permissions & perm) === perm;
          }
          if (perm === "Administrator") {
            return (permissions & 8n) === 8n;
          }
          return false;
        },
      },
    },
  };
}

describe("checkMentionGuard", () => {
  beforeEach(() => {
    resetMentionState();
  });

  it("returns not triggered for a clean message with no state", () => {
    const msg = makeMessage();
    const result = checkMentionGuard(msg, "en");
    expect(result.triggered).toBe(false);
    expect(result.multiplier).toBe(1.0);
    expect(result.reasons).toHaveLength(0);
  });

  it("triggers on @everyone without ManageMessages", () => {
    const msg = makeMessage({ everyone: true });
    const result = checkMentionGuard(msg, "en");
    expect(result.triggered).toBe(true);
    expect(result.multiplier).toBe(3.0);
    expect(result.reasons).toContain("mentioned @everyone");
  });

  it("triggers on @here", () => {
    const msg = makeMessage({ here: true });
    const result = checkMentionGuard(msg, "en");
    expect(result.triggered).toBe(true);
    expect(result.multiplier).toBe(3.0);
    expect(result.reasons).toContain("mentioned @here");
  });

  it("triggers on role mention", () => {
    const msg = makeMessage({ roleMentions: ["Moderators"] });
    const result = checkMentionGuard(msg, "en");
    expect(result.triggered).toBe(true);
    expect(result.multiplier).toBe(3.0);
    expect(result.reasons).toContain("mentioned @Moderators");
  });

  it("includes all reasons when multiple mention types are present", () => {
    const msg = makeMessage({
      everyone: true,
      here: true,
      roleMentions: ["Admins", "Mods"],
    });
    const result = checkMentionGuard(msg, "en");
    expect(result.triggered).toBe(true);
    expect(result.reasons).toContain("mentioned @everyone");
    expect(result.reasons).toContain("mentioned @here");
    expect(result.reasons).toContain("mentioned @Admins");
    expect(result.reasons).toContain("mentioned @Mods");
  });

  it("does not trigger on user with Administrator permission", () => {
    const msg = makeMessage({ everyone: true, permissions: 8n });
    const result = checkMentionGuard(msg, "en");
    expect(result.triggered).toBe(false);
    expect(result.multiplier).toBe(1.0);
  });

  it("does not trigger on user with ManageMessages permission", () => {
    const msg = makeMessage({ everyone: true, permissions: 0x2000n });
    const result = checkMentionGuard(msg, "en");
    expect(result.triggered).toBe(false);
    expect(result.multiplier).toBe(1.0);
  });

  it("escalates multiplier on repeat mentions", () => {
    const msg = makeMessage({ everyone: true });

    const first = checkMentionGuard(msg, "en");
    expect(first.multiplier).toBe(3.0);

    const second = checkMentionGuard(msg, "en");
    expect(second.multiplier).toBe(4.0);

    const third = checkMentionGuard(msg, "en");
    expect(third.multiplier).toBe(5.0);
  });

  it("caps multiplier at 5.0", () => {
    const msg = makeMessage({ everyone: true });

    for (let i = 0; i < 5; i++) {
      checkMentionGuard(msg, "en");
    }

    const result = checkMentionGuard(msg, "en");
    expect(result.multiplier).toBe(5.0);
  });

  it("decays multiplier on clean messages", () => {
    const msg = makeMessage({ everyone: true });
    checkMentionGuard(msg, "en"); // triggered, mult = 3.0

    // First clean message: cleanStreak=1, decay = 1 * 0.1 = 0.1
    const clean1 = makeMessage();
    const r1 = checkMentionGuard(clean1, "en");
    expect(r1.triggered).toBe(false);
    expect(getMentionMultiplier(GUILD_ID, USER_ID)).toBeCloseTo(2.9);

    // Second clean message: cleanStreak=2, decay = 2 * 0.1 = 0.2
    const clean2 = makeMessage();
    checkMentionGuard(clean2, "en");
    expect(getMentionMultiplier(GUILD_ID, USER_ID)).toBeCloseTo(2.7);
  });

  it("accelerates decay with longer clean streaks", () => {
    const msg = makeMessage({ everyone: true });
    checkMentionGuard(msg, "en"); // mult = 3.0

    // 3 clean messages
    for (let i = 0; i < 3; i++) {
      const clean = makeMessage();
      checkMentionGuard(clean, "en");
    }
    // After clean streak of 3:
    // msg 1: mult = 3.0 - 1*0.1 = 2.9, streak = 1
    // msg 2: mult = 2.9 - 2*0.1 = 2.7, streak = 2
    // msg 3: mult = 2.7 - 3*0.1 = 2.4, streak = 3
    expect(getMentionMultiplier(GUILD_ID, USER_ID)).toBeCloseTo(2.4);
  });

  it("removes state entry when multiplier reaches 1.0", () => {
    const msg = makeMessage({ everyone: true });
    checkMentionGuard(msg, "en"); // mult = 3.0

    // Decay with enough clean messages to reach 1.0
    // 3.0 - 0.1 - 0.2 - 0.3 - 0.4 - 0.5 - 0.6 = 0.9 < 1.0
    for (let i = 0; i < 6; i++) {
      const clean = makeMessage();
      checkMentionGuard(clean, "en");
    }

    expect(getMentionMultiplier(GUILD_ID, USER_ID)).toBe(1.0);
  });

  it("resets cleanStreak to 0 when a new mention triggers", () => {
    const msg = makeMessage({ everyone: true });
    checkMentionGuard(msg, "en"); // mult = 3.0

    // 2 clean messages → cleanStreak = 2
    const clean1 = makeMessage();
    checkMentionGuard(clean1, "en");
    const clean2 = makeMessage();
    checkMentionGuard(clean2, "en");

    // Mention again → cleanStreak reset to 0, mult = 2.7 + 1.0
    const mentionAgain = makeMessage({ everyone: true });
    const result = checkMentionGuard(mentionAgain, "en");
    expect(result.multiplier).toBeCloseTo(3.7);
    // One more clean: should decay by 1*0.1 (streak=1), not 3*0.1
    const clean3 = makeMessage();
    checkMentionGuard(clean3, "en");
    expect(getMentionMultiplier(GUILD_ID, USER_ID)).toBeCloseTo(3.6);
  });

  it("returns all state entries for a guild", () => {
    const msg = makeMessage({ everyone: true });
    checkMentionGuard(msg, "en");

    const state = getAllMentionState(GUILD_ID);
    expect(state).toHaveLength(1);
    expect(state[0].userId).toBe(USER_ID);
    expect(state[0].multiplier).toBe(3.0);
    expect(state[0].cleanStreak).toBe(0);
  });

  it("handles multiple users independently", () => {
    const msg1 = makeMessage({ everyone: true });
    checkMentionGuard(msg1, "en");

    const msg2 = {
      author: { id: "user_2" },
      guildId: GUILD_ID,
      mentions: { everyone: true, here: false, roles: new Map() },
      member: {
        permissions: { has: () => false },
      },
    };
    const result2 = checkMentionGuard(msg2, "en");
    expect(result2.multiplier).toBe(3.0); // independent state
  });
});
