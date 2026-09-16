// Steals a random town-specialty item from another unlocked player. Never
// touches oxFeed, companionExp, or titleIndex -- only `inventory`, so a steal
// can never dent the victim's real progress (see MOYU_TOWN_SPEC.md 8.2).
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const STEAL_COOLDOWN_MS = 24 * 3_600_000;
const STEAL_MAX_PER_WINDOW = 3;
const STEAL_EXP_GAIN = 3;

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

  const now = Date.now();
  const recentSteals = await db
    .collection("townJobLog")
    .where({
      openid: OPENID,
      targetOpenid,
      type: "steal",
      createdAt: _.gte(now - STEAL_COOLDOWN_MS),
    })
    .count();
  if (recentSteals.total >= STEAL_MAX_PER_WINDOW) return { ok: false, error: "steal_cooldown" };

  const targetInventory = target.inventory || {};
  const stealableItems = Object.entries(targetInventory).filter(([, qty]) => qty > 0);
  if (stealableItems.length === 0) return { ok: false, error: "nothing_to_steal" };

  const [item, available] = stealableItems[Math.floor(Math.random() * stealableItems.length)];
  const amount = Math.min(available, 1 + Math.floor(Math.random() * 3));

  const newTargetInventory = { ...targetInventory, [item]: available - amount };
  const selfInventory = { ...(self.inventory || {}) };
  selfInventory[item] = (selfInventory[item] || 0) + amount;
  const companionExp = (self.companionExp || 0) + STEAL_EXP_GAIN;

  await Promise.all([
    targetRef.update({ data: { inventory: newTargetInventory } }),
    selfRef.update({ data: { inventory: selfInventory, companionExp, lastActiveAt: now } }),
    db.collection("townJobLog").add({
      data: { openid: OPENID, targetOpenid, type: "steal", expGained: STEAL_EXP_GAIN, itemsGained: { [item]: amount }, createdAt: now },
    }),
  ]);

  return { ok: true, profile: { ...self, inventory: selfInventory, companionExp }, item, amount };
};
