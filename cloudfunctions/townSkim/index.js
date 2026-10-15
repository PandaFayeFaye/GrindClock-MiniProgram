// "画大饼/摊派" -- only available when the actor's town title outranks the
// target's. Forces the target's companion into a random unlocked shift
// (interrupting whatever it was doing) instead of just lifting items --
// "the boss makes you work, then takes a cut" is the whole joke. If the
// target was already working their OWN (non-assigned) shift, its remaining
// time is saved (pendingResumeJob) and picked back up automatically once
// the forced shift ends -- the interruption costs them time, not progress.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SKIM_COOLDOWN_MS = 6 * 3_600_000;

// Mirrors src/lib/town.ts TOWN_JOBS -- only the fields this function needs.
const TOWN_JOBS = [
  { key: "milkTeaShop", name: "奶茶店学徒", durationMs: 1 * 3_600_000, unlockLevel: 0, item: "milkTea", itemAmount: 1, expGain: 5 },
  { key: "convenienceStore", name: "便利店收银", durationMs: 1.5 * 3_600_000, unlockLevel: 0, item: "snackPack", itemAmount: 1, expGain: 5 },
  { key: "barista", name: "咖啡师", durationMs: 2 * 3_600_000, unlockLevel: 1, item: "coffeeBean", itemAmount: 2, expGain: 8 },
  { key: "rider", name: "外卖骑手", durationMs: 0.5 * 3_600_000, unlockLevel: 1, item: "riderSubsidy", itemAmount: 1, expGain: 5 },
  { key: "callCenter", name: "客服接线员", durationMs: 4 * 3_600_000, unlockLevel: 2, item: "phoneCard", itemAmount: 3, expGain: 12 },
  { key: "driver", name: "网约车代驾", durationMs: 3 * 3_600_000, unlockLevel: 3, item: "gasCard", itemAmount: 2, expGain: 10 },
  { key: "farmer", name: "菜地打工", durationMs: 3 * 3_600_000, unlockLevel: 4, item: "veggie", itemAmount: 4, expGain: 12 },
  { key: "bbqStall", name: "深夜烧烤摊", durationMs: 2 * 3_600_000, unlockLevel: 5, nightOnly: true, item: "bbqCoupon", itemAmount: 3, expGain: 15 },
  { key: "liveStream", name: "直播带货", durationMs: 2 * 3_600_000, unlockLevel: 6, item: "liveCommission", itemAmount: 1, expGain: 15, doubleChance: 0.1 },
  { key: "tutor", name: "家教老师", durationMs: 3 * 3_600_000, unlockLevel: 7, item: "tutorFee", itemAmount: 1, expGain: 18 },
  { key: "boardroom", name: "董事会摸鱼", durationMs: 4 * 3_600_000, unlockLevel: 8, item: "dividend", itemAmount: 1, expGain: 20 },
];

// Settles a FORCED (assignedBy-set) shift the moment its time is up --
// grants the worker their own reward AND the boss's cut in the same step,
// then either clears currentJob or, if a self-started shift was interrupted
// to make room for this one, resumes it for whatever time it had left.
// This is the one case in the whole town where a shift resolves without
// the player manually collecting it -- the player never chose to do this
// shift, so there's no "come back and check on it" reason to withhold it
// the way a voluntary shift still does (see townCollectJob).
//
// Called opportunistically wherever a worker's profile happens to be read
// (townGetProfile, townListWorld, here) since this backend has no cron.
// Idempotent via `settled`.
async function settleAssignedJob(workerOpenid, workerProfile, now) {
  const job = workerProfile && workerProfile.currentJob;
  if (!job || !job.assignedBy || job.settled || now < job.endsAt) return;
  const jobDef = TOWN_JOBS.find((j) => j.key === job.jobKey);
  if (!jobDef) return;

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
}

function isNight(now) {
  const h = new Date(now + 8 * 3_600_000).getUTCHours();
  return h >= 22 || h < 6;
}

// "名片被访通知" template (公共模板库 #801, 场景说明: "偷菜和摊派") -- see
// townSteal's copy for the field layout. Same template, best-effort and
// awaited before returning.
const SUBSCRIBE_TEMPLATE_ID = "2pMbXON4D1mJGcWnyEAnIZEkvCKufeXsfruclncjtdU";

