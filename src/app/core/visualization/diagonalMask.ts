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

export interface DiagonalMask {
  enabled: boolean;
  distanceBp: number;
}

export const DEFAULT_DIAGONAL_MASK: Readonly<DiagonalMask> = Object.freeze({ enabled: false, distanceBp: 100_000 });
export const MIN_DIAGONAL_MASK_BP = 1;
export const MAX_DIAGONAL_MASK_BP = 1_000_000_000;

export function validatedDiagonalMask(raw: unknown): Readonly<DiagonalMask> {
  if (raw == null) return DEFAULT_DIAGONAL_MASK;
  if (typeof raw !== "object" || !("enabled" in raw) || !("distanceBp" in raw))
    throw new Error("Expected diagonal mask settings");
  const { enabled, distanceBp } = raw;
  if (typeof enabled !== "boolean" || typeof distanceBp !== "number"
      || !Number.isInteger(distanceBp) || distanceBp < MIN_DIAGONAL_MASK_BP
      || distanceBp > MAX_DIAGONAL_MASK_BP)
    throw new Error("Invalid diagonal mask distance");
  return { enabled, distanceBp };
}

/** Number of bin offsets hidden on each side of the diagonal at resolution r (0 = only the diagonal). */
export function maskedOffsetBins(mask: DiagonalMask, resolutionBp: number): number {
  if (!mask.enabled) return -1;
  return Math.max(0, Math.ceil(mask.distanceBp / resolutionBp) - 1);
}

export function isMasked(mask: DiagonalMask, rowBin: number, columnBin: number, resolutionBp: number): boolean {
  const k = maskedOffsetBins(mask, resolutionBp);
  return k >= 0 && Math.abs(rowBin - columnBin) <= k;
}

/** Parse the sidebar field: accepts "100000", "100,000", "100 kb", "0.1 Mb". Returns undefined when invalid. */
export function parseDistanceBp(text: string): number | undefined {
  const m = /^\s*([0-9][0-9,_ ]*(?:\.[0-9]+)?)\s*(bp|kb|mb)?\s*$/i.exec(text);
  if (!m) return undefined;
  const value = Number(m[1].replace(/[,_ ]/g, ""));
  const unit = (m[2] ?? "bp").toLowerCase();
  const bp = Math.round(value * (unit === "mb" ? 1e6 : unit === "kb" ? 1e3 : 1));
  return Number.isFinite(bp) && bp >= MIN_DIAGONAL_MASK_BP && bp <= MAX_DIAGONAL_MASK_BP ? bp : undefined;
}
