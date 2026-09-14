import type { Employer } from "./types";

export interface ParsedDraft {
  employerId?: string;
  hours?: number;
  minutes?: number;
  startTimeStr?: string; // "HH:MM", only set when an explicit time range was recognized
  endTimeStr?: string;
  rawText: string;
}

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

/**
 * Best-effort, regex-based extraction from OCR/speech text -- NOT a real language
 * model. No API key is configured for this project (see PRD open questions), so
 * this free heuristic parser is the honest MVP. Users always get to review and
 * correct the result before saving (see AICapturePage), so a wrong guess here
 * costs a few taps, not a bad record.
 */
export function parseSpeechToDraft(text: string, employers: Employer[]): ParsedDraft {
  const employer = employers.find((e) => text.includes(e.name));

  // Prefer an explicit time range ("16:00-21:00", "16点到21点", "16点上班到
  // 20点下班", ...) -- it gives real start/end times, not just a duration
  // guess. The [^0-9]{0,8} gaps tolerate spoken filler words like "上班"
  // between the time and the connector, without crossing into an unrelated
  // number elsewhere in the sentence (a digit immediately breaks the gap).
  const rangeRe = new RegExp(`(${TIME_TOKEN})[^0-9]{0,8}(?:[-~—至]|到)[^0-9]{0,8}(${TIME_TOKEN})`);
  const rangeMatch = text.match(rangeRe);
  if (rangeMatch) {
    const startMin = parseTimeToken(rangeMatch[1]);
    const endMin = parseTimeToken(rangeMatch[2]);
    if (startMin !== null && endMin !== null) {
      let diff = endMin - startMin;
      if (diff <= 0) diff += 24 * 60; // overnight shift
      return {
        employerId: employer?.id,
        hours: Math.floor(diff / 60),
        minutes: diff % 60,
        startTimeStr: formatHHMM(startMin),
        endTimeStr: formatHHMM(endMin),
        rawText: text,
      };
    }
  }

  const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:个)?小时/);
  const minutesMatch = text.match(/(\d+)\s*分钟/);

  return {
    employerId: employer?.id,
    hours: hoursMatch ? Number(hoursMatch[1]) : undefined,
    minutes: minutesMatch ? Number(minutesMatch[1]) : undefined,
    rawText: text,
  };
}
