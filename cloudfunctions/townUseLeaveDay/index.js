// Spends one banked 带薪年假 day (see townCheckin for how they're earned --
// 1 per 7 consecutive daily check-ins). Counts as today's check-in if the
// player hasn't already claimed it (keeps the streak alive, still grants
// the normal ration -- no lucky-tier roll though, a leave day is a
// guaranteed day off, not a gamble) and grants immunity from steal/skim for
// the rest of the local day.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DAILY_RATION = 15;
const CN_TZ_OFFSET_MS = 8 * 3_600_000;

function cnDateKey(ts) {
  return new Date(ts + CN_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function cnEndOfDay(now) {
  const d = new Date(now + CN_TZ_OFFSET_MS);
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime() - CN_TZ_OFFSET_MS;
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) return { ok: false, error: "not_unlocked" };

  const now = Date.now();
  if (profile.jailedUntil && profile.jailedUntil > now) return { ok: false, error: "jailed" };
  if ((profile.leaveDaysAvailable || 0) <= 0) return { ok: false, error: "no_leave_days" };

  const todayKey = cnDateKey(now);
  const data = {
    leaveDaysAvailable: (profile.leaveDaysAvailable || 0) - 1,
    leaveActiveUntil: cnEndOfDay(now),
    lastActiveAt: now,
  };

  const alreadyCheckedInToday = profile.lastDailyRationAt && cnDateKey(profile.lastDailyRationAt) === todayKey;
  if (!alreadyCheckedInToday) {
    const yesterdayKey = cnDateKey(now - 24 * 3_600_000);
    const streak = profile.lastCheckinDateKey === yesterdayKey ? (profile.checkinStreakCount || 0) + 1 : 1;
    data.oxFeed = (profile.oxFeed || 0) + DAILY_RATION;
    data.lastDailyRationAt = now;
    data.checkinStreakCount = streak;
    data.lastCheckinDateKey = todayKey;
  }

  await ref.update({ data });
  await db.collection("townJobLog").add({
    data: { openid: OPENID, type: "leave_day", expGained: 0, itemsGained: {}, createdAt: now },
  });

  return { ok: true, profile: { ...profile, ...data } };
};
