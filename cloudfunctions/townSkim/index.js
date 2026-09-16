// "画大饼/摊派" -- only available when the actor's town title outranks the
// target's. A gentler, more frequent skim than townSteal (see
// MOYU_TOWN_SPEC.md 8.3). Also inventory-only, never touches real progress.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SKIM_COOLDOWN_MS = 6 * 3_600_000;
const SKIM_RATE = 0.1;

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

  const targetInventory = target.inventory || {};
  const skimmableItems = Object.entries(targetInventory).filter(([, qty]) => qty > 0);
  if (skimmableItems.length === 0) return { ok: false, error: "nothing_to_skim" };

  const [item, available] = skimmableItems[Math.floor(Math.random() * skimmableItems.length)];
  const amount = Math.max(1, Math.min(available, Math.round(available * SKIM_RATE)));
  const expGained = amount * 2;

  const newTargetInventory = { ...targetInventory, [item]: available - amount };
  const selfInventory = { ...(self.inventory || {}) };
  selfInventory[item] = (selfInventory[item] || 0) + amount;
  const companionExp = (self.companionExp || 0) + expGained;

  await Promise.all([
    targetRef.update({ data: { inventory: newTargetInventory } }),
    selfRef.update({ data: { inventory: selfInventory, companionExp, lastActiveAt: now } }),
    db.collection("townJobLog").add({
      data: { openid: OPENID, targetOpenid, type: "skim", expGained, itemsGained: { [item]: amount }, createdAt: now },
    }),
  ]);

  return { ok: true, profile: { ...self, inventory: selfInventory, companionExp }, item, amount };
};
