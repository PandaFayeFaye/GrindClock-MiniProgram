import type { Employer, Mood, TimeEntry } from "./types";
import { entryHours, entryPay, lumpSumForPeriod } from "./pay";

export function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isConfirmedPersonal(e: TimeEntry) {
  return !e.workerId && e.status === "confirmed" && e.endTime;
}

/** Total pay per calendar day, for the heatmap. Key is `YYYY-M-D`. */
export function payByDay(entries: TimeEntry[], employerById: Map<string, Employer>): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!isConfirmedPersonal(e)) continue;
    const emp = employerById.get(e.employerId);
    if (!emp) continue;
    const key = dateKey(e.startTime);
    map.set(key, (map.get(key) ?? 0) + entryPay(emp, e));
  }
  return map;
}

/** Total hours worked per calendar day. Key is `YYYY-M-D`. */
export function hoursByDay(entries: TimeEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!isConfirmedPersonal(e)) continue;
    const key = dateKey(e.startTime);
    map.set(key, (map.get(key) ?? 0) + entryHours(e));
  }
  return map;
}

/** Consecutive days (including today) with at least one confirmed entry. */
export function currentStreak(entries: TimeEntry[], now = Date.now()): number {
  const daysWithEntries = new Set(
    entries.filter(isConfirmedPersonal).map((e) => dateKey(e.startTime)),
  );
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  // If nothing logged today yet, the streak still "counts" through yesterday.
  if (!daysWithEntries.has(dateKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (daysWithEntries.has(dateKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const MOOD_PRIORITY: Mood[] = ["crash", "heartbeat", "ox", "grind", "great", "flat", "slack", "normal"];

/** One representative mood per day (worst/most-notable wins when several entries share a day). */
export function moodByDay(entries: TimeEntry[]): Map<string, Mood> {
  const map = new Map<string, Mood>();
  for (const [key, detail] of moodDetailByDay(entries)) map.set(key, detail.mood);
  return map;
}

/** Same picking rule as moodByDay, but also carries that entry's note (if any) for detail views. */
export function moodDetailByDay(entries: TimeEntry[]): Map<string, { mood: Mood; note?: string }> {
  const map = new Map<string, { mood: Mood; note?: string }>();
  for (const e of entries) {
    if (!isConfirmedPersonal(e) || !e.mood) continue;
    const key = dateKey(e.startTime);
    const existing = map.get(key);
    if (!existing || MOOD_PRIORITY.indexOf(e.mood) < MOOD_PRIORITY.indexOf(existing.mood)) {
      map.set(key, { mood: e.mood, note: e.moodNote });
    }
  }
  return map;
}

/** Today's mood if logged; otherwise the most recently logged mood from any past day. */
export function latestMoodOrFallback(entries: TimeEntry[]): Mood | undefined {
  const todayKey = dateKey(Date.now());
  const today = moodDetailByDay(entries).get(todayKey);
  if (today) return today.mood;
  let best: TimeEntry | null = null;
  for (const e of entries) {
    if (!isConfirmedPersonal(e) || !e.mood) continue;
    if (!best || e.startTime > best.startTime) best = e;
  }
  return best?.mood;
}

export interface LeaderboardRow {
  employer: Employer;
  hours: number;
  pay: number;
}

/**
 * `includeLumpSum` adds back monthly/base-salary lump sums for employers with
 * a shift logged in the period -- only correct when `since` bounds exactly one
 * settlement window (e.g. a calendar month for the Monthly Recap). Leave it
 * off for a sub-month window (e.g. StatsPage's weekly board), where crediting
 * a full month's salary every week would wildly overcount.
 */
export function leaderboard(
  entries: TimeEntry[],
  employers: Employer[],
  since: number,
  includeLumpSum = false,
): LeaderboardRow[] {
  const byId = new Map(employers.map((e) => [e.id, e]));
  const totals = new Map<string, { hours: number; pay: number }>();
  const periodEntries = entries.filter((e) => isConfirmedPersonal(e) && e.startTime >= since);
  for (const e of periodEntries) {
    const emp = byId.get(e.employerId);
    if (!emp) continue;
    const prev = totals.get(emp.id) ?? { hours: 0, pay: 0 };
    totals.set(emp.id, { hours: prev.hours + entryHours(e), pay: prev.pay + entryPay(emp, e) });
  }
  if (includeLumpSum) {
    for (const emp of employers) {
      const lump = lumpSumForPeriod(emp, periodEntries);
      if (lump <= 0) continue;
      const prev = totals.get(emp.id) ?? { hours: 0, pay: 0 };
      totals.set(emp.id, { hours: prev.hours, pay: prev.pay + lump });
    }
  }
  return [...totals.entries()]
    .map(([id, t]) => ({ employer: byId.get(id)!, ...t }))
    .sort((a, b) => b.pay - a.pay);
}

export function startOfWeek(now = Date.now()): number {
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfMonth(now = Date.now()): number {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Number of consecutive fully-completed weeks (ending last week, not the
 * in-progress current week) whose total pay met `goal`. Used by the
 * "省钱达人" badge (needs >=3).
 */
export function consecutiveWeeksMeetingGoal(
  entries: TimeEntry[],
  employerById: Map<string, Employer>,
  goal: number,
  now = Date.now(),
): number {
  if (goal <= 0) return 0;
  let weekStart = startOfWeek(now) - 7 * 24 * 3600_000; // last full week, walking backwards
  let streak = 0;
  for (let i = 0; i < 26; i++) {
    const weekEnd = weekStart + 7 * 24 * 3600_000;
    let pay = 0;
    for (const e of entries) {
      if (!isConfirmedPersonal(e) || e.startTime < weekStart || e.startTime >= weekEnd) continue;
      const emp = employerById.get(e.employerId);
      if (emp) pay += entryPay(emp, e);
    }
    if (pay >= goal) {
      streak += 1;
      weekStart -= 7 * 24 * 3600_000;
    } else {
      break;
    }
  }
  return streak;
}
