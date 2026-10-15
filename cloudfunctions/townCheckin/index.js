// Daily free 牛马粮 ration -- available regardless of real punch-clock
// activity so the town stays playable on rest days (see MOYU_TOWN_SPEC.md
// section 4.1). One ration per China-local calendar day. Also tracks the
// consecutive-checkin streak (banks a 带薪年假 day every 7), and rolls a
// purely-upside "签到彩蛋" bonus -- see townUseLeaveDay for how a banked
// leave day gets spent.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const DAILY_RATION = 15;
const CN_TZ_OFFSET_MS = 8 * 3_600_000;
const LEAVE_DAY_STREAK_REQUIREMENT = 7;
const LEAVE_DAYS_MAX = 10;

function cnDateKey(ts) {
  return new Date(ts + CN_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

// Deliberately ALL upside -- no bad outcome tier. "none" is just "nothing
// extra this time", never a penalty.
function rollLuckyTier() {
  const r = Math.random();
  if (r < 0.01) return "dadaji";
  if (r < 0.05) return "daji";
  if (r < 0.20) return "ji";
  return "none";
}

const LUCKY_BONUS = {
  ji: { rationMultiplier: 1.5, expGain: 3 },
  daji: { rationMultiplier: 2, expGain: 8 },
  dadaji: { rationMultiplier: 3, expGain: 15 },
};

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) {
    return { ok: false, error: "not_unlocked" };
  }

  const now = Date.now();
  if (profile.jailedUntil && profile.jailedUntil > now) return { ok: false, error: "jailed" };
  if (profile.lastDailyRationAt && cnDateKey(profile.lastDailyRationAt) === cnDateKey(now)) {
    return { ok: false, error: "already_claimed_today" };
  }

  const todayKey = cnDateKey(now);
  const yesterdayKey = cnDateKey(now - 24 * 3_600_000);
  const streak = profile.lastCheckinDateKey === yesterdayKey ? (profile.checkinStreakCount || 0) + 1 : 1;

  let leaveDaysAvailable = profile.leaveDaysAvailable || 0;
  const leaveDayAwarded = streak % LEAVE_DAY_STREAK_REQUIREMENT === 0 && leaveDaysAvailable < LEAVE_DAYS_MAX;
  if (leaveDayAwarded) leaveDaysAvailable += 1;

  const luckyTier = rollLuckyTier();
  const bonus = LUCKY_BONUS[luckyTier];
  const gained = bonus ? Math.round(DAILY_RATION * bonus.rationMultiplier) : DAILY_RATION;
  const expGained = bonus ? bonus.expGain : 0;

  const newOxFeed = (profile.oxFeed || 0) + gained;
  const newExp = (profile.companionExp || 0) + expGained;
  await ref.update({
    data: {
      oxFeed: newOxFeed,
      companionExp: newExp,
      lastDailyRationAt: now,
      lastActiveAt: now,
      checkinStreakCount: streak,
      lastCheckinDateKey: todayKey,
      leaveDaysAvailable,
    },
  });
  await db.collection("townJobLog").add({
    data: { openid: OPENID, type: "daily_checkin", expGained, itemsGained: {}, createdAt: now, luckyTier },
  });

  const updated = { ...profile, oxFeed: newOxFeed, companionExp: newExp, lastDailyRationAt: now, checkinStreakCount: streak, lastCheckinDateKey: todayKey, leaveDaysAvailable };
  return { ok: true, profile: updated, gained, luckyTier, leaveDayAwarded };
};
