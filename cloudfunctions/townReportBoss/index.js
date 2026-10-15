// 举报老板 -- reports a boss who's 画饼摊派'd (skimmed) you at least
// REPORT_SKIM_THRESHOLD times within REPORT_ELIGIBILITY_WINDOW_MS (a week).
// 劳动局 investigates: the boss loses a random cut of their 特产 (inventory
// items), paid out to the reporter as compensation. No jailing -- this is
// a restitution mechanic, not a lockout. Still capped at one report per
// boss per REPORT_COOLDOWN_MS so it can't be spammed the moment eligible.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const REPORT_COOLDOWN_MS = 24 * 3_600_000;
const REPORT_ELIGIBILITY_WINDOW_MS = 7 * 24 * 3_600_000;
const REPORT_SKIM_THRESHOLD = 7;

// Picks 1-3 item types the boss actually holds and docks 30%-70% of each,
// rounded up so a report always takes something, never zero.
function pickDeductions(inventory) {
  const keys = Object.keys(inventory || {}).filter((k) => (inventory[k] || 0) > 0);
  if (keys.length === 0) return {};
  const shuffled = keys.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(3, shuffled.length));
  const deductions = {};
  picked.forEach((k) => {
    const have = inventory[k];
    const amount = Math.min(have, Math.max(1, Math.round(have * (0.3 + Math.random() * 0.4))));
    deductions[k] = amount;
  });
  return deductions;
}

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
  if (recentSkim.total < REPORT_SKIM_THRESHOLD) return { ok: false, error: "not_eligible" };

  const deductions = pickDeductions(boss.inventory || {});
  const bossInventory = { ...(boss.inventory || {}) };
  const selfInventory = { ...(self.inventory || {}) };
  Object.keys(deductions).forEach((k) => {
    bossInventory[k] = Math.max(0, (bossInventory[k] || 0) - deductions[k]);
    selfInventory[k] = (selfInventory[k] || 0) + deductions[k];
  });

  await bossRef.update({ data: { inventory: bossInventory } });
  await selfRef.update({ data: { inventory: selfInventory, reportCooldowns: { ...cooldowns, [bossOpenid]: now } } });
  await db.collection("townJobLog").add({
    data: { openid: OPENID, targetOpenid: bossOpenid, type: "report_boss", itemsGained: deductions, createdAt: now },
  });

  return { ok: true, itemsGained: deductions, profile: { ...self, inventory: selfInventory, reportCooldowns: { ...cooldowns, [bossOpenid]: now } } };
};
