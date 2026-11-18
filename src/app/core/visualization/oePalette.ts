import { ColorTranslator } from "colortranslator";
import type { DisplayPalette } from "./displayPaletteMemory";

export const OE_PALETTE_PRESETS = [
  {
    id: "blue-red",
    label: "Blue–white–red",
    startColor: "#2166acff",
    endColor: "#b2182bff",
  },
  {
    id: "purple-green",
    label: "Purple–white–green",
    startColor: "#762a83ff",
    endColor: "#1b7837ff",
  },
] as const;

/** Strict user-facing contract; legacy server fallbacks remain readable. */
export function parseOePalette(value: unknown): DisplayPalette {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Choose an O/E palette.");
  const p = value as DisplayPalette;
  if (
    !Number.isFinite(p.min) ||
    !Number.isFinite(p.max) ||
    !(p.min > 0 && p.min < 1 && p.max > 1)
  )
    throw new Error("O/E limits must satisfy 0 < lower < 1 < upper.");
  if (typeof p.startColor !== "string" || typeof p.endColor !== "string")
    throw new Error("Choose both endpoint colors.");
  try {
    return {
      min: p.min,
      max: p.max,
      startColor: new ColorTranslator(p.startColor, { legacyCSS: true }).HEXA,
      endColor: new ColorTranslator(p.endColor, { legacyCSS: true }).HEXA,
    };
  } catch {
    throw new Error("Choose valid endpoint colors.");
  }
}
export function oePalettePresetId(start: string, end: string): string {
  return (
    OE_PALETTE_PRESETS.find(
      (p) =>
        p.startColor === start.toLowerCase() && p.endColor === end.toLowerCase()
    )?.id ?? "custom"
  );
}
