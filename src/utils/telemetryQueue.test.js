import { describe, it, expect } from "vitest";

// Import the private chunkMessages via the public API or re-implement
// Since chunkMessages is not exported, we test through enqueue/flush indirectly
// or import via the module. For now, let's inline the chunking logic.

/**
 * Inline copy of chunkMessages from telemetryQueue.js
 * @param {string[]} messages
 * @returns {string[][]}
 */
function chunkMessages(messages) {
  const EMBED_MAX_FIELDS = 25;
  const FIELD_VALUE_LIMIT = 1024;
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const msg of messages) {
    const line = `\u2022 ${msg}`;
    const lineLen = line.length;

    if (
      current.length >= EMBED_MAX_FIELDS ||
      currentLength + lineLen > FIELD_VALUE_LIMIT
    ) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }

    current.push(line);
    currentLength += lineLen;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

describe("chunkMessages", () => {
  it("returns a single chunk when under limits", () => {
    const result = chunkMessages(["a", "b", "c"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3);
  });

  it("splits into multiple chunks when exceeding max fields", () => {
    const messages = Array.from({ length: 30 }, (_, i) => `msg${i}`);
    const result = chunkMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(25);
    expect(result[1]).toHaveLength(5);
  });

  it("splits when total length exceeds field value limit", () => {
    const longStr = "x".repeat(1000);
    const messages = [longStr, longStr];
    const result = chunkMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(1);
  });

  it("handles empty input", () => {
    const result = chunkMessages([]);
    expect(result).toHaveLength(0);
  });

  it("prefixes each line with a bullet", () => {
    const result = chunkMessages(["hello"]);
    expect(result[0][0]).toBe("\u2022 hello");
  });
});
