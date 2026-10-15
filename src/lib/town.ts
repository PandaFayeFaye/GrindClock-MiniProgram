// Client-side config for the "摸鱼小镇" (Mole-Fish Town) hidden feature.
// Mirrors MOYU_TOWN_SPEC.md exactly -- if the numbers here change, the
// matching constants inside cloudfunctions/town*/index.js must change too,
// since the cloud functions own the actual settlement math (never trust the
// client for anything that moves oxFeed/inventory/exp/title).

export type TownItemType =
  | "milkTea"
  | "snackPack"
  | "coffeeBean"
  | "riderSubsidy"
  | "phoneCard"
  | "gasCard"
  | "veggie"
  | "bbqCoupon"
  | "liveCommission"
  | "tutorFee"
  | "dividend"
  | "icuBonus"
  | "blueprintFee"
  | "futuresCommission"
  | "pmBonus"
  | "contentBonus";

export const ITEM_LABEL: Record<TownItemType, string> = {
  milkTea: "奶茶",
  snackPack: "零食礼包",
  coffeeBean: "咖啡豆",
  riderSubsidy: "骑手补贴",
  phoneCard: "话费卡",
  gasCard: "加油卡",
  veggie: "蔬菜",
  bbqCoupon: "烧烤券",
  liveCommission: "带货佣金",
  tutorFee: "补习费",
  dividend: "分红",
  icuBonus: "抢救补贴",
  blueprintFee: "图纸费",
  futuresCommission: "期货提成",
  pmBonus: "产品奖金",
  contentBonus: "爆款奖金",
};

export type TownJob = {
  key: string;
  name: string;
  emoji: string;
  color: string;
  feedCost: number;
  durationMs: number;
  expGain: number;
  item: TownItemType;
  itemAmount: number;
  unlockLevel: number; // index into TOWN_LEVELS
  nightOnly?: boolean; // 22:00-6:00 only
  // Rough position (% of scene width/height) for the building in the
  // illustrated town-square scene -- see src/pages/town/index.tsx.
  x: number;
  y: number;
  // A lightweight CSS-only idle animation so every building has some life
  // to it, not just the bbq stall's flame-swap frames (handled separately
  // in the page since it needs two source images, not just a CSS class).
  effect?: "steam" | "sway" | "shake" | "glint";
};

