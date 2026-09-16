// Promotes the companion's town title by one step. Gated on BOTH the exp
// threshold and having the "述职材料" on hand (see MOYU_TOWN_SPEC.md 6.3) --
// titles never auto-advance from exp alone, so this is the only place
// titleIndex changes.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TOWN_LEVELS = [
  { title: "实习生", expThreshold: 0 },
  { title: "新人专员", expThreshold: 50 },
  { title: "资深员工", expThreshold: 150, materials: { milkTea: 5 } },
  { title: "组长", expThreshold: 350, materials: { coffeeBean: 8, snackPack: 5 } },
  { title: "主管", expThreshold: 700, materials: { riderSubsidy: 10, gasCard: 5 } },
  { title: "经理", expThreshold: 1300, materials: { veggie: 15 } },
  { title: "高级经理", expThreshold: 2200, materials: { bbqCoupon: 10 } },
  { title: "总监", expThreshold: 3500, materials: { liveCommission: 8 } },
  { title: "VP副总裁", expThreshold: 5500, materials: { tutorFee: 5, dividend: 2 } },
  { title: "总经理", expThreshold: 8000, materials: { dividend: 5 } },
  { title: "CEO", expThreshold: 12000, materials: { dividend: 10 } },
  { title: "董事长", expThreshold: 18000, materials: { dividend: 15 } },
];

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const ref = db.collection("townProfiles").doc(OPENID);
  const res = await ref.get().catch(() => null);
  const profile = res && res.data;
  if (!profile || !profile.unlocked) return { ok: false, error: "not_unlocked" };

  const titleIndex = profile.titleIndex || 0;
  const next = TOWN_LEVELS[titleIndex + 1];
  if (!next) return { ok: false, error: "max_level" };
  if ((profile.companionExp || 0) < next.expThreshold) return { ok: false, error: "exp_too_low" };

  const materials = next.materials || {};
  const inventory = { ...(profile.inventory || {}) };
  for (const [item, need] of Object.entries(materials)) {
    if ((inventory[item] || 0) < need) return { ok: false, error: "missing_materials" };
  }
  for (const [item, need] of Object.entries(materials)) {
    inventory[item] -= need;
  }

  const now = Date.now();
  await ref.update({ data: { titleIndex: titleIndex + 1, inventory, lastActiveAt: now } });

  return {
    ok: true,
    profile: { ...profile, titleIndex: titleIndex + 1, inventory },
    newTitle: next.title,
  };
};
