import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

/**
 * /actions command — appeal, rejoin link, and manual ban.
 * @type {import('discord.js').SlashCommandBuilder}
 */
export const actionsCommand = new SlashCommandBuilder()
  .setName("actions")
  .setDescription("Moderation action commands")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)

  .addSubcommand((sub) =>
    sub
      .setName("appeal")
      .setDescription("Set appeal contact info (shown to banned users)")
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Contact info or instructions for banned users")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("rejoin")
      .setDescription("Set rejoin invite link (sent to kicked users)")
      .addStringOption((opt) =>
        opt
          .setName("link")
          .setDescription("Rejoin invite link")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("ban")
      .setDescription("Ban a user with optional message deletion")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to ban").setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("delete_past")
          .setDescription("Delete messages from last N hours (max 168)")
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(168),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("refresh")
      .setDescription("Re-scan all cached members with user_profile module"),
  );
