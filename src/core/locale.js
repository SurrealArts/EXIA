import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { clog } from "../utils/clog.js";
import { cachedGet } from "../utils/queryCache.js";

const LOG_TAG = "[src/core/locale.js]";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "..", "locales");

const locales = new Map();

let loaded = false;

export function loadLocales() {
  locales.clear();

  const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    clog(console.warn, `${LOG_TAG} No locale files found in ${LOCALES_DIR}`);
    loaded = true;
    return;
  }

  for (const file of files) {
    const lang = file.replace(".json", "");
    const filePath = join(LOCALES_DIR, file);

    let data;
    try {
      const content = readFileSync(filePath, "utf-8");
      data = JSON.parse(content);
    } catch (err) {
      clog(console.error, `${LOG_TAG} Failed to load ${file}: ${err.message}`);
      continue;
    }

    const map = new Map(Object.entries(data));
    locales.set(lang, map);
    clog(console.log, `${LOG_TAG} Loaded locale "${lang}" — ${map.size} keys`);
  }

  const enMap = locales.get("en");
  if (!enMap) {
    clog(console.error, `${LOG_TAG} en.json not found — no fallback available`);
    loaded = true;
    return;
  }

  for (const [lang, map] of locales) {
    if (lang === "en") {
      continue;
    }

    for (const [key, value] of map) {
      if (typeof value !== "string" || value.trim() === "") {
        clog(console.warn, `${LOG_TAG} ${lang}.json: key "${key}" has empty value`);
      }
    }

    for (const key of enMap.keys()) {
      if (!map.has(key)) {
        clog(
          console.warn,
          `${LOG_TAG} ${lang}.json: missing key "${key}" (present in en.json) — will fall back to English`,
        );
      }
    }
  }

  loaded = true;
}

export function reloadLocales() {
  clog(console.log, `${LOG_TAG} Reloading all locale files...`);
  const prevCount = locales.size;
  loadLocales();
  clog(
    console.log,
    `${LOG_TAG} Reload complete — ${locales.size} locales loaded (was ${prevCount})`,
  );
}

export function t(lang, key, vars = {}) {
  if (!loaded) {
    loadLocales();
  }
  const langMap = locales.get(lang);

  if (!langMap || !langMap.has(key)) {
    if (lang !== "en") {
      clog(
        console.warn,
        `${LOG_TAG} Missing key "${key}" for language "${lang}" — falling back to en`,
      );
      const enMap = locales.get("en");
      if (enMap && enMap.has(key)) {
        return interpolate(enMap.get(key), vars, key);
      }
    }
    clog(console.warn, `${LOG_TAG} Missing key "${key}" in en.json — returning raw key`);
    return key;
  }

  const template = langMap.get(key);
  if (!template || typeof template !== "string") {
    clog(
      console.warn,
      `${LOG_TAG} Key "${key}" for language "${lang}" is empty — falling back to en`,
    );
    const enMap = locales.get("en");
    if (enMap && enMap.has(key)) {
      return interpolate(enMap.get(key), vars, key);
    }
    return key;
  }

  return interpolate(template, vars, key);
}

export function getGuildLanguage(db, guildId) {
  try {
    const row = cachedGet(
      db,
      "SELECT language FROM GuildConfiguration WHERE guild_id = ?",
      guildId,
    );
    return row?.language || "en";
  } catch {
    return "en";
  }
}

export function resolveInteractionLang(interaction, db, guildId) {
  const map = { ja: "ja", "ja-JP": "ja" };
  return map[interaction.locale] || getGuildLanguage(db, guildId);
}

function interpolate(template, vars, key) {
  if (!template) {
    return template;
  }

  const missing = [];
  const result = template.replace(/\{(\w+)\}/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      const val = vars[name];
      return val === null || val === undefined ? "" : String(val);
    }
    missing.push(name);
    return `{${name}}`;
  });

  if (missing.length > 0) {
    clog(
      console.warn,
      `${LOG_TAG} Key "${key}": missing variable(s) [${missing.join(", ")}] in provided vars`,
    );
  }

  return result;
}
