/** User palette preferences for the two derived views. No source or session data. */
export type DisplayPalette = {
  min: number;
  max: number;
  startColor: string;
  endColor: string;
  gamma?: number;
};
type Mode = "EXPECTED" | "OBSERVED_OVER_EXPECTED";
const key = "hict.display.palettes.v1";
const memory: Partial<Record<Mode, DisplayPalette>> = {};
function valid(value: unknown): value is DisplayPalette {
  if (!value || typeof value !== "object") return false;
  const p = value as DisplayPalette;
  return (
    Number.isFinite(p.min) &&
    Number.isFinite(p.max) &&
    p.max > p.min &&
    (p.gamma === undefined ||
      (Number.isFinite(p.gamma) && p.gamma >= 0.05 && p.gamma <= 100)) &&
    [p.startColor, p.endColor].every(
      (c) => typeof c === "string" && /^#[\da-f]{8}$/i.test(c)
    )
  );
}
export function rememberDisplayPalette(
  mode: Mode,
  palette: DisplayPalette
): void {
  if (!valid(palette)) return;
  memory[mode] = { ...palette };
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
    const values =
      stored && typeof stored === "object" && !Array.isArray(stored)
        ? stored
        : {};
    localStorage.setItem(key, JSON.stringify({ ...values, [mode]: palette }));
  } catch {
    /* In-memory preferences still work in a restricted browser. */
  }
}
export function recalledDisplayPalette(mode: Mode): DisplayPalette | undefined {
  if (memory[mode]) return { ...memory[mode]! };
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (valid(stored?.[mode])) return { ...stored[mode] };
  } catch {
    /* A missing/corrupt preference must not prevent switching views. */
  }
  return memory[mode] ? { ...memory[mode]! } : undefined;
}
