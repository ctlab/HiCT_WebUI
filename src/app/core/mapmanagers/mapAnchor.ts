/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Keeps the map's top-left corner against the top-left corner of the map area, next to the rulers.
 *
 * OpenLayers offers no public hook for a custom center constraint, so this is the one place that
 * reaches into the view: it wraps `view.constraints_.center` after every `applyOptions_`, which
 * rebuilds the constraints. `check-map-anchor.mjs` pins the OpenLayers version and the two private
 * names used here, so an upgrade fails the build until this adapter is checked again.
 *
 * Behaviour (map y grows downward as negative values, the origin is the map's top-left):
 *  - A map smaller than the area sits against the top-left corner. It is not centred.
 *  - A larger map can be panned across its whole extent, but never past its top or left edge.
 *  - A rotated view is not anchored: the visible area is no longer axis-aligned, so the plain
 *    OpenLayers constraint applies.
 */
import type View from "ol/View";
import type { Coordinate } from "ol/coordinate";
import type { Extent } from "ol/extent";

export const SUPPORTED_OL_VERSION = "9.1.0";

type CenterConstraint = (
  center: Coordinate | undefined,
  resolution: number,
  size: number[],
  isMoving?: boolean,
  centerShift?: number[]
) => Coordinate | undefined;

/** The only parts of an OpenLayers view this adapter touches, one of them private. */
interface ViewInternals {
  constraints_?: { center: CenterConstraint };
  applyOptions_: (
    options: { extent?: Extent } & Record<string, unknown>
  ) => void;
  getRotation: () => number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** The nearest center whose visible area stays at or below-right of the map's top-left corner. */
export function anchoredCenter(
  extent: Extent,
  center: Coordinate,
  resolution: number,
  size: number[]
): Coordinate {
  const [minX, minY, maxX, maxY] = extent;
  const width = size[0] * resolution;
  const height = size[1] * resolution;
  const left = clamp(center[0] - width / 2, minX, Math.max(minX, maxX - width));
  const top = clamp(
    center[1] + height / 2,
    Math.min(maxY, minY + height),
    maxY
  );
  return [left + width / 2, top - height / 2];
}

/**
 * Installs the anchor on a view and keeps it installed when the view rebuilds its constraints.
 * `isEnabled` is read on every constraint call, so toggling it needs no re-install.
 */
export function installTopLeftAnchor(
  view: View,
  initialExtent: Extent,
  isEnabled: () => boolean
): void {
  const target = view as unknown as ViewInternals;
  let extent = initialExtent;
  const wrap = (): void => {
    const constraints = target.constraints_;
    if (!constraints) return;
    const inner = constraints.center;
    constraints.center = (center, resolution, size, isMoving, centerShift) => {
      if (
        !center ||
        !isEnabled() ||
        target.getRotation() !== 0 ||
        !Number.isFinite(resolution) ||
        !size ||
        !(size[0] > 0 && size[1] > 0)
      )
        return inner(center, resolution, size, isMoving, centerShift);
      // The plain constraint first, so the extent rules it enforces still apply, then the anchor.
      const base = inner(center, resolution, size, isMoving, centerShift);
      return anchoredCenter(extent, base ?? center, resolution, size);
    };
  };
  const original = target.applyOptions_.bind(target);
  target.applyOptions_ = (options) => {
    if (Array.isArray(options?.extent) && options.extent.length === 4)
      extent = options.extent as Extent;
    original(options);
    wrap();
  };
  wrap();
}
