import type { Mood } from "./types";

// Higher mood = higher up the mood curve (smaller y%, since y grows downward).
export const MOOD_Y: Record<Mood, number> = {
  heartbeat: 6,
  grind: 16,
  great: 26,
  slack: 40,
  normal: 50,
  flat: 62,
  ox: 74,
  crash: 86,
};

export const MOOD_COLOR: Record<Mood, string> = {
  crash: "#5AC8FA",
  normal: "#B9AC9C",
  great: "#FFD93D",
  heartbeat: "#FF6B6B",
  slack: "#8AC9B8",
  grind: "#FF8C42",
  ox: "#A89078",
  flat: "#C7C2B8",
};

export const MOOD_KEYS: { key: Mood; label: string }[] = [
  { key: "crash", label: "崩溃" },
  { key: "ox", label: "社畜" },
  { key: "flat", label: "躺平" },
  { key: "normal", label: "普通" },
  { key: "slack", label: "摸鱼" },
  { key: "great", label: "爽" },
  { key: "grind", label: "爆肝" },
  { key: "heartbeat", label: "心动" },
];

export const MOOD_ICON: Record<Mood, string> = {
  crash: "/icons/mood-crash.png",
  normal: "/icons/mood-normal.png",
  great: "/icons/mood-great.png",
  heartbeat: "/icons/mood-heartbeat.png",
  slack: "/icons/mood-slack.png",
  grind: "/icons/mood-grind.png",
  ox: "/icons/mood-ox.png",
  flat: "/icons/mood-flat.png",
};
