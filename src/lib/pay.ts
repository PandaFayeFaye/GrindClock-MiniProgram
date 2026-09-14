import type { Adjustment, Employer, TimeEntry } from "./types";
import { scheduleDurationHours } from "./schedule";

export function entryHours(entry: TimeEntry, now = Date.now()): number {
  const end = entry.endTime ?? now;
  return Math.max(0, end - entry.startTime) / 3_600_000;
}

function adjustmentTotal(adjustments?: Adjustment[]): number {
  if (!adjustments) return 0;
  return adjustments.reduce(
    (sum, a) => sum + (a.type === "bonus" ? a.amount : -a.amount),
    0,
  );
}

/**
 * Per-entry pay estimate. `monthly` and the base-salary portion of
 * `base+overtime` aren't tied to a single shift, so they contribute 0 here --
 * those employers' income shows up in a lump sum elsewhere, not per entry.
 */
function rateMultiplier(employer: Employer, entry: TimeEntry): number {
  if (entry.isHoliday) return employer.holidayMultiplier ?? 1;
  if (entry.isOvertime) return employer.overtimeMultiplier ?? 1;
  return 1;
}

/**
 * The per-hour rate overtime actually pays: either the employer's own flat
 * overtimeHourlyRate (when they've said "we just pay a fixed OT rate,
 * regardless of the base rate") or the base rate x overtimeMultiplier
 * (defaulting to a conventional 1.5x if never configured).
 */
function overtimeRate(employer: Employer, baseHourlyRate: number): number {
  if (employer.overtimeRateMode === "fixed" && employer.overtimeHourlyRate) {
    return employer.overtimeHourlyRate;
  }
  return baseHourlyRate * (employer.overtimeMultiplier ?? 1.5);
}

/**
 * Splits an entry's hours into regular + overtime portions when
 * `entry.overtimeHours` is set (the excess beyond a fixed daily schedule,
 * detected at clock-out) regardless of the whole-entry `isOvertime` flag,
 * which is a separate, coarser manual override.
 */
function payWithOvertimeSplit(hours: number, hourlyRate: number, employer: Employer, entry: TimeEntry): number {
  const holidayMult = entry.isHoliday ? (employer.holidayMultiplier ?? 1) : 1;
  if (entry.overtimeHours && entry.overtimeHours > 0) {
    const ot = Math.min(entry.overtimeHours, hours);
    const regular = hours - ot;
    return (regular * hourlyRate + ot * overtimeRate(employer, hourlyRate)) * holidayMult;
  }
  return hours * hourlyRate * rateMultiplier(employer, entry);
}

/**
 * Just the overtime slice of an entry's pay (0 if it has no overtimeHours) --
 * uses the employer's currently-configured overtime rate (multiplier or flat
 * rate), the same one shown to and confirmed by the user when the overtime
 * was detected/entered.
 */
export function entryOvertimePay(employer: Employer, entry: TimeEntry, now = Date.now()): number {
  if (!entry.overtimeHours || entry.overtimeHours <= 0) return 0;
  const hours = payableHours(employer, entry, now);
  const ot = Math.min(entry.overtimeHours, hours);
  const holidayMult = entry.isHoliday ? (employer.holidayMultiplier ?? 1) : 1;
  let baseRate = 0;
  if (employer.payType === "hourly" || employer.payType === "comprehensive") baseRate = employer.hourlyRate ?? 0;
  else if (employer.payType === "monthly") baseRate = effectiveHourlyRate(employer) ?? 0;
  return ot * overtimeRate(employer, baseRate) * holidayMult;
}

/** Hours actually paid for a shift: clocked duration minus the employer's unpaid break. */
function payableHours(employer: Employer, entry: TimeEntry, now = Date.now()): number {
  const breakHours = (employer.breakMinutes ?? 0) / 60;
  return Math.max(0, entryHours(entry, now) - breakHours);
}

const AVG_WEEKS_PER_MONTH = 365.25 / 12 / 7; // ~4.348

/**
 * A monthly-salary employer with a fixed weekly schedule has an implied
 * hourly rate -- deriving it lets each shift show a real (estimated) amount
 * earned instead of a flat 0, which otherwise reads as "you earned nothing
 * today" no matter how much was actually worked. Returns undefined when
 * there's no schedule to derive weekly hours from (nothing to estimate).
 */
