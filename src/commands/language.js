import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { t } from "../core/locale.js";
import { clog } from "../utils/clog.js";
import { invalidateCache } from "../utils/queryCache.js";

const LOG_TAG = "[src/commands/language.js]";

export const languageCommand = new SlashCommandBuilder()
  .setName("language")
  .setDescription(t("en", "command.language.description"))
  .setDescriptionLocalizations({ ja: t("ja", "command.language.description") })
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName("language")
      .setDescription(t("en", "command.language.options.language.description"))
      .setDescriptionLocalizations({ ja: t("ja", "command.language.options.language.description") })
      .setRequired(true)
      .addChoices(
        {
          name: t("en", "command.language.options.language.choices.english"),
          value: "en",
          name_localizations: { ja: t("ja", "command.language.options.language.choices.english") },
        },
        {
          name: t("en", "command.language.options.language.choices.japanese"),
          value: "ja",
          name_localizations: { ja: t("ja", "command.language.options.language.choices.japanese") },
        },
      ),
  );

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('better-sqlite3').Database} db
 */
export async function handleLanguageCommand(interaction, db) {
  const lang = interaction.options.getString("language", true);

  const langNames = { en: "English", ja: "日本語" };
  const displayName = langNames[lang] || lang;

  db.prepare(
    `INSERT INTO GuildConfiguration (guild_id, language)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET language = ?`,
  ).run(interaction.guildId, lang, lang);

  invalidateCache();

  clog(
    console.log,
    `${LOG_TAG} Guild ${interaction.guildId} language set to "${lang}" by <@${interaction.user.id}>`,
  );

  await interaction.reply({
    content: t(lang, "reply.language.set", { language: displayName }),
    flags: (await import("discord.js")).MessageFlags.Ephemeral,
  });
}
