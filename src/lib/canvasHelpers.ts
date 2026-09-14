import Taro from "@tarojs/taro";

/** Legacy `Taro.createCanvasContext` canvas -- ctx.font/fillStyle work like
 * the browser Canvas 2D API but drawing only actually paints after ctx.draw()
 * is called, and canvasToTempFilePath must run after draw()'s callback fires. */
export type CanvasCtx = ReturnType<typeof Taro.createCanvasContext>;

export function roundRectPath(ctx: CanvasCtx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Char-by-char greedy wrap -- fine for CJK text where every character is
 * roughly one "word", unlike space-delimited wrapping. */
export function wrapText(ctx: CanvasCtx, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  let line = "";
  let cy = y;
  for (const ch of text) {
    const testLine = line + ch;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = ch;
      cy += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

/** Shrinks the font size (via fontBuilder) until `text` fits maxWidth, then draws it. */
export function fitText(
  ctx: CanvasCtx,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxPx: number,
  minPx: number,
  fontBuilder: (px: number) => string,
) {
  let size = maxPx;
  ctx.font = fontBuilder(size);
  while (size > minPx && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = fontBuilder(size);
  }
  ctx.fillText(text, x, y);
}

/** Runs ctx.draw(), waits a tick (draw is async with no reliable completion
 * signal on some devices), then exports the canvas to a temp PNG file. */
export function canvasToImage(ctx: CanvasCtx, canvasId: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    ctx.draw(false, () => {
      setTimeout(() => {
        Taro.canvasToTempFilePath({
          canvasId,
          width,
          height,
          destWidth: width * 2,
          destHeight: height * 2,
          fileType: "png",
          success: (res) => resolve(res.tempFilePath),
          fail: (err) => reject(err),
        });
      }, 200);
    });
  });
}
