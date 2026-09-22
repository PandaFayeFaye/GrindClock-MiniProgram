// Spends one of today's police badges to catch a specific thief who stole
// from the caller within the last STEAL_CATCH_WINDOW_MS (see townSteal's
// header comment for how badges/recentThefts are earned and logged). The
// caught thief gives back double what they took, capped at whatever they
// still actually have -- they may have already spent or traded it away.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const STEAL_CATCH_WINDOW_MS = 5 * 60_000;

function todayBadgeCount(profile, now) {
  if (!profile.policeBadgesResetAt) return 0;
  const a = new Date(profile.policeBadgesResetAt);
  const b = new Date(now);
  const sameDay = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  return sameDay ? profile.policeBadges || 0 : 0;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const thiefOpenid = event && event.thiefOpenid;
  if (!thiefOpenid) return { ok: false, error: "invalid_target" };

  const selfRef = db.collection("townProfiles").doc(OPENID);
  const thiefRef = db.collection("townProfiles").doc(thiefOpenid);
  const [selfRes, thiefRes] = await Promise.all([selfRef.get().catch(() => null), thiefRef.get().catch(() => null)]);
  const self = selfRes && selfRes.data;
  const thief = thiefRes && thiefRes.data;
  if (!self || !self.unlocked) return { ok: false, error: "not_unlocked" };
  if (!thief) return { ok: false, error: "target_not_found" };

  const now = Date.now();
  if (todayBadgeCount(self, now) <= 0) return { ok: false, error: "no_badges" };

  const recent = self.recentThefts || [];
  const theft = recent.find((t) => t.thiefOpenid === thiefOpenid && now - t.stolenAt <= STEAL_CATCH_WINDOW_MS);
  if (!theft) return { ok: false, error: "no_recent_theft" };

  const wantBack = theft.amount * 2;
  const thiefHas = (thief.inventory && thief.inventory[theft.item]) || 0;
  const giveBack = Math.min(wantBack, thiefHas);

  const thiefInventory = { ...(thief.inventory || {}) };
  thiefInventory[theft.item] = thiefHas - giveBack;
  const selfInventory = { ...(self.inventory || {}) };
  selfInventory[theft.item] = (selfInventory[theft.item] || 0) + giveBack;

  await Promise.all([
    thiefRef.update({ data: { inventory: thiefInventory } }),
    selfRef.update({
      data: {
        inventory: selfInventory,
        policeBadges: todayBadgeCount(self, now) - 1,
        policeBadgesResetAt: now,
        recentThefts: recent.filter((t) => t !== theft),
      },
    }),
    db.collection("townJobLog").add({
      data: { openid: OPENID, targetOpenid: thiefOpenid, type: "catch_thief", itemsGained: { [theft.item]: giveBack }, createdAt: now },
    }),
  ]);

  return { ok: true, item: theft.item, amount: giveBack };
};