// x/y are the building's GROUND anchor point (% of the scene box), since
// buildings are anchored bottom-center (translate(-50%,-100%) in
// index.scss) -- the sprite extends UPWARD and its name label extends a bit
// further DOWN from this point. Keep y within roughly 30%-78% so nothing
// collides with the top HUD bar (~0-15%) or the bottom HUD bar (~84-100%),
// and stagger x across 4 loose rows so buildings don't crowd each other.
// Laid out on a deliberate 4x4 grid (x: 12/37/62/87, y: 27/45/63/81) so
// buildings never crowd each other even at the smaller footprint -- see
// src/pages/town/index.scss .town-building sizing. Rows progress roughly by
// unlockLevel top-to-bottom so the screen reads as a visible career ladder.
export const TOWN_JOBS: TownJob[] = [
  { key: "milkTeaShop", name: "奶茶店学徒", emoji: "🧋", color: "#FFD93D", feedCost: 5, durationMs: 1 * 3_600_000, expGain: 5, item: "milkTea", itemAmount: 1, unlockLevel: 0, x: 12, y: 27, effect: "steam" },
  { key: "barista", name: "咖啡师", emoji: "☕", color: "#B084F5", feedCost: 8, durationMs: 2 * 3_600_000, expGain: 8, item: "coffeeBean", itemAmount: 2, unlockLevel: 1, x: 37, y: 27, effect: "steam" },
  { key: "convenienceStore", name: "便利店收银", emoji: "🏪", color: "#5AC8FA", feedCost: 5, durationMs: 1.5 * 3_600_000, expGain: 5, item: "snackPack", itemAmount: 1, unlockLevel: 0, x: 62, y: 27, effect: "glint" },
  { key: "rider", name: "外卖骑手", emoji: "🛵", color: "#FF6B6B", feedCost: 8, durationMs: 0.5 * 3_600_000, expGain: 5, item: "riderSubsidy", itemAmount: 1, unlockLevel: 1, x: 87, y: 27, effect: "shake" },
  { key: "callCenter", name: "客服接线员", emoji: "📞", color: "#39C97A", feedCost: 10, durationMs: 4 * 3_600_000, expGain: 12, item: "phoneCard", itemAmount: 3, unlockLevel: 2, x: 12, y: 45 },
  { key: "driver", name: "网约车代驾", emoji: "🚗", color: "#4361EE", feedCost: 10, durationMs: 3 * 3_600_000, expGain: 10, item: "gasCard", itemAmount: 2, unlockLevel: 3, x: 37, y: 45 },
  { key: "farmer", name: "菜地打工", emoji: "🥬", color: "#39C97A", feedCost: 12, durationMs: 3 * 3_600_000, expGain: 12, item: "veggie", itemAmount: 4, unlockLevel: 4, x: 62, y: 45, effect: "sway" },
  { key: "productManager", name: "产品经理", emoji: "📋", color: "#FF6B6B", feedCost: 10, durationMs: 3 * 3_600_000, expGain: 13, item: "pmBonus", itemAmount: 2, unlockLevel: 4, x: 87, y: 45 },
  { key: "hospital", name: "门诊医师", emoji: "🏥", color: "#5AC8FA", feedCost: 18, durationMs: 5 * 3_600_000, expGain: 22, item: "icuBonus", itemAmount: 2, unlockLevel: 4, nightOnly: true, x: 12, y: 63 },
  { key: "bbqStall", name: "深夜烧烤摊", emoji: "🍢", color: "#FFB800", feedCost: 12, durationMs: 2 * 3_600_000, expGain: 15, item: "bbqCoupon", itemAmount: 3, unlockLevel: 5, nightOnly: true, x: 37, y: 63 },
  { key: "designInstitute", name: "给排水设计师", emoji: "📐", color: "#B084F5", feedCost: 20, durationMs: 6 * 3_600_000, expGain: 25, item: "blueprintFee", itemAmount: 1, unlockLevel: 5, x: 62, y: 63 },
  { key: "contentOps", name: "内容运营", emoji: "📣", color: "#39C97A", feedCost: 10, durationMs: 2.5 * 3_600_000, expGain: 11, item: "contentBonus", itemAmount: 2, unlockLevel: 5, x: 87, y: 63 },
  { key: "liveStream", name: "直播带货", emoji: "📱", color: "#FF6B6B", feedCost: 15, durationMs: 2 * 3_600_000, expGain: 15, item: "liveCommission", itemAmount: 1, unlockLevel: 6, x: 12, y: 81 },
  { key: "futuresInstitute", name: "期货分析师", emoji: "📈", color: "#FFB800", feedCost: 25, durationMs: 3 * 3_600_000, expGain: 28, item: "futuresCommission", itemAmount: 2, unlockLevel: 6, x: 37, y: 81 },
  { key: "tutor", name: "家教老师", emoji: "📚", color: "#5AC8FA", feedCost: 15, durationMs: 3 * 3_600_000, expGain: 18, item: "tutorFee", itemAmount: 1, unlockLevel: 7, x: 62, y: 81, effect: "sway" },
  { key: "boardroom", name: "董事会摸鱼", emoji: "💼", color: "#1A1A1A", feedCost: 20, durationMs: 4 * 3_600_000, expGain: 20, item: "dividend", itemAmount: 1, unlockLevel: 8, x: 87, y: 81, effect: "glint" },
];

// Companion idles here when not working -- up in the open patch above the
// lower-right cluster of buildings (not dead-center, which reads as
// mechanically symmetric) and clear of every building's footprint above.
export const TOWN_IDLE_SPOT = { x: 30, y: 46 };

export type TownLevel = {
  title: string;
  expThreshold: number;
  materials?: Partial<Record<TownItemType, number>>;
};

