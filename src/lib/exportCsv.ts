import Taro from "@tarojs/taro";
import type { Employer, TimeEntry } from "./types";
import { entryHours, entryPay } from "./pay";
import { currencySymbol } from "./currency";
import { canvasToImage } from "./canvasHelpers";

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

/**
 * Renders the same rows as a table screenshot (PNG) instead of a CSV file --
 * the mini-program equivalent of the web app's "导出图片" option. Needs an
 * off-screen <Canvas canvasId={canvasId}> already mounted in the calling
 * page/component; `setCanvasSize` resizes that canvas's WXML style to fit
 * the measured content before drawing (the canvas element's own pixel
 * buffer follows its CSS size, so it must be sized before the real draw).
 */
export async function exportEntriesImage(
  canvasId: string,
  setCanvasSize: (size: { width: number; height: number }) => void,
  entries: TimeEntry[],
  employerById: Map<string, Employer>,
  columns: ExportColumn[],
  columnLabels: string[],
): Promise<string> {
  const rows = entries
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((e) => columns.map((col) => cellValue(col, e, employerById.get(e.employerId))));

  const padX = 16;
  const measureCtx = Taro.createCanvasContext(canvasId);
  const colWidths = columns.map((_, i) => {
    measureCtx.font = "700 15px sans-serif";
    const headerW = measureCtx.measureText(columnLabels[i]).width;
    measureCtx.font = "500 14px sans-serif";
    const cellW = rows.reduce((max, r) => Math.max(max, measureCtx.measureText(r[i]).width), 0);
    return Math.max(60, Math.ceil(Math.max(headerW, cellW)) + padX * 2);
  });

  const rowH = 40;
  const headerH = 46;
  const footerH = 40;
  const width = colWidths.reduce((s, w) => s + w, 0);
  const height = headerH + rows.length * rowH + footerH;

  setCanvasSize({ width, height });
  await new Promise((resolve) => setTimeout(resolve, 100));

  const ctx = Taro.createCanvasContext(canvasId);
  ctx.setTextBaseline("middle");

  ctx.fillStyle = "#FBF7EC";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1A1A1A";
  ctx.fillRect(0, 0, width, headerH);
  ctx.fillStyle = "#FFD93D";
  ctx.font = "700 15px sans-serif";
  let hx = 0;
  columnLabels.forEach((label, i) => {
    ctx.fillText(label, hx + padX, headerH / 2);
    hx += colWidths[i];
  });

  rows.forEach((row, rIdx) => {
    const ry = headerH + rIdx * rowH;
    ctx.fillStyle = rIdx % 2 === 0 ? "#FFFFFF" : "#F5F0E4";
    ctx.fillRect(0, ry, width, rowH);
    ctx.fillStyle = "#1A1A1A";
    ctx.font = "500 14px sans-serif";
    let cx = 0;
    row.forEach((cell, cIdx) => {
      ctx.fillText(cell, cx + padX, ry + rowH / 2);
      cx += colWidths[cIdx];
    });
    ctx.strokeStyle = "rgba(26,26,26,0.15)";
    ctx.beginPath();
    ctx.moveTo(0, ry + rowH);
    ctx.lineTo(width, ry + rowH);
    ctx.stroke();
  });

  ctx.fillStyle = "rgba(26,26,26,0.4)";
  ctx.font = "500 13px sans-serif";
  ctx.fillText("牛马打卡机 GrindClock", padX, height - footerH / 2);

  return canvasToImage(ctx, canvasId, width, height);
}
