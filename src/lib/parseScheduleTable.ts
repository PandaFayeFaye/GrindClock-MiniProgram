import type { Employer } from "./types";

export interface ScheduleRow {
  weekday: number; // 0=Monday .. 6=Sunday
  startTimeStr: string;
  endTimeStr: string;
  hours: number;
  date: string; // YYYY-MM-DD, computed against the current week
}

const WEEKDAY_TOKENS: [RegExp, number][] = [
  [/周一|星期一/, 0],
  [/周二|星期二/, 1],
  [/周三|星期三/, 2],
  [/周四|星期四/, 3],
  [/周五|星期五/, 4],
  [/周六|星期六/, 5],
  [/周日|周天|星期日|星期天/, 6],
];

export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const TIME_TOKEN = "\\d{1,2}(?:[:：]\\d{2}|点\\d{1,2}分?|点半|点)?";

function parseTimeToken(raw: string): number | null {
  let m = raw.match(/^(\d{1,2})[:：](\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = raw.match(/^(\d{1,2})点半$/);
  if (m) return Number(m[1]) * 60 + 30;
  m = raw.match(/^(\d{1,2})点(\d{1,2})分?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = raw.match(/^(\d{1,2})点?$/);
  if (m) return Number(m[1]) * 60;
  return null;
}

function formatHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mondayOfCurrentWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parses a multi-row weekly schedule table (as commonly OCR'd from a
 * schedule-board photo, e.g. "周一16:00-21:00 5h") into one row per weekday,
 * dated against the current calendar week. Returns an empty row list when
 * fewer than 2 weekday+time-range lines are found, so callers can fall back
 * to the single-entry parser (parseSpeechToDraft) for a plain sentence.
 */
export function parseScheduleTable(text: string, employers: Employer[]): { rows: ScheduleRow[]; employerId?: string } {
  const employer = employers.find((e) => text.includes(e.name));
  const lines = text.split(/\n+/);
  const rangeRe = new RegExp(`(${TIME_TOKEN})\\s*(?:[-~—至]|到)\\s*(${TIME_TOKEN})`);
  const monday = mondayOfCurrentWeek();
  const rows: ScheduleRow[] = [];

  for (const line of lines) {
    const weekdayMatch = WEEKDAY_TOKENS.find(([re]) => re.test(line));
    if (!weekdayMatch) continue;
    const rangeMatch = line.match(rangeRe);
    if (!rangeMatch) continue;
    const startMin = parseTimeToken(rangeMatch[1]);
    const endMin = parseTimeToken(rangeMatch[2]);
    if (startMin == null || endMin == null) continue;
    let diffMinutes = endMin - startMin;
    if (diffMinutes <= 0) diffMinutes += 24 * 60;
    const explicitHoursMatch = line.match(/(\d+(?:\.\d+)?)\s*h(?:小时)?/i);
    const hours = explicitHoursMatch ? Number(explicitHoursMatch[1]) : diffMinutes / 60;
    const date = new Date(monday);
    date.setDate(date.getDate() + weekdayMatch[1]);
    rows.push({
      weekday: weekdayMatch[1],
      startTimeStr: formatHHMM(startMin),
      endTimeStr: formatHHMM(endMin),
      hours,
      date: toDateStr(date),
    });
  }

  return { rows: rows.length >= 2 ? rows : [], employerId: employer?.id };
}
