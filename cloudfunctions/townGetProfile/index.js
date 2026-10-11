// Reads (and lazily creates) the caller's townProfiles doc. Also handles the
// one-time unlock flow ({unlock: true}) from the home-page 10-tap gesture.
// See MOYU_TOWN_SPEC.md for the full design. All town cloud functions key
// townProfiles by _id = OPENID so "get or create" is a simple doc().get().
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// Mirrors src/lib/town.ts TOWN_JOBS -- only the fields settleAssignedPayout
// needs. See townSkim's identical function for the full rationale: the
// boss who assigned a shift (画饼摊派) gets paid the moment it ends,
// regardless of whether the worker has collected their own reward yet --
// this just runs that same check opportunistically whenever the worker
// opens their own town page.
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

async function settleAssignedPayout(workerOpenid, workerProfile, now) {
  const job = workerProfile && workerProfile.currentJob;
  if (!job || !job.assignedBy || job.payoutSettled || now < job.endsAt) return;
  const jobDef = TOWN_JOBS.find((j) => j.key === job.jobKey);
  if (!jobDef) return;

  let amount = jobDef.itemAmount;
  if (jobDef.doubleChance && Math.random() < jobDef.doubleChance) amount *= 2;
  const bossRef = db.collection("townProfiles").doc(job.assignedBy);
  const bossRes = await bossRef.get().catch(() => null);
  const boss = bossRes && bossRes.data;
  if (boss) {
    const bossInventory = { ...(boss.inventory || {}) };
    bossInventory[jobDef.item] = (bossInventory[jobDef.item] || 0) + amount;
    const bossExpGain = Math.ceil(jobDef.expGain / 2);
    await bossRef.update({ data: { inventory: bossInventory, companionExp: (boss.companionExp || 0) + bossExpGain } });
    await db.collection("townJobLog").add({
      data: {
        openid: job.assignedBy,
        targetOpenid: workerOpenid,
        type: "skim_payout",
        jobType: jobDef.key,
        expGained: bossExpGain,
        itemsGained: { [jobDef.item]: amount },
        createdAt: now,
      },
    });
  }
  await db.collection("townProfiles").doc(workerOpenid).update({ data: { currentJob: { ...job, payoutSettled: true } } });
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
  await settleAssignedPayout(OPENID, profile, now).catch(() => {});
  await ref.update({ data: { lastActiveAt: now } });

  return { ok: true, profile };
};
