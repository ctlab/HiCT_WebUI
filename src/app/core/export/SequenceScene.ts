import type { ContactMapManager } from "../mapmanagers/ContactMapManager";
import type { SequenceAxisSegment } from "../visualization/sequenceTrackProjection";
import { captureCanvasScene } from "./CanvasScene";

export interface SequenceExportWindow {
  label: string;
  orientation: "horizontal" | "vertical";
  start: number;
  sequence: string;
  segments: readonly SequenceAxisSegment[];
  width: number;
  scrollLeft: number;
  bases: {
    letter: string;
    position: number;
    description: string;
    boundary: Record<string, string>;
  }[];
}
const colors: Record<string, string> = {
  A: "#16823b",
  C: "#1769c2",
  G: "#996600",
  T: "#c52a30",
};

/** Export the displayed sequence windows, including their horizontal scroll,
 * using vector recording for annotations, bases, separators and ruler labels.
 * No live DOM, map viewport, track cache or assembly coordinates are changed. */
export async function captureSequenceScene(
  manager: ContactMapManager,
  windows: readonly SequenceExportWindow[],
  metadata?: Record<string, unknown>,
  progress?: (value: number) => void
): Promise<{ svg: SVGSVGElement; canvas: HTMLCanvasElement }> {
  if (!windows.length || windows.some((w) => !w.sequence.length))
    throw new Error(
      "Wait for both sequence windows to finish loading before exporting."
    );
  const version = manager.networkManager.requestManager.history.applied;
  const current = () =>
    !manager.isDisposed &&
    manager.networkManager.requestManager.history.applied?.session ===
      version?.session &&
    manager.networkManager.requestManager.history.applied?.revision ===
      version?.revision;
  const root = document.createElement("div");
  const width = Math.max(
    ...windows.map((w) => Math.max(1, Math.ceil(w.width)))
  );
  Object.assign(root.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${width}px`,
    background: "#ffffff",
    pointerEvents: "none",
    zIndex: "-1",
  });
  root.setAttribute("aria-hidden", "true");
  root.dataset.hictSequenceExport = "true";
  document.body.append(root);
  const canvas = (parent: HTMLElement, w: number, h: number) => {
    const node = document.createElement("canvas");
    node.width = Math.max(1, Math.ceil(w));
    node.height = Math.max(1, Math.ceil(h));
    node.style.display = "block";
    parent.append(node);
    return node;
  };
  const surfaces = windows.map((window) => {
    const title = canvas(root, width, 32);
    const clip = document.createElement("div");
    Object.assign(clip.style, {
      width: `${window.width}px`,
      overflow: "hidden",
    });
    root.append(clip);
    const tracks = manager.linearTrackManager.getVisibleTracksForAxis(
      window.orientation
    );
    const length = window.sequence.length * 18;
    const annotations = tracks.length
      ? canvas(clip, length, tracks.length * 60)
      : undefined;
    const bases = canvas(clip, length, 58);
    for (const c of [annotations, bases])
      if (c) c.style.transform = `translateX(${-window.scrollLeft}px)`;
    return { window, title, annotations, bases };
  });
  try {
    await document.fonts.ready;
    progress?.(0.1);
    return await captureCanvasScene(
      root,
      async () => {
        for (const [index, surface] of surfaces.entries()) {
          if (!current())
            throw new Error(
              "The assembly changed while exporting sequence windows."
            );
          const { window, title, annotations, bases } = surface;
          const heading = title.getContext("2d")!;
          heading.fillStyle = "white";
          heading.fillRect(0, 0, title.width, title.height);
          heading.fillStyle = "#17212c";
          heading.font = "bold 14px 'HiCT Sans', sans-serif";
          heading.textBaseline = "middle";
          heading.fillText(
            `${window.label} · sequence ${window.start + 1}–${
              window.start + window.sequence.length
            } bp (including gaps)`,
            4,
            16
          );
          if (annotations) {
            const rendered =
              await manager.linearTrackManager.renderSequenceTracks(
                annotations,
                window.orientation,
                {
                  start: window.start,
                  end: window.start + window.sequence.length,
                  segments: window.segments,
                  isCurrent: current,
                },
                "horizontal"
              );
            if (!rendered || rendered.errors.length)
              throw new Error(
                rendered?.errors.join("; ") ||
                  "Sequence annotations changed during export. Try again."
              );
          }
          const context = bases.getContext("2d")!;
          context.fillStyle = "white";
          context.fillRect(0, 0, bases.width, bases.height);
          context.textAlign = "center";
          context.textBaseline = "middle";
          for (const [i, base] of window.bases.entries()) {
            const x = i * 18;
            if (base.letter === "N") {
              context.fillStyle = "#f0f1f2";
              context.fillRect(x, 4, 18, 21);
            }
            const border = base.boundary.borderLeft?.match(
              /^([\d.]+)px solid (.+)$/
            );
            if (border) {
              const borderWidth = Number(border[1]);
              if (base.boundary.boxShadow) {
                context.fillStyle = "rgba(0,0,0,0.9)";
                context.fillRect(x - 2, 3, borderWidth + 2, 23);
              }
              context.fillStyle = border[2];
              context.fillRect(x, 4, borderWidth, 21);
            }
            context.font = "bold 17px 'HiCT Mono', monospace";
            context.fillStyle = colors[base.letter] ?? "#626b74";
            context.fillText(
              base.letter,
              x + 9 + (border ? Number(border[1]) / 2 : 0),
              14.5
            );
          }
          context.strokeStyle = "#ccd4dc";
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(0, 28.5);
          context.lineTo(bases.width, 28.5);
          context.stroke();
          context.fillStyle = "#17212c";
          context.font = "11px 'HiCT Sans', sans-serif";
          context.textAlign = "left";
          context.textBaseline = "top";
          for (let i = 0; i < window.bases.length; i += 10)
            context.fillText(
              (window.bases[i].position + 1).toLocaleString(),
              i * 18,
              33
            );
          progress?.(0.2 + (0.5 * (index + 1)) / surfaces.length);
        }
        // Even windows containing only Ns must be checked against the current
        // assembly: they do not make an annotation query with its own guard.
        if (version) {
          const page =
            await manager.networkManager.requestManager.getAssemblyHistory();
          if (
            !current() ||
            page.summary?.session !== version.session ||
            page.summary?.revision !== version.revision
          )
            throw new Error(
              "The assembly changed in another client. Refresh it before exporting sequence windows."
            );
        }
      },
      {
        ...metadata,
        coordinateSystem: "padded-sequence",
        assembly: version,
        windows: windows.map((w) => ({
          label: w.label,
          startBp: w.start,
          endBp: w.start + w.sequence.length,
          scrollLeft: w.scrollLeft,
          viewportWidth: w.width,
          segments: w.segments,
        })),
      }
    );
  } finally {
    root.remove();
  }
}
