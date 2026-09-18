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
  { key: "milkTeaShop", name: "奶茶店学徒", durationMs: 1 * 3_600_000, unlockLevel: 0 },
  { key: "convenienceStore", name: "便利店收银", durationMs: 1.5 * 3_600_000, unlockLevel: 0 },
  { key: "barista", name: "咖啡师", durationMs: 2 * 3_600_000, unlockLevel: 1 },
  { key: "rider", name: "外卖骑手", durationMs: 0.5 * 3_600_000, unlockLevel: 1 },
  { key: "callCenter", name: "客服接线员", durationMs: 4 * 3_600_000, unlockLevel: 2 },
  { key: "driver", name: "网约车代驾", durationMs: 3 * 3_600_000, unlockLevel: 3 },
  { key: "farmer", name: "菜地打工", durationMs: 3 * 3_600_000, unlockLevel: 4 },
  { key: "bbqStall", name: "深夜烧烤摊", durationMs: 2 * 3_600_000, unlockLevel: 5, nightOnly: true },
  { key: "liveStream", name: "直播带货", durationMs: 2 * 3_600_000, unlockLevel: 6 },
  { key: "tutor", name: "家教老师", durationMs: 3 * 3_600_000, unlockLevel: 7 },
  { key: "boardroom", name: "董事会摸鱼", durationMs: 4 * 3_600_000, unlockLevel: 8 },
];

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
  if (!target || !target.unlocked) return { ok: false, error: "target_not_found" };
  if ((self.titleIndex || 0) <= (target.titleIndex || 0)) return { ok: false, error: "not_higher_rank" };

  const now = Date.now();
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
