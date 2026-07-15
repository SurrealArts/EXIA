import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocales, reloadLocales, t, getGuildLanguage } from "./locale.js";
import { invalidateCache } from "../utils/queryCache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, "..", "locales");

const backupDir = path.join(LOCALES_DIR, ".test-backups");
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

function backupLocale(file) {
  const fp = path.join(LOCALES_DIR, file);
  if (fs.existsSync(fp)) {
    fs.copyFileSync(fp, path.join(backupDir, file));
  }
}

function restoreLocale(file) {
  const bak = path.join(backupDir, file);
  const fp = path.join(LOCALES_DIR, file);
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, fp);
  }
}

function writeLocale(file, data) {
  fs.writeFileSync(path.join(LOCALES_DIR, file), JSON.stringify(data, null, 2), "utf-8");
}

describe("loadLocales", () => {
  beforeEach(() => {
    backupLocale("en.json");
    backupLocale("ja.json");
  });

  afterEach(() => {
    try {
      restoreLocale("en.json");
    } catch {}
    try {
      restoreLocale("ja.json");
    } catch {}
  });

  it("loads en.json and ja.json", () => {
    loadLocales();
    const result = t("en", "command.config.description");
    expect(result).toBe("Configure EXIA moderation settings");
    const jaResult = t("ja", "command.config.description");
    expect(jaResult).toBe("EXIA モデレーション設定を構成");
  });

  it("falls back to en when key is missing in ja", () => {
    writeLocale("ja.json", {});
    loadLocales();
    const result = t("ja", "command.config.description");
    expect(result).toBe("Configure EXIA moderation settings");
  });

  it("returns the key when missing in all locales", () => {
    loadLocales();
    const result = t("en", "nonexistent.key");
    expect(result).toBe("nonexistent.key");
  });

  it("falls back to en when lang has no locale file", () => {
    loadLocales();
    const result = t("fr", "command.config.description");
    expect(result).toBe("Configure EXIA moderation settings");
  });
});

describe("t() interpolation", () => {
  beforeEach(() => {
    backupLocale("en.json");
    writeLocale("en.json", {
      "test.simple": "Hello {name}",
      "test.multi": "{a} and {b}",
      "test.noVars": "Static text",
      "test.missing": "Missing {x} here",
      "test.unicode": "⚠️ **{name}** in **{place}**",
    });
    loadLocales();
  });

  afterEach(() => {
    try {
      restoreLocale("en.json");
    } catch {}
  });

  it("interpolates a single variable", () => {
    expect(t("en", "test.simple", { name: "World" })).toBe("Hello World");
  });

  it("interpolates multiple variables", () => {
    expect(t("en", "test.multi", { a: "1", b: "2" })).toBe("1 and 2");
  });

  it("returns static text with no vars", () => {
    expect(t("en", "test.noVars")).toBe("Static text");
  });

  it("handles unicode and markdown in templates", () => {
    expect(t("en", "test.unicode", { name: "Warning", place: "Server" })).toBe(
      "⚠️ **Warning** in **Server**",
    );
  });

  it("leaves missing variable placeholders intact", () => {
    const result = t("en", "test.missing", {});
    expect(result).toBe("Missing {x} here");
  });

  it("handles null/undefined variable values as empty", () => {
    expect(t("en", "test.simple", { name: null })).toBe("Hello ");
    expect(t("en", "test.simple", { name: undefined })).toBe("Hello ");
  });
});

describe("getGuildLanguage", () => {
  beforeEach(() => {
    invalidateCache();
  });

  it("returns 'en' for guild without language set", () => {
    const mockDb = {
      prepare: () => ({
        get: () => null,
      }),
    };
    expect(getGuildLanguage(mockDb, "guild1")).toBe("en");
  });

  it("returns the stored language", () => {
    const mockDb = {
      prepare: () => ({
        get: () => ({ language: "ja" }),
      }),
    };
    expect(getGuildLanguage(mockDb, "guild1")).toBe("ja");
  });
});

describe("reloadLocales", () => {
  beforeEach(() => {
    backupLocale("en.json");
    loadLocales();
  });

  afterEach(() => {
    try {
      restoreLocale("en.json");
    } catch {}
  });

  it("reloads updated locale files", () => {
    writeLocale("en.json", {
      ...JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf-8")),
      "test.dynamic": "Dynamic value",
    });
    reloadLocales();
    expect(t("en", "test.dynamic")).toBe("Dynamic value");
  });
});
