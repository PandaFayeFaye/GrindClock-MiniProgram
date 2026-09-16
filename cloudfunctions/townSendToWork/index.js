// Starts a virtual work shift for the companion. Mirrors TOWN_JOBS /
// TOWN_LEVELS in src/lib/town.ts exactly -- keep both in sync if the numbers
// change (see MOYU_TOWN_SPEC.md section 5.2).
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TOWN_JOBS = [
  { key: "milkTeaShop", feedCost: 5, durationMs: 1 * 3_600_000, unlockLevel: 0 },
  { key: "convenienceStore", feedCost: 5, durationMs: 1.5 * 3_600_000, unlockLevel: 0 },
  { key: "barista", feedCost: 8, durationMs: 2 * 3_600_000, unlockLevel: 1 },
  { key: "rider", feedCost: 8, durationMs: 0.5 * 3_600_000, unlockLevel: 1 },
  { key: "callCenter", feedCost: 10, durationMs: 4 * 3_600_000, unlockLevel: 2 },
  { key: "driver", feedCost: 10, durationMs: 3 * 3_600_000, unlockLevel: 3 },
  { key: "farmer", feedCost: 12, durationMs: 3 * 3_600_000, unlockLevel: 4 },
  { key: "bbqStall", feedCost: 12, durationMs: 2 * 3_600_000, unlockLevel: 5, nightOnly: true },
  { key: "liveStream", feedCost: 15, durationMs: 2 * 3_600_000, unlockLevel: 6 },
  { key: "tutor", feedCost: 15, durationMs: 3 * 3_600_000, unlockLevel: 7 },
  { key: "boardroom", feedCost: 20, durationMs: 4 * 3_600_000, unlockLevel: 8 },
];

function isNight(now) {
  const h = new Date(now + 8 * 3_600_000).getUTCHours();
  return h >= 22 || h < 6;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const job = TOWN_JOBS.find((j) => j.key === (event && event.jobKey));
  if (!job) return { ok: false, error: "unknown_job" };

  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) return { ok: false, error: "not_unlocked" };
  if (profile.currentJob) return { ok: false, error: "already_working" };
  if ((profile.titleIndex || 0) < job.unlockLevel) return { ok: false, error: "level_too_low" };
  if ((profile.oxFeed || 0) < job.feedCost) return { ok: false, error: "insufficient_oxfeed" };

  const now = Date.now();
  if (job.nightOnly && !isNight(now)) return { ok: false, error: "night_only" };

  const currentJob = { jobKey: job.key, startedAt: now, endsAt: now + job.durationMs };
  const newOxFeed = profile.oxFeed - job.feedCost;
  await ref.update({ data: { oxFeed: newOxFeed, currentJob, lastActiveAt: now } });

  return { ok: true, profile: { ...profile, oxFeed: newOxFeed, currentJob } };
};