export const TOWN_LEVELS: TownLevel[] = [
  { title: "实习生", expThreshold: 0 },
  { title: "新人专员", expThreshold: 50 },
  { title: "资深员工", expThreshold: 150, materials: { milkTea: 5 } },
  { title: "组长", expThreshold: 350, materials: { coffeeBean: 8, snackPack: 5 } },
  { title: "主管", expThreshold: 700, materials: { riderSubsidy: 10, gasCard: 5 } },
  { title: "经理", expThreshold: 1300, materials: { veggie: 15, pmBonus: 8, icuBonus: 6 } },
  { title: "高级经理", expThreshold: 2200, materials: { bbqCoupon: 10, contentBonus: 8, blueprintFee: 4 } },
  { title: "总监", expThreshold: 3500, materials: { liveCommission: 8, futuresCommission: 6 } },
  { title: "VP副总裁", expThreshold: 5500, materials: { tutorFee: 5, dividend: 2 } },
  { title: "总经理", expThreshold: 8000, materials: { dividend: 5 } },
  { title: "CEO", expThreshold: 12000, materials: { dividend: 10 } },
  { title: "董事长", expThreshold: 18000, materials: { dividend: 15 } },
];

export function townLevelIndex(exp: number): number {
  return TOWN_LEVELS.reduce((idx, lvl, i) => (exp >= lvl.expThreshold ? i : idx), 0);
}

// Decorations are pure cosmetics -- traded in from town-job specialties,
// never affecting exp/title/oxFeed. This is the "装饰类" outlet from
// MOYU_TOWN_SPEC.md section 7 that was originally missing: specialties had
// nowhere to go except promotion materials and being stolen. Owned keys show
// up next to the player's card on the World page as a small brag-worthy
// badge row.
export type TownDecoration = { key: string; name: string; icon: string; costItem: TownItemType; costAmount: number };
export const TOWN_DECORATIONS: TownDecoration[] = [
  { key: "milkTeaLantern", name: "奶茶灯笼", icon: "/town/deco-icons/milkTeaLantern.png", costItem: "milkTea", costAmount: 5 },
  { key: "snackBox", name: "零食礼盒堆", icon: "/town/deco-icons/snackBox.png", costItem: "snackPack", costAmount: 6 },
  { key: "coffeeSign", name: "咖啡招牌", icon: "/town/deco-icons/coffeeSign.png", costItem: "coffeeBean", costAmount: 8 },
  { key: "helmet", name: "骑手头盔摆件", icon: "/town/deco-icons/helmet.png", costItem: "riderSubsidy", costAmount: 6 },
  { key: "phoneBooth", name: "复古电话亭", icon: "/town/deco-icons/phoneBooth.png", costItem: "phoneCard", costAmount: 6 },
  { key: "gasPump", name: "迷你加油站", icon: "/town/deco-icons/gasPump.png", costItem: "gasCard", costAmount: 6 },
  { key: "harvestScarecrow", name: "丰收稻草人", icon: "/town/deco-icons/harvestScarecrow.png", costItem: "veggie", costAmount: 10 },
  { key: "bbqLights", name: "烧烤灯串", icon: "/town/deco-icons/bbqLights.png", costItem: "bbqCoupon", costAmount: 6 },
  { key: "neonLive", name: "直播霓虹灯牌", icon: "/town/deco-icons/neonLive.png", costItem: "liveCommission", costAmount: 5 },
  { key: "lightbulb", name: "补习灯泡", icon: "/town/deco-icons/lightbulb.png", costItem: "tutorFee", costAmount: 6 },
  { key: "goldTrophy", name: "金色奖杯", icon: "/town/deco-icons/goldTrophy.png", costItem: "dividend", costAmount: 3 },
  { key: "luckyCat", name: "幸运招财猫", icon: "/town/deco-icons/luckyCat.png", costItem: "snackPack", costAmount: 12 },
  { key: "loungeChair", name: "摸鱼躺椅", icon: "/town/deco-icons/loungeChair.png", costItem: "veggie", costAmount: 16 },
  { key: "bossSofa", name: "老板专属沙发", icon: "/town/deco-icons/bossSofa.png", costItem: "dividend", costAmount: 8 },
];

// Mirrors cloudfunctions/townCriticize's SUBSCRIBE_TEMPLATE_ID -- the
// "打卡超时通知" one-time template (公共模板库 #74908) chosen in
// mp.weixin.qq.com -> 订阅消息. Keep both copies in sync if it's ever
// swapped for a different template.
export const SUBSCRIBE_TEMPLATE_ID: string = "eqyBvDNghz6B1MqTm1MluJ_ttKt9c811eQ3yZRIRGFw";

