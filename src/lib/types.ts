export type PayType = "hourly" | "daily" | "base+overtime" | "comprehensive" | "monthly" | "per-order";

export interface Employer {
  id: string;
  name: string;
  color: string;
  payType: PayType;
  currency?: string; // ISO-ish code, e.g. "CNY" | "USD" | "EUR" -- see lib/currency.ts; defaults to CNY
  industryTag?: string; // free-form or preset industry label, e.g. "Restaurant" -- display/filter only, no calculation impact
  scheduleMode?: "flexible" | "fixed"; // "flexible" (default) = manual punch in/out; "fixed" = has a weekly schedule, see fixedSchedule
  fixedSchedule?: Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { start: string; end: string }>>; // key = JS Date.getDay(), "0"=Sunday; a missing key means not a working day
  hourlyRate?: number;
  dailyRate?: number;
  baseSalary?: number;
  monthlySalary?: number;
  pricePerOrder?: number;
  overtimeMultiplier?: number;
  overtimeRateMode?: "multiplier" | "fixed"; // "multiplier" (default) = hourlyRate/effective rate x overtimeMultiplier; "fixed" = a flat overtimeHourlyRate regardless of the base rate
  overtimeHourlyRate?: number; // used when overtimeRateMode is "fixed"
  holidayMultiplier?: number;
  breakMinutes?: number;
  settlementCycle?: "daily" | "weekly" | "monthly";
  commuteMinutes?: number;
  commuteCost?: number;
  idleTimePct?: number; // estimated % of on-shift time spent idle/waiting (e.g. between rideshare/delivery orders)
  defaultAdjustments?: Adjustment[]; // recurring per-shift bonus/deduction rules, auto-applied to every new entry
  note?: string;
  archived?: boolean; // retired -- hidden from Home/punch flows, but its history stays intact and it can be reactivated
}

export type Mood = "crash" | "normal" | "great" | "heartbeat" | "slack" | "grind" | "ox" | "flat";

export interface Adjustment {
  type: "bonus" | "deduction";
  amount: number;
  note?: string;
}

export interface TimeEntry {
  id: string;
  employerId: string;
  workerId?: string; // set when this entry belongs to a team-logged worker
  startTime: number; // epoch ms
  endTime: number | null; // null while clocked in
  status: "confirmed" | "draft";
  source: "manual" | "ocr" | "voice";
  mood?: Mood;
  moodNote?: string;
  adjustment?: Adjustment[];
  orderCount?: number; // only for per-order payType
  isOvertime?: boolean; // manual "count this whole shift as overtime" flag -- applies employer.overtimeMultiplier to all its hours
  isHoliday?: boolean; // applies employer.holidayMultiplier when computing pay
  overtimeHours?: number; // hours within this entry beyond a fixed daily schedule, paid at employer.overtimeMultiplier while the rest pays the regular rate
  note?: string;
  clockInLocation?: { lat: number; lng: number; accuracy: number };
}

export interface Worker {
  id: string;
  name: string;
  note?: string;
  defaultHourlyRate?: number;
}
