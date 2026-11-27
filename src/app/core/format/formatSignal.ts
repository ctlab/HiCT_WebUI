const SUPERSCRIPT: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** Value for labels and unfocused inputs. */
export function formatSignal(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? "−∞" : "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1000) return Math.round(value).toLocaleString("en-US");
  if (abs < 0.001) {
    const [mantissa, exponent] = value.toExponential(1).split("e");
    const exp = String(Number(exponent)).replace(
      /./g,
      (c) => SUPERSCRIPT[c] ?? c
    );
    return `${mantissa} × 10${exp}`;
  }
  return Number(value.toPrecision(3)).toString();
}

/** Compact form for histogram axes and tick labels: 12.5 k, 3.2 M. */
export function formatSignalCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${Number((value / 1e6).toPrecision(3))} M`;
  if (abs >= 1e3) return `${Number((value / 1e3).toPrecision(3))} k`;
  return formatSignal(value);
}

/** Base-pair coordinates in labels: integer with thousands separators. */
export function formatBp(bp: number): string {
  return Math.round(bp).toLocaleString("en-US");
}

/** Base-pair coordinates for "Copy coordinates": plain integers, no separators (advisor item 9). */
export function copyBp(bp: number): string {
  return String(Math.round(bp));
}

/** Genomic lengths: 910.7 kb, 1.45 Mb, 850 bp. */
export function formatLength(bp: number): string {
  if (bp >= 1e6) return `${Number((bp / 1e6).toPrecision(3))} Mb`;
  if (bp >= 1e3) return `${Number((bp / 1e3).toPrecision(4))} kb`;
  return `${Math.round(bp)} bp`;
}
