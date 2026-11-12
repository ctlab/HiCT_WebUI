import type { TrackBinResponse } from "../net/api/response";

/** A slice of the padded sequence axis. Original FASTA strand is already applied
 * by the server's assembly projection; this mapping must not reverse it again. */
export interface SequenceAxisSegment {
  start: number;
  end: number;
  assemblyStart: number | null;
  gap: boolean;
}

/** Keep assembly bp for provenance and use explicit projected pixel coordinates
 * for drawing. Each output piece belongs to real sequence, never a synthetic N.
 * Splitting at gaps also splits exon/coding blocks, preventing drawn bridges. */
export function projectSequenceTrackBins(
  bins: readonly TrackBinResponse[],
  segments: readonly SequenceAxisSegment[]
): TrackBinResponse[] {
  const result: TrackBinResponse[] = [];
  for (const segment of segments) {
    if (segment.gap || segment.assemblyStart === null) continue;
    const assemblyStart = segment.assemblyStart;
    const assemblyEnd = assemblyStart + segment.end - segment.start;
    const project = (bp: number) => segment.start + bp - assemblyStart;
    for (const bin of bins) {
      const start = Math.max(assemblyStart, bin.startBp);
      const end = Math.min(assemblyEnd, bin.endBp);
      if (!(end > start)) continue;
      const codingStart = Math.max(start, bin.thickStartBp ?? end);
      const codingEnd = Math.min(end, bin.thickEndBp ?? start);
      result.push({
        ...bin,
        startBp: start,
        endBp: end,
        startPx: project(start),
        endPx: project(end),
        thickStartBp: codingEnd > codingStart ? codingStart : null,
        thickEndBp: codingEnd > codingStart ? codingEnd : null,
        thickStartPx: codingEnd > codingStart ? project(codingStart) : null,
        thickEndPx: codingEnd > codingStart ? project(codingEnd) : null,
        blocks: (bin.blocks ?? []).flatMap((block) => {
          const left = Math.max(start, block.startBp);
          const right = Math.min(end, block.endBp);
          return right > left
            ? [
                {
                  ...block,
                  startBp: left,
                  endBp: right,
                  startPx: project(left),
                  endPx: project(right),
                },
              ]
            : [];
        }),
        attributes: {
          ...bin.attributes,
          "Sequence coordinates": `${project(start) + 1}–${project(
            end
          )} (including gaps)`,
        },
      });
    }
  }
  return result;
}
