import { SlashCommandBuilder } from "discord.js";
import { t } from "../core/locale.js";

export const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription(t("en", "command.help.description"))
  .setDescriptionLocalizations({ ja: t("ja", "command.help.description") });
