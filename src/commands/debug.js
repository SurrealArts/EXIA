import { SlashCommandBuilder } from "discord.js";

export const debugCommand = new SlashCommandBuilder()
  .setName("debug")
  .setDescription("Show full system state for debugging");
