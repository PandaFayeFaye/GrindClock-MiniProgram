import Taro from "@tarojs/taro";
import type { Employer, TimeEntry } from "./types";
import { entryHours, entryPay } from "./pay";
import { currencySymbol } from "./currency";

export type ExportColumn = "date" | "employer" | "start" | "end" | "hours" | "pay" | "mood" | "note";

export const EXPORT_COLUMNS: { key: ExportColumn; label: string }[] = [
  { key: "date", label: "日期" },
  { key: "employer", label: "副本" },
  { key: "start", label: "开始时间" },
  { key: "end", label: "结束时间" },
  { key: "hours", label: "时长(小时)" },
  { key: "pay", label: "收入" },
  { key: "mood", label: "心情" },
  { key: "note", label: "备注" },
];

function cellValue(col: ExportColumn, e: TimeEntry, emp: Employer | undefined): string {
  const start = new Date(e.startTime);
  const end = e.endTime ? new Date(e.endTime) : null;
  switch (col) {
    case "date": return start.toLocaleDateString();
    case "employer": return emp?.name ?? "";
    case "start": return start.toLocaleTimeString();
    case "end": return end ? end.toLocaleTimeString() : "";
    case "hours": return entryHours(e).toFixed(2);
    case "pay": return emp ? `${currencySymbol(emp.currency)}${entryPay(emp, e).toFixed(2)}` : "";
    case "mood": return e.mood ?? "";
    case "note": return (e.note ?? "").replace(/[\r\n,]+/g, " ");
  }
}

function csvEscape(v: string) {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * Builds the CSV, writes it to a temp file, and lets the user forward it
 * through WeChat (to a friend, group, or "文件传输助手"/File Transfer to
 * themselves) via the native share sheet -- mini programs can't trigger a
 * browser-style file download, so this is the equivalent "get my data out"
 * path here.
 */
export async function exportEntriesCsv(
  entries: TimeEntry[],
  employerById: Map<string, Employer>,
  filename: string,
  columns: ExportColumn[],
  columnLabels: string[],
) {
  const rows = entries
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((e) => columns.map((col) => cellValue(col, e, employerById.get(e.employerId))));

  const csv = [columnLabels, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
  // BOM so Excel on Windows/macOS renders Chinese characters correctly.
  const content = "﻿" + csv;

  const fs = Taro.getFileSystemManager();
  const filePath = `${Taro.env.USER_DATA_PATH}/${filename}`;
  fs.writeFileSync(filePath, content, "utf8");

  await Taro.shareFileMessage({ filePath });
}
