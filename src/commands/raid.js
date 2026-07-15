import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { t } from "../core/locale.js";

export const raidCommand = new SlashCommandBuilder()
  .setName("raid")
  .setDescription(t("en", "command.raid.description"))
  .setDescriptionLocalizations({ ja: t("ja", "command.raid.description") })
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  .addSubcommand((sub) =>
    sub
      .setName("stage")
      .setDescription(t("en", "command.raid.stage.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.raid.stage.description") })
      .addIntegerOption((opt) =>
        opt
          .setName("stage")
          .setDescription(t("en", "command.raid.stage.options.stage.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.raid.stage.options.stage.description"),
          })
          .setRequired(true)
          .addChoices(
            {
              name: t("en", "command.raid.stage.options.stage.choices.stage0"),
              value: 0,
              name_localizations: {
                ja: t("ja", "command.raid.stage.options.stage.choices.stage0"),
              },
            },
            {
              name: t("en", "command.raid.stage.options.stage.choices.stage1"),
              value: 1,
              name_localizations: {
                ja: t("ja", "command.raid.stage.options.stage.choices.stage1"),
              },
            },
            {
              name: t("en", "command.raid.stage.options.stage.choices.stage2"),
              value: 2,
              name_localizations: {
                ja: t("ja", "command.raid.stage.options.stage.choices.stage2"),
              },
            },
            {
              name: t("en", "command.raid.stage.options.stage.choices.stage3"),
              value: 3,
              name_localizations: {
                ja: t("ja", "command.raid.stage.options.stage.choices.stage3"),
              },
            },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription(t("en", "command.raid.status.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.raid.status.description") }),
  );
