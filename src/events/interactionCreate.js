import { MessageFlags } from "discord.js";
import { getDatabase } from "../core/database.js";
import { clog } from "../utils/clog.js";
import { t, resolveInteractionLang } from "../core/locale.js";
import { handleLanguageCommand } from "../commands/language.js";
import { invalidateCache } from "../utils/queryCache.js";

// TODO: This file is too large. Consider splitting it into multiple files for better maintainability.

const LOG_TAG = "[src/events/interactionCreate.js]";

/**
 * @param {import('discord.js').Interaction} interaction
 */
export default async function handleInteractionCreate(interaction) {
  if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);
  const fullCmd = sub
    ? `${interaction.commandName}${group ? ` ${group}` : ""} ${sub}`
    : interaction.commandName;
  clog(
    console.log,
    `${LOG_TAG} <@${interaction.user.id}> ran /${fullCmd} in guild ${interaction.guildId}`,
  );

  const db = getDatabase();
  const lang = resolveInteractionLang(interaction, db, interaction.guildId);

  switch (interaction.commandName) {
    case "config":
      await handleConfigCommand(interaction, db);
      break;
    case "actions":
      await handleActionsCommand(interaction, db);
      break;
    case "profiles":
      await handleProfilesCommand(interaction, db);
      break;
    case "raid":
      await handleRaidCommand(interaction, db);
      break;
    case "debug":
      await handleDebugCommand(interaction, db);
      break;
    case "language":
      await handleLanguageCommand(interaction, db);
      break;
    default:
      await interaction.reply({
        content: t(lang, "reply.unknownCommand"),
        flags: MessageFlags.Ephemeral,
      });
  }
}

// ─── AUTOCOMPLETE ───────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').AutocompleteInteraction} interaction
 */
async function handleAutocomplete(interaction) {
  const db = getDatabase();
  const focused = interaction.options.getFocused(true);

  if (interaction.commandName === "profiles") {
    const sub = interaction.options.getSubcommand();
    if (sub === "apply" || sub === "remove") {
      const profiles = db
        .prepare(
          "SELECT profile_name FROM ConfigProfiles WHERE guild_id = ? AND profile_name LIKE ?",
        )
        .all(interaction.guildId, `%${focused.value}%`);

      await interaction.respond(
        profiles.map((p) => ({ name: p.profile_name, value: p.profile_name })).slice(0, 25),
      );
      return;
    }
  }

  if (interaction.commandName === "config") {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    if (group === "regex" && (sub === "edit" || sub === "delete")) {
      const rules = db
        .prepare(
          "SELECT rule_identifier FROM RegexRules WHERE guild_id = ? AND rule_identifier LIKE ?",
        )
        .all(interaction.guildId, `%${focused.value}%`);

      await interaction.respond(
        rules.map((r) => ({ name: r.rule_identifier, value: r.rule_identifier })).slice(0, 25),
      );
      return;
    }
  }

  await interaction.respond([]);
}

// ─── CONFIG ─────────────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('better-sqlite3').Database} db
 */
async function handleConfigCommand(interaction, db) {
  const lang = resolveInteractionLang(interaction, db, interaction.guildId);
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  // /config modules toggle
  if (subcommandGroup === "modules" && subcommand === "toggle") {
    const moduleName = interaction.options.getString("target_module", true);
    const activeState = interaction.options.getBoolean("active_state", true);

    const existing = db
      .prepare(
        "SELECT weight, is_critical FROM ModuleWeights WHERE guild_id = ? AND module_name = ?",
      )
      .get(interaction.guildId, moduleName);

    const weight = existing ? existing.weight : 0;
    const isCritical = existing ? existing.is_critical : 0;

    db.prepare(
      `INSERT INTO ModuleWeights (guild_id, module_name, weight, is_critical, is_enabled)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, module_name)
       DO UPDATE SET is_enabled = ?`,
    ).run(
      interaction.guildId,
      moduleName,
      weight,
      isCritical,
      activeState ? 1 : 0,
      activeState ? 1 : 0,
    );
    invalidateCache();

    clog(
      console.log,
      `${LOG_TAG} Module "${moduleName}" toggled ${activeState ? "ON" : "OFF"} (weight: ${weight}, critical: ${isCritical}) by <@${interaction.user.id}>`,
    );

    await interaction.reply({
      content: t(lang, "reply.config.modules.toggle", {
        moduleName,
        activeState: t(lang, activeState ? "status.enabled" : "status.disabled"),
      }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /config modules weight
  if (subcommandGroup === "modules" && subcommand === "weight") {
    const moduleName = interaction.options.getString("target_module", true);
    const value = interaction.options.getInteger("value", true);

    db.prepare(
      `INSERT INTO ModuleWeights (guild_id, module_name, weight, is_enabled)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(guild_id, module_name)
       DO UPDATE SET weight = ?`,
    ).run(interaction.guildId, moduleName, value, value);
    invalidateCache();

    clog(
      console.log,
      `${LOG_TAG} Module "${moduleName}" weight → ${value} by <@${interaction.user.id}>`,
    );

    await interaction.reply({
      content: t(lang, "reply.config.modules.weight", { moduleName, value }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /config modules critical
  if (subcommandGroup === "modules" && subcommand === "critical") {
    const moduleName = interaction.options.getString("target_module", true);
    const isCritical = interaction.options.getBoolean("is_critical", true);

    const existing = db
      .prepare(
        "SELECT weight, is_enabled FROM ModuleWeights WHERE guild_id = ? AND module_name = ?",
      )
      .get(interaction.guildId, moduleName);

    const weight = existing ? existing.weight : 0;
    const isEnabled = existing ? existing.is_enabled : 1;

    db.prepare(
      `INSERT INTO ModuleWeights (guild_id, module_name, weight, is_critical, is_enabled)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, module_name)
       DO UPDATE SET is_critical = ?`,
    ).run(
      interaction.guildId,
      moduleName,
      weight,
      isCritical ? 1 : 0,
      isEnabled,
      isCritical ? 1 : 0,
    );
    invalidateCache();

    clog(
      console.log,
      `${LOG_TAG} Module "${moduleName}" critical → ${isCritical ? "ON" : "OFF"} by <@${interaction.user.id}>`,
    );

    await interaction.reply({
      content: t(lang, "reply.config.modules.critical", {
        moduleName,
        isCritical: t(lang, isCritical ? "status.yesInstantBan" : "status.no"),
      }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /config thresholds assign
  if (subcommandGroup === "thresholds" && subcommand === "assign") {
    const tier = interaction.options.getInteger("action_tier", true);
    const pressureLimit = interaction.options.getInteger("pressure_limit", true);
    const deleteSec = interaction.options.getInteger("delete_after") ?? 120;

    const tierNames = { 1: "warn", 2: "mute", 3: "kick", 4: "ban" };
    const action = tierNames[tier] || "warn";

    db.prepare(
      `INSERT INTO ThresholdActions (guild_id, pressure_tier, action, message_delete_seconds, pressure)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, pressure_tier)
       DO UPDATE SET action = ?, message_delete_seconds = ?, pressure = ?`,
    ).run(
      interaction.guildId,
      tier,
      action,
      deleteSec,
      pressureLimit,
      action,
      deleteSec,
      pressureLimit,
    );
    invalidateCache();

    clog(
      console.log,
      `${LOG_TAG} Tier ${tier} threshold → ${pressureLimit}p => ${action} (delete: ${deleteSec}s) by <@${interaction.user.id}>`,
    );

    await interaction.reply({
      content: t(lang, "reply.config.thresholds.assign", {
        tier,
        pressureLimit,
        action,
        deleteSec,
      }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /config regex create
  if (subcommand === "create" && subcommandGroup === "regex") {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } =
      await import("discord.js");

    const modal = new ModalBuilder()
      .setCustomId("regex_create_modal")
      .setTitle(t(lang, "reply.config.regex.create.modalTitle"));

    const ruleIdInput = new TextInputBuilder()
      .setCustomId("rule_identifier")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);

    const patternInput = new TextInputBuilder()
      .setCustomId("pattern")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const weightInput = new TextInputBuilder()
      .setCustomId("threat_weight")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(t(lang, "reply.config.regex.create.modal.ruleId.label"))
        .setTextInputComponent(ruleIdInput),
      new LabelBuilder()
        .setLabel(t(lang, "reply.config.regex.create.modal.pattern.label"))
        .setTextInputComponent(patternInput),
      new LabelBuilder()
        .setLabel(t(lang, "reply.config.regex.create.modal.weight.label"))
        .setTextInputComponent(weightInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // /config regex list
  if (subcommand === "list" && subcommandGroup === "regex") {
    const rules = db
      .prepare("SELECT * FROM RegexRules WHERE guild_id = ?")
      .all(interaction.guildId);

    if (!rules.length) {
      await interaction.reply({
        content: t(lang, "reply.config.regex.list.none"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = rules.map((r, i) =>
      t(lang, "reply.config.regex.list.line", {
        index: i + 1,
        identifier: r.rule_identifier,
        weight: r.threat_weight,
        critical: r.is_critical === 1 ? t(lang, "status.yes") : t(lang, "status.no"),
      }),
    );
    await interaction.reply({
      content: lines.join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /config regex edit
  if (subcommand === "edit" && subcommandGroup === "regex") {
    const identifier = interaction.options.getString("identifier", true);

    const rule = db
      .prepare("SELECT * FROM RegexRules WHERE guild_id = ? AND rule_identifier = ?")
      .get(interaction.guildId, identifier);

    if (!rule) {
      await interaction.reply({
        content: t(lang, "reply.config.regex.edit.notFound", { identifier }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } =
      await import("discord.js");

    const modal = new ModalBuilder()
      .setCustomId(`regex_edit_modal_${identifier}`)
      .setTitle(t(lang, "reply.config.regex.edit.modalTitle", { identifier }));

    const patternInput = new TextInputBuilder()
      .setCustomId("pattern")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue(rule.pattern);

    const weightInput = new TextInputBuilder()
      .setCustomId("threat_weight")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(String(rule.threat_weight));

    const criticalInput = new TextInputBuilder()
      .setCustomId("is_critical")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(rule.is_critical === 1 ? "yes" : "no");

    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(t(lang, "reply.config.regex.edit.modal.pattern.label"))
        .setTextInputComponent(patternInput),
      new LabelBuilder()
        .setLabel(t(lang, "reply.config.regex.edit.modal.weight.label"))
        .setTextInputComponent(weightInput),
      new LabelBuilder()
        .setLabel(t(lang, "reply.config.regex.edit.modal.critical.label"))
        .setTextInputComponent(criticalInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // /config regex delete
  if (subcommand === "delete" && subcommandGroup === "regex") {
    const identifier = interaction.options.getString("identifier", true);

    const result = db
      .prepare("DELETE FROM RegexRules WHERE guild_id = ? AND rule_identifier = ?")
      .run(interaction.guildId, identifier);
    invalidateCache();

    if (result.changes === 0) {
      await interaction.reply({
        content: t(lang, "reply.config.regex.delete.notFound", { identifier }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: t(lang, "reply.config.regex.delete.success", { identifier }),
      flags: MessageFlags.Ephemeral,
    });

    clog(console.log, `${LOG_TAG} Regex rule "${identifier}" deleted by <@${interaction.user.id}>`);
    return;
  }

  // /config honeypot set
  if (subcommand === "set" && subcommandGroup === "honeypot") {
    const channel = interaction.options.getChannel("target_channel", true);

    db.prepare(
      `INSERT INTO GuildConfiguration (guild_id, honeypot_channel_id)
       VALUES (?, ?)
       ON CONFLICT(guild_id)
        DO UPDATE SET honeypot_channel_id = ?`,
    ).run(interaction.guildId, channel.id, channel.id);
    invalidateCache();

    await interaction.reply({
      content: t(lang, "reply.config.honeypot.set", { channelId: channel.id }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /config logchannel set
  if (subcommand === "set" && subcommandGroup === "logchannel") {
    const channel = interaction.options.getChannel("target_channel", true);

    db.prepare(
      `INSERT INTO GuildConfiguration (guild_id, log_channel_id)
       VALUES (?, ?)
       ON CONFLICT(guild_id)
        DO UPDATE SET log_channel_id = ?`,
    ).run(interaction.guildId, channel.id, channel.id);
    invalidateCache();

    await interaction.reply({
      content: t(lang, "reply.config.logchannel.set", { channelId: channel.id }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /config view
  if (subcommand === "view") {
    const { EmbedBuilder } = await import("discord.js");

    const config = db
      .prepare("SELECT * FROM GuildConfiguration WHERE guild_id = ?")
      .get(interaction.guildId);

    const modules = db
      .prepare("SELECT * FROM ModuleWeights WHERE guild_id = ?")
      .all(interaction.guildId);

    const thresholds = db
      .prepare("SELECT * FROM ThresholdActions WHERE guild_id = ? ORDER BY pressure_tier")
      .all(interaction.guildId);

    const regex = db
      .prepare("SELECT * FROM RegexRules WHERE guild_id = ?")
      .all(interaction.guildId);

    const activeProfile = db
      .prepare("SELECT active_profile FROM GuildConfiguration WHERE guild_id = ?")
      .get(interaction.guildId);

    const allModuleNames = ["user_profile", "velocity", "honeypot", "regex"];
    const moduleMap = {};
    for (const m of modules) {
      moduleMap[m.module_name] = m;
    }
    const moduleFields = allModuleNames.flatMap((name) => {
      const m = moduleMap[name];
      if (!m) {
        return [
          {
            name: "❌ " + name,
            value: `\`${t(lang, "embed.config.modules.absent")}\``,
            inline: true,
          },
          { name: t(lang, "embed.config.modules.weightLabel"), value: "`0`", inline: true },
          {
            name: t(lang, "embed.config.modules.criticalLabel"),
            value: `\`${t(lang, "embed.config.modules.no")}\``,
            inline: true,
          },
        ];
      }
      const statusEmoji = m.is_enabled === 1 ? "✅" : "❌";
      const critLabel =
        m.is_critical === 1
          ? t(lang, "embed.config.modules.yesCritical")
          : t(lang, "embed.config.modules.no");

      if (name === "regex") {
        const ruleWeights = regex.map((r) => r.threat_weight);
        const weightDisplay =
          ruleWeights.length > 0
            ? `${Math.min(...ruleWeights)}~${Math.max(...ruleWeights)}`
            : t(lang, "embed.config.modules.navValue");
        return [
          {
            name: `${statusEmoji} ${m.module_name}`,
            value: "** **",
            inline: true,
          },
          {
            name: t(lang, "embed.config.modules.weightLabel"),
            value: `\`${weightDisplay}\``,
            inline: true,
          },
          {
            name: t(lang, "embed.config.modules.criticalLabel"),
            value: `\`${critLabel}\``,
            inline: true,
          },
        ];
      }

      if (name === "user_profile") {
        return [
          {
            name: `${statusEmoji} ${m.module_name}`,
            value: t(lang, "embed.config.modules.multiplier"),
            inline: true,
          },
          {
            name: t(lang, "embed.config.modules.tiers"),
            value: t(lang, "embed.config.modules.tiers.value"),
            inline: true,
          },
          {
            name: t(lang, "embed.config.modules.criticalLabel"),
            value: `\`${critLabel}\``,
            inline: true,
          },
        ];
      }

      return [
        {
          name: `${statusEmoji} ${m.module_name}`,
          value: "** **",
          inline: true,
        },
        {
          name: t(lang, "embed.config.modules.weightLabel"),
          value: `\`${m.weight}\``,
          inline: true,
        },
        {
          name: t(lang, "embed.config.modules.criticalLabel"),
          value: `\`${critLabel}\``,
          inline: true,
        },
      ];
    });

    const generalLines = [
      t(lang, "embed.config.general.logChannel", {
        channel: config?.log_channel_id
          ? `<#${config.log_channel_id}>`
          : t(lang, "embed.config.general.notSet"),
      }),
      t(lang, "embed.config.general.appealContact", {
        contact: config?.appeal_link || t(lang, "embed.config.general.notSet"),
      }),
      t(lang, "embed.config.general.rejoinLink", {
        link: config?.rejoin_link || t(lang, "embed.config.general.notSet"),
      }),
      t(lang, "embed.config.general.honeypot", {
        channel: config?.honeypot_channel_id
          ? `<#${config.honeypot_channel_id}>`
          : t(lang, "embed.config.general.notSet"),
      }),
    ];

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(t(lang, "embed.config.title"))
      .setDescription(
        t(lang, "embed.config.guildProfile", {
          guildName: interaction.guild.name,
          profileName: activeProfile?.active_profile || "Standard",
        }),
      )
      .addFields(
        {
          name: t(lang, "embed.config.general"),
          value: generalLines.join("\n"),
        },
        {
          name: t(lang, "embed.config.modules"),
          value: "** **",
        },
        ...moduleFields,
        {
          name: t(lang, "embed.config.thresholds"),
          value:
            thresholds.length > 0
              ? thresholds
                  .map((th) =>
                    t(lang, "embed.config.thresholds.line", {
                      tier: th.pressure_tier,
                      pressure: th.pressure ?? 25,
                      action: th.action,
                      deleteSec: th.message_delete_seconds,
                    }),
                  )
                  .join("\n")
              : t(lang, "embed.config.thresholds.none"),
        },
        {
          name: t(lang, "embed.config.regexRules"),
          value:
            regex.length > 0
              ? regex
                  .map((r) =>
                    t(lang, "embed.config.regexRules.line", {
                      identifier: r.rule_identifier,
                      pattern: r.pattern.length > 50 ? r.pattern.slice(0, 50) + "..." : r.pattern,
                      weight: r.threat_weight,
                    }),
                  )
                  .join("\n")
              : t(lang, "embed.config.regexRules.none"),
        },
        {
          name: t(lang, "embed.config.pressureMap"),
          value: (() => {
            if (thresholds.length === 0) {
              return t(lang, "embed.config.pressureMap.none");
            }
            const lines = [];
            const firstP = thresholds[0].pressure ?? 25;
            if (firstP > 0) {
              lines.push(
                t(lang, "embed.config.pressureMap.noAction", { start: 0, end: firstP - 1 }),
              );
            }
            for (let i = 0; i < thresholds.length; i++) {
              const th = thresholds[i];
              const p = th.pressure ?? 25;
              const next =
                i < thresholds.length - 1 ? (thresholds[i + 1].pressure ?? 25) - 1 : null;
              if (next !== null) {
                lines.push(
                  t(lang, "embed.config.pressureMap.actionRange", {
                    start: p,
                    end: next,
                    action: th.action,
                  }),
                );
              } else {
                lines.push(
                  t(lang, "embed.config.pressureMap.actionPlus", { start: p, action: th.action }),
                );
              }
            }
            return lines.join("\n");
          })(),
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({
    content: t(lang, "reply.unknownSubcommand"),
    flags: MessageFlags.Ephemeral,
  });
}

// ─── ACTIONS ────────────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('better-sqlite3').Database} db
 */
async function handleActionsCommand(interaction, db) {
  const lang = resolveInteractionLang(interaction, db, interaction.guildId);
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "appeal") {
    const message = interaction.options.getString("message", true);

    db.prepare(
      `INSERT INTO GuildConfiguration (guild_id, appeal_link)
       VALUES (?, ?)
       ON CONFLICT(guild_id)
        DO UPDATE SET appeal_link = ?`,
    ).run(interaction.guildId, message, message);
    invalidateCache();

    await interaction.reply({
      content: t(lang, "reply.actions.appeal"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "rejoin") {
    const link = interaction.options.getString("link", true);

    db.prepare(
      `INSERT INTO GuildConfiguration (guild_id, rejoin_link)
       VALUES (?, ?)
       ON CONFLICT(guild_id)
        DO UPDATE SET rejoin_link = ?`,
    ).run(interaction.guildId, link, link);
    invalidateCache();

    await interaction.reply({
      content: t(lang, "reply.actions.rejoin"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "ban") {
    const user = interaction.options.getUser("user", true);
    const hours = interaction.options.getInteger("delete_past") || 0;
    const deleteSeconds = Math.min(hours * 3600, 604_800);

    if (!interaction.memberPermissions?.has("BanMembers")) {
      await interaction.reply({
        content: t(lang, "reply.actions.ban.noPermission"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      await member.ban({
        deleteMessageSeconds: deleteSeconds,
        reason: `Banned by ${interaction.user.tag}`,
      });
    }

    clog(
      console.log,
      `${LOG_TAG} <@${user.id}> banned by <@${interaction.user.id}>${hours > 0 ? `, delete ${hours}h` : ""}`,
    );

    const hoursSuffix = hours > 0 ? t(lang, "reply.actions.ban.hoursSuffix", { hours }) : "";
    await interaction.reply({
      content: t(lang, "reply.actions.ban.success", { userTag: user.tag, hoursSuffix }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "refresh") {
    const { auditProfile } = await import("../modules/userProfile.js");
    const { enqueue } = await import("../utils/telemetryQueue.js");

    const members = interaction.guild.members.cache;

    if (members.size === 0) {
      await interaction.reply({
        content: t(lang, "reply.actions.refresh.none"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const mod = db
      .prepare(
        "SELECT is_enabled FROM ModuleWeights WHERE guild_id = ? AND module_name = 'user_profile'",
      )
      .get(interaction.guildId);

    const profileEnabled = mod && mod.is_enabled === 1;

    let flagged = 0;

    for (const [, member] of members) {
      if (member.user.bot) {
        continue;
      }

      const profile = auditProfile(member, lang);
      if (profile.reasons.length > 0 && profileEnabled) {
        flagged++;
        enqueue(
          "flag",
          interaction.guildId,
          `${LOG_TAG} ${t(lang, "telemetry.flag.refresh", { user: member.user.tag, userId: member.id, reasons: profile.reasons.join(", "), multiplier: profile.multiplier })}`,
        );
      }
    }

    clog(
      console.log,
      `${LOG_TAG} Manual refresh: scanned ${members.size} members, flagged ${flagged} with multipliers (by <@${interaction.user.id}>)`,
    );

    await interaction.editReply(
      t(lang, "reply.actions.refresh.complete", { count: members.size, flagged }),
    );
    return;
  }

  await interaction.reply({
    content: t(lang, "reply.unknownSubcommand"),
    flags: MessageFlags.Ephemeral,
  });
}

// ─── PROFILES ───────────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('better-sqlite3').Database} db
 */
async function handleProfilesCommand(interaction, db) {
  const lang = resolveInteractionLang(interaction, db, interaction.guildId);
  const subcommand = interaction.options.getSubcommand();

  // /profiles list
  if (subcommand === "list") {
    const profiles = db
      .prepare(
        "SELECT profile_name, is_locked FROM ConfigProfiles WHERE guild_id = ? ORDER BY is_locked DESC, profile_name",
      )
      .all(interaction.guildId);

    const active = db
      .prepare("SELECT active_profile FROM GuildConfiguration WHERE guild_id = ?")
      .get(interaction.guildId);

    const { EmbedBuilder } = await import("discord.js");
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(t(lang, "embed.profiles.list.title"))
      .setDescription(
        profiles.length > 0
          ? profiles
              .map((p) => {
                const name = p.profile_name;
                const marker = name === active?.active_profile ? "📌 " : "";
                const lock = p.is_locked ? " 🔒" : "";
                return `${marker}**${name}**${lock}`;
              })
              .join("\n")
          : t(lang, "embed.profiles.list.empty"),
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // /profiles current
  if (subcommand === "current") {
    const active = db
      .prepare("SELECT active_profile FROM GuildConfiguration WHERE guild_id = ?")
      .get(interaction.guildId);

    await interaction.reply({
      content: t(lang, "reply.profiles.current", {
        profileName: active?.active_profile || "Standard",
      }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /profiles create <name>
  if (subcommand === "create") {
    const name = interaction.options.getString("name", true);

    const existing = db
      .prepare("SELECT profile_name FROM ConfigProfiles WHERE guild_id = ? AND profile_name = ?")
      .get(interaction.guildId, name);

    if (existing) {
      await interaction.reply({
        content: t(lang, "reply.profiles.create.exists", { name }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const data = snapshotConfig(db, interaction.guildId);
    db.prepare(
      `INSERT INTO ConfigProfiles (guild_id, profile_name, profile_data, is_locked)
       VALUES (?, ?, ?, 0)`,
    ).run(interaction.guildId, name, JSON.stringify(data));
    invalidateCache();

    clog(console.log, `${LOG_TAG} Profile "${name}" created by <@${interaction.user.id}>`);

    await interaction.reply({
      content: t(lang, "reply.profiles.create.success", { name }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /profiles apply <name>
  if (subcommand === "apply") {
    const name = interaction.options.getString("name", true);

    if (name === "Standard") {
      const { applyStandardProfile } = await import("../core/database.js");
      applyStandardProfile(interaction.guildId);
    } else {
      const row = db
        .prepare("SELECT profile_data FROM ConfigProfiles WHERE guild_id = ? AND profile_name = ?")
        .get(interaction.guildId, name);

      if (!row) {
        await interaction.reply({
          content: t(lang, "reply.profiles.apply.notFound", { name }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const data = JSON.parse(row.profile_data);
      restoreConfig(db, interaction.guildId, data);
    }

    db.prepare(
      `INSERT INTO GuildConfiguration (guild_id, active_profile)
       VALUES (?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET active_profile = ?`,
    ).run(interaction.guildId, name, name);
    invalidateCache();

    clog(console.log, `${LOG_TAG} Profile "${name}" applied by <@${interaction.user.id}>`);

    await interaction.reply({
      content: t(lang, "reply.profiles.apply.success", { name }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /profiles export
  if (subcommand === "export") {
    const data = snapshotConfig(db, interaction.guildId);
    const encoded = Buffer.from(JSON.stringify(data), "utf8").toString("base64");

    await interaction.reply({
      content: `\`\`\`\n${encoded}\n\`\`\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // /profiles import <encoded>
  if (subcommand === "import") {
    const encoded = interaction.options.getString("encoded", true);

    let data;
    try {
      const json = Buffer.from(encoded, "base64").toString("utf8");
      data = JSON.parse(json);
    } catch {
      await interaction.reply({
        content: t(lang, "reply.profiles.import.invalid"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { EmbedBuilder } = await import("discord.js");
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(t(lang, "embed.profiles.import.title"))
      .setDescription(
        t(lang, "embed.profiles.import.description", {
          modules: data.modules?.length || 0,
          thresholds: data.thresholds?.length || 0,
          regex: data.regex?.length || 0,
        }),
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // /profiles remove <name>
  if (subcommand === "remove") {
    const name = interaction.options.getString("name", true);

    const row = db
      .prepare("SELECT is_locked FROM ConfigProfiles WHERE guild_id = ? AND profile_name = ?")
      .get(interaction.guildId, name);

    if (!row) {
      await interaction.reply({
        content: t(lang, "reply.profiles.remove.notFound", { name }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (row.is_locked) {
      await interaction.reply({
        content: t(lang, "reply.profiles.remove.locked", { name }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    db.prepare("DELETE FROM ConfigProfiles WHERE guild_id = ? AND profile_name = ?").run(
      interaction.guildId,
      name,
    );
    invalidateCache();

    const active = db
      .prepare("SELECT active_profile FROM GuildConfiguration WHERE guild_id = ?")
      .get(interaction.guildId);

    if (active?.active_profile === name) {
      db.prepare("UPDATE GuildConfiguration SET active_profile = NULL WHERE guild_id = ?").run(
        interaction.guildId,
      );
    }
    invalidateCache();

    clog(console.log, `${LOG_TAG} Profile "${name}" removed by <@${interaction.user.id}>`);

    await interaction.reply({
      content: t(lang, "reply.profiles.remove.success", { name }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: t(lang, "reply.unknownSubcommand"),
    flags: MessageFlags.Ephemeral,
  });
}

// ─── RAID ───────────────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('better-sqlite3').Database} db
 */
async function handleRaidCommand(interaction, db) {
  const lang = resolveInteractionLang(interaction, db, interaction.guildId);
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "stage") {
    const stage = interaction.options.getInteger("stage", true);

    const { setRaidStage } = await import("../modules/raidProtection.js");
    const result = await setRaidStage(interaction.guild, stage, db);

    clog(
      console.log,
      `${LOG_TAG} Raid stage ${stage} set ${result ? "successfully" : "FAILED"} by <@${interaction.user.id}>`,
    );

    await interaction.reply({
      content: result
        ? t(lang, "reply.raid.stage.success", { stage })
        : t(lang, "reply.raid.stage.failed"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "status") {
    const { getRaidStage } = await import("../modules/raidProtection.js");
    const stage = getRaidStage(interaction.guildId);

    await interaction.reply({
      content: t(lang, "reply.raid.status", {
        stage,
        inactive: stage === 0 ? t(lang, "reply.raid.status.inactive") : "",
      }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: t(lang, "reply.unknownSubcommand"),
    flags: MessageFlags.Ephemeral,
  });
}

// ─── /debug handler ────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {import('better-sqlite3').Database} db
 */
async function handleDebugCommand(interaction, db) {
  const lang = resolveInteractionLang(interaction, db, interaction.guildId);
  const { EmbedBuilder } = await import("discord.js");
  const { getAllPressureScores } = await import("../core/pressureEngine.js");
  const { getRaidStage } = await import("../modules/raidProtection.js");
  const { getQueueLength } = await import("../utils/telemetryQueue.js");

  const modules = db
    .prepare("SELECT * FROM ModuleWeights WHERE guild_id = ?")
    .all(interaction.guildId);

  const thresholds = db
    .prepare("SELECT * FROM ThresholdActions WHERE guild_id = ? ORDER BY pressure_tier")
    .all(interaction.guildId);

  const regex = db.prepare("SELECT * FROM RegexRules WHERE guild_id = ?").all(interaction.guildId);

  const config = db
    .prepare("SELECT * FROM GuildConfiguration WHERE guild_id = ?")
    .get(interaction.guildId);

  const activeProfile = db
    .prepare("SELECT active_profile FROM GuildConfiguration WHERE guild_id = ?")
    .get(interaction.guildId);

  const allPressure = getAllPressureScores().filter((p) => p.guildId === interaction.guildId);

  const raidStage = getRaidStage(interaction.guildId);
  const telemetryQueued = getQueueLength();
  const memberCount = interaction.guild.memberCount;
  const uptimeSec = process.uptime();

  const lines = [];

  lines.push(
    t(lang, "embed.debug.title"),
    t(lang, "embed.debug.profile", { profileName: activeProfile?.active_profile || "Standard" }),
    t(lang, "embed.debug.raid", {
      stage: raidStage,
      active:
        raidStage === 0 ? t(lang, "embed.debug.raid.inactive") : t(lang, "embed.debug.raid.active"),
    }),
    t(lang, "embed.debug.members", { count: memberCount }),
    t(lang, "embed.debug.queue", { count: telemetryQueued }),
    t(lang, "embed.debug.uptime", {
      hours: Math.floor(uptimeSec / 3600),
      minutes: Math.floor((uptimeSec % 3600) / 60),
    }),
    t(lang, "embed.debug.logChannel", {
      channel: config?.log_channel_id
        ? `<#${config.log_channel_id}>`
        : t(lang, "embed.debug.notSet"),
    }),
    t(lang, "embed.debug.honeypot", {
      channel: config?.honeypot_channel_id
        ? `<#${config.honeypot_channel_id}>`
        : t(lang, "embed.debug.notSet"),
    }),
    "",
  );

  const allModuleNames = ["user_profile", "velocity", "honeypot", "regex"];
  const moduleMap = {};
  for (const m of modules) {
    moduleMap[m.module_name] = m;
  }
  lines.push(t(lang, "embed.debug.modules"));
  for (const name of allModuleNames) {
    const m = moduleMap[name];
    if (!m) {
      lines.push(
        t(lang, "embed.debug.moduleLine.unknown", { name, weight: 0, critical: 0, enabled: 0 }),
      );
    } else if (name === "regex") {
      const ruleWeights = regex.map((r) => r.threat_weight);
      const weightDisplay =
        ruleWeights.length > 0 ? `${Math.min(...ruleWeights)}~${Math.max(...ruleWeights)}` : "0";
      lines.push(
        t(lang, "embed.debug.moduleLine.regex", {
          name: m.module_name,
          weightDisplay,
          critical: m.is_critical,
          enabled: m.is_enabled,
        }),
      );
    } else if (name === "user_profile") {
      lines.push(
        t(lang, "embed.debug.moduleLine.profile", {
          name: m.module_name,
          critical: m.is_critical,
          enabled: m.is_enabled,
        }),
      );
    } else {
      lines.push(
        t(lang, "embed.debug.moduleLine.normal", {
          name: m.module_name,
          weight: m.weight,
          critical: m.is_critical,
          enabled: m.is_enabled,
        }),
      );
    }
  }
  lines.push("");

  if (thresholds.length > 0) {
    lines.push(t(lang, "embed.debug.thresholds"));
    for (const th of thresholds) {
      lines.push(
        t(lang, "embed.debug.thresholdLine", {
          tier: th.pressure_tier,
          pressure: th.pressure,
          action: th.action,
          deleteSec: th.message_delete_seconds,
        }),
      );
    }
    lines.push("");
  }

  if (regex.length > 0) {
    lines.push(t(lang, "embed.debug.regexRules"));
    for (const r of regex) {
      lines.push(
        t(lang, "embed.debug.regexLine", {
          identifier: r.rule_identifier,
          weight: r.threat_weight,
          critical: r.is_critical,
        }),
      );
    }
    lines.push("");
  }

  if (allPressure.length > 0) {
    lines.push(t(lang, "embed.debug.pressureScores"));
    for (const p of allPressure) {
      const elapsed = Date.now() - p.lastUpdated;
      lines.push(
        t(lang, "embed.debug.pressureLine", {
          userId: p.userId,
          pressure: p.pressure,
          seconds: Math.floor(elapsed / 1000),
        }),
      );
    }
  } else {
    lines.push(t(lang, "embed.debug.pressureNone"));
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(lines.join("\n"))
    .setFooter({ text: t(lang, "embed.debug.footer") });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Snapshot current config tables into a portable object.
 * @param {import('better-sqlite3').Database} db
 * @param {string} guildId
 * @returns {{ modules: object[], thresholds: object[], regex: object[], guildConfig: object|null }}
 */
function snapshotConfig(db, guildId) {
  const modules = db
    .prepare(
      "SELECT module_name, weight, is_critical, is_enabled FROM ModuleWeights WHERE guild_id = ?",
    )
    .all(guildId);

  const thresholds = db
    .prepare(
      "SELECT pressure_tier, action, message_delete_seconds, pressure FROM ThresholdActions WHERE guild_id = ?",
    )
    .all(guildId);

  const regex = db
    .prepare(
      "SELECT rule_identifier, pattern, threat_weight, is_critical FROM RegexRules WHERE guild_id = ?",
    )
    .all(guildId);

  return { modules, thresholds, regex };
}

/**
 * Restore config tables from a snapshot object.
 * @param {import('better-sqlite3').Database} db
 * @param {string} guildId
 * @param {{ modules: object[], thresholds: object[], regex: object[], guildConfig: object|null }} data
 */
function restoreConfig(db, guildId, data) {
  const clearModule = db.prepare("DELETE FROM ModuleWeights WHERE guild_id = ?");
  const clearThresholds = db.prepare("DELETE FROM ThresholdActions WHERE guild_id = ?");
  const clearRegex = db.prepare("DELETE FROM RegexRules WHERE guild_id = ?");

  const insModule = db.prepare(
    "INSERT INTO ModuleWeights (guild_id, module_name, weight, is_critical, is_enabled) VALUES (?, ?, ?, ?, ?)",
  );
  const insThreshold = db.prepare(
    "INSERT INTO ThresholdActions (guild_id, pressure_tier, action, message_delete_seconds, pressure) VALUES (?, ?, ?, ?, ?)",
  );
  const insRegex = db.prepare(
    "INSERT INTO RegexRules (guild_id, rule_identifier, pattern, threat_weight, is_critical) VALUES (?, ?, ?, ?, ?)",
  );

  const transaction = db.transaction(() => {
    clearModule.run(guildId);
    for (const m of data.modules || []) {
      insModule.run(
        guildId,
        m.module_name ?? m.name,
        m.weight,
        m.is_critical ?? m.critical ?? 0,
        m.is_enabled ?? m.enabled ?? 0,
      );
    }

    clearThresholds.run(guildId);
    for (const t of data.thresholds || []) {
      insThreshold.run(
        guildId,
        t.pressure_tier ?? t.tier,
        t.action,
        t.message_delete_seconds ?? t.deleteSec ?? 120,
        t.pressure ?? 25,
      );
    }

    clearRegex.run(guildId);
    for (const r of data.regex || []) {
      insRegex.run(guildId, r.rule_identifier, r.pattern, r.threat_weight, r.is_critical);
    }
  });

  transaction();
  invalidateCache();
}
