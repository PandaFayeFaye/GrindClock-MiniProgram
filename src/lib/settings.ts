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
