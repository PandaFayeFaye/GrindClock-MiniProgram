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

// Reuses the same "打卡超时通知" template as townCriticize (see that
// function for the field layout and setup notes) -- the outer notification
// card will still read "打卡超时通知" since a template's title isn't
// per-send editable, but the four content lines are, which is what
// actually carries "you got robbed, go get it back" to the victim.
const SUBSCRIBE_TEMPLATE_ID = "eqyBvDNghz6B1MqTm1MluJ_ttKt9c811eQ3yZRIRGFw";

async function notifyVictim(db, targetOpenid, thiefOpenid, item) {
  if (!SUBSCRIBE_TEMPLATE_ID) return;
  try {
    const [targetProfileRes, thiefProfileRes] = await Promise.all([
      db.collection("userProfile").where({ _openid: targetOpenid }).limit(1).get(),
      db.collection("userProfile").where({ _openid: thiefOpenid }).limit(1).get(),
    ]);
    const targetNickname = (targetProfileRes.data[0] && targetProfileRes.data[0].nickname) || "打工人";
    const thiefNickname = (thiefProfileRes.data[0] && thiefProfileRes.data[0].nickname) || "神秘搭子";
    await cloud.openapi.subscribeMessage.send({
      touser: targetOpenid,
      templateId: SUBSCRIBE_TEMPLATE_ID,
      page: "pages/town-world/index",
      data: {
        thing1: { value: targetNickname.slice(0, 20) },
        thing2: { value: `被${thiefNickname.slice(0, 6)}偷家啦`.slice(0, 20) },
        time3: { value: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") },
        thing4: { value: "快去世界里偷回来" },
      },
    });
  } catch (err) {
    console.error("subscribeMessage.send (steal) failed", err);
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

  // Best-effort and awaited (not fire-and-forget) -- a cloud function's
  // execution environment can be torn down the instant exports.main
  // resolves, which would silently kill an un-awaited async call before its
  // network request ever completes. The .catch keeps a push failure from
  // turning into a steal failure.
  await notifyVictim(db, targetOpenid, OPENID, item).catch(() => {});

  return { ok: true, profile: { ...self, inventory: selfInventory, companionExp }, item, amount };
};
