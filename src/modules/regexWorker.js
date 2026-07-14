import { parentPort, workerData } from "node:worker_threads";

try {
  const { pattern, content } = workerData;
  const regex = new RegExp(pattern, "gi");
  const matched = regex.test(content);
  parentPort.postMessage({ matched });
} catch (err) {
  parentPort.postMessage({
    matched: true,
    fastTrack: true,
    error: err.message,
  });
}
