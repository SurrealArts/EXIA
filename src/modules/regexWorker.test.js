import { describe, it, expect } from "vitest";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(__dirname, "regexWorker.js");

function runWorker(pattern, content) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { pattern, content } });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

describe("regexWorker.js", () => {
  it("returns matched=true for matching pattern", async () => {
    const result = await runWorker("hello", "hello world");
    expect(result.matched).toBe(true);
  });

  it("returns matched=false for non-matching pattern", async () => {
    const result = await runWorker("hello", "goodbye world");
    expect(result.matched).toBe(false);
  });

  it("matches case-insensitively", async () => {
    const result = await runWorker("HELLO", "Say hello world");
    expect(result.matched).toBe(true);
  });

  it("handles regex special characters", async () => {
    const result = await runWorker("\\d{3}", "code: 123");
    expect(result.matched).toBe(true);
  });

  it("handles non-matching special characters", async () => {
    const result = await runWorker("\\d{5}", "code: 123");
    expect(result.matched).toBe(false);
  });

  it("handles anchors", async () => {
    const r1 = await runWorker("^hello", "hello world");
    expect(r1.matched).toBe(true);

    const r2 = await runWorker("^hello", "say hello");
    expect(r2.matched).toBe(false);
  });

  it("matches with global flag (g) implicitly added", async () => {
    const result = await runWorker("a", "aaa");
    expect(result.matched).toBe(true);
  });

  it("returns matched=true + fastTrack for invalid regex pattern", async () => {
    const result = await runWorker("[invalid", "any content");
    expect(result.matched).toBe(true);
    expect(result.fastTrack).toBe(true);
    expect(result.error).toBeDefined();
  });

  it("matches alternation patterns", async () => {
    const r1 = await runWorker("spam|phish", "this is spam");
    expect(r1.matched).toBe(true);

    const r2 = await runWorker("spam|phish", "this is phish");
    expect(r2.matched).toBe(true);

    const r3 = await runWorker("spam|phish", "this is clean");
    expect(r3.matched).toBe(false);
  });

  it("matches content with newlines", async () => {
    const result = await runWorker("line2", "line1\nline2\nline3");
    expect(result.matched).toBe(true);
  });

  it("does not match empty pattern against non-empty content (no match)", async () => {
    const result = await runWorker("(?!)", "anything");
    expect(result.matched).toBe(false);
  });
});
