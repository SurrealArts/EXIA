import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { t } from "../core/locale.js";

export const debugCommand = new SlashCommandBuilder()
  .setName("debug")
  .setDescription(t("en", "command.debug.description"))
  .setDescriptionLocalizations({ ja: t("ja", "command.debug.description") })
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
