import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

/**
 * /raid command — manual raid mode control.
 * @type {import('discord.js').SlashCommandBuilder}
 */
export const raidCommand = new SlashCommandBuilder()
  .setName("raid")
  .setDescription("Raid protection controls")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  .addSubcommand((sub) =>
    sub
      .setName("stage")
      .setDescription("Set raid stage manually")
      .addIntegerOption((opt) =>
        opt
          .setName("stage")
          .setDescription("Raid stage (0 = off, 1-3 = active)")
          .setRequired(true)
          .addChoices(
            { name: "Stage 0 — Inactive", value: 0 },
            { name: "Stage 1 — Slowmode 30m", value: 1 },
            { name: "Stage 2 — Slowmode 2h", value: 2 },
            { name: "Stage 3 — Lockdown", value: 3 },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Check current raid stage"),
  );