// Mirrors cloudfunctions/townSteal & townSkim's SUBSCRIBE_TEMPLATE_ID -- the
// "名片被访通知" template (公共模板库 #801) used for steal/skim victim pushes.
export const STEAL_SUBSCRIBE_TEMPLATE_ID: string = "2pMbXON4D1mJGcWnyEAnIZEkvCKufeXsfruclncjtdU";

// Every one-time template the World page should ask the viewer to grant in
// one batched prompt, so they stay reachable for both kinds of push.
export const ALL_SUBSCRIBE_TEMPLATE_IDS: string[] = [SUBSCRIBE_TEMPLATE_ID, STEAL_SUBSCRIBE_TEMPLATE_ID];

export const DAILY_RATION = 15;
export const FEED_COST = 10;
export const STEAL_COOLDOWN_MS = 24 * 3_600_000;
export const STEAL_MAX_PER_WINDOW = 3;
export const SKIM_COOLDOWN_MS = 6 * 3_600_000;

export type TownInventory = Partial<Record<TownItemType, number>>;

export type TownRecentTheft = { thiefOpenid: string; item: TownItemType; amount: number; stolenAt: number };

export type TownProfile = {
  unlocked: boolean;
  unlockedAt: number | null;
  oxFeed: number;
  lastDailyRationAt: number | null;
  lastFedAt: number | null;
  companionExp: number;
  titleIndex: number;
  currentJob: { jobKey: string; startedAt: number; endsAt: number; assignedBy?: string; settled?: boolean } | null;
  // Set when a forced shift (画饼摊派) interrupts a self-started one still in
  // progress -- the remaining time at the moment of interruption, so it can
  // resume automatically for exactly that long once the forced shift ends
  // (see cloudfunctions/townSkim's settleAssignedJob).
  pendingResumeJob?: { jobKey: string; remainingMs: number } | null;
  inventory: TownInventory;
  promotionSubmissions: Record<string, TownInventory>;
  decorations: string[];
  lastActiveAt: number | null;
  // Anti-theft state -- see cloudfunctions/townSteal's header comment for
  // the full mechanic. `policeBadges`/`policeBadgesResetAt` reset once per
  // local day and accumulate within it, same read pattern as the daily
  // ration.
  policeBadges?: number;
  policeBadgesResetAt?: number | null;
  recentThefts?: TownRecentTheft[];
  trapSetAt?: number | null;
  jailedUntil?: number | null;
  // 带薪年假: 1 day banked per LEAVE_DAY_STREAK_REQUIREMENT consecutive daily
  // check-ins. Spending one (townUseLeaveDay) both counts as that day's
  // check-in (keeps the streak alive, still grants the ration) AND grants
  // leaveActiveUntil immunity from steal/skim for the rest of the day.
  leaveDaysAvailable?: number;
  checkinStreakCount?: number;
  lastCheckinDateKey?: string | null;
  leaveActiveUntil?: number | null;
  // "闭店罢工弹": small chance per job collected. Spent on a specific
  // building (townUseBomb) to take it offline for every player for the
  // rest of the local day -- anyone already mid-shift there keeps working
  // and still gets paid in full, it just can't be started fresh.
  bombs?: number;
  // 举报老板: once per boss per day (see REPORT_COOLDOWN_MS), only if they
  // skimmed you at least REPORT_SKIM_THRESHOLD times within
  // REPORT_ELIGIBILITY_WINDOW_MS -- 劳动局 docks a random cut of their
  // inventory and pays it to you as compensation.
  reportCooldowns?: Record<string, number>;
};

export const STEAL_CATCH_WINDOW_MS = 5 * 60_000;
export const TRAP_DURATION_MS = 2 * 3_600_000;
export const JAIL_DURATION_MS = 3 * 3_600_000;

export function todayBadgeCount(profile: Pick<TownProfile, "policeBadges" | "policeBadgesResetAt">, now = Date.now()): number {
  if (!profile.policeBadgesResetAt || !isSameLocalDay(profile.policeBadgesResetAt, now)) return 0;
  return profile.policeBadges || 0;
}

