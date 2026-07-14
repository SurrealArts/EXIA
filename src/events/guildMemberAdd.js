import { auditProfile } from "../modules/userProfile.js";
import { getDatabase } from "../core/database.js";
import { enqueue } from "../utils/telemetryQueue.js";
import { clog } from "../utils/clog.js";

export default async function handleGuildMemberAdd(member) {
  if (member.user.bot) {
    clog(
      console.log,
      `[src/events/guildMemberAdd.js] Ignored bot user ${member.user.id} joining guild ${member.guild.id}`,
    );
    return;
  }

  clog(
    console.log,
    `[src/events/guildMemberAdd.js] Member joined: <@${member.user.id}> (${member.user.id}) in guild ${member.guild.id}`,
  );

  const db = getDatabase();

  const mod = db
    .prepare(
      "SELECT is_enabled FROM ModuleWeights WHERE guild_id = ? AND module_name = 'user_profile'",
    )
    .get(member.guild.id);

  const profileEnabled = mod && mod.is_enabled === 1;
  clog(
    console.log,
    `[src/events/guildMemberAdd.js] user_profile module enabled: ${profileEnabled} for guild ${member.guild.id}`,
  );

  if (!profileEnabled) {
    clog(
      console.log,
      `[src/events/guildMemberAdd.js] user_profile disabled, skipping audit for <@${member.user.id}>`,
    );
    return;
  }

  const profile = auditProfile(member);
  clog(
    console.log,
    `[src/events/guildMemberAdd.js] <@${member.user.id}> audit complete — multiplier: ${profile.multiplier}x, flagged: ${profile.reasons.length > 0}`,
  );

  if (profile.reasons.length > 0) {
    clog(
      console.log,
      `[src/events/guildMemberAdd.js] <@${member.user.id}> flagged on join — reasons: ${profile.reasons.join("; ")}, multiplier: ${profile.multiplier}x`,
    );
    enqueue(
      "flag",
      `<@${member.user.id}> joined flagged — ${profile.reasons.join("; ")} (${profile.multiplier}x)`,
    );
  }
}
