// Settles a finished work shift: adds the item + exp, clears currentJob, logs
// the result. Must be called manually by the user (no auto-collect) so
// there's a reason to come back and check on the companion.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const TOWN_JOBS = [
  { key: "milkTeaShop", expGain: 5, item: "milkTea", itemAmount: 1 },
  { key: "convenienceStore", expGain: 5, item: "snackPack", itemAmount: 1 },
  { key: "barista", expGain: 8, item: "coffeeBean", itemAmount: 2 },
  { key: "rider", expGain: 5, item: "riderSubsidy", itemAmount: 1 },
  { key: "callCenter", expGain: 12, item: "phoneCard", itemAmount: 3 },
  { key: "driver", expGain: 10, item: "gasCard", itemAmount: 2 },
  { key: "farmer", expGain: 12, item: "veggie", itemAmount: 4 },
  { key: "bbqStall", expGain: 15, item: "bbqCoupon", itemAmount: 3 },
  { key: "liveStream", expGain: 15, item: "liveCommission", itemAmount: 1, doubleChance: 0.1 },
  { key: "tutor", expGain: 18, item: "tutorFee", itemAmount: 1 },
  { key: "boardroom", expGain: 20, item: "dividend", itemAmount: 1 },
];

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) return { ok: false, error: "not_unlocked" };
  if (!profile.currentJob) return { ok: false, error: "not_working" };

  const now = Date.now();
  if (now < profile.currentJob.endsAt) return { ok: false, error: "not_finished" };

  const job = TOWN_JOBS.find((j) => j.key === profile.currentJob.jobKey);
  if (!job) return { ok: false, error: "unknown_job" };

  let amount = job.itemAmount;
  if (job.doubleChance && Math.random() < job.doubleChance) amount *= 2;

  const inventory = { ...(profile.inventory || {}) };
  inventory[job.item] = (inventory[job.item] || 0) + amount;
  const companionExp = (profile.companionExp || 0) + job.expGain;

  await ref.update({
    data: { inventory, companionExp, currentJob: _.set(null), lastActiveAt: now },
  });
  await db.collection("townJobLog").add({
    data: {
      openid: OPENID,
      type: "job_complete",
      jobType: job.key,
      expGained: job.expGain,
      itemsGained: { [job.item]: amount },
      createdAt: now,
    },
  });

  return {
    ok: true,
    profile: { ...profile, inventory, companionExp, currentJob: null },
    itemGained: job.item,
    amountGained: amount,
    expGained: job.expGain,
  };
};
