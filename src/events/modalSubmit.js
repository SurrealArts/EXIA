import { MessageFlags } from "discord.js";
import { clog } from "../utils/clog.js";

/**
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('better-sqlite3').Database} db
 */
export default async function handleModalSubmit(interaction, db) {
  if (interaction.customId === "regex_create_modal") {
    const ruleIdentifier =
      interaction.fields.getTextInputValue("rule_identifier");
    const pattern = interaction.fields.getTextInputValue("pattern");
    const weightRaw = interaction.fields.getTextInputValue("threat_weight");
    const threatWeight = weightRaw ? parseInt(weightRaw, 10) : 10;

    if (!ruleIdentifier || !pattern) {
      await interaction.reply({
        content: "Rule identifier and pattern are required.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      new RegExp(pattern);
    } catch (err) {
      await interaction.reply({
        content: `Invalid regex pattern: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    db.prepare(
      `INSERT INTO RegexRules (guild_id, rule_identifier, pattern, threat_weight)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id, rule_identifier)
       DO UPDATE SET pattern = ?, threat_weight = ?`,
    ).run(
      interaction.guildId,
      ruleIdentifier,
      pattern,
      threatWeight,
      pattern,
      threatWeight,
    );

    await interaction.reply({
      content: `Regex rule **${ruleIdentifier}** created with weight ${threatWeight}.`,
      flags: MessageFlags.Ephemeral,
    });

    clog(
      console.log,
      `[src/events/modalSubmit.js] Regex rule "${ruleIdentifier}" created by <@${interaction.user.id}> — pattern: "${pattern.slice(0, 80)}", weight: ${threatWeight}`,
    );
    return;
  }

  if (interaction.customId.startsWith("regex_edit_modal_")) {
    const ruleIdentifier = interaction.customId.slice(
      "regex_edit_modal_".length,
    );
    const pattern = interaction.fields.getTextInputValue("pattern");
    const weightRaw = interaction.fields.getTextInputValue("threat_weight");
    const criticalRaw = interaction.fields.getTextInputValue("is_critical");
    const threatWeight = weightRaw ? parseInt(weightRaw, 10) : 10;
    const isCritical = criticalRaw?.toLowerCase() === "yes" ? 1 : 0;

    if (!pattern) {
      await interaction.reply({
        content: "Pattern is required.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      new RegExp(pattern);
    } catch (err) {
      await interaction.reply({
        content: `Invalid regex pattern: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    db.prepare(
      `UPDATE RegexRules SET pattern = ?, threat_weight = ?, is_critical = ? WHERE guild_id = ? AND rule_identifier = ?`,
    ).run(
      pattern,
      threatWeight,
      isCritical,
      interaction.guildId,
      ruleIdentifier,
    );

    await interaction.reply({
      content: `Regex rule **${ruleIdentifier}** updated (weight: ${threatWeight}, critical: ${isCritical === 1 ? "Yes" : "No"}).`,
      flags: MessageFlags.Ephemeral,
    });

    clog(
      console.log,
      `[src/events/modalSubmit.js] Regex rule "${ruleIdentifier}" updated by <@${interaction.user.id}> — pattern: "${pattern.slice(0, 80)}", weight: ${threatWeight}, critical: ${isCritical === 1 ? "Yes" : "No"}`,
    );
  }
}
