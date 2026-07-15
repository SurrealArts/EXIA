import { auditProfile } from "../modules/userProfile.js";
import { getDatabase } from "../core/database.js";
import { enqueue } from "../utils/telemetryQueue.js";
import { clog } from "../utils/clog.js";
import { t, getGuildLanguage } from "../core/locale.js";

const LOG_TAG = "[src/events/guildMemberAdd.js]";

export default async function handleGuildMemberAdd(member) {
  if (member.user.bot) {
    clog(
      console.log,
      `${LOG_TAG} Ignored bot user ${member.user.id} joining guild ${member.guild.id}`,
    );
    return;
  }

  clog(
    console.log,
    `${LOG_TAG} Member joined: <@${member.user.id}> (${member.user.id}) in guild ${member.guild.id}`,
  );

  const db = getDatabase();
  const lang = getGuildLanguage(db, member.guild.id);

  const mod = db
    .prepare(
      "SELECT is_enabled FROM ModuleWeights WHERE guild_id = ? AND module_name = 'user_profile'",
    )
    .get(member.guild.id);

  const profileEnabled = mod && mod.is_enabled === 1;
  clog(
    console.log,
    `${LOG_TAG} user_profile module enabled: ${profileEnabled} for guild ${member.guild.id}`,
  );

  if (!profileEnabled) {
    clog(console.log, `${LOG_TAG} user_profile disabled, skipping audit for <@${member.user.id}>`);
    return;
  }

  const profile = auditProfile(member, lang);
  clog(
    console.log,
    `${LOG_TAG} <@${member.user.id}> audit complete — multiplier: ${profile.multiplier}x, flagged: ${profile.reasons.length > 0}`,
  );

  if (profile.reasons.length > 0) {
    clog(
      console.log,
      `${LOG_TAG} <@${member.user.id}> flagged on join — reasons: ${profile.reasons.join("; ")}, multiplier: ${profile.multiplier}x`,
    );
    enqueue(
      "flag",
      member.guild.id,
      t(lang, "reply.guildMemberAdd.flagged", {
        userId: member.user.id,
        reasons: profile.reasons.join("; "),
        multiplier: profile.multiplier,
      }),
    );
  }
}
