/** Layout and base complement for the FASTA strip's optional reverse-strand row. */

const COMPLEMENT: Record<string, string> = {
  A: "T",
  T: "A",
  U: "A",
  C: "G",
  G: "C",
  R: "Y",
  Y: "R",
  K: "M",
  M: "K",
  B: "V",
  V: "B",
  D: "H",
  H: "D",
  S: "S",
  W: "W",
  N: "N",
};

/** IUPAC complement; unknown symbols (gaps, '*') are returned unchanged. */
export function complementBase(base: string): string {
  const upper = base.toUpperCase();
  const complement = COMPLEMENT[upper] ?? base;
  return base === upper ? complement : complement.toLowerCase();
}

export const SINGLE_STRAND_SIZE_PX = 32;
export const DOUBLE_STRAND_SIZE_PX = 56;

export function sequenceStripSize(showReverse: boolean): number {
  return showReverse ? DOUBLE_STRAND_SIZE_PX : SINGLE_STRAND_SIZE_PX;
}

export interface StrandRow {
  strand: "forward" | "reverse";
  /** Offset across the strip (y for the horizontal strip, x for the vertical one). */
  start: number;
  end: number;
  center: number;
}

/** Forward row first (top / left), reverse complement below (bottom / right). */
export function strandRows(showReverse: boolean): StrandRow[] {
  if (!showReverse)
    return [{ strand: "forward", start: 0, end: 32, center: 16 }];
  const half = DOUBLE_STRAND_SIZE_PX / 2;
  return [
    { strand: "forward", start: 0, end: half, center: half / 2 },
    {
      strand: "reverse",
      start: half,
      end: DOUBLE_STRAND_SIZE_PX,
      center: half + half / 2,
    },
  ];
}
