// Ported from the web app's lib/tiers.tsx, minus TIER_ICONS (JSX-coupled --
// native WEAPP doesn't render inline <svg>, so tier icons need image assets,
// a separate task for whenever the badge wall page gets built).
export const TIERS: { label: string; threshold: number }[] = [
  { label: "萌新打工人", threshold: 0 },
  { label: "摸鱼练习生", threshold: 10 },
  { label: "搬砖能手", threshold: 50 },
  { label: "卷王候选人", threshold: 200 },
  { label: "牛马之王", threshold: 500 },
];

export function currentTierIndex(totalHours: number): number {
  return TIERS.reduce((idx, tier, i) => (totalHours >= tier.threshold ? i : idx), 0);
}

export const TIER_COLORS: string[] = [
  "#39C97A",
  "#5AC8FA",
  "#FFD93D",
  "#FF6B6B",
  "#B084F5",
];
