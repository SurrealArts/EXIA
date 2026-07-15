import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { t } from "../core/locale.js";

export const actionsCommand = new SlashCommandBuilder()
  .setName("actions")
  .setDescription(t("en", "command.actions.description"))
  .setDescriptionLocalizations({ ja: t("ja", "command.actions.description") })
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)

  .addSubcommand((sub) =>
    sub
      .setName("appeal")
      .setDescription(t("en", "command.actions.appeal.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.actions.appeal.description") })
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription(t("en", "command.actions.appeal.options.message.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.actions.appeal.options.message.description"),
          })
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("rejoin")
      .setDescription(t("en", "command.actions.rejoin.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.actions.rejoin.description") })
      .addStringOption((opt) =>
        opt
          .setName("link")
          .setDescription(t("en", "command.actions.rejoin.options.link.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.actions.rejoin.options.link.description"),
          })
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("ban")
      .setDescription(t("en", "command.actions.ban.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.actions.ban.description") })
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription(t("en", "command.actions.ban.options.user.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.actions.ban.options.user.description"),
          })
          .setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("delete_past")
          .setDescription(t("en", "command.actions.ban.options.delete_past.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.actions.ban.options.delete_past.description"),
          })
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(168),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("refresh")
      .setDescription(t("en", "command.actions.refresh.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.actions.refresh.description") }),
  );
