import { freezeFigureScene, type FrozenFigure } from "./FrozenFigure";
import { portableFigureScene } from "./FigureSnapshotDocument";

const NS = "http://www.w3.org/2000/svg";
export type FigureComparisonLayout = "horizontal" | "vertical";
export async function compareCapturedFigures(
  panels: readonly [
    { figure: FrozenFigure; label: string; snapshotId?: string },
    { figure: FrozenFigure; label: string; snapshotId?: string }
  ],
  layout: FigureComparisonLayout,
  signal?: AbortSignal
): Promise<FrozenFigure> {
  signal?.throwIfAborted();
  const panelWidths = panels.map((panel) => Math.max(240, panel.figure.width));
  const padding = 24,
    caption = 64,
    gap = 24;
  if (!["horizontal", "vertical"].includes(layout))
    throw Error("Choose a supported comparison layout.");
  if (panels.some((panel) => !panel.label.trim() || panel.label.length > 100))
    throw Error("Panel labels must contain 1–100 characters.");
  const width =
    layout === "horizontal"
      ? panelWidths[0] + panelWidths[1] + padding * 2 + gap
      : Math.max(...panelWidths) + padding * 2;
  const height =
    layout === "horizontal"
      ? Math.max(...panels.map((p) => p.figure.height)) + caption + padding
      : panels[0].figure.height +
        panels[1].figure.height +
        caption * 2 +
        padding +
        gap;
  if (width > 32768 || height > 32768 || width * height > 64 * 1024 * 1024)
    throw Error(
      "The comparison exceeds the supported figure dimensions. Capture smaller areas."
    );
  const { ensureMapFonts } = await import("../rendering/MapFonts");
  await ensureMapFonts();
  signal?.throwIfAborted();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw Error("The comparison drawing surface is unavailable.");
  const svg = document.createElementNS(NS, "svg");
  for (const [key, value] of Object.entries({
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
  }))
    svg.setAttribute(key, String(value));
  const background = document.createElementNS(NS, "rect");
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", "#ffffff");
  svg.appendChild(background);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const capturedAt = new Date().toISOString();
  const records: Record<string, unknown>[] = [];
  for (let index = 0; index < panels.length; index++) {
    const panel = panels[index];
    const scene = portableFigureScene(panel.figure);
    const metadata = JSON.parse(scene.querySelector("metadata")!.textContent!);
    scene.querySelector("metadata")!.remove();
    // IDs are document-wide even inside a nested SVG. Avoid cross-panel clipping collisions.
    for (const element of [scene, ...Array.from(scene.querySelectorAll("*"))]) {
      const id = element.getAttribute("id");
      if (id) element.setAttribute("id", `panel${index}-${id}`);
      const clip = element.getAttribute("clip-path");
      if (clip)
        element.setAttribute(
          "clip-path",
          clip.replace("url(#", `url(#panel${index}-`)
        );
    }
    const x =
      layout === "horizontal" && index === 1
        ? padding + panelWidths[0] + gap
        : padding;
    const y =
      layout === "vertical" && index === 1
        ? caption * 2 + panels[0].figure.height + gap
        : caption;
    scene.setAttribute("overflow", "hidden");
    scene.setAttribute("x", String(x));
    scene.setAttribute("y", String(y));
    svg.appendChild(scene);
    context.font = 'bold 16px "HiCT Sans"';
    let label = panel.label.trim();
    while (
      label.length > 1 &&
      context.measureText(label).width > panelWidths[index]
    )
      label = label.slice(0, -2) + "…";
    for (const [text, font, size, baseline] of [
      [label, "bold", 16, y - 30],
      [panel.figure.capturedAt, "normal", 11, y - 12],
    ] as const) {
      const node = document.createElementNS(NS, "text");
      for (const [key, value] of Object.entries({
        x,
        y: baseline,
        "font-family": "HiCT Sans",
        "font-size": size,
        "font-weight": font,
        fill: "#172033",
      }))
        node.setAttribute(key, String(value));
      node.textContent = text;
      svg.appendChild(node);
      context.font = `${font} ${size}px "HiCT Sans"`;
      context.fillStyle = "#172033";
      context.fillText(text, x, baseline);
    }
    const url = URL.createObjectURL(panel.figure.png);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      signal?.throwIfAborted();
      context.drawImage(image, x, y);
    } finally {
      URL.revokeObjectURL(url);
    }
    records.push({
      label: panel.label.trim(),
      snapshotId: panel.snapshotId ?? null,
      capturedAt: panel.figure.capturedAt,
      width: panel.figure.width,
      height: panel.figure.height,
      offset: { x, y },
      provenance: metadata,
    });
  }
  const metadata = document.createElementNS(NS, "metadata");
  metadata.textContent = JSON.stringify({
    format: "hict-figure",
    version: 1,
    capturedAt,
    comparison: { layout, pixelScale: 1, panels: records },
  });
  svg.prepend(metadata);
  signal?.throwIfAborted();
  const result = await freezeFigureScene({ svg, canvas }, capturedAt);
  canvas.width = canvas.height = 0;
  signal?.throwIfAborted();
  return result;
}
