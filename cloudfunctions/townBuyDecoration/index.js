// Trades town specialties for a cosmetic decoration -- the "装饰类" outlet
// from MOYU_TOWN_SPEC.md section 7 (mirrors src/lib/town.ts TOWN_DECORATIONS
// exactly; keep both in sync). Purely cosmetic: never touches oxFeed,
// companionExp, or titleIndex, only `inventory` and `decorations`.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TOWN_DECORATIONS = [
  { key: "milkTeaLantern", costItem: "milkTea", costAmount: 5 },
  { key: "coffeeSign", costItem: "coffeeBean", costAmount: 8 },
  { key: "harvestScarecrow", costItem: "veggie", costAmount: 10 },
  { key: "goldTrophy", costItem: "dividend", costAmount: 3 },
];

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const deco = TOWN_DECORATIONS.find((d) => d.key === (event && event.key));
  if (!deco) return { ok: false, error: "unknown_decoration" };

  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) return { ok: false, error: "not_unlocked" };

  const owned = profile.decorations || [];
  if (owned.includes(deco.key)) return { ok: false, error: "already_owned" };

  const inventory = { ...(profile.inventory || {}) };
  if ((inventory[deco.costItem] || 0) < deco.costAmount) return { ok: false, error: "insufficient_materials" };
  inventory[deco.costItem] -= deco.costAmount;

  const decorations = [...owned, deco.key];
  const now = Date.now();
  await ref.update({ data: { inventory, decorations, lastActiveAt: now } });

  return { ok: true, profile: { ...profile, inventory, decorations } };
};
