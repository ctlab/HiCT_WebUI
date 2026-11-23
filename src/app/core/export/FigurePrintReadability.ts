import type { FrozenFigure } from "./FrozenFigure";
import { portableFigureScene } from "./FigureSnapshotDocument";

/** Smallest transformed vector text size, in captured pixels, without changing the scene. */
export function smallestFigureTextPx(figure: FrozenFigure): number | null {
  let smallest = Infinity;
  forEachFigureText(figure, (_index, size) => {
    smallest = Math.min(smallest, size);
  });
  return Number.isFinite(smallest) ? smallest : null;
}

function forEachFigureText(
  figure: FrozenFigure,
  visit: (index: number, captureSize: number, fontSize: number) => void
): void {
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
  try {
    const rootTransform = svg.getScreenCTM()?.inverse();
    const texts = Array.from(
      svg.querySelectorAll<SVGTextContentElement>("text, tspan")
    );
    for (const [index, text] of texts.entries()) {
      // A tspan may override the parent size. Count only direct, nonblank text.
      if (
        !Array.from(text.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        )
      )
        continue;
      const style = getComputedStyle(text),
        screenTransform = text.getScreenCTM(),
        matrix =
          rootTransform && screenTransform
            ? rootTransform.multiply(screenTransform)
            : null;
      if (
        !matrix ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      )
        continue;
      const font = Number.parseFloat(style.fontSize);
      const size = font * Math.hypot(matrix.c, matrix.d);
      if (Number.isFinite(size) && size > 0) visit(index, size, font);
    }
  } finally {
    host.remove();
  }
}

/** Enlarge only the vector labels below the requested printed size. */
export function applyMinimumPrintText(
  figure: FrozenFigure,
  output: SVGSVGElement,
  widthMm: number,
  minimumPoints: number
): boolean {
  if (
    !Number.isFinite(minimumPoints) ||
    minimumPoints < 1 ||
    minimumPoints > 36
  )
    throw Error("Choose a label size from 1 to 36 pt.");
  const minimumPx = minimumPoints / printedTextPoints(1, figure.width, widthMm);
  const texts = output.querySelectorAll<SVGTextContentElement>("text, tspan");
  let changed = false;
  forEachFigureText(figure, (index, captureSize, fontSize) => {
    if (captureSize >= minimumPx || !texts[index]) return;
    texts[index].style.fontSize = `${(fontSize * minimumPx) / captureSize}px`;
    changed = true;
  });
  return changed;
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
