import { clog } from "../utils/clog.js";

const LOG_TAG = "[src/modules/honeypotTrap.js]";

export function checkHoneypot(message, guildConfig) {
  const userId = message.author?.id ?? "unknown";
  const channelId = message.channelId;

  if (!guildConfig?.honeypot_channel_id) {
    clog(console.log, `${LOG_TAG} <@${userId}> check: no honeypot configured — triggered=false`);
    return { triggered: false, whitelisted: false };
  }

  clog(
    console.log,
    `${LOG_TAG} <@${userId}> check: honeypot channel = <#${guildConfig.honeypot_channel_id}>, current channel = <#${channelId}>`,
  );

  if (message.channelId !== guildConfig.honeypot_channel_id) {
    clog(console.log, `${LOG_TAG} <@${userId}> check: not in honeypot channel — triggered=false`);
    return { triggered: false, whitelisted: false };
  }

  const whitelisted = message.member?.permissions.has("Administrator") ?? false;
  clog(
    console.log,
    `${LOG_TAG} <@${userId}> check: in honeypot channel, whitelisted=${whitelisted} (Admin permission)`,
  );

  if (whitelisted) {
    clog(
      console.log,
      `${LOG_TAG} <@${userId}> whitelisted admin bypassed honeypot trap in <#${channelId}>`,
    );
    return { triggered: true, whitelisted: true };
  }

  clog(
    console.warn,
    `${LOG_TAG} <@${userId}> TRIGGERED honeypot in <#${channelId}> — initiating fast-track ban`,
  );

  return { triggered: true, whitelisted: false };
}
