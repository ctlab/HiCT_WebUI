import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { TrackOrientation } from "@/app/core/mapmanagers/LinearTrackManager";
import {
  copyText,
  formatLocus,
  type ContextMenuItem,
} from "@/app/core/mapmanagers/contextMenuActions";

export const OPEN_TRACK_MANAGER_EVENT = "hict:open-track-manager";

/** `contig:1000-1500`, or `contigA:900-contigB:100` across a contig border. */
function formatFeatureCoordinates(
  mapManager: ContactMapManager,
  startBp: number,
  endBp: number
): string {
  const holder = mapManager.getContigDimensionHolder();
  const first = holder.getContigLocusByBp(Math.max(0, startBp));
  const last = holder.getContigLocusByBp(Math.max(startBp, endBp - 1));
  // Positions are 1-based and inclusive, as in genome browsers.
  const from = first.inContigBp + 1;
  const to = last.inContigBp + 1;
  if (first.contigId === last.contigId) {
    return `${formatLocus(first.contigName, from)}-${to}`;
  }
  return `${formatLocus(first.contigName, from)}-${formatLocus(
    last.contigName,
    to
  )}`;
}

/**
 * Menu for a 1D track lane. `axisOffsetPx` runs along the track, `crossOffsetPx` across the lanes,
 * both relative to the track host, exactly as `getTrackHoverAt` expects.
 */
export function buildTrackContextMenu(
  mapManager: ContactMapManager,
  orientation: TrackOrientation,
  axisOffsetPx: number,
  crossOffsetPx: number,
  hideTrack: (trackId: string) => void
): { title: string; items: ContextMenuItem[] } {
  const tracks = mapManager.linearTrackManager;
  const hit = tracks.getTrackHoverAt(orientation, axisOffsetPx, crossOffsetPx);
  const lane = hit ?? tracks.getTrackLaneAt(orientation, crossOffsetPx);
  const items: ContextMenuItem[] = [];
  if (hit?.kind === "feature") {
    const name = hit.label ?? hit.featureType ?? hit.trackName;
    items.push(
      {
        label: "Center on feature",
        run: () =>
          tracks.centerOnFeature({
            key: `${hit.trackId}:${hit.startBp}-${hit.endBp}:${name}`,
            trackId: hit.trackId,
            trackName: hit.trackName,
            label: name,
            featureType: hit.featureType,
            strand: hit.strand,
            startBp: hit.startBp,
            endBp: hit.endBp,
            updatedAtMs: Date.now(),
          }),
      },
      {
        label: "Zoom to feature",
        disabled: !mapManager.networkManager.requestManager.hasLinkedFasta,
        run: () =>
          tracks.zoomToFeature({
            key: `${hit.trackId}:${hit.startBp}-${hit.endBp}:${name}`,
            trackId: hit.trackId,
            trackName: hit.trackName,
            label: name,
            featureType: hit.featureType,
            strand: hit.strand,
            startBp: hit.startBp,
            endBp: hit.endBp,
            updatedAtMs: Date.now(),
          }),
      },
      {
        label: "Copy feature name",
        run: () => void copyText(name, "Feature name"),
      },
      {
        label: "Copy coordinates",
        run: () =>
          void copyText(
            formatFeatureCoordinates(mapManager, hit.startBp, hit.endBp),
            "Coordinates"
          ),
      }
    );
    if (
      mapManager.networkManager.requestManager.sourceCapabilities.PRIMARY
        ?.sequenceScaleTiles === true
    ) {
      // Projected feature bounds are assembly BP, zero-based and half-open.
      // These are the lower/higher display boundaries on either biological strand.
      for (const [label, bp] of [
        ["Cut at feature start", hit.startBp],
        ["Cut at feature end", hit.endBp],
      ] as const) {
        const target = mapManager.eventManager.getExactCutTarget(bp);
        items.push({
          label,
          disabled: !target,
          title: target
            ? "Cut at this assembly boundary, retaining all sequence and original contact bins. Start/end follow the displayed assembly coordinates on either strand."
            : "Cuts are available inside editable contigs. Existing contig boundaries cannot be cut again.",
          run: () => {
            if (target) void mapManager.eventManager.cutAtExactTarget(target);
          },
        });
      }
    }
  }
  items.push(
    {
      label: "Hide track",
      disabled: !lane,
      run: () => {
        if (lane) hideTrack(lane.trackId);
      },
    },
    {
      label: "1D tracks…",
      run: () =>
        window.dispatchEvent(new CustomEvent(OPEN_TRACK_MANAGER_EVENT)),
    }
  );
  return { title: lane?.trackName ?? "Tracks", items };
}