export function effectiveHourlyRate(employer: Employer): number | undefined {
  if (employer.payType !== "monthly" || !employer.monthlySalary || !employer.fixedSchedule) return undefined;
  const days = Object.values(employer.fixedSchedule);
  if (days.length === 0) return undefined;
  const weeklyHours = days.reduce((sum, day) => sum + scheduleDurationHours(day), 0);
  if (weeklyHours <= 0) return undefined;
  const monthlyHours = weeklyHours * AVG_WEEKS_PER_MONTH;
  return employer.monthlySalary / monthlyHours;
}

export function entryPay(employer: Employer, entry: TimeEntry, now = Date.now()): number {
  const hours = payableHours(employer, entry, now);
  let base = 0;
  switch (employer.payType) {
    case "hourly":
    case "comprehensive":
      base = payWithOvertimeSplit(hours, employer.hourlyRate ?? 0, employer, entry);
      break;
    case "daily":
      base = employer.dailyRate ?? 0;
      break;
    case "per-order":
      base = (entry.orderCount ?? 0) * (employer.pricePerOrder ?? 0);
      break;
    case "base+overtime":
      // The base salary itself is a monthly lump sum, not tied to a single shift --
      // only overtime/holiday-flagged entries contribute a per-entry amount here.
      base = entry.isOvertime || entry.isHoliday
        ? hours * (employer.hourlyRate ?? 0) * rateMultiplier(employer, entry)
        : 0;
      break;
    case "monthly": {
      const rate = effectiveHourlyRate(employer);
      base = rate !== undefined ? payWithOvertimeSplit(hours, rate, employer, entry) : 0;
      break;
    }
  }
  return base + adjustmentTotal(entry.adjustment);
}

function isConfirmedPersonalFor(employerId: string) {
  return (e: TimeEntry) => e.employerId === employerId && !e.workerId && e.status === "confirmed" && !!e.endTime;
}

/**
 * `monthly` and `base+overtime` pay a fixed lump sum that isn't tied to any
 * single shift -- entryPay() deliberately returns 0 for it there. This adds
 * that lump sum back in for a given set of entries, once, if the employee
 * actually logged at least one shift for that employer in the period (no
 * shifts logged = nothing earned, even on a nominal salary).
 */
export function lumpSumForPeriod(employer: Employer, periodEntries: TimeEntry[]): number {
  // A monthly employer with a derivable hourly rate already has its salary
  // spread across each shift via entryPay() -- adding the lump sum here too
  // would double-count it.
  if (employer.payType === "monthly" && effectiveHourlyRate(employer) !== undefined) return 0;
  const amount = employer.payType === "monthly" ? employer.monthlySalary ?? 0
    : employer.payType === "base+overtime" ? employer.baseSalary ?? 0
    : 0;
  if (amount <= 0) return 0;
  return periodEntries.some(isConfirmedPersonalFor(employer.id)) ? amount : 0;
}

/** All-time version of lumpSumForPeriod: pays once per distinct calendar month
 * the employee logged at least one shift, since a monthly salary recurs monthly. */
export function lumpSumAllTime(employer: Employer, entries: TimeEntry[]): number {
  if (employer.payType === "monthly" && effectiveHourlyRate(employer) !== undefined) return 0;
  const amount = employer.payType === "monthly" ? employer.monthlySalary ?? 0
    : employer.payType === "base+overtime" ? employer.baseSalary ?? 0
    : 0;
  if (amount <= 0) return 0;
  const months = new Set<string>();
  for (const e of entries) {
    if (!isConfirmedPersonalFor(employer.id)(e)) continue;
    const d = new Date(e.startTime);
    months.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  return months.size * amount;
}

/** Physical time actually worked today, deduplicating overlapping concurrent shifts
 * across different employers (a rider dual-apping doesn't get 36-hour days). */
export function mergedHoursToday(entries: TimeEntry[], now = Date.now()): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  const ranges = entries
    .map((e) => [Math.max(e.startTime, dayStart), Math.min(e.endTime ?? now, now)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, e] of ranges) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else {
      curEnd = Math.max(curEnd, e);
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total / 3_600_000;
}
