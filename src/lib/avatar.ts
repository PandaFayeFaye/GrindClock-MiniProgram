export type AnimalKey =
  | "rat" | "cat" | "cow" | "rabbit" | "tiger" | "sheep" | "monkey" | "dog"
  | "pig" | "horse" | "snake" | "chick" | "dragon" | "giraffe" | "capybara";

export const ANIMALS: { key: AnimalKey; label: string }[] = [
  { key: "rat", label: "鼠" },
  { key: "cat", label: "猫" },
  { key: "cow", label: "牛" },
  { key: "rabbit", label: "兔" },
  { key: "tiger", label: "虎" },
  { key: "sheep", label: "羊" },
  { key: "monkey", label: "猴" },
  { key: "dog", label: "狗" },
  { key: "pig", label: "猪" },
  { key: "horse", label: "马" },
  { key: "snake", label: "蛇" },
  { key: "chick", label: "小鸡" },
  { key: "dragon", label: "龙" },
  { key: "giraffe", label: "长颈鹿" },
  { key: "capybara", label: "水豚" },
];

export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

// The 4 MBTI temperament groups (Keirsey), used only to pick a ring color.
export function mbtiGroupColor(mbti: string): string {
  if (["INTJ", "INTP", "ENTJ", "ENTP"].includes(mbti)) return "#B084F5"; // Analysts
  if (["INFJ", "INFP", "ENFJ", "ENFP"].includes(mbti)) return "#39C97A"; // Diplomats
  if (["ISTJ", "ISFJ", "ESTJ", "ESFJ"].includes(mbti)) return "#5AC8FA"; // Sentinels
  return "#FFD93D"; // Explorers: ISTP/ISFP/ESTP/ESFP
}

// Illustrated portraits live in the packageCharacters subpackage (copied
// verbatim by config/index.ts's copy.patterns, not bundled through webpack
// as JS assets) so the 255 animal+MBTI portraits don't bloat the main
// package. Referencing this absolute path triggers that subpackage's
// download the first time an <Image> resolves it.
export function characterImageSrc(animal: AnimalKey, mbti?: string): string {
  return mbti
    ? `/packageCharacters/assets/characters/${animal}-${mbti}.png`
    : `/packageCharacters/assets/characters/${animal}-default.png`;
}

export type PetAccessory = "star" | "crown";
