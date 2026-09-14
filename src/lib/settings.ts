import Taro from "@tarojs/taro";

const WEEKLY_GOAL_KEY = "grindclock_weekly_goal";

export function getWeeklyGoal(): number {
  try {
    return Number(Taro.getStorageSync(WEEKLY_GOAL_KEY)) || 1000;
  } catch {
    return 1000;
  }
}

export function setWeeklyGoal(value: number) {
  try {
    Taro.setStorageSync(WEEKLY_GOAL_KEY, String(value));
  } catch {
    // ignore
  }
}

export const SETTINGS_KEYS = {
  simpleMode: "grindclock_simple_mode",
  locationPunch: "grindclock_location_punch",
  dailyRecapPush: "grindclock_daily_recap_push",
  aiPhoto: "grindclock_ai_photo",
  aiVoice: "grindclock_ai_voice",
  companionHintSeen: "grindclock_companion_hint_seen",
} as const;

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = Taro.getStorageSync(key);
    return raw === "" || raw == null ? fallback : raw === "true" || raw === true;
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    Taro.setStorageSync(key, String(value));
  } catch {
    // ignore
  }
}

export function getLocalToggle(key: string, fallback: boolean): boolean {
  return readBool(key, fallback);
}

export function setLocalToggle(key: string, value: boolean) {
  writeBool(key, value);
}

export function getCompanionHintSeen(): boolean {
  return readBool(SETTINGS_KEYS.companionHintSeen, false);
}

export function setCompanionHintSeen(value: boolean) {
  writeBool(SETTINGS_KEYS.companionHintSeen, value);
}
