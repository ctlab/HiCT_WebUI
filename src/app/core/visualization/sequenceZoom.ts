/** Skip the uninformative zoom interval between a screen-sized contact bin and readable bases. */
export function sequenceZoomResolution(
  previous: number | undefined,
  requested: number,
  finestPixel: number,
  finestBp: number,
  viewport: number[]
): number {
  if (
    ![requested, finestPixel, finestBp, ...viewport].every(
      (n) => Number.isFinite(n) && n > 0
    )
  )
    return requested;
  const binFillsScreen = finestPixel / Math.max(1, Math.min(...viewport));
  const basesReadable = finestPixel / finestBp / 12;
  if (
    basesReadable >= binFillsScreen ||
    requested >= binFillsScreen * (1 - 1e-9) ||
    requested <= basesReadable * (1 + 1e-9)
  )
    return requested;
  return previous !== undefined && previous <= basesReadable * (1 + 1e-9)
    ? binFillsScreen
    : basesReadable;
}
