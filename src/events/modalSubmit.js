import { MessageFlags } from "discord.js";
import { clog } from "../utils/clog.js";
import { t, resolveInteractionLang } from "../core/locale.js";
import { invalidateCache } from "../utils/queryCache.js";

const LOG_TAG = "[src/events/modalSubmit.js]";

/**
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('better-sqlite3').Database} db
 */
export default async function handleModalSubmit(interaction, db) {
  const lang = resolveInteractionLang(interaction, db, interaction.guildId);

  if (interaction.customId === "regex_create_modal") {
    const ruleIdentifier = interaction.fields.getTextInputValue("rule_identifier");
    const pattern = interaction.fields.getTextInputValue("pattern");
    const weightRaw = interaction.fields.getTextInputValue("threat_weight");
    const threatWeight = weightRaw ? parseInt(weightRaw, 10) : 10;

    if (!ruleIdentifier || !pattern) {
      await interaction.reply({
        content: t(lang, "reply.modal.regex.create.required"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      new RegExp(pattern);
    } catch (err) {
      await interaction.reply({
        content: t(lang, "reply.modal.regex.invalidPattern", { errorMessage: err.message }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    db.prepare(
      `INSERT INTO RegexRules (guild_id, rule_identifier, pattern, threat_weight)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id, rule_identifier)
       DO UPDATE SET pattern = ?, threat_weight = ?`,
    ).run(interaction.guildId, ruleIdentifier, pattern, threatWeight, pattern, threatWeight);

    invalidateCache();

    await interaction.reply({
      content: t(lang, "reply.modal.regex.create.success", {
        identifier: ruleIdentifier,
        weight: threatWeight,
      }),
      flags: MessageFlags.Ephemeral,
    });

    clog(
      console.log,
      `${LOG_TAG} Regex rule "${ruleIdentifier}" created by <@${interaction.user.id}> — pattern: "${pattern.slice(0, 80)}", weight: ${threatWeight}`,
    );
    return;
  }

  if (interaction.customId.startsWith("regex_edit_modal_")) {
    const ruleIdentifier = interaction.customId.slice("regex_edit_modal_".length);
    const pattern = interaction.fields.getTextInputValue("pattern");
    const weightRaw = interaction.fields.getTextInputValue("threat_weight");
    const criticalRaw = interaction.fields.getTextInputValue("is_critical");
    const threatWeight = weightRaw ? parseInt(weightRaw, 10) : 10;
    const isCritical = criticalRaw?.toLowerCase() === "yes" ? 1 : 0;

    if (!pattern) {
      await interaction.reply({
        content: t(lang, "reply.modal.regex.edit.required"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      new RegExp(pattern);
    } catch (err) {
      await interaction.reply({
        content: t(lang, "reply.modal.regex.invalidPattern", { errorMessage: err.message }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    db.prepare(
      `UPDATE RegexRules SET pattern = ?, threat_weight = ?, is_critical = ? WHERE guild_id = ? AND rule_identifier = ?`,
    ).run(pattern, threatWeight, isCritical, interaction.guildId, ruleIdentifier);

    invalidateCache();

    const criticalStatus = isCritical === 1 ? t(lang, "status.yes") : t(lang, "status.no");

    await interaction.reply({
      content: t(lang, "reply.modal.regex.edit.success", {
        identifier: ruleIdentifier,
        weight: threatWeight,
        critical: criticalStatus,
      }),
      flags: MessageFlags.Ephemeral,
    });

    clog(
      console.log,
      `${LOG_TAG} Regex rule "${ruleIdentifier}" updated by <@${interaction.user.id}> — pattern: "${pattern.slice(0, 80)}", weight: ${threatWeight}, critical: ${isCritical === 1 ? "Yes" : "No"}`,
    );
  }
}
