import { LOG_SLIDER_FLOOR_FRACTION } from "./colorMidpoint";

export type HistogramRange = { from: number; to: number };

export function histogramScale(domain: HistogramRange, logarithmic: boolean) {
  const span = domain.to - domain.from;
  const floorLog = Math.log10(LOG_SLIDER_FLOOR_FRACTION);
  const floor = domain.from + span * LOG_SLIDER_FLOOR_FRACTION;
  const minimum = logarithmic
    ? floor + Math.max(Math.abs(floor) * Number.EPSILON, Number.MIN_VALUE)
    : -Infinity;
  return {
    minimum,
    position(value: number): number {
      if (!logarithmic) return value;
      const fraction = Math.max(LOG_SLIDER_FLOOR_FRACTION, (value - domain.from) / span);
      return (Math.log10(fraction) - floorLog) / -floorLog;
    },
    value(position: number): number {
      if (!logarithmic) return position;
      if (position <= 0) return domain.from;
      if (position === 1) return domain.to;
      return domain.from + span * Math.pow(10, floorLog - position * floorLog);
    },
  };
}

export function validHistogramView(view: HistogramRange, minimum: number): boolean {
  return Number.isFinite(view.from) && Number.isFinite(view.to) &&
    view.from >= minimum && view.to > view.from && Number.isFinite(view.to - view.from);
}
