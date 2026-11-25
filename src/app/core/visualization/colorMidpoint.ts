/** Color transfer only: numeric signals and histogram samples remain unchanged. */
export function validateColorGamma(value: number): number {
  if (!Number.isFinite(value) || value < 0.05 || value > 100)
    throw new Error("Color gamma must be finite and between 0.05 and 100.");
  return value;
}
export const midpointFraction = (gamma: number) =>
  Math.pow(0.5, 1 / validateColorGamma(gamma));
export const gammaFromMidpoint = (fraction: number) =>
  Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, fraction)));

export const MAX_CURVE_POINTS = 64;
export interface CurvePoint {
  x: number;
  y: number;
}

export function validatedCurve(raw: unknown): number[] | undefined {
  if (raw == null) return undefined;
  if (
    !Array.isArray(raw) ||
    raw.length % 2 ||
    raw.length > MAX_CURVE_POINTS * 2
  )
    throw Error("Invalid color curve");
  let previous = -1;
  for (let i = 0; i < raw.length; i += 2) {
    const x = raw[i],
      y = raw[i + 1];
    if (
      !Number.isFinite(x) ||
      !(x > previous && x >= 0 && x <= 1) ||
      !Number.isFinite(y) ||
      y < 0 ||
      y > 1
    )
      throw Error("Invalid color curve point");
    previous = x;
  }
  return [...raw];
}

export function curveParts(points: readonly number[] = []): {
  start: number;
  end: number;
  interior: CurvePoint[];
} {
  const interior: CurvePoint[] = [];
  let start = 0;
  let end = 1;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x === 0) start = y;
    else if (x === 1) end = y;
    else interior.push({ x, y });
  }
  return { start, end, interior };
}

export function buildCurve(
  start: number,
  end: number,
  interior: CurvePoint[]
): number[] | undefined {
  const points: number[] = [];
  if (start !== 0) points.push(0, start);
  for (const point of interior) points.push(point.x, point.y);
  if (end !== 1) points.push(1, end);
  return points.length ? points : undefined;
}

export function colorFraction(
  fraction: number,
  gamma: number,
  points?: readonly number[]
): number {
  const x = Math.max(0, Math.min(1, fraction));
  if (!points) return gamma === 1 ? x : Math.pow(x, validateColorGamma(gamma));
  const hasStart = points[0] === 0;
  if (x === 0 && hasStart) return points[1];
  if (x === 1 && points.at(-2) === 1) return points[points.length - 1];
  let left = 0,
    lower = hasStart ? points[1] : 0;
  for (let i = hasStart ? 2 : 0; i < points.length; i += 2) {
    const right = points[i],
      upper = points[i + 1];
    if (x <= right)
      return lower + ((upper - lower) * (x - left)) / (right - left);
    left = right;
    lower = upper;
  }
  return lower + ((1 - lower) * (x - left)) / (1 - left);
}
