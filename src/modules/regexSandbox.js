import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clog } from "../utils/clog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Evaluates a regex pattern against content inside a Worker thread.
 * Skips evaluation if content is empty — returns no match immediately.
 *
 * @param {string} pattern
 * @param {string} content
 * @param {object} [options]
 * @param {number} [options.timeout]
 * @returns {Promise<{ matched: boolean, fastTrack: boolean, error?: string }>}
 */
export function evaluateRegex(pattern, content, options = {}) {
  if (!content || content.length === 0) {
    return Promise.resolve({ matched: false, fastTrack: false });
  }

  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  let terminated = false;

  return new Promise((resolve) => {
    const workerPath = path.resolve(__dirname, "regexWorker.js");
    const start = Date.now();

    const worker = new Worker(workerPath, {
      workerData: { pattern, content },
    });

    const timer = setTimeout(() => {
      terminated = true;
      worker.terminate();
      clog(
        console.warn,
        `[src/modules/regexSandbox.js] Worker timed out after ${timeoutMs}ms for pattern: ${pattern.slice(0, 60)} — content: "${content.slice(0, 80)}"`,
      );
      resolve({
        matched: false,
        fastTrack: false,
        error: "Regex evaluation timed out",
      });
    }, timeoutMs);

    worker.on("message", (result) => {
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      clog(
        console.log,
        `[src/modules/regexSandbox.js] Worker completed in ${elapsed}ms — matched: ${result.matched} — pattern: ${pattern.slice(0, 60)}`,
      );
      resolve({ matched: result.matched, fastTrack: false });
    });

    worker.on("error", (err) => {
      clearTimeout(timer);
      clog(console.error, `[src/modules/regexSandbox.js] Worker error:`, err);
      resolve({ matched: true, fastTrack: true, error: err.message });
    });

    worker.on("exit", (code) => {
      if (!terminated && code !== 0) {
        clearTimeout(timer);
        clog(
          console.warn,
          `[src/modules/regexSandbox.js] Worker exited unexpectedly with code ${code} — pattern: ${pattern.slice(0, 60)}`,
        );
        resolve({
          matched: true,
          fastTrack: true,
          error: `Worker exit code ${code}`,
        });
      }
    });
  });
}
