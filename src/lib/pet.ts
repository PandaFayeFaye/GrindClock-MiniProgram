import type { DictKey } from "./i18n";

export type PetAccessory = "star" | "crown";

export type PetStage = {
  nameKey: DictKey;
  threshold: number;
  scale: number;
  accessory?: PetAccessory;
};

// Growth story: the user's chosen animal grows into a bigger, more decorated
// form as cumulative worked hours ("feeding") add up. Thresholds intentionally
// match lib/tiers.ts so the job-title path and the companion's growth line up.
export const PET_STAGES: PetStage[] = [
  { nameKey: "petStageEgg", threshold: 0, scale: 0.72 },
  { nameKey: "petStageBaby", threshold: 10, scale: 0.86 },
  { nameKey: "petStageGrowing", threshold: 50, scale: 1 },
  { nameKey: "petStageStrong", threshold: 200, scale: 1.12, accessory: "star" },
  { nameKey: "petStageLegend", threshold: 500, scale: 1.25, accessory: "crown" },
];

export function currentPetStageIndex(totalHours: number): number {
  return PET_STAGES.reduce((idx, stage, i) => (totalHours >= stage.threshold ? i : idx), 0);
}

const HUNGER_WINDOW_MS = 36 * 3_600_000;

export function isPetHungry(lastFedAt: number | null, now = Date.now()): boolean {
  if (lastFedAt == null) return false;
  return now - lastFedAt > HUNGER_WINDOW_MS;
}

export function hoursSinceFed(lastFedAt: number | null, now = Date.now()): number {
  if (lastFedAt == null) return 0;
  return (now - lastFedAt) / 3_600_000;
}
