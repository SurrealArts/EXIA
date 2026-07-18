import { Client, GatewayIntentBits, Events, ActivityType } from "discord.js";
import { token, version } from "./config/config.js";
import { initDatabase } from "./core/database.js";
import { startDecayTimer } from "./core/pressureEngine.js";
import { startRefillTimer } from "./modules/velocityBucket.js";
import { startTelemetryFlusher } from "./utils/telemetryQueue.js";
import { startRaidDetection, setClient } from "./modules/raidProtection.js";
import { configCommand } from "./commands/configuration.js";
import { actionsCommand } from "./commands/appeals.js";
import { profilesCommand } from "./commands/profiles.js";
import { raidCommand } from "./commands/raid.js";
import { debugCommand } from "./commands/debug.js";
import { helpCommand } from "./commands/help.js";
import { languageCommand } from "./commands/language.js";
import handleMessageCreate from "./events/messageCreate.js";
import handleInteractionCreate from "./events/interactionCreate.js";
import handleModalSubmit from "./events/modalSubmit.js";
import handleGuildMemberAdd from "./events/guildMemberAdd.js";
import { clog } from "./utils/clog.js";
import { t } from "./core/locale.js";

const LOG_TAG = "[src/index.js]";

const db = initDatabase();
clog(console.log, `${LOG_TAG} Database initialized (better-sqlite3 + WAL mode)`);

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
  clog(console.log, `${LOG_TAG} Logged in as ${readyClient.user.tag} (ID: ${readyClient.user.id})`);
  clog(console.log, `${LOG_TAG} Serving ${readyClient.guilds.cache.size} guild(s)`);

  try {
    const commandsArray = [
      configCommand,
      actionsCommand,
      profilesCommand,
      raidCommand,
      debugCommand,
      helpCommand,
      languageCommand,
    ];
    await readyClient.application.commands.set(commandsArray);
    clog(console.log, `${LOG_TAG} ${commandsArray.length} slash commands registered globally`);
  } catch (err) {
    clog(console.error, `${LOG_TAG} Failed to register commands: ${err?.message || err}`);
  }

  readyClient.user.setPresence({
    activities: [{ name: `Running Ver${version || "?"}`, type: ActivityType.Playing }],
    status: "online",
  });

  startDecayTimer();
  clog(console.log, `${LOG_TAG} Pressure decay timer started (60s interval, -5p/cycle)`);
  startRefillTimer();
  clog(console.log, `${LOG_TAG} Velocity refill timer started (1s interval, +1 token/cycle)`);
  setClient(readyClient);
  startRaidDetection();
  clog(console.log, `${LOG_TAG} Raid detection timer started (30s interval)`);
  startTelemetryFlusher(readyClient);
  clog(console.log, `${LOG_TAG} Telemetry flusher started (5s batch interval)`);

  autoRefresh(readyClient);

  clog(console.log, `${LOG_TAG} ${readyClient.user.tag} is ready — all systems operational`);
});

process.on("SIGINT", async () => {
  clog(console.log, `${LOG_TAG} Shutting down...`);
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  clog(console.log, `${LOG_TAG} Shutting down...`);
  client.destroy();
  process.exit(0);
});

process.on("unhandledRejection", (err) => {
  clog(console.error, `${LOG_TAG} Unhandled rejection:`, err);
});

client.on(Events.Error, (err) => {
  clog(console.error, `${LOG_TAG} Client error:`, err);
});

client.login(token).catch((err) => {
  clog(console.error, `${LOG_TAG} Login failed:`, err);
  process.exit(1);
});

/**
 * Fire-and-forget: scans cached members for all guilds the bot is in.
 * Uses only already-cached GuildMember objects. No API calls nor rate limits.
 * @param {import('discord.js').Client} client
 */
function autoRefresh(client) {
  const guilds = [...client.guilds.cache.values()];
  let idx = 0;

  function processNext() {
    if (idx >= guilds.length) {
      clog(console.log, `${LOG_TAG} Auto-refresh complete — ${guilds.length} guilds scanned`);
      return;
    }

    const guild = guilds[idx++];
    setImmediate(async () => {
      try {
        const { auditProfile } = await import("./modules/userProfile.js");
        const { enqueue } = await import("./utils/telemetryQueue.js");
        const { getGuildLanguage } = await import("./core/locale.js");
        const { getDatabase } = await import("./core/database.js");
        const db = getDatabase();
        const { cachedGet } = await import("./utils/queryCache.js");

        const lang = getGuildLanguage(db, guild.id);
        const mod = cachedGet(
          db,
          "SELECT is_enabled FROM ModuleWeights WHERE guild_id = ? AND module_name = 'user_profile'",
          guild.id,
        );

        const profileEnabled = mod && mod.is_enabled === 1;
        let flagged = 0;

        for (const [, member] of guild.members.cache) {
          if (member.user.bot) {
            continue;
          }
          const profile = auditProfile(member, lang);
          if (profile.reasons.length > 0 && profileEnabled) {
            flagged++;
            enqueue(
              "flag",
              guild.id,
              `${LOG_TAG} ${t(lang, "telemetry.flag.refresh", { user: `<@${member.id}>`, userId: member.id, reasons: profile.reasons.join(", "), multiplier: profile.multiplier })}`,
            );
          }
        }

        clog(
          console.log,
          `${LOG_TAG} Auto-refresh: guild ${guild.id} (${guild.name}) scanned ${guild.members.cache.size} members, flagged ${flagged}`,
        );
      } catch (err) {
        clog(console.error, `${LOG_TAG} Auto-refresh error for guild ${guild.id}:`, err);
      }

      processNext();
    });
  }

  processNext();
}

export { client };
