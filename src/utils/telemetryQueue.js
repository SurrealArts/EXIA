import { clog } from "./clog.js";
import { t, getGuildLanguage } from "../core/locale.js";

const LOG_TAG = "[src/utils/telemetryQueue.js]";

const BATCH_INTERVAL_MS = 5_000;
const EMBED_MAX_FIELDS = 25;
const FIELD_VALUE_LIMIT = 1024;

/**
 * In-memory batching queues for log payloads, keyed by guild ID.
 * @type {Map<string, { action: string[], flag: string[], command: string[] }>}
 */
const queues = new Map();

let flushInterval = null;

/**
 * Returns a new empty queue bucket.
 * @returns {{ action: string[], flag: string[], command: string[] }}
 */
function emptyBucket() {
  return { action: [], flag: [], command: [] };
}

/**
 * Returns the total pending entries, optionally for a single guild.
 * @param {string} [guildId]
 * @returns {number}
 */
export function getQueueLength(guildId) {
  if (guildId) {
    const q = queues.get(guildId);
    return q ? q.action.length + q.flag.length + q.command.length : 0;
  }
  let total = 0;
  for (const q of queues.values()) {
    total += q.action.length + q.flag.length + q.command.length;
  }
  return total;
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
 * Enqueues a log entry for a specific guild.
 *
 * @param {'action'|'flag'|'command'} category
 * @param {string} guildId
 * @param {string} message
 */
export function enqueue(category, guildId, message) {
  if (!queues.has(guildId)) {
    queues.set(guildId, emptyBucket());
  }
  const bucket = queues.get(guildId);
  if (!bucket[category]) {
    return;
  }
  bucket[category].push(message);
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

  for (const { guild_id: guildId, log_channel_id: channelId } of guildIds) {
    const bucket = queues.get(guildId);
    if (!bucket) {
      continue;
    }

    const messages = [];

    for (const category of /** @type {const} */ (["action", "flag", "command"])) {
      if (bucket[category].length > 0) {
        const batch = bucket[category].splice(0, bucket[category].length);
        messages.push(...batch.map((msg) => `• **${category.toUpperCase()}** ${msg}`));
      }
    }

    if (messages.length === 0) {
      queues.delete(guildId);
      continue;
    }

    try {
      const channel = client.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        continue;
      }

      const lang = getGuildLanguage(db, guildId);
      const chunks = chunkMessages(messages);

      for (const chunk of chunks) {
        const { EmbedBuilder } = await import("discord.js");
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(t(lang, "telemetry.title"))
          .setTimestamp()
          .setDescription(chunk.join("\n"));

        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      clog(console.error, `${LOG_TAG} Failed to send log:`, err);
    }

    // Clean up empty bucket after sending
    const b = queues.get(guildId);
    if (b && !b.action.length && !b.flag.length && !b.command.length) {
      queues.delete(guildId);
    }
  }

  // Remove stale queues for guilds with no log channel configured
  const configured = new Set(guildIds.map((r) => r.guild_id));
  for (const [gid] of queues) {
    if (!configured.has(gid)) {
      queues.delete(gid);
    }
  }
}

/**
 * Splits messages into chunks that fit within Discord embed limits.
 * @param {string[]} messages
 * @returns {string[][]}
 */
export function chunkMessages(messages) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const msg of messages) {
    const line = msg;
    const lineLen = line.length;

    if (current.length >= EMBED_MAX_FIELDS || currentLength + lineLen > FIELD_VALUE_LIMIT) {
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
