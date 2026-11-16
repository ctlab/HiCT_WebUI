/** Selection coordinates are assembly BP, zero-based and half-open. */
export type RegionBounds = {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
};
export type SelectionContig = { name: string; start: number; length: number };
export type CoordinateConvention = "one-based" | "zero-based";

export function snapRegionBoundary(value: number, end: boolean): number {
  const nearest = Math.round(value);
  if (
    Math.abs(value - nearest) <=
    Math.max(1e-7, Math.abs(value) * Number.EPSILON * 4)
  )
    return nearest;
  return end ? Math.ceil(value) : Math.floor(value);
}

export function validateRegion(
  region: RegionBounds,
  domain: RegionBounds
): RegionBounds {
  for (const key of [
    "rowStart",
    "rowEnd",
    "columnStart",
    "columnEnd",
  ] as const) {
    if (!Number.isSafeInteger(region[key]))
      throw Error("Coordinates must be whole base-pair positions.");
  }
  if (
    region.rowStart < domain.rowStart ||
    region.rowEnd > domain.rowEnd ||
    region.columnStart < domain.columnStart ||
    region.columnEnd > domain.columnEnd
  )
    throw Error(
      "The region must lie within the current row and column scopes."
    );
  if (
    region.rowStart >= region.rowEnd ||
    region.columnStart >= region.columnEnd
  )
    throw Error("Each end must be after its start.");
  return { ...region };
}

/** Plain decimal positions or current-contig:position; never infer a source offset after edits. */
export function parseBoundary(
  text: string,
  end: boolean,
  convention: CoordinateConvention,
  contigs: SelectionContig[]
): number {
  const input = text.trim();
  const colon = input.lastIndexOf(":");
  const raw = colon < 0 ? input : input.slice(colon + 1).trim();
  if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(raw))
    throw Error("Use a whole position or contig:position.");
  const value = Number(raw.replaceAll(",", ""));
  if (!Number.isSafeInteger(value)) throw Error("The coordinate is too large.");
  const offset = convention === "one-based" && !end ? value - 1 : value;
  if (value < (convention === "one-based" ? 1 : 0))
    throw Error("The position is outside the selected coordinate convention.");
  if (colon < 0) return offset;
  const matches = contigs.filter(
    (contig) => contig.name === input.slice(0, colon).trim()
  );
  if (matches.length !== 1)
    throw Error(
      matches.length
        ? "This contig name is ambiguous. Use assembly positions."
        : "Unknown current contig name."
    );
  if (value > matches[0].length)
    throw Error("The position is beyond this contig.");
  return matches[0].start + offset;
}

export function parseRegion(
  fields: Record<keyof RegionBounds, string>,
  convention: CoordinateConvention,
  contigs: SelectionContig[],
  domain: RegionBounds
): RegionBounds {
  return validateRegion(
    {
      rowStart: parseBoundary(fields.rowStart, false, convention, contigs),
      rowEnd: parseBoundary(fields.rowEnd, true, convention, contigs),
      columnStart: parseBoundary(
        fields.columnStart,
        false,
        convention,
        contigs
      ),
      columnEnd: parseBoundary(fields.columnEnd, true, convention, contigs),
    },
    domain
  );
}
