/** Selection coordinates are assembly BP, zero-based and half-open. */
import type { ContactMapManager } from "./ContactMapManager";

export type RegionBounds = {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
};
export type CoordinateReferenceInterval = {
  name: string;
  start: number;
  length: number;
};
export type CoordinateReferences = {
  contigs: CoordinateReferenceInterval[];
  scaffolds: CoordinateReferenceInterval[];
};
export type CoordinateFrame = "assembly" | "scaffold" | "contig";
export type CoordinateConvention = "one-based" | "zero-based";

export function getCoordinateReferences(
  manager: ContactMapManager
): CoordinateReferences {
  const contigs = manager.contigDimensionHolder;
  const scaffolds = manager.scaffoldHolder;
  return {
    contigs: contigs.contigDescriptors.map((descriptor, index) => ({
      name: descriptor.contigName,
      start: contigs.prefix_sum_bp[index],
      length: descriptor.contigLengthBp,
    })),
    scaffolds: Array.from(scaffolds.scaffoldTable.values()).flatMap(
      (descriptor) => {
        const borders = descriptor.scaffoldBordersBP;
        return borders
          ? [
              {
                name: descriptor.scaffoldName,
                start: borders.startBP,
                length: borders.endBP - borders.startBP,
              },
            ]
          : [];
      }
    ),
  };
}

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

/** Entity positions follow the current mapped orientation. Scaffold positions omit AGP padding. */
export function parseBoundary(
  text: string,
  end: boolean,
  convention: CoordinateConvention,
  references: CoordinateReferences,
  frame: CoordinateFrame = "assembly"
): number {
  const input = text.trim();
  const colon = input.lastIndexOf(":");
  const raw = colon < 0 ? input : input.slice(colon + 1).trim();
  if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(raw))
    throw Error(
      "Use a whole position, ctg:name:position or scf:name:position."
    );
  const value = Number(raw.replaceAll(",", ""));
  if (!Number.isSafeInteger(value)) throw Error("The coordinate is too large.");
  const offset = convention === "one-based" && !end ? value - 1 : value;
  if (value < (convention === "one-based" ? 1 : 0))
    throw Error("The position is outside the selected coordinate convention.");
  if (colon < 0) {
    if (frame !== "assembly")
      throw Error(`Include the ${frame} name before the position.`);
    return offset;
  }
  const subject = input.slice(0, colon).trim();
  if (subject === "assembly") return offset;
  const prefix = subject.slice(0, 4);
  const kind =
    prefix === "scf:"
      ? "scaffold"
      : prefix === "ctg:"
      ? "contig"
      : frame === "scaffold"
      ? "scaffold"
      : "contig";
  const name =
    prefix === "scf:" || prefix === "ctg:" ? subject.slice(4) : subject;
  const intervals =
    kind === "scaffold" ? references.scaffolds : references.contigs;
  const matches = intervals.filter((interval) => interval.name === name);
  if (matches.length !== 1)
    throw Error(
      matches.length
        ? `This ${kind} name is ambiguous. Use assembly positions.`
        : `Unknown current ${kind} name.`
    );
  if (value > matches[0].length)
    throw Error(`The position is beyond this ${kind}.`);
  return matches[0].start + offset;
}

export function formatBoundary(
  boundary: number,
  end: boolean,
  convention: CoordinateConvention,
  references: CoordinateReferences,
  frame: CoordinateFrame
): string {
  const value = boundary + (convention === "one-based" && !end ? 1 : 0);
  if (frame === "assembly") return String(value);
  const intervals =
    frame === "scaffold" ? references.scaffolds : references.contigs;
  const includedBase = boundary - Number(end);
  const containing = intervals.find(
    ({ start, length }) =>
      includedBase >= start && includedBase < start + length
  );
  if (
    !containing ||
    intervals.some(
      (interval) => interval !== containing && interval.name === containing.name
    )
  ) {
    return `assembly:${value}`;
  }
  const prefix = frame === "scaffold" ? "scf" : "ctg";
  return `${prefix}:${containing.name}:${value - containing.start}`;
}

export function parseRegion(
  fields: Record<keyof RegionBounds, string>,
  convention: CoordinateConvention,
  references: CoordinateReferences,
  domain: RegionBounds,
  frame: CoordinateFrame = "assembly"
): RegionBounds {
  return validateRegion(
    {
      rowStart: parseBoundary(
        fields.rowStart,
        false,
        convention,
        references,
        frame
      ),
      rowEnd: parseBoundary(fields.rowEnd, true, convention, references, frame),
      columnStart: parseBoundary(
        fields.columnStart,
        false,
        convention,
        references,
        frame
      ),
      columnEnd: parseBoundary(
        fields.columnEnd,
        true,
        convention,
        references,
        frame
      ),
    },
    domain
  );
}

/** Decode the clipboard formats produced by Copy coordinates for rectangles and entity ranges. */
export function parseCopiedRegion(
  text: string,
  references: CoordinateReferences,
  domain: RegionBounds
) {
  const [heading, ...lines] = text.trim().split(/\r?\n/);
  const header =
    /^(Assembly|Scaffold|Contig) coordinates \(bp, (1-based inclusive|0-based, end excluded)\)$/.exec(
      heading
    );
  if (!header)
    throw Error("Paste coordinates copied from HiCT, including their heading.");
  const frame = header[1].toLowerCase() as CoordinateFrame;
  const convention: CoordinateConvention =
    header[2] === "1-based inclusive" ? "one-based" : "zero-based";
  let rows: string[], columns: string[];
  if (lines.length === 1) {
    rows = columns = lines[0].split("\t");
  } else if (
    lines.length === 2 &&
    lines[0].startsWith("Rows\t") &&
    lines[1].startsWith("Columns\t")
  ) {
    rows = lines[0].split("\t").slice(1);
    columns = lines[1].split("\t").slice(1);
  } else throw Error("Expected one interval or labeled Rows and Columns.");
  if (rows.length !== 2 || columns.length !== 2)
    throw Error("Each axis needs a start and end.");
  const prefix = frame === "contig" ? "ctg:" : "scf:";
  for (const field of [...rows, ...columns]) {
    if (
      !field.startsWith("assembly:") &&
      (frame === "assembly" ? field.includes(":") : !field.startsWith(prefix))
    )
      throw Error("A coordinate does not match the copied frame.");
  }
  const bounds = parseRegion(
    {
      rowStart: rows[0],
      rowEnd: rows[1],
      columnStart: columns[0],
      columnEnd: columns[1],
    },
    convention,
    references,
    domain,
    frame
  );
  return { bounds, frame, convention };
}
