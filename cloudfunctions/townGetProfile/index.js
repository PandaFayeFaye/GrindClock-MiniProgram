// Reads (and lazily creates) the caller's townProfiles doc. Also handles the
// one-time unlock flow ({unlock: true}) from the home-page 10-tap gesture.
// See MOYU_TOWN_SPEC.md for the full design. All town cloud functions key
// townProfiles by _id = OPENID so "get or create" is a simple doc().get().
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// Mirrors src/lib/town.ts TOWN_JOBS -- only the fields settleAssignedJob
// needs. See townSkim's identical function for the full rationale: a
// forced shift (画饼摊派) pays out BOTH the worker and the boss, and resumes
// whatever self-started shift it interrupted, the moment it ends --
// regardless of whether the worker has opened the app since. This just
// runs that same check opportunistically whenever the worker opens their
// own town page.
const TOWN_JOBS = [
  { key: "milkTeaShop", item: "milkTea", itemAmount: 1, expGain: 5 },
  { key: "convenienceStore", item: "snackPack", itemAmount: 1, expGain: 5 },
  { key: "barista", item: "coffeeBean", itemAmount: 2, expGain: 8 },
  { key: "rider", item: "riderSubsidy", itemAmount: 1, expGain: 5 },
  { key: "callCenter", item: "phoneCard", itemAmount: 3, expGain: 12 },
  { key: "driver", item: "gasCard", itemAmount: 2, expGain: 10 },
  { key: "farmer", item: "veggie", itemAmount: 4, expGain: 12 },
  { key: "bbqStall", item: "bbqCoupon", itemAmount: 3, expGain: 15 },
  { key: "liveStream", item: "liveCommission", itemAmount: 1, expGain: 15, doubleChance: 0.1 },
  { key: "tutor", item: "tutorFee", itemAmount: 1, expGain: 18 },
  { key: "boardroom", item: "dividend", itemAmount: 1, expGain: 20 },
];

async function settleAssignedJob(workerOpenid, workerProfile, now) {
  const job = workerProfile && workerProfile.currentJob;
  if (!job || !job.assignedBy || job.settled || now < job.endsAt) return false;
  const jobDef = TOWN_JOBS.find((j) => j.key === job.jobKey);
  if (!jobDef) return false;

  let workerAmount = jobDef.itemAmount;
  if (jobDef.doubleChance && Math.random() < jobDef.doubleChance) workerAmount *= 2;
  const workerInventory = { ...(workerProfile.inventory || {}) };
  workerInventory[jobDef.item] = (workerInventory[jobDef.item] || 0) + workerAmount;
  const workerExp = (workerProfile.companionExp || 0) + jobDef.expGain;

  const pending = workerProfile.pendingResumeJob;
  const nextJob = pending
    ? { jobKey: pending.jobKey, startedAt: now, endsAt: now + pending.remainingMs }
    : null;

  await db.collection("townProfiles").doc(workerOpenid).update({
    data: {
      inventory: workerInventory,
      companionExp: workerExp,
      currentJob: _.set(nextJob),
      pendingResumeJob: _.set(null),
    },
  });
  await db.collection("townJobLog").add({
    data: {
      openid: workerOpenid,
      type: "job_complete",
      jobType: jobDef.key,
      expGained: jobDef.expGain,
      itemsGained: { [jobDef.item]: workerAmount },
      createdAt: now,
    },
  });

  let bossAmount = jobDef.itemAmount;
  if (jobDef.doubleChance && Math.random() < jobDef.doubleChance) bossAmount *= 2;
  const bossRef = db.collection("townProfiles").doc(job.assignedBy);
  const bossRes = await bossRef.get().catch(() => null);
  const boss = bossRes && bossRes.data;
  if (boss) {
    const bossInventory = { ...(boss.inventory || {}) };
    bossInventory[jobDef.item] = (bossInventory[jobDef.item] || 0) + bossAmount;
    const bossExpGain = Math.ceil(jobDef.expGain / 2);
    await bossRef.update({ data: { inventory: bossInventory, companionExp: (boss.companionExp || 0) + bossExpGain } });
    await db.collection("townJobLog").add({
      data: {
        openid: job.assignedBy,
        targetOpenid: workerOpenid,
        type: "skim_payout",
        jobType: jobDef.key,
        expGained: bossExpGain,
        itemsGained: { [jobDef.item]: bossAmount },
        createdAt: now,
      },
    });
  }
  return true;
}

function defaultProfile() {
  return {
    unlocked: false,
    unlockedAt: null,
    oxFeed: 0,
    lastDailyRationAt: null,
    lastFedAt: null,
    companionExp: 0,
    titleIndex: 0,
    currentJob: null,
    inventory: {},
    promotionSubmissions: {},
    decorations: [],
    lastActiveAt: Date.now(),
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);

  let profile;
  try {
    const res = await ref.get();
    profile = res.data;
  } catch (err) {
    profile = defaultProfile();
    await ref.set({ data: profile });
  }

  if (event && event.unlock && !profile.unlocked) {
    profile.unlocked = true;
    profile.unlockedAt = Date.now();
    await ref.update({ data: { unlocked: true, unlockedAt: profile.unlockedAt } });
  }

  // Self-heal profiles created before a field existed (e.g. `decorations`
  // added later) so older accounts don't crash client code that assumes it.
  if (!profile.decorations) {
    profile.decorations = [];
    await ref.update({ data: { decorations: [] } });
  }

  const now = Date.now();
  const settled = await settleAssignedJob(OPENID, profile, now).catch(() => false);
  if (settled) {
    const res = await ref.get().catch(() => null);
    if (res && res.data) profile = res.data;
  }
  await ref.update({ data: { lastActiveAt: now } });

  return { ok: true, profile };
};
