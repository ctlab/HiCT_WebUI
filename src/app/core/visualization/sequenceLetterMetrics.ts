export const SEQUENCE_LETTER_FONT = "bold 14px 'HiCT Sans', sans-serif";

/** Match letter visibility to the actual loaded axis font in CSS pixels. */
export function sequenceLetterMinimumPixels(): number {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 13;
  context.font = SEQUENCE_LETTER_FONT;
  const width = Math.max(
    ...["A", "C", "G", "T", "N", "W"].map(
      (base) => context.measureText(base).width
    )
  );
  return (width > 0 ? width : 10) + 3;
}
