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
export const LOG_SLIDER_FLOOR_FRACTION = 1e-10;
const floorLog = Math.log10(LOG_SLIDER_FLOOR_FRACTION);
export type CurveMode = "smooth-value" | "smooth-log";

export function validatedCurveMode(raw: unknown): CurveMode | undefined {
  if (raw == null) return undefined;
  if (raw === "smooth-value" || raw === "smooth-log") return raw;
  throw new Error("Invalid color curve mode");
}

const clampFraction = (value: number) => Math.max(0, Math.min(1, value));

export function logarithmicPosition(fraction: number): number {
  const valueLog = Math.log10(Math.max(LOG_SLIDER_FLOOR_FRACTION, fraction));
  return clampFraction((valueLog - floorLog) / -floorLog);
}

export function valueFractionFromLog(position: number): number {
  return position <= 0 ? 0 : Math.pow(10, floorLog - clampFraction(position) * floorLog);
}
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

function legacyColorFraction(
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

export function colorFraction(fraction: number, gamma: number, points?: readonly number[], mode?: CurveMode): number {
  return mode ? prepareColorFraction(gamma, points, mode)(fraction) : legacyColorFraction(fraction, gamma, points);
}

/** Compute spline coefficients once for a tile or a histogram paint. */
export function prepareColorFraction(gamma: number, points?: readonly number[], mode?: CurveMode): (fraction: number) => number {
  if (!mode) return (fraction) => legacyColorFraction(fraction, gamma, points);
  const interpolate = smoothCurve(points);
  return mode === "smooth-log"
    ? (fraction) => interpolate(logarithmicPosition(fraction))
    : (fraction) => interpolate(clampFraction(fraction));
}

const smoothstep = (u: number) => u * u * (3 - 2 * u);

function secant(a: CurvePoint, b: CurvePoint): number {
  return Math.max(-Number.MAX_VALUE, Math.min(Number.MAX_VALUE, (b.y - a.y) / (b.x - a.x)));
}

function smoothCurve(points?: readonly number[]): (t: number) => number {
  const { start, end, interior } = curveParts(points);
  if (!interior.length) return (t) => start + (end - start) * t;
  const knots = [{ x: 0, y: start }, ...interior, { x: 1, y: end }];
  const slopes = knots.slice(1).map((point, index) => secant(knots[index], point));
  if (interior.length === 1) {
    const { x, y } = interior[0];
    const [left, right] = slopes;
    if (left !== 0 && right !== 0 && Math.sign(left) !== Math.sign(right)) {
      return (t) => t <= x
        ? start + (y - start) * smoothstep(t / x)
        : y + (end - y) * smoothstep((t - x) / (1 - x));
    }
    const steepest = Math.max(Math.abs(left), Math.abs(right));
    const a = 1.5 * (steepest / Math.abs(left));
    const b = 1.5 * (steepest / Math.abs(right));
    return (t) => t <= x
      ? left === 0 ? start : start + (y - start) * Math.pow(t / x, a)
      : right === 0 ? end : end - (end - y) * Math.pow((1 - t) / (1 - x), b);
  }
  // Fritsch–Carlson slopes, including flats, turns and zero slopes at both ends.
  const tangents = [0, ...interior.map((_, i) => Math.sign(slopes[i]) === Math.sign(slopes[i + 1])
    ? slopes[i] / 2 + slopes[i + 1] / 2 : 0), 0];
  slopes.forEach((slope, i) => {
    if (slope === 0) {
      tangents[i] = tangents[i + 1] = 0;
    } else {
      const norm = Math.hypot(tangents[i] / slope, tangents[i + 1] / slope);
      if (norm > 3) {
        tangents[i] *= 3 / norm;
        tangents[i + 1] *= 3 / norm;
      }
    }
  });
  return (t) => {
    let i = 0;
    while (i + 2 < knots.length && t > knots[i + 1].x) i++;
    const left = knots[i], right = knots[i + 1];
    const span = right.x - left.x;
    const u = (t - left.x) / span;
    const transition = smoothstep(u);
    const result = (1 - transition) * left.y + transition * right.y +
      u * (1 - u) * ((1 - u) * span * tangents[i] - u * span * tangents[i + 1]);
    return Math.max(Math.min(left.y, right.y), Math.min(Math.max(left.y, right.y), result));
  };
}
