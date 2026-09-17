// "画大饼/摊派" -- only available when the actor's town title outranks the
// target's. A gentler, more frequent skim than townSteal (see
// MOYU_TOWN_SPEC.md 8.3). Also inventory-only, never touches real progress.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SKIM_COOLDOWN_MS = 6 * 3_600_000;
const SKIM_RATE = 0.1;

// See townSteal's copy of this for the full explanation -- same template,
// reused fields, best-effort and awaited before returning.
const SUBSCRIBE_TEMPLATE_ID = "eqyBvDNghz6B1MqTm1MluJ_ttKt9c811eQ3yZRIRGFw";

async function notifyVictim(targetOpenid, actorOpenid) {
  if (!SUBSCRIBE_TEMPLATE_ID) return;
  try {
    const [targetProfileRes, actorProfileRes] = await Promise.all([
      db.collection("userProfile").where({ _openid: targetOpenid }).limit(1).get(),
      db.collection("userProfile").where({ _openid: actorOpenid }).limit(1).get(),
    ]);
    const targetNickname = (targetProfileRes.data[0] && targetProfileRes.data[0].nickname) || "打工人";
    const actorNickname = (actorProfileRes.data[0] && actorProfileRes.data[0].nickname) || "神秘搭子";
    await cloud.openapi.subscribeMessage.send({
      touser: targetOpenid,
      templateId: SUBSCRIBE_TEMPLATE_ID,
      page: "pages/town-world/index",
      data: {
        thing1: { value: targetNickname.slice(0, 20) },
        thing2: { value: `被${actorNickname.slice(0, 6)}画饼摊派了`.slice(0, 20) },
        time3: { value: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") },
        thing4: { value: "快去世界里争口气" },
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

  await notifyVictim(targetOpenid, OPENID).catch(() => {});

  return { ok: true, profile: { ...self, inventory: selfInventory, companionExp }, item, amount };
};
