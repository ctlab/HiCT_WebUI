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
export const colorFraction = (fraction: number, gamma: number) =>
  Math.pow(Math.max(0, Math.min(1, fraction)), validateColorGamma(gamma));
