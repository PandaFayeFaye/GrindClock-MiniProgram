// "画大饼/摊派" -- only available when the actor's town title outranks the
// target's. Forces the target's companion into a random unlocked shift
// (interrupting whatever it was doing, unpaid) instead of just lifting
// items -- "the boss makes you work, then takes a cut" is the whole joke.
// The actor's cut is paid out later, in townCollectJob, when the target
// actually collects that shift. Never touches oxFeed or promotion progress.
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

// Pays the boss their cut the moment a forced shift's time is up, whether or
// not the worker has collected it themselves yet (collection is a separate
// event now -- the worker still gets their own, independently-rolled
// reward whenever they actually collect, in townCollectJob). Called
// opportunistically wherever a worker's profile happens to be read, so it
// settles as soon as ANY of those paths runs next, instead of needing a
// cron job this backend doesn't have. Idempotent via `payoutSettled`.
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
  const target = targetRes && targetRes.data;
  if (!self || !self.unlocked) return { ok: false, error: "not_unlocked" };
  if (self.jailedUntil && self.jailedUntil > Date.now()) return { ok: false, error: "jailed" };
  if (!target || !target.unlocked) return { ok: false, error: "target_not_found" };
  if ((self.titleIndex || 0) <= (target.titleIndex || 0)) return { ok: false, error: "not_higher_rank" };

  const now = Date.now();

  // While someone else's assigned shift is still running, it can't be
  // hijacked by a second skim -- the first boss's claim on it is protected
  // until it actually finishes. Once it HAS finished (just sitting
  // uncollected), it's fair game again, but settle that boss's payout
  // first so discarding it doesn't cost them their cut.
  if (target.currentJob && target.currentJob.assignedBy && target.currentJob.assignedBy !== OPENID && now < target.currentJob.endsAt) {
    return { ok: false, error: "target_already_assigned" };
  }
  await settleAssignedPayout(targetOpenid, target, now).catch(() => {});

  const recentSkims = await db
    .collection("townJobLog")
    .where({ openid: OPENID, targetOpenid, type: "skim", createdAt: _.gte(now - SKIM_COOLDOWN_MS) })
    .count();
  if (recentSkims.total > 0) return { ok: false, error: "skim_cooldown" };

  const night = isNight(now);
  const eligibleJobs = TOWN_JOBS.filter((j) => j.unlockLevel <= (target.titleIndex || 0) && (!j.nightOnly || night));
  if (eligibleJobs.length === 0) return { ok: false, error: "no_job_available" };
  const job = eligibleJobs[Math.floor(Math.random() * eligibleJobs.length)];

  // currentJob may currently be `null` -- _.set() forces a full overwrite
  // instead of merging into null, same pattern as townSendToWork. Whatever
  // shift the target was already on is simply discarded, unpaid.
  const currentJob = { jobKey: job.key, startedAt: now, endsAt: now + job.durationMs, assignedBy: OPENID };
  await targetRef.update({ data: { currentJob: _.set(currentJob), lastActiveAt: now } });

  await db.collection("townJobLog").add({
    data: { openid: OPENID, targetOpenid, type: "skim", jobType: job.key, createdAt: now },
  });

  await notifyVictim(targetOpenid, OPENID, job.name).catch(() => {});

  return { ok: true, jobKey: job.key, jobName: job.name, endsAt: currentJob.endsAt };
};
