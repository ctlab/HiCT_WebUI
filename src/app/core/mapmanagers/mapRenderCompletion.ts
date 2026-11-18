import type Map from "ol/Map";

export const RENDER_COMPLETION_OL_VERSION = "9.1.0";

/** OpenLayers can discard the last obsolete queue entries after computing
 * frame readiness. No tile then changes state to request the final frame.
 * Poll only during its public loading lifecycle, and render only when both
 * the queue and layer renderers are idle. Never mark a tile/frame complete.
 */
export function watchMapRenderCompletion(map: Map): () => void {
  const renderer = map as unknown as {
    tileQueue_: { getCount(): number; getTilesLoading(): number };
    getLoadingOrNotReady(): boolean;
  };
  let timer: number | undefined;
  let disposed = false;
  const stop = () => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };
  const start = () => {
    if (disposed || timer !== undefined) return;
    timer = window.setInterval(() => {
      if (
        renderer.tileQueue_.getCount() === 0 &&
        renderer.tileQueue_.getTilesLoading() === 0 &&
        !renderer.getLoadingOrNotReady()
      )
        map.render();
    }, 100);
  };
  map.on("loadstart", start);
  map.on("loadend", stop);
  return () => {
    disposed = true;
    stop();
    map.un("loadstart", start);
    map.un("loadend", stop);
  };
}
