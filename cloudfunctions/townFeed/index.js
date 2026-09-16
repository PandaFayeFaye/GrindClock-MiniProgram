// Spends 牛马粮 to satisfy the companion's real hunger window (isPetHungry /
// 36h, see src/lib/pet.ts). The client takes max(realLastPunchOutTime,
// townProfile.lastFedAt) when deciding whether the pet looks hungry, so
// feeding from the town resets the same clock a real punch-out would.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const FEED_COST = 10;

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) {
    return { ok: false, error: "not_unlocked" };
  }
  if ((profile.oxFeed || 0) < FEED_COST) {
    return { ok: false, error: "insufficient_oxfeed" };
  }

  const now = Date.now();
  const newOxFeed = profile.oxFeed - FEED_COST;
  await ref.update({ data: { oxFeed: newOxFeed, lastFedAt: now, lastActiveAt: now } });

  return { ok: true, profile: { ...profile, oxFeed: newOxFeed, lastFedAt: now } };
};
