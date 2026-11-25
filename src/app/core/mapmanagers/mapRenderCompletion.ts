import type Map from "ol/Map";

export const RENDER_COMPLETION_OL_VERSION = "9.1.0";

/** A frame drawn during a gesture can leave queued tiles without a transfer.
 * The next frame lets OpenLayers reprioritize the queue and update readiness
 * after obsolete entries are discarded. Poll only during the loading lifecycle
 * and request a frame only when the view, transfers and layer renderers are idle.
 */
export function watchMapRenderCompletion(map: Map): () => void {
  const renderer = map as unknown as {
    tileQueue_: { getTilesLoading(): number };
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
      const view = map.getView();
      if (
        !view.getAnimating() &&
        !view.getInteracting() &&
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
