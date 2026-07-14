import { clog } from "../utils/clog.js";

const MIN_ACCOUNT_AGE_DAYS = 7;

export function auditProfile(member) {
  const reasons = [];
  const userId = member.user.id;

  const accountAge =
    (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);

  const isYoung = accountAge < MIN_ACCOUNT_AGE_DAYS;
  const noAvatar = !member.user.avatar;

  clog(
    console.log,
    `[src/modules/userProfile.js] Auditing ${userId} — account age: ${accountAge.toFixed(2)} days, avatar: ${noAvatar ? "missing" : "present"}, isYoung: ${isYoung}`,
  );

  if (isYoung) {
    reasons.push(
      `account too young (${accountAge.toFixed(1)} days < ${MIN_ACCOUNT_AGE_DAYS} days)`,
    );
  }

  if (noAvatar) {
    reasons.push("no avatar set");
  }

  let multiplier;
  if (isYoung && noAvatar) {
    multiplier = 2.0;
  } else if (isYoung) {
    multiplier = 1.5;
  } else if (noAvatar) {
    multiplier = 1.2;
  } else {
    multiplier = 1.0;
  }

  clog(
    console.log,
    `[src/modules/userProfile.js] ${userId} result — multiplier: ${multiplier}x, reasons: [${reasons.join(", ")}]`,
  );

  return { multiplier, reasons };
}
