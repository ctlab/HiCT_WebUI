/** Place a measured popover in the browser viewport, never in a clipped track. */
export function placeFloatingPanel(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number
): { left: number; top: number } {
  const margin = 12,
    offset = 16;
  const fit = (value: number, size: number, viewport: number) =>
    Math.max(
      margin,
      Math.min(value, Math.max(margin, viewport - size - margin))
    );
  const left =
    x + offset + width <= viewportWidth - margin
      ? x + offset
      : x - width - offset;
  const top =
    y + offset + height <= viewportHeight - margin
      ? y + offset
      : y - height - offset;
  return {
    left: fit(left, width, viewportWidth),
    top: fit(top, height, viewportHeight),
  };
}
