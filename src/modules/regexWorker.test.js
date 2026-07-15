import { describe, it, expect } from "vitest";
import { evaluateRegex } from "./regexSandbox.js";

describe("regexWorker (via evaluateRegex)", () => {
  it("returns matched=true for matching pattern", async () => {
    const result = await evaluateRegex("hello", "hello world");
    expect(result.matched).toBe(true);
  });

  it("returns matched=false for non-matching pattern", async () => {
    const result = await evaluateRegex("hello", "goodbye world");
    expect(result.matched).toBe(false);
  });

  it("matches case-insensitively", async () => {
    const result = await evaluateRegex("HELLO", "Say hello world");
    expect(result.matched).toBe(true);
  });

  it("handles regex special characters", async () => {
    const result = await evaluateRegex("\\d{3}", "code: 123");
    expect(result.matched).toBe(true);
  });

  it("handles non-matching special characters", async () => {
    const result = await evaluateRegex("\\d{5}", "code: 123");
    expect(result.matched).toBe(false);
  });

  it("handles anchors", async () => {
    const r1 = await evaluateRegex("^hello", "hello world");
    expect(r1.matched).toBe(true);

    const r2 = await evaluateRegex("^hello", "say hello");
    expect(r2.matched).toBe(false);
  });

  it("matches with global flag (g) implicitly added", async () => {
    const result = await evaluateRegex("a", "aaa");
    expect(result.matched).toBe(true);
  });

  it("returns matched=true + fastTrack for invalid regex pattern", async () => {
    const result = await evaluateRegex("[invalid", "any content");
    expect(result.matched).toBe(true);
    expect(result.fastTrack).toBe(true);
    expect(result.error).toBeDefined();
  });

  it("matches alternation patterns", async () => {
    const r1 = await evaluateRegex("spam|phish", "this is spam");
    expect(r1.matched).toBe(true);

    const r2 = await evaluateRegex("spam|phish", "this is phish");
    expect(r2.matched).toBe(true);

    const r3 = await evaluateRegex("spam|phish", "this is clean");
    expect(r3.matched).toBe(false);
  });

  it("matches content with newlines", async () => {
    const result = await evaluateRegex("line2", "line1\nline2\nline3");
    expect(result.matched).toBe(true);
  });

  it("does not match empty pattern against non-empty content (no match)", async () => {
    const result = await evaluateRegex("(?!)", "anything");
    expect(result.matched).toBe(false);
  });
});
