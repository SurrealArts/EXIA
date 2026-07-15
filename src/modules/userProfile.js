import { clog } from "../utils/clog.js";
import { t } from "../core/locale.js";

const LOG_TAG = "[src/modules/userProfile.js]";

const MIN_ACCOUNT_AGE_DAYS = 7;

export function auditProfile(member, lang = "en") {
  const reasons = [];
  const userId = member.user.id;

  const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);

  const isYoung = accountAge < MIN_ACCOUNT_AGE_DAYS;
  const noAvatar = !member.user.avatar;

  clog(
    console.log,
    `${LOG_TAG} Auditing ${userId} — account age: ${accountAge.toFixed(2)} days, avatar: ${noAvatar ? "missing" : "present"}, isYoung: ${isYoung}`,
  );

  if (isYoung) {
    reasons.push(
      t(lang, "profile.reason.young", {
        age: accountAge.toFixed(1),
        minDays: MIN_ACCOUNT_AGE_DAYS,
      }),
    );
  }

  if (noAvatar) {
    reasons.push(t(lang, "profile.reason.noAvatar"));
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
    `${LOG_TAG} ${userId} result — multiplier: ${multiplier}x, reasons: [${reasons.join(", ")}]`,
  );

  return { multiplier, reasons };
}
