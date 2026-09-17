import Taro from "@tarojs/taro";
import type { TownProfile } from "./town";

// All state-changing town actions are settled server-side in cloud functions
// (townCheckin/townSendToWork/townCollectJob/townSteal/townSkim/townPromote)
// -- the client never writes oxFeed/inventory/companionExp/companionTitle
// directly, same principle as the money-math rules for the real punch-clock.

async function call<T>(name: string, data?: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await Taro.cloud.callFunction({ name, data });
  } catch (err) {
    // Surfaces network/transport-level failures (function not reachable,
    // callFunction rejected before the server ever ran it) -- these never
    // show up in the cloud function's own invocation logs, so this is the
    // only place to see what actually went wrong.
    console.error(`[town] callFunction "${name}" transport error:`, err);
    throw err;
  }
  const result = res.result as { ok: boolean; error?: string } & T;
  if (!result?.ok) {
    console.error(`[town] callFunction "${name}" returned error:`, result);
    throw new Error(result?.error || `${name}_failed`);
  }
  return result;
}

export function fetchTownProfile() {
  return call<{ profile: TownProfile }>("townGetProfile");
}

export function unlockTown() {
  return call<{ profile: TownProfile }>("townGetProfile", { unlock: true });
}

export function townCheckin() {
  return call<{ profile: TownProfile; gained: number }>("townCheckin");
}

export function feedCompanionInTown() {
  return call<{ profile: TownProfile }>("townFeed");
}

export function cancelJob() {
  return call<{ profile: TownProfile }>("townCancelJob");
}

/** Fire-and-forget after a real punch-clock clock-out. Silently resolves
 * false (never throws) when the town isn't unlocked or the call fails, so
 * callers can await it without any try/catch cluttering the real clock-out
 * flow -- the real punch must never be blocked or slowed by the town. */
export async function awardRealPunchBonus(): Promise<number> {
  try {
    const res = await call<{ gained: number }>("townPunchBonus");
    return res.gained;
  } catch {
    return 0;
  }
}

export function sendToWork(jobKey: string) {
  return call<{ profile: TownProfile }>("townSendToWork", { jobKey });
}

export function collectJob() {
  return call<{ profile: TownProfile; itemGained: string; amountGained: number; expGained: number }>(
    "townCollectJob",
  );
}

export type WorldEntry = {
  openid: string;
  rank: number;
  nickname: string;
  animal: string;
  mbti?: string;
  companionTitle: string;
  titleIndex: number;
  companionExp: number;
  lastActiveAt: number | null;
  inventoryCount: number;
  decorations: string[];
  checkedInToday: boolean;
  isWorking: boolean;
  workingJobKey: string | null;
};

export function fetchWorld() {
  return call<{ list: WorldEntry[]; me: WorldEntry | null; myRank: number | null; totalRanked: number }>(
    "townListWorld",
  );
}

export function stealFrom(targetOpenid: string) {
  return call<{ profile: TownProfile; item: string; amount: number; punished: boolean }>("townSteal", { targetOpenid });
}

export function skimFrom(targetOpenid: string) {
  return call<{ profile: TownProfile; item: string; amount: number }>("townSkim", { targetOpenid });
}

export function criticizeForNotCheckingIn(targetOpenid: string) {
  return call<{ pushed: boolean }>("townCriticize", { targetOpenid });
}

export function promote() {
  return call<{ profile: TownProfile; newTitle: string }>("townPromote");
}

export function buyDecoration(key: string) {
  return call<{ profile: TownProfile }>("townBuyDecoration", { key });
}
