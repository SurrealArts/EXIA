import { Client, GatewayIntentBits, Events } from "discord.js";
import { token } from "./config/config.js";
import { initDatabase } from "./core/database.js";
import { startDecayTimer } from "./core/pressureEngine.js";
import { startRefillTimer } from "./modules/velocityBucket.js";
import { startTelemetryFlusher } from "./utils/telemetryQueue.js";
import { startRaidDetection } from "./modules/raidProtection.js";
import { configCommand } from "./commands/configuration.js";
import { actionsCommand } from "./commands/appeals.js";
import { profilesCommand } from "./commands/profiles.js";
import { raidCommand } from "./commands/raid.js";
import { debugCommand } from "./commands/debug.js";
import handleMessageCreate from "./events/messageCreate.js";
import handleInteractionCreate from "./events/interactionCreate.js";
import handleModalSubmit from "./events/modalSubmit.js";
import handleGuildMemberAdd from "./events/guildMemberAdd.js";
import { clog } from "./utils/clog.js";

const db = initDatabase();
clog(
  console.log,
  "[src/index.js] Database initialized (better-sqlite3 + WAL mode)",
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
});

client.on(Events.MessageCreate, handleMessageCreate);
client.on(Events.InteractionCreate, handleInteractionCreate);
client.on(Events.GuildMemberAdd, handleGuildMemberAdd);
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction, db);
  }
});

client.once(Events.ClientReady, async (readyClient) => {
  clog(
    console.log,
    `[src/index.js] Logged in as ${readyClient.user.tag} (ID: ${readyClient.user.id})`,
  );
  clog(
    console.log,
    `[src/index.js] Serving ${readyClient.guilds.cache.size} guild(s)`,
  );

  try {
    await readyClient.application.commands.set([
      configCommand,
      actionsCommand,
      profilesCommand,
      raidCommand,
      debugCommand,
    ]);
    clog(console.log, `[src/index.js] ${5} slash commands registered globally`);
  } catch (err) {
    clog(
      console.error,
      `[src/index.js] Failed to register commands: ${err?.message || err}`,
    );
  }

  startDecayTimer();
  clog(
    console.log,
    "[src/index.js] Pressure decay timer started (60s interval, -5p/cycle)",
  );
  startRefillTimer();
  clog(
    console.log,
    "[src/index.js] Velocity refill timer started (1s interval, +1 token/cycle)",
  );
  startRaidDetection();
  clog(
    console.log,
    "[src/index.js] Raid detection timer started (30s interval)",
  );
  startTelemetryFlusher(readyClient);
  clog(
    console.log,
    "[src/index.js] Telemetry flusher started (5s batch interval)",
  );

  autoRefresh(readyClient).catch((err) =>
    clog(
      console.error,
      `[src/index.js] Auto-refresh error: ${err?.message || err}`,
    ),
  );

  clog(
    console.log,
    `[src/index.js] ${readyClient.user.tag} is ready — all systems operational`,
  );
});

process.on("SIGINT", async () => {
  clog(console.log, "[src/index.js] Shutting down...");
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  clog(console.log, "[src/index.js] Shutting down...");
  client.destroy();
  process.exit(0);
});

process.on("unhandledRejection", (err) => {
  clog(console.error, "[src/index.js] Unhandled rejection:", err);
});

client.on(Events.Error, (err) => {
  clog(console.error, "[src/index.js] Client error:", err);
});

client.login(token).catch((err) => {
  clog(console.error, "[src/index.js] Login failed:", err);
  process.exit(1);
});

/**
 * Fire-and-forget: scans cached members for all guilds the bot is in.
 * Uses only already-cached GuildMember objects. No API calls nor rate limits.
 * @param {import('discord.js').Client} client
 */
async function autoRefresh(client) {
  const { auditProfile } = await import("./modules/userProfile.js");
  const { enqueue } = await import("./utils/telemetryQueue.js");
  const db = (await import("./core/database.js")).getDatabase();

  for (const [, guild] of client.guilds.cache) {
    const mod = db
      .prepare(
        "SELECT is_enabled FROM ModuleWeights WHERE guild_id = ? AND module_name = 'user_profile'",
      )
      .get(guild.id);

    const profileEnabled = mod && mod.is_enabled === 1;

    let flagged = 0;

    for (const [, member] of guild.members.cache) {
      if (member.user.bot) {
        continue;
      }

      const profile = auditProfile(member);
      if (profile.reasons.length > 0 && profileEnabled) {
        flagged++;
        enqueue(
          "flag",
          `[AUTO-REFRESH] <@${member.id}> — ${profile.reasons.join(", ")} (${profile.multiplier}x)`,
        );
      }
    }

    if (flagged > 0) {
      clog(
        console.log,
        `[src/index.js] Auto-refresh: guild ${guild.id} (${guild.name}) scanned ${guild.members.cache.size} members, flagged ${flagged}`,
      );
    } else {
      clog(
        console.log,
        `[src/index.js] Auto-refresh: guild ${guild.id} (${guild.name}) scanned ${guild.members.cache.size} members, none flagged`,
      );
    }
  }
}

export { client, db };
