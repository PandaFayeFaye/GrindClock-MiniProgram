import Taro from "@tarojs/taro";
import type { Employer, TimeEntry } from "./types";

// Mirrors the web app's src/lib/firestore.ts shape so page code reads the
// same way on both sides. Security is enforced by the WeChat CloudBase
// collection permission rule ("仅创建者可读写", see docs/DATA_MODEL.md) --
// every query here is implicitly scoped to the signed-in user's own _openid,
// so callers never need to pass a uid around like the Firestore version does.

function db() {
  return Taro.cloud.database();
}

export function employersCollection() {
  return db().collection("employers");
}

export function timeEntriesCollection() {
  return db().collection("timeEntries");
}

export function userProfileCollection() {
  return db().collection("userProfile");
}

export interface CloudEmployer extends Omit<Employer, "id"> {
  _id: string;
}

export interface CloudTimeEntry extends Omit<TimeEntry, "id"> {
  _id: string;
}

/** One-shot fetch (CloudBase's watch() API needs the WEAPP runtime, not always
 * available in every preview context -- pages call this and re-fetch after
 * writes rather than holding a live subscription, at least for Phase 2). */
export async function fetchEmployers(): Promise<CloudEmployer[]> {
  const res = await employersCollection().get();
  return res.data as CloudEmployer[];
}

export async function fetchEmployerById(employerId: string): Promise<CloudEmployer | null> {
  const res = await employersCollection().doc(employerId).get({});
  return (res.data as unknown as CloudEmployer) ?? null;
}

export async function fetchTimeEntries(): Promise<CloudTimeEntry[]> {
  const res = await timeEntriesCollection().orderBy("startTime", "desc").get();
  return res.data as CloudTimeEntry[];
}

export function addEmployer(data: Omit<Employer, "id">) {
  return employersCollection().add({ data });
}

export function updateEmployer(employerId: string, data: Partial<Employer>) {
  return employersCollection().doc(employerId).update({ data });
}

export function archiveEmployer(employerId: string) {
  return updateEmployer(employerId, { archived: true });
}

export function reactivateEmployer(employerId: string) {
  return updateEmployer(employerId, { archived: false });
}

export function addManualEntry(data: Omit<TimeEntry, "id">) {
  return timeEntriesCollection().add({ data });
}

export function updateTimeEntry(entryId: string, data: Partial<TimeEntry>) {
  return timeEntriesCollection().doc(entryId).update({ data });
}

export function deleteTimeEntry(entryId: string) {
  return timeEntriesCollection().doc(entryId).remove({});
}

// CloudBase's client SDK has no batched-write API like Firestore's writeBatch
// -- each of these is just N independent requests fired together.
export function addManualEntries(entries: Omit<TimeEntry, "id">[]) {
  return Promise.all(entries.map((data) => addManualEntry(data)));
}

export function deleteTimeEntries(entryIds: string[]) {
  return Promise.all(entryIds.map((id) => deleteTimeEntry(id)));
}

export function clockIn(employerId: string, startTime: number) {
  return addManualEntry({
    employerId,
    startTime,
    endTime: null,
    status: "confirmed",
    source: "manual",
  } as Omit<TimeEntry, "id">);
}

export function clockOut(entryId: string, data: Partial<TimeEntry> & { endTime: number }) {
  return updateTimeEntry(entryId, data);
}

export async function fetchUserProfile(): Promise<{ animal?: string; mbti?: string; nickname?: string } | null> {
  const res = await userProfileCollection().limit(1).get();
  const doc = res.data[0] as ({ _id: string } & Record<string, unknown>) | undefined;
  return doc ? (doc as any) : null;
}

export async function setUserProfile(data: { animal?: string; mbti?: string; nickname?: string }) {
  const existing = await userProfileCollection().limit(1).get();
  const doc = existing.data[0] as { _id: string } | undefined;
  if (doc) {
    return userProfileCollection().doc(doc._id).update({ data });
  }
  return userProfileCollection().add({ data });
}