export function isJailed(profile: Pick<TownProfile, "jailedUntil">, now = Date.now()): boolean {
  return !!profile.jailedUntil && profile.jailedUntil > now;
}

export function trapAlreadySetToday(profile: Pick<TownProfile, "trapSetAt">, now = Date.now()): boolean {
  return !!profile.trapSetAt && isSameLocalDay(profile.trapSetAt, now);
}

// ---- 带薪年假 (paid leave) ----
export const LEAVE_DAY_STREAK_REQUIREMENT = 7;
export const LEAVE_DAYS_MAX = 10;

export function isOnLeave(profile: Pick<TownProfile, "leaveActiveUntil">, now = Date.now()): boolean {
  return !!profile.leaveActiveUntil && profile.leaveActiveUntil > now;
}

// ---- 闭店罢工弹 (workplace bomb) ----
export const BOMB_DROP_CHANCE = 0.04;

// ---- 举报老板 (report your boss) ----
export const REPORT_COOLDOWN_MS = 24 * 3_600_000;
export const REPORT_ELIGIBILITY_WINDOW_MS = 7 * 24 * 3_600_000;
export const REPORT_SKIM_THRESHOLD = 7;

// ---- 签到彩蛋 (lucky check-in) -- deliberately all-upside, see townCheckin ----
export type LuckyTier = "none" | "ji" | "daji" | "dadaji";

/** Whether the next title is reachable: exp threshold met AND materials on
 * hand. Titles never auto-advance on exp alone -- see MOYU_TOWN_SPEC.md 6.3. */
export function canPromote(profile: Pick<TownProfile, "companionExp" | "titleIndex" | "inventory">): boolean {
  const next = TOWN_LEVELS[profile.titleIndex + 1];
  if (!next) return false;
  if (profile.companionExp < next.expThreshold) return false;
  const materials = next.materials || {};
  return Object.entries(materials).every(([item, need]) => (profile.inventory[item as TownItemType] || 0) >= (need as number));
}

// Pixel-art building sprites (composited from the CC0 "Tiny Town" tileset --
// see assets/town/CREDITS.txt), one per job, plus the scene background.
export function buildingImageSrc(jobKey: string): string {
  return `/town/${jobKey}.png`;
}

export const TOWN_SCENE_BG = "/town/scene_bg.png";

// HUD chrome uses the same tile-kit art as the scene (a wood-plank panel
// background + item icons) instead of plain white app-style pills, so the
// resource bar and drawer buttons read as part of the town, not a UI
// layer bolted on top of it.
export const HUD_WOOD_STRIP = "/town/hud/wood_strip.png";
export const HUD_ICON_CHEST = "/town/hud/chest.png";
export const HUD_ICON_TROPHY = "/town/hud/trophy.png";
export const HUD_ICON_FLAG = "/town/hud/flag.png";
export const HUD_ICON_COIN = "/town/hud/coin.png";

// Standalone foliage sprites (from the same CC0 tileset) scattered around
// the buildings and animated with a CSS sway -- kept as separate images
// (rather than baked into the background) specifically so each one can move
// independently instead of the scene being one flat static picture.
export const TOWN_DECO: { src: string; x: number; y: number; size: number; delay: number }[] = [
  { src: "tree1", x: 5, y: 15, size: 64 },
  { src: "tree2", x: 92, y: 12, size: 60 },
  { src: "tree3", x: 4, y: 55, size: 58 },
  { src: "tree4", x: 94, y: 50, size: 56 },
  { src: "tree5", x: 8, y: 88, size: 62 },
  { src: "tree6", x: 90, y: 90, size: 58 },
  { src: "tree7", x: 30, y: 5, size: 44 },
  { src: "tree8", x: 70, y: 4, size: 44 },
  { src: "mushroom", x: 18, y: 60, size: 30 },
  { src: "mushroom", x: 85, y: 30, size: 26 },
].map((d, i) => ({ ...d, src: `/town/deco/${d.src}.png`, delay: (i % 4) * 0.6 }));

export function isNightNow(now = new Date()): boolean {
  const h = now.getHours();
  return h >= 22 || h < 6;
}

export function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
