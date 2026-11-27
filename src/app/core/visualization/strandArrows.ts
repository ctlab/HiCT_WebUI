/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export const STRAND_PLUS_FILL = "#d92d20"; // red, + strand
export const STRAND_MINUS_FILL = "#1d4ed8"; // blue, − strand
export const ARROW_ON_DARK = "#ffffff";
export const ARROW_ON_LIGHT = "#101828";
export const MAX_ARROWS_PER_SEGMENT = 3;
export const MIN_SEGMENT_PX = 10; // shorter introns/blocks get no chevrons
export const ARROW_PITCH_PX = 14; // minimum distance between chevron centres
export const DEFAULT_STRAND_COLORS = {
  "+": STRAND_PLUS_FILL,
  "-": STRAND_MINUS_FILL,
} as const;
export type StrandColors = Readonly<Record<"+" | "-", string>>;

export type Strand = "+" | "-" | "." | null | undefined;

/** Box heights for a lane of `laneHeight` px (UCSC proportions). Intron line is always 1 px. */
export function featureGeometry(laneHeight: number): {
  coding: number;
  utr: number;
  intron: number;
  chevronHalf: number;
} {
  const coding = Math.max(5, Math.round(laneHeight * 0.75));
  const utr = Math.max(3, Math.round(coding / 2));
  const chevronHalf = Math.max(2, Math.min(4, Math.floor(utr / 2))); // chevron = 2·half+1 px tall, ≤ UTR height
  return { coding, utr, intron: 1, chevronHalf };
}

/** Fill colour for a BED feature. `itemRgb` is the raw BED column ("r,g,b"), `trackRgb` the track-line colour. */
export function strandFill(
  strand: Strand,
  itemRgb: string | undefined,
  trackRgb: string | undefined,
  trackColor: string,
  strandColors: StrandColors = DEFAULT_STRAND_COLORS
): string {
  const parsed = parseBedRgb(itemRgb) ?? parseBedRgb(trackRgb);
  if (parsed) return parsed;
  if (strand === "+" || strand === "-") return strandColors[strand];
  return trackColor;
}

/** "255,0,0" → "rgb(255, 0, 0)"; "0" (BED default for "no colour") and invalid values → undefined. */
export function parseBedRgb(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const channels = raw.split(",").map((part) => part.trim());
  if (channels.some((part) => !/^\d{1,3}$/.test(part))) return undefined;
  const parts = channels.map(Number);
  if (
    parts.length !== 3 ||
    parts.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    return undefined;
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

/** WCAG relative luminance of a CSS rgb()/hex colour. */
export function relativeLuminance(css: string): number {
  let r: number, g: number, b: number;
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(css);
  if (hex) {
    const n = parseInt(hex[1], 16);
    [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else if (rgb) {
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  } else return 0.5;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Chevron colour INSIDE a block: white on dark fills, near-black on light fills. */
export function arrowColor(fill: string): string {
  const l = relativeLuminance(fill);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / (relativeLuminance(ARROW_ON_LIGHT) + 0.05);
  return onWhite >= onBlack ? ARROW_ON_DARK : ARROW_ON_LIGHT;
}

/** Chevron centres for one segment [start, end): 0 below MIN_SEGMENT_PX, else min(3, ⌊w/14⌋) (≥ 1), evenly spaced. */
export function arrowCentres(start: number, end: number): number[] {
  const width = end - start;
  if (!(width >= MIN_SEGMENT_PX)) return [];
  const n = Math.max(
    1,
    Math.min(MAX_ARROWS_PER_SEGMENT, Math.floor(width / ARROW_PITCH_PX))
  );
  return Array.from({ length: n }, (_, i) =>
    Math.round(start + (width * (i + 1)) / (n + 1))
  );
}

export interface ScreenBlock {
  x0: number;
  x1: number;
} // visible screen px of one exon block, sorted

export interface ChevronRun {
  centres: number[];
  color: string;
  onIntron: boolean;
}

/**
 * Which chevrons to draw for one feature. `blocks` are its exon blocks in screen px (BED3–9: one block).
 * Introns are the gaps between consecutive blocks.
 */
export function featureChevrons(
  strand: Strand,
  blocks: ScreenBlock[],
  fill: string,
  window?: ScreenBlock
): ChevronRun[] {
  if (strand !== "+" && strand !== "-") return [];
  const centresInWindow = (start: number, end: number) =>
    window
      ? arrowCentres(Math.max(window.x0, start), Math.min(window.x1, end))
      : arrowCentres(start, end);
  if (blocks.length <= 1) {
    const b = blocks[0];
    const centres = b ? centresInWindow(b.x0, b.x1) : [];
    return centres.length
      ? [{ centres, color: arrowColor(fill), onIntron: false }]
      : [];
  }
  const runs: ChevronRun[] = [];
  for (let i = 1; i < blocks.length; i++) {
    const centres = centresInWindow(blocks[i - 1].x1, blocks[i].x0);
    if (centres.length) runs.push({ centres, color: fill, onIntron: true });
  }
  return runs;
}

/** Draw open chevrons (1 px) centred on `y`; `half` from featureGeometry(). Horizontal tracks. */
export function drawChevrons(
  ctx: CanvasRenderingContext2D,
  strand: "+" | "-",
  centres: number[],
  y: number,
  half: number,
  color: string
): void {
  if (!centres.length) return;
  const cy = Math.floor(y) + 0.5;
  const depth = Math.max(2, half - 1);
  ctx.save();
  ctx.beginPath();
  for (const c of centres) {
    const x = c + 0.5;
    const tip = strand === "+" ? x + depth / 2 : x - depth / 2;
    const tail = strand === "+" ? x - depth / 2 : x + depth / 2;
    ctx.moveTo(tail, cy - half);
    ctx.lineTo(tip, cy);
    ctx.lineTo(tail, cy + half);
  }
  ctx.lineWidth = 1;
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

/** Hollow double chevron at a clipped edge, pointing out of the window ("left" or "right"). */
export function drawClippedEdge(
  ctx: CanvasRenderingContext2D,
  edge: "left" | "right",
  x: number,
  y: number,
  half: number,
  color: string,
  background: string
): void {
  const cy = Math.floor(y) + 0.5;
  const dir = edge === "left" ? -1 : 1;
  ctx.save();
  ctx.beginPath();
  for (const offset of [0, half + 1]) {
    const tip = x + 0.5 - dir * offset;
    const base = tip - dir * (half + 1);
    ctx.moveTo(base, cy - half);
    ctx.lineTo(tip, cy);
    ctx.lineTo(base, cy + half);
    ctx.closePath();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = background;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
