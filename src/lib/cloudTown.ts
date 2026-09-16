import Taro from "@tarojs/taro";
import type { TownProfile } from "./town";

// All state-changing town actions are settled server-side in cloud functions
// (townCheckin/townSendToWork/townCollectJob/townSteal/townSkim/townPromote)
// -- the client never writes oxFeed/inventory/companionExp/companionTitle
// directly, same principle as the money-math rules for the real punch-clock.

async function call<T>(name: string, data?: Record<string, unknown>): Promise<T> {
  const res = await Taro.cloud.callFunction({ name, data });
  const result = res.result as { ok: boolean; error?: string } & T;
  if (!result?.ok) {
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
  nickname: string;
  companionTitle: string;
  titleIndex: number;
  companionExp: number;
  lastActiveAt: number | null;
  inventoryCount: number;
};

export function fetchWorld() {
  return call<{ list: WorldEntry[] }>("townListWorld");
}

export function stealFrom(targetOpenid: string) {
  return call<{ profile: TownProfile; item: string; amount: number }>("townSteal", { targetOpenid });
}

export function skimFrom(targetOpenid: string) {
  return call<{ profile: TownProfile; item: string; amount: number }>("townSkim", { targetOpenid });
}

export function promote() {
  return call<{ profile: TownProfile; newTitle: string }>("townPromote");
}
