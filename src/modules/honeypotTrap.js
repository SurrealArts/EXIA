import { clog } from "../utils/clog.js";

export function checkHoneypot(message, db) {
  const userId = message.author?.id ?? "unknown";
  const channelId = message.channelId;

  const config = db
    .prepare(
      "SELECT honeypot_channel_id FROM GuildConfiguration WHERE guild_id = ?",
    )
    .get(message.guildId);

  if (!config?.honeypot_channel_id) {
    clog(
      console.log,
      `[src/modules/honeypotTrap.js] <@${userId}> check: no honeypot configured — triggered=false`,
    );
    return { triggered: false, whitelisted: false };
  }

  clog(
    console.log,
    `[src/modules/honeypotTrap.js] <@${userId}> check: honeypot channel = <#${config.honeypot_channel_id}>, current channel = <#${channelId}>`,
  );

  if (message.channelId !== config.honeypot_channel_id) {
    clog(
      console.log,
      `[src/modules/honeypotTrap.js] <@${userId}> check: not in honeypot channel — triggered=false`,
    );
    return { triggered: false, whitelisted: false };
  }

  const whitelisted = message.member?.permissions.has("Administrator") ?? false;
  clog(
    console.log,
    `[src/modules/honeypotTrap.js] <@${userId}> check: in honeypot channel, whitelisted=${whitelisted} (Admin permission)`,
  );

  if (whitelisted) {
    clog(
      console.log,
      `[src/modules/honeypotTrap.js] <@${userId}> whitelisted admin bypassed honeypot trap in <#${channelId}>`,
    );
    return { triggered: true, whitelisted: true };
  }

  clog(
    console.warn,
    `[src/modules/honeypotTrap.js] <@${userId}> TRIGGERED honeypot in <#${channelId}> — initiating fast-track ban`,
  );

  return { triggered: true, whitelisted: false };
}
