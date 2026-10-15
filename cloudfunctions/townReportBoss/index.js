// 举报老板 -- reports someone who画饼摊派'd (skimmed) you recently. Jails
// them for REPORT_JAIL_MS: same lockout as the steal-trap jail (no working,
// stealing, skimming, promoting, buying decor, feeding, or claiming
// rations). Only usable against someone who actually skimmed you within
// REPORT_ELIGIBILITY_WINDOW_MS, and only once per boss per REPORT_COOLDOWN_MS
// -- can't be used as a generic griefing tool against someone who never
// touched you.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const REPORT_JAIL_MS = 4 * 3_600_000;
const REPORT_COOLDOWN_MS = 24 * 3_600_000;
const REPORT_ELIGIBILITY_WINDOW_MS = 24 * 3_600_000;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const bossOpenid = event && event.bossOpenid;
  if (!bossOpenid || bossOpenid === OPENID) return { ok: false, error: "invalid_target" };

  const selfRef = db.collection("townProfiles").doc(OPENID);
  const bossRef = db.collection("townProfiles").doc(bossOpenid);
  const [selfRes, bossRes] = await Promise.all([selfRef.get().catch(() => null), bossRef.get().catch(() => null)]);
  const self = selfRes && selfRes.data;
  const boss = bossRes && bossRes.data;
  if (!self || !self.unlocked) return { ok: false, error: "not_unlocked" };
  if (!boss || !boss.unlocked) return { ok: false, error: "target_not_found" };

  const now = Date.now();
  const cooldowns = self.reportCooldowns || {};
  if (cooldowns[bossOpenid] && now - cooldowns[bossOpenid] < REPORT_COOLDOWN_MS) {
    return { ok: false, error: "report_cooldown" };
  }

  const recentSkim = await db
    .collection("townJobLog")
    .where({ openid: bossOpenid, targetOpenid: OPENID, type: "skim", createdAt: _.gte(now - REPORT_ELIGIBILITY_WINDOW_MS) })
    .count();
  if (recentSkim.total === 0) return { ok: false, error: "not_eligible" };

  const jailedUntil = Math.max(boss.jailedUntil || 0, now + REPORT_JAIL_MS);
  await bossRef.update({ data: { jailedUntil } });
  await selfRef.update({ data: { reportCooldowns: { ...cooldowns, [bossOpenid]: now } } });
  await db.collection("townJobLog").add({
    data: { openid: OPENID, targetOpenid: bossOpenid, type: "report_boss", createdAt: now },
  });

  return { ok: true, jailedUntil };
};
