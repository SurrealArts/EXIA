import { parentPort } from "node:worker_threads";

parentPort.on("message", ({ id, pattern, content }) => {
  try {
    const regex = new RegExp(pattern, "i");
    const matched = regex.test(content);
    parentPort.postMessage({ id, matched });
  } catch (err) {
    parentPort.postMessage({
      id,
      matched: true,
      fastTrack: true,
      error: err.message,
    });
  }
});
