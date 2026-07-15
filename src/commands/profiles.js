import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { t } from "../core/locale.js";

export const profilesCommand = new SlashCommandBuilder()
  .setName("profiles")
  .setDescription(t("en", "command.profiles.description"))
  .setDescriptionLocalizations({ ja: t("ja", "command.profiles.description") })
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription(t("en", "command.profiles.list.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.profiles.list.description") }),
  )
  .addSubcommand((sub) =>
    sub
      .setName("current")
      .setDescription(t("en", "command.profiles.current.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.profiles.current.description") }),
  )
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription(t("en", "command.profiles.create.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.profiles.create.description") })
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription(t("en", "command.profiles.create.options.name.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.profiles.create.options.name.description"),
          })
          .setRequired(true)
          .setMaxLength(50),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("apply")
      .setDescription(t("en", "command.profiles.apply.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.profiles.apply.description") })
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription(t("en", "command.profiles.apply.options.name.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.profiles.apply.options.name.description"),
          })
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("export")
      .setDescription(t("en", "command.profiles.export.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.profiles.export.description") }),
  )
  .addSubcommand((sub) =>
    sub
      .setName("import")
      .setDescription(t("en", "command.profiles.import.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.profiles.import.description") })
      .addStringOption((opt) =>
        opt
          .setName("encoded")
          .setDescription(t("en", "command.profiles.import.options.encoded.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.profiles.import.options.encoded.description"),
          })
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription(t("en", "command.profiles.remove.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.profiles.remove.description") })
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription(t("en", "command.profiles.remove.options.name.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.profiles.remove.options.name.description"),
          })
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );
