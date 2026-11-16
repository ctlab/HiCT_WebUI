import { complementBase } from "../visualization/sequenceStrands";

export type SequenceMeasurement = {
  axis: "horizontal" | "vertical";
  startBp: number;
  endBp: number;
  reverse: boolean;
  /** Frozen gapless bases in the selected strand's reading direction. */
  sequence: string;
};

/** Both pointer endpoints select whole letters, including a one-letter click. */
export function measureBases(
  bases: readonly { bp: number; base: string }[],
  anchor: number,
  focus: number,
  axis: SequenceMeasurement["axis"],
  reverse: boolean
): SequenceMeasurement | undefined {
  const startBp = Math.min(anchor, focus),
    endBp = Math.max(anchor, focus) + 1;
  const selected = bases.filter(
    (base) => base.bp >= startBp && base.bp < endBp
  );
  // Do not silently copy a discontinuous or stale viewport.
  if (
    selected.length !== endBp - startBp ||
    selected.some((b, i) => b.bp !== startBp + i)
  )
    return;
  const forward = selected.map((base) => base.base).join("");
  return {
    axis,
    startBp,
    endBp,
    reverse,
    sequence: reverse
      ? [...forward].reverse().map(complementBase).join("")
      : forward,
  };
}

export interface RepeatPeriodJob {
  jobId: string;
  status: "submitted" | "running" | "finished" | "failed" | "cancelled";
  error?: string;
  result?: {
    length: number;
    periodBp: number | null;
    copies: number | null;
    identity: number | null;
    comparedPairs: number;
    matches: number;
    ambiguousBases: number;
    compositionIdentity: number;
    method: string;
    message: string;
    startBp: number;
    endBp: number;
    snapshot: string;
    coordinateSystem: string;
    inputSha256: string;
    sourceFasta: string;
    sourceStamp: string;
  };
}
