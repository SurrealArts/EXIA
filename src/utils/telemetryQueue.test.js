import { describe, it, expect } from "vitest";
import { chunkMessages } from "./telemetryQueue.js";

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

  it("preserves message content (bullet not added by chunking)", () => {
    const result = chunkMessages(["• **FLAG** hello"]);
    expect(result[0][0]).toBe("• **FLAG** hello");
  });
});
