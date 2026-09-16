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
  | "dividend";

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
};

export const TOWN_JOBS: TownJob[] = [
  { key: "milkTeaShop", name: "奶茶店学徒", emoji: "🧋", color: "#FFD93D", feedCost: 5, durationMs: 1 * 3_600_000, expGain: 5, item: "milkTea", itemAmount: 1, unlockLevel: 0, x: 12, y: 18 },
  { key: "convenienceStore", name: "便利店收银", emoji: "🏪", color: "#5AC8FA", feedCost: 5, durationMs: 1.5 * 3_600_000, expGain: 5, item: "snackPack", itemAmount: 1, unlockLevel: 0, x: 78, y: 14 },
  { key: "barista", name: "咖啡师", emoji: "☕", color: "#B084F5", feedCost: 8, durationMs: 2 * 3_600_000, expGain: 8, item: "coffeeBean", itemAmount: 2, unlockLevel: 1, x: 45, y: 8 },
  { key: "rider", name: "外卖骑手", emoji: "🛵", color: "#FF6B6B", feedCost: 8, durationMs: 0.5 * 3_600_000, expGain: 5, item: "riderSubsidy", itemAmount: 1, unlockLevel: 1, x: 8, y: 55 },
  { key: "callCenter", name: "客服接线员", emoji: "📞", color: "#39C97A", feedCost: 10, durationMs: 4 * 3_600_000, expGain: 12, item: "phoneCard", itemAmount: 3, unlockLevel: 2, x: 85, y: 52 },
  { key: "driver", name: "网约车代驾", emoji: "🚗", color: "#4361EE", feedCost: 10, durationMs: 3 * 3_600_000, expGain: 10, item: "gasCard", itemAmount: 2, unlockLevel: 3, x: 30, y: 62 },
  { key: "farmer", name: "菜地打工", emoji: "🥬", color: "#39C97A", feedCost: 12, durationMs: 3 * 3_600_000, expGain: 12, item: "veggie", itemAmount: 4, unlockLevel: 4, x: 62, y: 68 },
  { key: "bbqStall", name: "深夜烧烤摊", emoji: "🍢", color: "#FFB800", feedCost: 12, durationMs: 2 * 3_600_000, expGain: 15, item: "bbqCoupon", itemAmount: 3, unlockLevel: 5, nightOnly: true, x: 15, y: 82 },
  { key: "liveStream", name: "直播带货", emoji: "📱", color: "#FF6B6B", feedCost: 15, durationMs: 2 * 3_600_000, expGain: 15, item: "liveCommission", itemAmount: 1, unlockLevel: 6, x: 78, y: 80 },
  { key: "tutor", name: "家教老师", emoji: "📚", color: "#5AC8FA", feedCost: 15, durationMs: 3 * 3_600_000, expGain: 18, item: "tutorFee", itemAmount: 1, unlockLevel: 7, x: 48, y: 88 },
  { key: "boardroom", name: "董事会摸鱼", emoji: "💼", color: "#1A1A1A", feedCost: 20, durationMs: 4 * 3_600_000, expGain: 20, item: "dividend", itemAmount: 1, unlockLevel: 8, x: 48, y: 40 },
];

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
  { title: "经理", expThreshold: 1300, materials: { veggie: 15 } },
  { title: "高级经理", expThreshold: 2200, materials: { bbqCoupon: 10 } },
  { title: "总监", expThreshold: 3500, materials: { liveCommission: 8 } },
  { title: "VP副总裁", expThreshold: 5500, materials: { tutorFee: 5, dividend: 2 } },
  { title: "总经理", expThreshold: 8000, materials: { dividend: 5 } },
  { title: "CEO", expThreshold: 12000, materials: { dividend: 10 } },
  { title: "董事长", expThreshold: 18000, materials: { dividend: 15 } },
];

export function townLevelIndex(exp: number): number {
  return TOWN_LEVELS.reduce((idx, lvl, i) => (exp >= lvl.expThreshold ? i : idx), 0);
}

export const DAILY_RATION = 15;
export const FEED_COST = 10;
export const STEAL_COOLDOWN_MS = 24 * 3_600_000;
export const STEAL_MAX_PER_WINDOW = 3;
export const SKIM_COOLDOWN_MS = 6 * 3_600_000;

export type TownInventory = Partial<Record<TownItemType, number>>;

export type TownProfile = {
  unlocked: boolean;
  unlockedAt: number | null;
  oxFeed: number;
  lastDailyRationAt: number | null;
  lastFedAt: number | null;
  companionExp: number;
  titleIndex: number;
  currentJob: { jobKey: string; startedAt: number; endsAt: number } | null;
  inventory: TownInventory;
  promotionSubmissions: Record<string, TownInventory>;
  lastActiveAt: number | null;
};

/** Whether the next title is reachable: exp threshold met AND materials on
 * hand. Titles never auto-advance on exp alone -- see MOYU_TOWN_SPEC.md 6.3. */
export function canPromote(profile: Pick<TownProfile, "companionExp" | "titleIndex" | "inventory">): boolean {
  const next = TOWN_LEVELS[profile.titleIndex + 1];
  if (!next) return false;
  if (profile.companionExp < next.expThreshold) return false;
  const materials = next.materials || {};
  return Object.entries(materials).every(([item, need]) => (profile.inventory[item as TownItemType] || 0) >= (need as number));
}

export function isNightNow(now = new Date()): boolean {
  const h = now.getHours();
  return h >= 22 || h < 6;
}
