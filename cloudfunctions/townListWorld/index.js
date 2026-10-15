// Lists every unlocked player for the "世界" screen, ranked by 摸鱼资历 so
// the World doubles as a leaderboard -- the actual "compare yourself to
// friends" motivation hook, not just a directory to steal from. Small
// population for now (see MOYU_TOWN_SPEC.md 8.1) so this returns everyone
// in one page -- revisit with real pagination once the unlocked count
// gets large.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// Mirrors src/lib/town.ts TOWN_JOBS -- see townSkim's identical function
// for the full rationale. Settling here means just VIEWING the World
// screen pays out anyone's pending assigned-job/resume state, which in
// practice is the single most reliable trigger for "the boss doesn't have
// to wait for the worker to collect" -- the boss finding out at all
// usually means they opened World to check.
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

const TOWN_LEVEL_TITLES = [
  "实习生", "新人专员", "资深员工", "组长", "主管", "经理",
  "高级经理", "总监", "VP副总裁", "总经理", "CEO", "董事长",
];

const CN_TZ_OFFSET_MS = 8 * 3_600_000;
function cnDateKey(ts) {
  return new Date(ts + CN_TZ_OFFSET_MS).toISOString().slice(0, 10);
}
function checkedInToday(lastDailyRationAt) {
  if (!lastDailyRationAt) return false;
  return cnDateKey(lastDailyRationAt) === cnDateKey(Date.now());
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  const res = await db.collection("townProfiles").where({ unlocked: true }).limit(100).get();
  const profiles = res.data || [];

  const now = Date.now();
  await Promise.all(profiles.map((p) => settleAssignedJob(p._id, p, now).catch(() => {})));

  const openids = profiles.map((p) => p._id);
  let userInfoByOpenid = {};
  if (openids.length > 0) {
    const profileRes = await db.collection("userProfile").where({ _openid: _.in(openids) }).limit(100).get();
    userInfoByOpenid = (profileRes.data || []).reduce((acc, row) => {
      acc[row._openid] = { nickname: row.nickname, animal: row.animal, mbti: row.mbti };
      return acc;
    }, {});
  }

  // Rank everyone (including the caller) by companionExp first -- ties
  // broken by titleIndex, then by who's been active more recently.
  const ranked = profiles
    .slice()
    .sort((a, b) =>
      (b.companionExp || 0) - (a.companionExp || 0) ||
      (b.titleIndex || 0) - (a.titleIndex || 0) ||
      (b.lastActiveAt || 0) - (a.lastActiveAt || 0),
    )
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const mine = ranked.find((p) => p._id === OPENID);
  const myRank = mine ? mine.rank : null;

  const toEntry = (p) => ({
    openid: p._id,
    rank: p.rank,
    nickname: (userInfoByOpenid[p._id] && userInfoByOpenid[p._id].nickname) || "神秘打工人",
    animal: (userInfoByOpenid[p._id] && userInfoByOpenid[p._id].animal) || "cat",
    mbti: userInfoByOpenid[p._id] && userInfoByOpenid[p._id].mbti,
    companionTitle: TOWN_LEVEL_TITLES[p.titleIndex || 0],
    titleIndex: p.titleIndex || 0,
    companionExp: p.companionExp || 0,
    lastActiveAt: p.lastActiveAt || null,
    inventoryCount: Object.values(p.inventory || {}).reduce((s, n) => s + n, 0),
    decorations: p.decorations || [],
    checkedInToday: checkedInToday(p.lastDailyRationAt),
    isWorking: !!p.currentJob,
    workingJobKey: p.currentJob ? p.currentJob.jobKey : null,
  });

  const list = ranked.filter((p) => p._id !== OPENID).map(toEntry);
  const me = mine ? toEntry(mine) : null;

  return { ok: true, list, me, myRank, totalRanked: ranked.length };
};
