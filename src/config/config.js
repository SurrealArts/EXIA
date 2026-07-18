import dotenvFlow from "dotenv-flow";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clog } from "../utils/clog.js";

const LOG_TAG = "[src/config/config.js]";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

dotenvFlow.config({ path: repoRoot });
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf-8"));

// BOT VARIABLES
export const clientid = process.env.CLIENT_ID;
export const token = process.env.TOKEN;
export const version = pkg.version;

// LOGGING
export const logWithTime = process.env.LOG_WITH_TIME !== "false";
export const logTimezone = process.env.LOG_TIMEZONE || "UTC";

/**
 * Validates that required environment variables are set.
 * Exits with code 1 if CLIENT_ID or TOKEN are missing.
 */
function validateConfig() {
  const missing = { essential: [], nonEssential: [] };

  if (!clientid) {
    missing.essential.push("CLIENT_ID");
  }
  if (!token) {
    missing.essential.push("TOKEN");
  }

  if (missing.essential.length > 0) {
    clog(console.error, `${LOG_TAG} Missing essential variables: ${missing.essential.join(", ")}`);
    process.exit(1);
  }
  // nonEssential is unused for now
  if (missing.nonEssential.length > 0) {
    clog(
      console.warn,
      `${LOG_TAG} Missing non-essential variables: ${missing.nonEssential.join(", ")}`,
    );
  }
  clog(console.log, `${LOG_TAG} Validation Success.`);
}

validateConfig();
