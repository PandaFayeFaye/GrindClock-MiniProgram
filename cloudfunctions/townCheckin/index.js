// Daily free 牛马粮 ration -- available regardless of real punch-clock
// activity so the town stays playable on rest days (see MOYU_TOWN_SPEC.md
// section 4.1). One ration per China-local calendar day.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const DAILY_RATION = 15;
const CN_TZ_OFFSET_MS = 8 * 3_600_000;

function cnDateKey(ts) {
  return new Date(ts + CN_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) {
    return { ok: false, error: "not_unlocked" };
  }

  const now = Date.now();
  if (profile.lastDailyRationAt && cnDateKey(profile.lastDailyRationAt) === cnDateKey(now)) {
    return { ok: false, error: "already_claimed_today" };
  }

  const newOxFeed = (profile.oxFeed || 0) + DAILY_RATION;
  await ref.update({ data: { oxFeed: newOxFeed, lastDailyRationAt: now, lastActiveAt: now } });
  await db.collection("townJobLog").add({
    data: { openid: OPENID, type: "daily_checkin", expGained: 0, itemsGained: {}, createdAt: now },
  });

  const updated = { ...profile, oxFeed: newOxFeed, lastDailyRationAt: now };
  return { ok: true, profile: updated, gained: DAILY_RATION };
};
