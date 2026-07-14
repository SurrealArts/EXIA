import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

/**
 * /profiles command — manage full config snapshots.
 * @type {import('discord.js').SlashCommandBuilder}
 */
export const profilesCommand = new SlashCommandBuilder()
  .setName("profiles")
  .setDescription("Manage configuration profiles")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all profiles"),
  )
  .addSubcommand((sub) =>
    sub.setName("current").setDescription("Show active profile name"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Save current config as a new profile")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Profile name")
          .setRequired(true)
          .setMaxLength(50),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("apply")
      .setDescription("Apply a saved profile")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Profile name")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("export")
      .setDescription("Export current config as encoded string"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("import")
      .setDescription("Preview an encoded config string")
      .addStringOption((opt) =>
        opt
          .setName("encoded")
          .setDescription("Base64 encoded config")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a profile (cannot remove Standard)")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Profile name")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );
