import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { clog } from "../utils/clog.js";

const LOG_TAG = "[src/modules/regexSandbox.js]";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TIMEOUT_MS = 2000;
const POOL_SIZE = Math.max(2, os.availableParallelism?.() ?? 2);

const workerPath = path.resolve(__dirname, "regexWorker.js");

let msgId = 0;

/**
 * @type {{ worker: Worker, pending: Map<number, { resolve: Function, timer: NodeJS.Timeout }> }[]}
 */
let pool = null;

let nextIdx = 0;

function getPool() {
  if (pool) {
    return pool;
  }

  pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push(spawnWorker());
  }
  clog(console.log, `${LOG_TAG} Regex worker pool created — ${POOL_SIZE} workers`);
  return pool;
}

function spawnWorker() {
  const worker = new Worker(workerPath);
  worker.unref();
  /** @type {Map<number, { resolve: Function, timer: NodeJS.Timeout }>} */
  const pending = new Map();

  worker.on("message", ({ id, matched, fastTrack, error }) => {
    const cb = pending.get(id);
    if (!cb) {
      return;
    }
    clearTimeout(cb.timer);
    pending.delete(id);
    cb.resolve({ matched, fastTrack: !!fastTrack, error });
  });

  worker.on("error", () => {
    for (const [, cb] of pending) {
      clearTimeout(cb.timer);
      cb.resolve({ matched: true, fastTrack: true, error: "Worker crashed" });
    }
    pending.clear();
    // Replace this entry at its index
    const idx = pool ? pool.findIndex((e) => e.worker === worker) : -1;
    if (idx !== -1) {
      pool[idx] = spawnWorker();
    }
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      for (const [, cb] of pending) {
        clearTimeout(cb.timer);
        cb.resolve({ matched: true, fastTrack: true, error: `Worker exit code ${code}` });
      }
      pending.clear();
      const idx = pool ? pool.findIndex((e) => e.worker === worker) : -1;
      if (idx !== -1) {
        pool[idx] = spawnWorker();
      }
    }
  });

  return { worker, pending };
}

/**
 * Evaluates a regex pattern against content inside a Worker thread pool.
 * Skips evaluation if content is empty.
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

  return new Promise((resolve) => {
    const p = getPool();
    nextIdx = (nextIdx + 1) % p.length;
    const entry = p[nextIdx];
    const id = ++msgId;

    const timer = setTimeout(() => {
      entry.pending.delete(id);
      entry.worker.terminate();
      clog(
        console.warn,
        `${LOG_TAG} Worker timed out after ${timeoutMs}ms for pattern: ${pattern.slice(0, 60)}`,
      );
      resolve({ matched: false, fastTrack: false, error: "Regex evaluation timed out" });
    }, timeoutMs);

    entry.pending.set(id, { resolve, timer });
    entry.worker.postMessage({ id, pattern, content });
  });
}

export function terminatePool() {
  if (!pool) {
    return;
  }
  for (const { worker, pending } of pool) {
    for (const [, cb] of pending) {
      clearTimeout(cb.timer);
    }
    pending.clear();
    worker.terminate();
  }
  pool = null;
}
