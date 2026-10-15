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
// Paid leave pays out as if an 8-hour shift had been worked, regardless of
// how long the picked job's actual shift runs -- see the per-hour scaling
// below.
const LEAVE_PAYOUT_HOURS = 8;

// Mirrors src/lib/town.ts TOWN_JOBS -- only the fields a paid-leave payout
// needs (durationMs so the payout can be scaled to a per-hour rate).
// nightOnly is deliberately ignored here: this is a stand-in salary, not an
// actual shift, so time-of-day shouldn't gate which job it's based on.
const TOWN_JOBS = [
  { key: "milkTeaShop", item: "milkTea", itemAmount: 1, expGain: 5, unlockLevel: 0, durationMs: 1 * 3_600_000 },
  { key: "convenienceStore", item: "snackPack", itemAmount: 1, expGain: 5, unlockLevel: 0, durationMs: 1.5 * 3_600_000 },
  { key: "barista", item: "coffeeBean", itemAmount: 2, expGain: 8, unlockLevel: 1, durationMs: 2 * 3_600_000 },
  { key: "rider", item: "riderSubsidy", itemAmount: 1, expGain: 5, unlockLevel: 1, durationMs: 0.5 * 3_600_000 },
  { key: "callCenter", item: "phoneCard", itemAmount: 3, expGain: 12, unlockLevel: 2, durationMs: 4 * 3_600_000 },
  { key: "driver", item: "gasCard", itemAmount: 2, expGain: 10, unlockLevel: 3, durationMs: 3 * 3_600_000 },
  { key: "farmer", item: "veggie", itemAmount: 4, expGain: 12, unlockLevel: 4, durationMs: 3 * 3_600_000 },
  { key: "productManager", item: "pmBonus", itemAmount: 2, expGain: 13, unlockLevel: 4, durationMs: 3 * 3_600_000 },
  { key: "hospital", item: "icuBonus", itemAmount: 2, expGain: 22, unlockLevel: 4, durationMs: 5 * 3_600_000 },
  { key: "bbqStall", item: "bbqCoupon", itemAmount: 3, expGain: 15, unlockLevel: 5, durationMs: 2 * 3_600_000 },
  { key: "designInstitute", item: "blueprintFee", itemAmount: 1, expGain: 25, unlockLevel: 5, durationMs: 6 * 3_600_000 },
  { key: "contentOps", item: "contentBonus", itemAmount: 2, expGain: 11, unlockLevel: 5, durationMs: 2.5 * 3_600_000 },
  { key: "liveStream", item: "liveCommission", itemAmount: 1, expGain: 15, unlockLevel: 6, durationMs: 2 * 3_600_000 },
  { key: "futuresInstitute", item: "futuresCommission", itemAmount: 2, expGain: 28, unlockLevel: 6, durationMs: 3 * 3_600_000 },
  { key: "tutor", item: "tutorFee", itemAmount: 1, expGain: 18, unlockLevel: 7, durationMs: 3 * 3_600_000 },
  { key: "boardroom", item: "dividend", itemAmount: 1, expGain: 20, unlockLevel: 8, durationMs: 4 * 3_600_000 },
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

  // Paid leave pays out as if an LEAVE_PAYOUT_HOURS shift had been worked,
  // picked randomly among whatever job's unlocked at the player's current
  // title, then scaled by that job's own per-hour rate -- a short shift
  // (e.g. rider's 0.5h) and a long one (e.g. designInstitute's 6h) should
  // both come out to roughly the same day's pay, not the same raw per-shift
  // amount regardless of how long the shift actually runs.
  const eligibleJobs = TOWN_JOBS.filter((j) => j.unlockLevel <= (profile.titleIndex || 0));
  const payoutJob = eligibleJobs.length > 0 ? eligibleJobs[Math.floor(Math.random() * eligibleJobs.length)] : null;
  let amountGained = 0;
  let expGained = 0;
  if (payoutJob) {
    const jobHours = payoutJob.durationMs / 3_600_000;
    const scale = LEAVE_PAYOUT_HOURS / jobHours;
    amountGained = Math.max(1, Math.round(payoutJob.itemAmount * scale));
    expGained = Math.max(1, Math.round(payoutJob.expGain * scale));

    const inventory = { ...(profile.inventory || {}) };
    inventory[payoutJob.item] = (inventory[payoutJob.item] || 0) + amountGained;
    data.inventory = inventory;
    data.companionExp = (profile.companionExp || 0) + expGained;
  }

  await ref.update({ data });
  await db.collection("townJobLog").add({
    data: {
      openid: OPENID,
      type: "leave_day",
      jobType: payoutJob ? payoutJob.key : undefined,
      expGained,
      itemsGained: payoutJob ? { [payoutJob.item]: amountGained } : {},
      createdAt: now,
    },
  });

  return {
    ok: true,
    profile: { ...profile, ...data },
    itemGained: payoutJob ? payoutJob.item : null,
    amountGained,
    expGained,
  };
};
