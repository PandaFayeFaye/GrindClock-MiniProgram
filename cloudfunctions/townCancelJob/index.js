// Recalls the companion from an in-progress shift early. The oxFeed "shift
// fee" already spent is NOT refunded (otherwise cancelling would make
// starting a job free too), and no item/exp is granted since the shift
// never finished -- this just clears currentJob so the player isn't stuck
// waiting out a shift they no longer want, like recalling a villager in
// FarmVille/开心农场.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) return { ok: false, error: "not_unlocked" };
  if (!profile.currentJob) return { ok: false, error: "not_working" };

  const now = Date.now();
  await ref.update({ data: { currentJob: _.set(null), lastActiveAt: now } });

  return { ok: true, profile: { ...profile, currentJob: null } };
};
