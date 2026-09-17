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

// Small easter egg for the app's own creator: stealing from this specific
// openid halves the THIEF's own inventory (rounded down per item) and
// hands that half straight to the founder, on top of the normal steal. The
// client shows a warning before calling this at all, but the punishment is
// enforced here unconditionally so it can't be skipped by bypassing the
// client-side confirm.
const FOUNDER_OPENID = "oF5PnxfxG4rGc0QHHDuPaeddZaPY";
// A global per-actor throttle on top of the per-target cap -- without this,
// someone could burn through several different victims' 3-per-24h budgets
// back to back in one sitting.
const STEAL_GLOBAL_COOLDOWN_MS = 3_600_000;

// "名片被访通知" template (公共模板库 #801), whose 场景说明 literally says
// "偷菜和摊派" -- dedicated to this exact use case, unlike townCriticize's
// check-in template. Fields: name1=访问人, date2=访问时间, thing3=访问详情,
// thing4=温馨提示.
const SUBSCRIBE_TEMPLATE_ID = "2pMbXON4D1mJGcWnyEAnIZEkvCKufeXsfruclncjtdU";

async function notifyVictim(db, targetOpenid, thiefOpenid, item) {
  if (!SUBSCRIBE_TEMPLATE_ID) return;
  try {
    const thiefProfileRes = await db.collection("userProfile").where({ _openid: thiefOpenid }).limit(1).get();
    const thiefNickname = (thiefProfileRes.data[0] && thiefProfileRes.data[0].nickname) || "神秘搭子";
    await cloud.openapi.subscribeMessage.send({
      touser: targetOpenid,
      templateId: SUBSCRIBE_TEMPLATE_ID,
      page: "pages/town-world/index",
      data: {
        name1: { value: thiefNickname.slice(0, 10) },
        date2: { value: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10) },
        thing3: { value: `被${thiefNickname.slice(0, 6)}偷家啦`.slice(0, 20) },
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
  const [recentStealsOnTarget, recentStealsAnywhere] = await Promise.all([
    db.collection("townJobLog").where({
      openid: OPENID,
      targetOpenid,
      type: "steal",
      createdAt: _.gte(now - STEAL_COOLDOWN_MS),
    }).count(),
    db.collection("townJobLog").where({
      openid: OPENID,
      type: "steal",
      createdAt: _.gte(now - STEAL_GLOBAL_COOLDOWN_MS),
    }).count(),
  ]);
  if (recentStealsOnTarget.total >= STEAL_MAX_PER_WINDOW) return { ok: false, error: "steal_cooldown" };
  if (recentStealsAnywhere.total >= 1) return { ok: false, error: "steal_global_cooldown" };

  const targetInventory = target.inventory || {};
  const stealableItems = Object.entries(targetInventory).filter(([, qty]) => qty > 0);
  if (stealableItems.length === 0) return { ok: false, error: "nothing_to_steal" };

  const [item, available] = stealableItems[Math.floor(Math.random() * stealableItems.length)];
  const amount = Math.min(available, 1 + Math.floor(Math.random() * 3));

  const newTargetInventory = { ...targetInventory, [item]: available - amount };
  let selfInventory = { ...(self.inventory || {}) };
  selfInventory[item] = (selfInventory[item] || 0) + amount;
  const companionExp = (self.companionExp || 0) + STEAL_EXP_GAIN;

  // The founder punishment: half of everything the thief owns (after the
  // steal above is added in) gets clawed back and handed to the founder.
  let punished = false;
  if (targetOpenid === FOUNDER_OPENID) {
    punished = true;
    const tribute = {};
    for (const [k, qty] of Object.entries(selfInventory)) {
      const half = Math.floor((qty || 0) / 2);
      if (half > 0) {
        tribute[k] = half;
        selfInventory[k] = qty - half;
      }
    }
    for (const [k, qty] of Object.entries(tribute)) {
      newTargetInventory[k] = (newTargetInventory[k] || 0) + qty;
    }
  }

  await Promise.all([
    targetRef.update({ data: { inventory: newTargetInventory } }),
    selfRef.update({ data: { inventory: selfInventory, companionExp, lastActiveAt: now } }),
    db.collection("townJobLog").add({
      data: { openid: OPENID, targetOpenid, type: "steal", expGained: STEAL_EXP_GAIN, itemsGained: { [item]: amount }, createdAt: now, punished },
    }),
  ]);

  // Best-effort and awaited (not fire-and-forget) -- a cloud function's
  // execution environment can be torn down the instant exports.main
  // resolves, which would silently kill an un-awaited async call before its
  // network request ever completes. The .catch keeps a push failure from
  // turning into a steal failure.
  await notifyVictim(db, targetOpenid, OPENID, item).catch(() => {});

  return { ok: true, profile: { ...self, inventory: selfInventory, companionExp }, item, amount, punished };
};
