import { clog } from "./clog.js";

const BATCH_INTERVAL_MS = 5_000;
const EMBED_MAX_FIELDS = 25;
const FIELD_VALUE_LIMIT = 1024;

/**
 * In-memory batching queues for log payloads.
 * @type {{ action: string[], flag: string[], command: string[] }}
 */
const queues = {
  action: [],
  flag: [],
  command: [],
};

let flushInterval = null;

/**
 * Returns total pending entries across all queues.
 * @returns {number}
 */
export function getQueueLength() {
  return queues.action.length + queues.flag.length + queues.command.length;
}

/**
 * Starts the periodic queue flush timer.
 * Every BATCH_INTERVAL_MS, queued entries are drained.
 *
 * @param {import('discord.js').Client} client
 */
export function startTelemetryFlusher(client) {
  if (flushInterval) {
    return;
  }

  flushInterval = setInterval(() => {
    flushQueues(client);
  }, BATCH_INTERVAL_MS);

  if (flushInterval && typeof flushInterval.unref === "function") {
    flushInterval.unref();
  }
}

/**
 * Stops the telemetry flusher.
 */
export function stopTelemetryFlusher() {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
}

/**
 * Enqueues a log entry.
 *
 * @param {'action'|'flag'|'command'} category
 * @param {string} message
 */
export function enqueue(category, message) {
  if (!queues[category]) {
    return;
  }
  queues[category].push(message);
}

/**
 * Drains all queues and sends batched embeds to each guild's log channel.
 *
 * @param {import('discord.js').Client} client
 */
async function flushQueues(client) {
  const db = (await import("../core/database.js")).getDatabase();

  const guildIds = db
    .prepare(
      "SELECT guild_id, log_channel_id FROM GuildConfiguration WHERE log_channel_id IS NOT NULL",
    )
    .all();

  for (const { log_channel_id: channelId } of guildIds) {
    const messages = [];

    for (const category of /** @type {const} */ ([
      "action",
      "flag",
      "command",
    ])) {
      if (queues[category].length > 0) {
        const batch = queues[category].splice(0, queues[category].length);
        messages.push(
          ...batch.map((msg) => `**${category.toUpperCase()}** ${msg}`),
        );
      }
    }

    if (messages.length === 0) {
      return;
    }

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        continue;
      }

      const chunks = chunkMessages(messages);

      for (const chunk of chunks) {
        const { EmbedBuilder } = await import("discord.js");
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("EXIA Telemetry")
          .setTimestamp()
          .setDescription(chunk.join("\n"));

        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      clog(
        console.error,
        "[src/utils/telemetryQueue.js] Failed to send log:",
        err,
      );
    }
  }
}

/**
 * Splits messages into chunks that fit within Discord embed limits.
 * @param {string[]} messages
 * @returns {string[][]}
 */
function chunkMessages(messages) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const msg of messages) {
    const line = `• ${msg}`;
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
