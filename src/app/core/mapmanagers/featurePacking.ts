/** Deterministic O(n log n) interval partitioning for feature-track lanes. */
export function packIntervalsIntoLanes<T>(
  values: T[],
  start: (value: T) => number,
  end: (value: T) => number
): { lanes: Map<T, number>; laneCount: number } {
  const ordered = [...values].sort(
    (a, b) => start(a) - start(b) || end(a) - end(b)
  );
  const active: Array<{ end: number; lane: number }> = [];
  const free: number[] = [];
  const lanes = new Map<T, number>();
  let laneCount = 0;
  const push = <V>(heap: V[], value: V, less: (a: V, b: V) => boolean) => {
    heap.push(value);
    for (let child = heap.length - 1; child > 0; ) {
      const parent = Math.floor((child - 1) / 2);
      if (!less(heap[child], heap[parent])) break;
      [heap[child], heap[parent]] = [heap[parent], heap[child]];
      child = parent;
    }
  };
  const pop = <V>(heap: V[], less: (a: V, b: V) => boolean): V | undefined => {
    if (!heap.length) return undefined;
    const first = heap[0];
    const last = heap.pop() as V;
    if (heap.length) {
      heap[0] = last;
      for (let parent = 0; ; ) {
        let child = parent * 2 + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++;
        if (!less(heap[child], heap[parent])) break;
        [heap[parent], heap[child]] = [heap[child], heap[parent]];
        parent = child;
      }
    }
    return first;
  };
  for (const value of ordered) {
    const begin = start(value);
    while (active.length && active[0].end <= begin) {
      const released = pop(
        active,
        (a, b) => a.end < b.end || (a.end === b.end && a.lane < b.lane)
      );
      if (released) push(free, released.lane, (a, b) => a < b);
    }
    const lane = pop(free, (a, b) => a < b) ?? laneCount++;
    lanes.set(value, lane);
    push(
      active,
      { end: Math.max(begin, end(value)), lane },
      (a, b) => a.end < b.end || (a.end === b.end && a.lane < b.lane)
    );
  }
  return { lanes, laneCount };
}