async function notifyVictim(targetOpenid, actorOpenid, jobName) {
  if (!SUBSCRIBE_TEMPLATE_ID) return;
  try {
    const actorProfileRes = await db.collection("userProfile").where({ _openid: actorOpenid }).limit(1).get();
    const actorNickname = (actorProfileRes.data[0] && actorProfileRes.data[0].nickname) || "神秘搭子";
    await cloud.openapi.subscribeMessage.send({
      touser: targetOpenid,
      templateId: SUBSCRIBE_TEMPLATE_ID,
      page: "pages/town-world/index",
      data: {
        name1: { value: actorNickname.slice(0, 10) },
        date2: { value: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10) },
        thing3: { value: `被${actorNickname.slice(0, 6)}画饼派去打工了`.slice(0, 20) },
        thing4: { value: `${jobName}正等着你收工`.slice(0, 20) },
      },
    });
  } catch (err) {
    console.error("subscribeMessage.send (skim) failed", err);
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const targetOpenid = event && event.targetOpenid;
  if (!targetOpenid || targetOpenid === OPENID) return { ok: false, error: "invalid_target" };

  const selfRef = db.collection("townProfiles").doc(OPENID);
  const targetRef = db.collection("townProfiles").doc(targetOpenid);
  const [selfRes, targetRes] = await Promise.all([selfRef.get().catch(() => null), targetRef.get().catch(() => null)]);
  const self = selfRes && selfRes.data;
  let target = targetRes && targetRes.data;
  if (!self || !self.unlocked) return { ok: false, error: "not_unlocked" };
  if (self.jailedUntil && self.jailedUntil > Date.now()) return { ok: false, error: "jailed" };
  if (!target || !target.unlocked) return { ok: false, error: "target_not_found" };
  if ((self.titleIndex || 0) <= (target.titleIndex || 0)) return { ok: false, error: "not_higher_rank" };

  const now = Date.now();

  // While someone else's assigned shift is still running, it can't be
  // hijacked by a second skim -- the first boss's claim on it is protected
  // until it actually finishes. Once it HAS finished (just sitting
  // unsettled), it's fair game again, but settle it first so discarding it
  // doesn't cost the worker or that boss their cut.
  if (target.currentJob && target.currentJob.assignedBy && target.currentJob.assignedBy !== OPENID && now < target.currentJob.endsAt) {
    return { ok: false, error: "target_already_assigned" };
  }
  await settleAssignedJob(targetOpenid, target, now).catch(() => {});
  if (target.currentJob && target.currentJob.assignedBy && now >= target.currentJob.endsAt) {
    // Re-read: settleAssignedJob may have just replaced currentJob with a
    // resumed self-job (or cleared it), and that's what the interruption
    // check right below needs to see, not the stale pre-settlement value.
    const refreshed = await targetRef.get().catch(() => null);
    target = (refreshed && refreshed.data) || target;
  }

  const recentSkims = await db
    .collection("townJobLog")
    .where({ openid: OPENID, targetOpenid, type: "skim", createdAt: _.gte(now - SKIM_COOLDOWN_MS) })
    .count();
  if (recentSkims.total > 0) return { ok: false, error: "skim_cooldown" };

  const night = isNight(now);
  const eligibleJobs = TOWN_JOBS.filter((j) => j.unlockLevel <= (target.titleIndex || 0) && (!j.nightOnly || night));
  if (eligibleJobs.length === 0) return { ok: false, error: "no_job_available" };
  const job = eligibleJobs[Math.floor(Math.random() * eligibleJobs.length)];

  // If the target is mid-way through their OWN (non-assigned) shift, save
  // how much of it is left so it can resume automatically once this forced
  // one ends -- the interruption costs them time, not their progress on it.
  const updateData = { currentJob: _.set({ jobKey: job.key, startedAt: now, endsAt: now + job.durationMs, assignedBy: OPENID }), lastActiveAt: now };
  if (target.currentJob && !target.currentJob.assignedBy && now < target.currentJob.endsAt) {
    updateData.pendingResumeJob = _.set({ jobKey: target.currentJob.jobKey, remainingMs: target.currentJob.endsAt - now });
  }
  await targetRef.update({ data: updateData });

  await db.collection("townJobLog").add({
    data: { openid: OPENID, targetOpenid, type: "skim", jobType: job.key, createdAt: now },
  });

  await notifyVictim(targetOpenid, OPENID, job.name).catch(() => {});

  return { ok: true, jobKey: job.key, jobName: job.name, endsAt: now + job.durationMs };
};
