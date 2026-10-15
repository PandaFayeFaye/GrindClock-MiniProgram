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
const _ = db.command;

const CN_TZ_OFFSET_MS = 8 * 3_600_000;
function cnDateKey(ts) {
  return new Date(ts + CN_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

const VALID_JOB_KEYS = [
  "milkTeaShop", "barista", "callCenter", "convenienceStore", "rider", "boardroom",
  "driver", "farmer", "bbqStall", "liveStream", "tutor",
  "productManager", "contentOps", "hospital", "designInstitute", "futuresInstitute",
];

// "阳光普照" -- bombing a job takes it offline for EVERYONE that day, not
// just whoever the bomber was targeting, so everyone unlocked gets a flat
// oxFeed subsidy for the shift they can no longer start there. Uses an
// atomic _.inc instead of read-modify-write since this touches every
// profile at once (concurrent checkins/collects elsewhere would otherwise
// race with a plain read-then-write here).
const BOMB_SUBSIDY_OXFEED = 10;

async function paySubsidyToEveryone(jobKey, now) {
  const res = await db.collection("townProfiles").where({ unlocked: true }).limit(100).get();
  const profiles = res.data || [];
  await Promise.all(
    profiles.map((p) =>
      db
        .collection("townProfiles")
        .doc(p._id)
        .update({ data: { oxFeed: _.inc(BOMB_SUBSIDY_OXFEED) } })
        .catch(() => {}),
    ),
  );
  await db.collection("townJobLog").add({
    data: { type: "bomb_subsidy", jobType: jobKey, expGained: 0, itemsGained: {}, createdAt: now },
  });
}

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

  await paySubsidyToEveryone(jobKey, now).catch((err) => console.error("bomb subsidy failed", err));

  return { ok: true, bombedUntilDateKey: todayKey, subsidyAmount: BOMB_SUBSIDY_OXFEED };
};
