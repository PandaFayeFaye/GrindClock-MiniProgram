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

// "名片被访通知" template (公共模板库 #801) -- same template townSteal/townSkim
// already push through, reused here so no extra subscription grant is needed
// on the client (see src/lib/town.ts ALL_SUBSCRIBE_TEMPLATE_IDS).
const SUBSCRIBE_TEMPLATE_ID = "2pMbXON4D1mJGcWnyEAnIZEkvCKufeXsfruclncjtdU";

async function notifyReportedBoss(bossOpenid, reporterOpenid) {
  if (!SUBSCRIBE_TEMPLATE_ID) return;
  try {
    const reporterProfileRes = await db.collection("userProfile").where({ _openid: reporterOpenid }).limit(1).get();
    const reporterNickname = (reporterProfileRes.data[0] && reporterProfileRes.data[0].nickname) || "神秘搭子";
    await cloud.openapi.subscribeMessage.send({
      touser: bossOpenid,
      templateId: SUBSCRIBE_TEMPLATE_ID,
      page: "pages/town-world/index",
      data: {
        name1: { value: reporterNickname.slice(0, 10) },
        date2: { value: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10) },
        thing3: { value: `被${reporterNickname.slice(0, 6)}举报画饼摊派`.slice(0, 20) },
        thing4: { value: "劳动局查了你，扣了点特产赔给TA" },
      },
    });
  } catch (err) {
    console.error("subscribeMessage.send (reportBoss) failed", err);
  }
}

// Picks 1-3 item types the boss actually holds and docks a small flat
// 1-3 units of each -- a symbolic fine, not a wipeout.
function pickDeductions(inventory) {
  const keys = Object.keys(inventory || {}).filter((k) => (inventory[k] || 0) > 0);
  if (keys.length === 0) return {};
  const shuffled = keys.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(3, shuffled.length));
  const deductions = {};
  picked.forEach((k) => {
    const have = inventory[k];
    const amount = Math.min(have, 1 + Math.floor(Math.random() * 3));
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

  await notifyReportedBoss(bossOpenid, OPENID);

  return { ok: true, itemsGained: deductions, profile: { ...self, inventory: selfInventory, reportCooldowns: { ...cooldowns, [bossOpenid]: now } } };
};
