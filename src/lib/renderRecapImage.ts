import Taro from "@tarojs/taro";
import { roundRectPath, wrapText, fitText, canvasToImage } from "./canvasHelpers";

export interface RecapShareData {
  monthLabel: string;
  totalHours: string;
  totalPayText: string;
  streak: number;
  topEmployer: string;
  hardestDay: string;
  heatCells: number[]; // 0-3 intensity per day
  tierLabel: string;
}

const HEAT_COLORS = ["#2A2A2A", "rgba(255,217,61,.45)", "rgba(255,217,61,.75)", "#FFD93D"];
const W = 540;
const H = 800;

/** Renders the monthly recap as a shareable poster image onto an off-screen
 * canvas, mirroring the web app's Canvas-drawn recap share image (halved to
 * 540x800 to keep the mini-program canvas a sane phone-friendly size). */
export async function renderRecapShareImage(canvasId: string, data: RecapShareData): Promise<string> {
  const ctx = Taro.createCanvasContext(canvasId);

  ctx.fillStyle = "#1A1A1A";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,.05)";
  for (let x = 15; x < W; x += 30) {
    for (let y = 15; y < H; y += 30) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#FFD93D";
  ctx.font = "700 16px sans-serif";
  ctx.setTextBaseline("alphabetic");
  ctx.fillText(`${data.monthLabel} · 打工战绩报告`, 32, 60);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 30px sans-serif";
  wrapText(ctx, `这个月，你搬了${data.totalHours}小时的砖`, 32, 116, 476, 38);

  const tiles = [
    { n: `${data.streak}天`, l: "当前连续打卡" },
    { n: data.topEmployer, l: "最赚钱副本" },
    { n: data.hardestDay, l: "难忘的一天" },
    { n: data.totalPayText, l: "本月总收入" },
  ];
  const tileW = 230;
  const tileH = 100;
  const gap = 16;
  const gridX = 32;
  const gridY = 230;
  tiles.forEach((tile, i) => {
    const tx = gridX + (i % 2) * (tileW + gap);
    const ty = gridY + Math.floor(i / 2) * (tileH + gap);
    ctx.fillStyle = "#242424";
    roundRectPath(ctx, tx, ty, tileW, tileH, 14);
    ctx.fill();
    ctx.fillStyle = "#FFD93D";
    fitText(ctx, tile.n, tx + 18, ty + 48, tileW - 36, 22, 14, (px) => `800 ${px}px sans-serif`);
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.font = "500 12px sans-serif";
    ctx.fillText(tile.l, tx + 18, ty + 76);
  });

  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.font = "600 13px sans-serif";
  ctx.fillText("本月活跃度", 32, 490);

  const cellSize = 64;
  const cellGap = 4;
  const heatX = 32;
  const heatY = 510;
  data.heatCells.forEach((level, i) => {
    const cx = heatX + (i % 7) * (cellSize + cellGap);
    const cy = heatY + Math.floor(i / 7) * (cellSize + cellGap);
    ctx.fillStyle = HEAT_COLORS[level] ?? HEAT_COLORS[0];
    roundRectPath(ctx, cx, cy, cellSize, cellSize, 6);
    ctx.fill();
  });

  ctx.fillStyle = "#FFD93D";
  ctx.font = "800 20px sans-serif";
  ctx.fillText(`当前称号：${data.tierLabel}`, 32, H - 66);

  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.font = "500 12px sans-serif";
  ctx.fillText("GrindClock · 打工人的记工搭子", 32, H - 30);

  return canvasToImage(ctx, canvasId, W, H);
}

export const RECAP_CANVAS_SIZE = { width: W, height: H };
