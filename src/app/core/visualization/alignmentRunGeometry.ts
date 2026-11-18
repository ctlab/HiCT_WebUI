import type { AlignmentDetailSegment } from "../net/api/RequestManager";

/** Base-boundary vertices keep a run aligned even across nonuniform native fragment geometry. */
export function alignmentRunGeometry(
  segment: AlignmentDetailSegment,
  point: (column: number, row: number) => number[]
): number[][] {
  const { rowStart, rowEnd, columnStart, columnEnd, operation, reverse } =
    segment;
  if (
    ![rowStart, rowEnd, columnStart, columnEnd].every(
      (x) => Number.isSafeInteger(x) && x >= 0
    ) ||
    rowEnd < rowStart ||
    columnEnd < columnStart
  )
    throw Error("Invalid alignment bounds.");
  const rows = rowEnd - rowStart,
    columns = columnEnd - columnStart;
  if (rows > 4096 || columns > 4096)
    throw Error("Alignment run exceeds its bounded sequence window.");
  if (operation === "INSERTION" || operation === "DELETION") {
    if (
      (operation === "INSERTION" && (rows !== 0 || columns === 0)) ||
      (operation === "DELETION" && (columns !== 0 || rows === 0))
    )
      throw Error("Invalid alignment gap.");
    return [
      point(reverse ? columnEnd : columnStart, rowStart),
      point(reverse ? columnStart : columnEnd, rowEnd),
    ];
  }
  if (
    !["MATCH", "SUBSTITUTION", "AMBIGUOUS"].includes(operation) ||
    rows === 0 ||
    rows !== columns
  )
    throw Error("Invalid aligned run.");
  return Array.from({ length: rows + 1 }, (_, i) =>
    point(reverse ? columnEnd - i : columnStart + i, rowStart + i)
  );
}
