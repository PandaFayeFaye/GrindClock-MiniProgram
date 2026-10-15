// Spends one banked 带薪年假 day (see townCheckin for how they're earned --
// 1 per 7 consecutive daily check-ins). Counts as today's check-in if the
// player hasn't already claimed it (keeps the streak alive, still grants
// the normal ration -- no lucky-tier roll though, a leave day is a
// guaranteed day off, not a gamble), grants immunity from steal/skim for
// the rest of the local day, AND -- since it's PAID leave, not unpaid --
// pays out one job's worth of specialty + exp as if a shift had been
// worked, so the day off doesn't cost the player their usual income.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DAILY_RATION = 15;
const CN_TZ_OFFSET_MS = 8 * 3_600_000;

// Mirrors src/lib/town.ts TOWN_JOBS -- only the fields a paid-leave payout
// needs. nightOnly is deliberately ignored here: this is a stand-in salary,
// not an actual shift, so time-of-day shouldn't gate which job it's based on.
const TOWN_JOBS = [
  { key: "milkTeaShop", item: "milkTea", itemAmount: 1, expGain: 5, unlockLevel: 0 },
  { key: "convenienceStore", item: "snackPack", itemAmount: 1, expGain: 5, unlockLevel: 0 },
  { key: "barista", item: "coffeeBean", itemAmount: 2, expGain: 8, unlockLevel: 1 },
  { key: "rider", item: "riderSubsidy", itemAmount: 1, expGain: 5, unlockLevel: 1 },
  { key: "callCenter", item: "phoneCard", itemAmount: 3, expGain: 12, unlockLevel: 2 },
  { key: "driver", item: "gasCard", itemAmount: 2, expGain: 10, unlockLevel: 3 },
  { key: "farmer", item: "veggie", itemAmount: 4, expGain: 12, unlockLevel: 4 },
  { key: "productManager", item: "pmBonus", itemAmount: 2, expGain: 13, unlockLevel: 4 },
  { key: "hospital", item: "icuBonus", itemAmount: 2, expGain: 22, unlockLevel: 4 },
  { key: "bbqStall", item: "bbqCoupon", itemAmount: 3, expGain: 15, unlockLevel: 5 },
  { key: "designInstitute", item: "blueprintFee", itemAmount: 1, expGain: 25, unlockLevel: 5 },
  { key: "contentOps", item: "contentBonus", itemAmount: 2, expGain: 11, unlockLevel: 5 },
  { key: "liveStream", item: "liveCommission", itemAmount: 1, expGain: 15, unlockLevel: 6 },
  { key: "futuresInstitute", item: "futuresCommission", itemAmount: 2, expGain: 28, unlockLevel: 6 },
  { key: "tutor", item: "tutorFee", itemAmount: 1, expGain: 18, unlockLevel: 7 },
  { key: "boardroom", item: "dividend", itemAmount: 1, expGain: 20, unlockLevel: 8 },
];

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

  // Paid leave pays out one job's worth of specialty + exp, as if a shift
  // had been worked, picked randomly among whatever's unlocked at the
  // player's current title.
  const eligibleJobs = TOWN_JOBS.filter((j) => j.unlockLevel <= (profile.titleIndex || 0));
  const payoutJob = eligibleJobs.length > 0 ? eligibleJobs[Math.floor(Math.random() * eligibleJobs.length)] : null;
  if (payoutJob) {
    const inventory = { ...(profile.inventory || {}) };
    inventory[payoutJob.item] = (inventory[payoutJob.item] || 0) + payoutJob.itemAmount;
    data.inventory = inventory;
    data.companionExp = (profile.companionExp || 0) + payoutJob.expGain;
  }

  await ref.update({ data });
  await db.collection("townJobLog").add({
    data: {
      openid: OPENID,
      type: "leave_day",
      jobType: payoutJob ? payoutJob.key : undefined,
      expGained: payoutJob ? payoutJob.expGain : 0,
      itemsGained: payoutJob ? { [payoutJob.item]: payoutJob.itemAmount } : {},
      createdAt: now,
    },
  });

  return {
    ok: true,
    profile: { ...profile, ...data },
    itemGained: payoutJob ? payoutJob.item : null,
    amountGained: payoutJob ? payoutJob.itemAmount : 0,
    expGained: payoutJob ? payoutJob.expGain : 0,
  };
};
