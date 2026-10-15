// Spends one 闭店罢工弹 ("workplace bomb", a small-chance drop from
// collecting any job -- see townCollectJob) on a specific job building.
// Takes it offline for EVERY player for the rest of the local day --
// townSendToWork and townSkim both refuse to start that job there while
// it's bombed. Anyone already mid-shift at that building when it's bombed
// keeps working normally and still gets paid in full when it ends; this
// only blocks NEW shifts from starting, it never touches an in-progress one.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const CN_TZ_OFFSET_MS = 8 * 3_600_000;
function cnDateKey(ts) {
  return new Date(ts + CN_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

const VALID_JOB_KEYS = [
  "milkTeaShop", "barista", "callCenter", "convenienceStore", "rider", "boardroom",
  "driver", "farmer", "bbqStall", "liveStream", "tutor",
  "productManager", "contentOps", "hospital", "designInstitute", "futuresInstitute",
];

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const jobKey = event && event.jobKey;
  if (!jobKey || !VALID_JOB_KEYS.includes(jobKey)) return { ok: false, error: "unknown_job" };

  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) return { ok: false, error: "not_unlocked" };

  const now = Date.now();
  if (profile.jailedUntil && profile.jailedUntil > now) return { ok: false, error: "jailed" };
  if ((profile.bombs || 0) <= 0) return { ok: false, error: "no_bombs" };

  const stateRef = db.collection("townWorldState").doc("bombedJobs");
  const stateRes = await stateRef.get().catch(() => null);
  const bombed = (stateRes && stateRes.data && stateRes.data.bombed) || {};
  const todayKey = cnDateKey(now);
  bombed[jobKey] = todayKey;
  await stateRef.set({ data: { bombed } });

  await ref.update({ data: { bombs: profile.bombs - 1, lastActiveAt: now } });
  await db.collection("townJobLog").add({
    data: { openid: OPENID, type: "bomb_used", jobType: jobKey, createdAt: now },
  });

  return { ok: true, bombedUntilDateKey: todayKey };
};
