import { describe, it, expect } from "vitest";
import { evaluateRegex } from "./regexSandbox.js";

const LONG_TIMEOUT = { timeout: 5000 };

describe("evaluateRegex", () => {
  it("returns matched=true when pattern matches content", async () => {
    const result = await evaluateRegex("spam", "this is spam message", LONG_TIMEOUT);
    expect(result.matched).toBe(true);
    expect(result.fastTrack).toBe(false);
  });

  it("returns matched=false when pattern does not match", async () => {
    const result = await evaluateRegex("spam", "clean message", LONG_TIMEOUT);
    expect(result.matched).toBe(false);
    expect(result.fastTrack).toBe(false);
  });

  it("handles case-insensitive matching", async () => {
    const result = await evaluateRegex("SPAM", "this is Spam", LONG_TIMEOUT);
    expect(result.matched).toBe(true);
  });

  it("handles special regex characters", async () => {
    const result = await evaluateRegex("\\d{3}", "code: 123", LONG_TIMEOUT);
    expect(result.matched).toBe(true);
  });

  it("handles non-matching special regex", async () => {
    const result = await evaluateRegex("\\d{5}", "code: 123", LONG_TIMEOUT);
    expect(result.matched).toBe(false);
  });

  it("handles anchors", async () => {
    const r1 = await evaluateRegex("^hello", "hello world", LONG_TIMEOUT);
    expect(r1.matched).toBe(true);

    const r2 = await evaluateRegex("^hello", "say hello", LONG_TIMEOUT);
    expect(r2.matched).toBe(false);
  });

  it("short-circuits on empty content (no match)", async () => {
    const result = await evaluateRegex(".*", "", LONG_TIMEOUT);
    expect(result.matched).toBe(false);
    expect(result.fastTrack).toBe(false);
  });
});
