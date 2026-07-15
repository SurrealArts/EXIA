import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { t } from "../core/locale.js";

export const configCommand = new SlashCommandBuilder()
  .setName("config")
  .setDescription(t("en", "command.config.description"))
  .setDescriptionLocalizations({ ja: t("ja", "command.config.description") })
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  .addSubcommandGroup((group) =>
    group
      .setName("modules")
      .setDescription(t("en", "command.config.modules.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.config.modules.description") })
      .addSubcommand((sub) =>
        sub
          .setName("toggle")
          .setDescription(t("en", "command.config.modules.toggle.description"))
          .setDescriptionLocalizations({ ja: t("ja", "command.config.modules.toggle.description") })
          .addStringOption((opt) =>
            opt
              .setName("target_module")
              .setDescription(
                t("en", "command.config.modules.toggle.options.target_module.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.modules.toggle.options.target_module.description"),
              })
              .setRequired(true)
              .addChoices(
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.user_profile",
                  ),
                  value: "user_profile",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.user_profile",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.velocity",
                  ),
                  value: "velocity",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.velocity",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.honeypot",
                  ),
                  value: "honeypot",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.honeypot",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.regex",
                  ),
                  value: "regex",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.regex",
                    ),
                  },
                },
              ),
          )
          .addBooleanOption((opt) =>
            opt
              .setName("active_state")
              .setDescription(
                t("en", "command.config.modules.toggle.options.active_state.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.modules.toggle.options.active_state.description"),
              })
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("weight")
          .setDescription(t("en", "command.config.modules.weight.description"))
          .setDescriptionLocalizations({ ja: t("ja", "command.config.modules.weight.description") })
          .addStringOption((opt) =>
            opt
              .setName("target_module")
              .setDescription(
                t("en", "command.config.modules.weight.options.target_module.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.modules.weight.options.target_module.description"),
              })
              .setRequired(true)
              .addChoices(
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.user_profile",
                  ),
                  value: "user_profile",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.user_profile",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.velocity",
                  ),
                  value: "velocity",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.velocity",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.honeypot",
                  ),
                  value: "honeypot",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.honeypot",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.regex",
                  ),
                  value: "regex",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.regex",
                    ),
                  },
                },
              ),
          )
          .addIntegerOption((opt) =>
            opt
              .setName("value")
              .setDescription(t("en", "command.config.modules.weight.options.value.description"))
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.modules.weight.options.value.description"),
              })
              .setRequired(true)
              .setMinValue(0)
              .setMaxValue(9999),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("critical")
          .setDescription(t("en", "command.config.modules.critical.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.config.modules.critical.description"),
          })
          .addStringOption((opt) =>
            opt
              .setName("target_module")
              .setDescription(
                t("en", "command.config.modules.critical.options.target_module.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.modules.critical.options.target_module.description"),
              })
              .setRequired(true)
              .addChoices(
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.user_profile",
                  ),
                  value: "user_profile",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.user_profile",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.velocity",
                  ),
                  value: "velocity",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.velocity",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.honeypot",
                  ),
                  value: "honeypot",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.honeypot",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.modules.toggle.options.target_module.choices.regex",
                  ),
                  value: "regex",
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.modules.toggle.options.target_module.choices.regex",
                    ),
                  },
                },
              ),
          )
          .addBooleanOption((opt) =>
            opt
              .setName("is_critical")
              .setDescription(
                t("en", "command.config.modules.critical.options.is_critical.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.modules.critical.options.is_critical.description"),
              })
              .setRequired(true),
          ),
      ),
  )

  .addSubcommandGroup((group) =>
    group
      .setName("thresholds")
      .setDescription(t("en", "command.config.thresholds.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.config.thresholds.description") })
      .addSubcommand((sub) =>
        sub
          .setName("assign")
          .setDescription(t("en", "command.config.thresholds.assign.description"))
          .setDescriptionLocalizations({
            ja: t("ja", "command.config.thresholds.assign.description"),
          })
          .addIntegerOption((opt) =>
            opt
              .setName("action_tier")
              .setDescription(
                t("en", "command.config.thresholds.assign.options.action_tier.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.thresholds.assign.options.action_tier.description"),
              })
              .setRequired(true)
              .addChoices(
                {
                  name: t(
                    "en",
                    "command.config.thresholds.assign.options.action_tier.choices.tier1",
                  ),
                  value: 1,
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.thresholds.assign.options.action_tier.choices.tier1",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.thresholds.assign.options.action_tier.choices.tier2",
                  ),
                  value: 2,
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.thresholds.assign.options.action_tier.choices.tier2",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.thresholds.assign.options.action_tier.choices.tier3",
                  ),
                  value: 3,
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.thresholds.assign.options.action_tier.choices.tier3",
                    ),
                  },
                },
                {
                  name: t(
                    "en",
                    "command.config.thresholds.assign.options.action_tier.choices.tier4",
                  ),
                  value: 4,
                  name_localizations: {
                    ja: t(
                      "ja",
                      "command.config.thresholds.assign.options.action_tier.choices.tier4",
                    ),
                  },
                },
              ),
          )
          .addIntegerOption((opt) =>
            opt
              .setName("pressure_limit")
              .setDescription(
                t("en", "command.config.thresholds.assign.options.pressure_limit.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.thresholds.assign.options.pressure_limit.description"),
              })
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(9999),
          )
          .addIntegerOption((opt) =>
            opt
              .setName("delete_after")
              .setDescription(
                t("en", "command.config.thresholds.assign.options.delete_after.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.thresholds.assign.options.delete_after.description"),
              })
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(3600),
          ),
      ),
  )

  .addSubcommandGroup((group) =>
    group
      .setName("regex")
      .setDescription(t("en", "command.config.regex.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.config.regex.description") })
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription(t("en", "command.config.regex.create.description"))
          .setDescriptionLocalizations({ ja: t("ja", "command.config.regex.create.description") }),
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription(t("en", "command.config.regex.list.description"))
          .setDescriptionLocalizations({ ja: t("ja", "command.config.regex.list.description") }),
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription(t("en", "command.config.regex.edit.description"))
          .setDescriptionLocalizations({ ja: t("ja", "command.config.regex.edit.description") })
          .addStringOption((opt) =>
            opt
              .setName("identifier")
              .setDescription(t("en", "command.config.regex.edit.options.identifier.description"))
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.regex.edit.options.identifier.description"),
              })
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription(t("en", "command.config.regex.delete.description"))
          .setDescriptionLocalizations({ ja: t("ja", "command.config.regex.delete.description") })
          .addStringOption((opt) =>
            opt
              .setName("identifier")
              .setDescription(t("en", "command.config.regex.delete.options.identifier.description"))
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.regex.delete.options.identifier.description"),
              })
              .setRequired(true)
              .setAutocomplete(true),
          ),
      ),
  )

  .addSubcommandGroup((group) =>
    group
      .setName("honeypot")
      .setDescription(t("en", "command.config.honeypot.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.config.honeypot.description") })
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription(t("en", "command.config.honeypot.set.description"))
          .setDescriptionLocalizations({ ja: t("ja", "command.config.honeypot.set.description") })
          .addChannelOption((opt) =>
            opt
              .setName("target_channel")
              .setDescription(
                t("en", "command.config.honeypot.set.options.target_channel.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.honeypot.set.options.target_channel.description"),
              })
              .setRequired(true),
          ),
      ),
  )

  .addSubcommandGroup((group) =>
    group
      .setName("logchannel")
      .setDescription(t("en", "command.config.logchannel.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.config.logchannel.description") })
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription(t("en", "command.config.logchannel.set.description"))
          .setDescriptionLocalizations({ ja: t("ja", "command.config.logchannel.set.description") })
          .addChannelOption((opt) =>
            opt
              .setName("target_channel")
              .setDescription(
                t("en", "command.config.logchannel.set.options.target_channel.description"),
              )
              .setDescriptionLocalizations({
                ja: t("ja", "command.config.logchannel.set.options.target_channel.description"),
              })
              .setRequired(true),
          ),
      ),
  )

  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription(t("en", "command.config.view.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.config.view.description") }),
  );
