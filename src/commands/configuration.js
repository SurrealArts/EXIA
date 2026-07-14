import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

/**
 * /config command — all subcommand groups and subcommands.
 * @type {import('discord.js').SlashCommandBuilder}
 */
export const configCommand = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configure EXIA moderation settings")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  // /config modules toggle
  .addSubcommandGroup((group) =>
    group
      .setName("modules")
      .setDescription("Manage threat detection modules")
      .addSubcommand((sub) =>
        sub
          .setName("toggle")
          .setDescription("Enable or disable a module")
          .addStringOption((opt) =>
            opt
              .setName("target_module")
              .setDescription("Module to toggle")
              .setRequired(true)
              .addChoices(
                { name: "User Profile", value: "user_profile" },
                { name: "Velocity", value: "velocity" },
                { name: "Honeypot Trap", value: "honeypot" },
                { name: "Regex", value: "regex" },
              ),
          )
          .addBooleanOption((opt) =>
            opt
              .setName("active_state")
              .setDescription("Enable or disable")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("weight")
          .setDescription("Set a module's pressure weight")
          .addStringOption((opt) =>
            opt
              .setName("target_module")
              .setDescription("Module to configure")
              .setRequired(true)
              .addChoices(
                { name: "User Profile", value: "user_profile" },
                { name: "Velocity", value: "velocity" },
                { name: "Honeypot Trap", value: "honeypot" },
                { name: "Regex", value: "regex" },
              ),
          )
          .addIntegerOption((opt) =>
            opt
              .setName("value")
              .setDescription("Pressure weight (0-9999)")
              .setRequired(true)
              .setMinValue(0)
              .setMaxValue(9999),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("critical")
          .setDescription("Toggle a module's critical (instant ban) flag")
          .addStringOption((opt) =>
            opt
              .setName("target_module")
              .setDescription("Module to configure")
              .setRequired(true)
              .addChoices(
                { name: "User Profile", value: "user_profile" },
                { name: "Velocity", value: "velocity" },
                { name: "Honeypot Trap", value: "honeypot" },
                { name: "Regex", value: "regex" },
              ),
          )
          .addBooleanOption((opt) =>
            opt
              .setName("is_critical")
              .setDescription("Critical? (instant ban on trigger)")
              .setRequired(true),
          ),
      ),
  )

  // /config thresholds assign
  .addSubcommandGroup((group) =>
    group
      .setName("thresholds")
      .setDescription("Configure pressure thresholds")
      .addSubcommand((sub) =>
        sub
          .setName("assign")
          .setDescription("Assign an action to a pressure tier")
          .addIntegerOption((opt) =>
            opt
              .setName("action_tier")
              .setDescription("Tier to configure")
              .setRequired(true)
              .addChoices(
                { name: "Tier 1 — Warn", value: 1 },
                { name: "Tier 2 — Mute", value: 2 },
                { name: "Tier 3 — Kick", value: 3 },
                { name: "Tier 4 — Ban", value: 4 },
              ),
          )
          .addIntegerOption((opt) =>
            opt
              .setName("pressure_limit")
              .setDescription("Pressure points required")
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(9999),
          )
          .addIntegerOption((opt) =>
            opt
              .setName("delete_after")
              .setDescription(
                "Auto-delete notice after N seconds (default 120)",
              )
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(3600),
          ),
      ),
  )

  // /config regex create, list, edit, delete
  .addSubcommandGroup((group) =>
    group
      .setName("regex")
      .setDescription("Manage regex rules")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create a regex rule (opens modal)"),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List all regex rules"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription("Edit a regex rule (opens modal)")
          .addStringOption((opt) =>
            opt
              .setName("identifier")
              .setDescription("Rule identifier to edit")
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete a regex rule")
          .addStringOption((opt) =>
            opt
              .setName("identifier")
              .setDescription("Rule identifier to delete")
              .setRequired(true)
              .setAutocomplete(true),
          ),
      ),
  )

  // /config honeypot set
  .addSubcommandGroup((group) =>
    group
      .setName("honeypot")
      .setDescription("Configure honeypot channel")
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("Set the honeypot trap channel")
          .addChannelOption((opt) =>
            opt
              .setName("target_channel")
              .setDescription("Honeypot channel")
              .setRequired(true),
          ),
      ),
  )

  // /config logchannel set
  .addSubcommandGroup((group) =>
    group
      .setName("logchannel")
      .setDescription("Configure telemetry log channel")
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("Set the log channel for telemetry")
          .addChannelOption((opt) =>
            opt
              .setName("target_channel")
              .setDescription("Log channel")
              .setRequired(true),
          ),
      ),
  )

  // /config view
  .addSubcommand((sub) =>
    sub.setName("view").setDescription("View current configuration"),
  );
