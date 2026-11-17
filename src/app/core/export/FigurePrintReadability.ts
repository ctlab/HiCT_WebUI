import type { FrozenFigure } from "./FrozenFigure";
import { portableFigureScene } from "./FigureSnapshotDocument";

/** Smallest transformed vector text size, in captured pixels, without changing the scene. */
export function smallestFigureTextPx(figure: FrozenFigure): number | null {
  // Rebuild the allowlisted vocabulary before attaching anything to the DOM.
  const svg = portableFigureScene(figure);
  for (const image of Array.from(svg.querySelectorAll("image"))) image.remove();
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "0",
    top: "0",
    opacity: "0",
    pointerEvents: "none",
    contain: "strict",
    width: `${figure.width}px`,
    height: `${figure.height}px`,
  });
  host.setAttribute("aria-hidden", "true");
  if (!svg.hasAttribute("font-size")) svg.style.fontSize = "16px";
  host.appendChild(svg);
  document.body.appendChild(host);
  let smallest = Infinity;
  try {
    for (const text of Array.from(
      svg.querySelectorAll<SVGTextContentElement>("text, tspan")
    )) {
      // A tspan may override the parent size. Count only direct, nonblank text.
      if (
        !Array.from(text.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        )
      )
        continue;
      const style = getComputedStyle(text),
        matrix = text.getCTM();
      if (
        !matrix ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      )
        continue;
      const font = Number.parseFloat(style.fontSize);
      const size = font * Math.hypot(matrix.c, matrix.d);
      if (Number.isFinite(size) && size > 0)
        smallest = Math.min(smallest, size);
    }
  } finally {
    host.remove();
  }
  return Number.isFinite(smallest) ? smallest : null;
}

export function printedTextPoints(
  textPx: number,
  captureWidth: number,
  widthMm: number
): number {
  if (
    ![textPx, captureWidth, widthMm].every((n) => Number.isFinite(n) && n > 0)
  )
    throw Error("Invalid printed text dimensions.");
  return (textPx * widthMm * 72) / (25.4 * captureWidth);
}
