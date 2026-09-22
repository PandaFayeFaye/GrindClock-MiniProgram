// Arms today's 2h anti-theft trap, once per local day. See townSteal's own
// header comment for the full mechanic: any steal landing inside this
// window is intercepted there, never here -- this function only records
// when the window starts.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function isJailed(profile, now) {
  return !!profile.jailedUntil && profile.jailedUntil > now;
}

function isSameLocalDay(a, b) {
  const da = new Date(a);
  const db2 = new Date(b);
  return da.getFullYear() === db2.getFullYear() && da.getMonth() === db2.getMonth() && da.getDate() === db2.getDate();
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) return { ok: false, error: "not_unlocked" };

  const now = Date.now();
  if (isJailed(profile, now)) return { ok: false, error: "jailed" };
  if (profile.trapSetAt && isSameLocalDay(profile.trapSetAt, now)) return { ok: false, error: "trap_already_set" };

  await ref.update({ data: { trapSetAt: now, lastActiveAt: now } });

  return { ok: true, trapSetAt: now };
};
