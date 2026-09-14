import Taro from "@tarojs/taro";

const ONBOARDED_KEY = "grindclock_onboarded";
const COACH_TOUR_SEEN_KEY = "grindclock_coach_tour_seen";

function readFlag(key: string): boolean {
  try {
    return Taro.getStorageSync(key) === "true";
  } catch {
    return true; // fail open -- never trap a user behind onboarding due to a storage error
  }
}

function writeFlag(key: string) {
  try {
    Taro.setStorageSync(key, "true");
  } catch {
    // ignore
  }
}

export function hasOnboarded(): boolean {
  return readFlag(ONBOARDED_KEY);
}

export function markOnboarded() {
  writeFlag(ONBOARDED_KEY);
}

export function hasSeenCoachTour(): boolean {
  return readFlag(COACH_TOUR_SEEN_KEY);
}

export function markCoachTourSeen() {
  writeFlag(COACH_TOUR_SEEN_KEY);
}
