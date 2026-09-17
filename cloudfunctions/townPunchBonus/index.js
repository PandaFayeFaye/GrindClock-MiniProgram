// Awards a 牛马粮 bonus for a REAL punch-clock clock-out, on top of the daily
// free ration (townCheckin) -- see MOYU_TOWN_SPEC.md 4.1: "真实打卡奖励...
// 比免费配给多好几倍". This is what actually ties the town's economy back to
// real work; without it 牛马粮 only came from the daily login ration and the
// town was fully decoupled from real punching, which was never the intent.
// Silently a no-op if the player hasn't unlocked the town yet -- the client
// calls this fire-and-forget after every real clock-out and ignores errors.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const REAL_PUNCH_BONUS = 30;

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) return { ok: false, error: "not_unlocked" };

  const now = Date.now();
  const newOxFeed = (profile.oxFeed || 0) + REAL_PUNCH_BONUS;
  await ref.update({ data: { oxFeed: newOxFeed, lastActiveAt: now } });
  await db.collection("townJobLog").add({
    data: { openid: OPENID, type: "real_punch_bonus", expGained: 0, itemsGained: {}, createdAt: now },
  });

  return { ok: true, gained: REAL_PUNCH_BONUS, profile: { ...profile, oxFeed: newOxFeed } };
};
