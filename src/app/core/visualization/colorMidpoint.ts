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
export function validatedCurve(raw: unknown): number[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw) || raw.length % 2 || raw.length > 128)
    throw Error("Invalid color curve");
  let previous = 0;
  for (let i = 0; i < raw.length; i += 2) {
    const x = raw[i],
      y = raw[i + 1];
    if (
      !Number.isFinite(x) ||
      !(x > previous && x < 1) ||
      !Number.isFinite(y) ||
      y < 0 ||
      y > 1
    )
      throw Error("Invalid color curve point");
    previous = x;
  }
  return [...raw];
}
export function colorFraction(
  fraction: number,
  gamma: number,
  points?: number[]
): number {
  const x = Math.max(0, Math.min(1, fraction));
  if (!points) return Math.pow(x, validateColorGamma(gamma));
  let left = 0,
    lower = 0;
  for (let i = 0; i < points.length; i += 2) {
    const right = points[i],
      upper = points[i + 1];
    if (x <= right)
      return lower + ((upper - lower) * (x - left)) / (right - left);
    left = right;
    lower = upper;
  }
  return lower + ((1 - lower) * (x - left)) / (1 - left);
}
