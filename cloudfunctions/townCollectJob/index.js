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
  { key: "productManager", expGain: 13, item: "pmBonus", itemAmount: 2 },
  { key: "contentOps", expGain: 11, item: "contentBonus", itemAmount: 2, doubleChance: 0.08 },
  { key: "hospital", expGain: 22, item: "icuBonus", itemAmount: 2 },
  { key: "designInstitute", expGain: 25, item: "blueprintFee", itemAmount: 1 },
  { key: "futuresInstitute", expGain: 28, item: "futuresCommission", itemAmount: 2, doubleChance: 0.1 },
];

// 闭店罢工弹 (see townUseBomb): a small independent chance per collected
// shift to earn one, regardless of which job it was.
const BOMB_DROP_CHANCE = 0.04;

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

  // If this was a forced shift (画饼摊派) that interrupted a self-started one,
  // pick that one back up for whatever time it had left instead of just
  // clearing to idle.
  const pending = profile.pendingResumeJob;
  const nextJob = pending ? { jobKey: pending.jobKey, startedAt: now, endsAt: now + pending.remainingMs } : null;

  const bombDropped = Math.random() < BOMB_DROP_CHANCE;
  const bombs = (profile.bombs || 0) + (bombDropped ? 1 : 0);

  await ref.update({
    data: { inventory, companionExp, bombs, currentJob: _.set(nextJob), pendingResumeJob: _.set(null), lastActiveAt: now },
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

  // Whoever forced this shift on the caller (townSkim's "画饼摊派") normally
  // already got paid automatically the moment it ended -- see
  // settleAssignedJob in townGetProfile/townListWorld/townSkim, which runs
  // opportunistically on any of those and doesn't wait for the worker to
  // collect. This is just a safety net for the rare case none of those ran
  // first: `settled` makes it a no-op if one of them already paid out, so
  // this can never double-pay the boss.
  const assignedBy = profile.currentJob.assignedBy;
  if (assignedBy && assignedBy !== OPENID && !profile.currentJob.settled) {
    const bossRef = db.collection("townProfiles").doc(assignedBy);
    const bossRes = await bossRef.get().catch(() => null);
    const boss = bossRes && bossRes.data;
    if (boss) {
      const bossInventory = { ...(boss.inventory || {}) };
      bossInventory[job.item] = (bossInventory[job.item] || 0) + amount;
      const bossExpGain = Math.ceil(job.expGain / 2);
      const bossExp = (boss.companionExp || 0) + bossExpGain;
      await bossRef.update({ data: { inventory: bossInventory, companionExp: bossExp } });
      await db.collection("townJobLog").add({
        data: {
          openid: assignedBy,
          targetOpenid: OPENID,
          type: "skim_payout",
          jobType: job.key,
          expGained: bossExpGain,
          itemsGained: { [job.item]: amount },
          createdAt: now,
        },
      });
    }
  }

  return {
    ok: true,
    profile: { ...profile, inventory, companionExp, bombs, currentJob: nextJob },
    itemGained: job.item,
    amountGained: amount,
    expGained: job.expGain,
    bombDropped,
  };
};
