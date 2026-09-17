// Reads (and lazily creates) the caller's townProfiles doc. Also handles the
// one-time unlock flow ({unlock: true}) from the home-page 10-tap gesture.
// See MOYU_TOWN_SPEC.md for the full design. All town cloud functions key
// townProfiles by _id = OPENID so "get or create" is a simple doc().get().
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function defaultProfile() {
  return {
    unlocked: false,
    unlockedAt: null,
    oxFeed: 0,
    lastDailyRationAt: null,
    lastFedAt: null,
    companionExp: 0,
    titleIndex: 0,
    currentJob: null,
    inventory: {},
    promotionSubmissions: {},
    decorations: [],
    lastActiveAt: Date.now(),
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);

  let profile;
  try {
    const res = await ref.get();
    profile = res.data;
  } catch (err) {
    profile = defaultProfile();
    await ref.set({ data: profile });
  }

  if (event && event.unlock && !profile.unlocked) {
    profile.unlocked = true;
    profile.unlockedAt = Date.now();
    await ref.update({ data: { unlocked: true, unlockedAt: profile.unlockedAt } });
  }

  // Self-heal profiles created before a field existed (e.g. `decorations`
  // added later) so older accounts don't crash client code that assumes it.
  if (!profile.decorations) {
    profile.decorations = [];
    await ref.update({ data: { decorations: [] } });
  }

  await ref.update({ data: { lastActiveAt: Date.now() } });

  return { ok: true, profile };
};
