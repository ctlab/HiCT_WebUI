export type RulerInterval = {
  /** Assembly bp interval visible in this portion of the axis. */
  startBp: number;
  endBp: number;
  /** Assembly bp where the selected ruler coordinate system starts. */
  originBp: number;
};

export type RulerTick = {
  bp: number;
  screen: number;
  label: string;
  major: boolean;
};

const MAJOR_SPACING_PX = 92;
const MINOR_SPACING_PX = 14;

export function rulerMajorStep(bpPerPixel: number): number {
  if (!Number.isFinite(bpPerPixel) || bpPerPixel <= 0) return 1;
  const target = Math.max(1, bpPerPixel * MAJOR_SPACING_PX);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return (
    ([1, 2, 5, 10].find((multiple) => multiple * magnitude >= target) ?? 10) *
    magnitude
  );
}

export function rulerUnit(majorStep: number): { scale: number; label: string } {
  if (majorStep >= 1_000_000_000) return { scale: 1_000_000_000, label: "Gb" };
  if (majorStep >= 1_000_000) return { scale: 1_000_000, label: "Mb" };
  if (majorStep >= 1_000) return { scale: 1_000, label: "kb" };
  return { scale: 1, label: "bp" };
}

/**
 * Generate coordinates inside each visible sequence interval and project each
 * coordinate independently. Hidden sequence has no interval, so a tick never
 * interpolates across an assembly break.
 */
export function buildRulerTicks(
  intervals: readonly RulerInterval[],
  bpPerPixel: number,
  screenStart: number,
  screenEnd: number,
  projectBp: (bp: number) => number
): { ticks: RulerTick[]; unit: string } {
  const majorStep = rulerMajorStep(bpPerPixel);
  const minorStep =
    [majorStep / 5, majorStep / 2].find(
      (step) => Number.isInteger(step) && step >= bpPerPixel * MINOR_SPACING_PX
    ) ?? majorStep;
  const unit = rulerUnit(majorStep);
  const ticks: RulerTick[] = [];
  for (const { startBp, endBp, originBp } of intervals) {
    const first = Math.ceil((startBp - originBp) / minorStep);
    const end = Math.ceil((endBp - originBp) / minorStep);
    for (let index = first; index < end; index++) {
      const relativeBp = index * minorStep;
      const bp = originBp + relativeBp;
      const screen = projectBp(bp);
      if (
        !Number.isFinite(screen) ||
        screen < screenStart ||
        screen > screenEnd
      )
        continue;
      const major = relativeBp % majorStep === 0;
      ticks.push({
        bp,
        screen,
        major,
        label: major
          ? (relativeBp / unit.scale).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })
          : "",
      });
    }
  }
  return { ticks, unit: unit.label };
}
