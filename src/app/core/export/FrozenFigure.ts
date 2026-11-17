/** One rendered figure, reused for preview and every output format without rereading the map. */
export interface FrozenFigure {
  readonly svg: string;
  readonly png: Blob;
  readonly width: number;
  readonly height: number;
  readonly capturedAt: string;
}

export async function freezeFigureScene(
  scene: {
    svg: SVGSVGElement;
    canvas: HTMLCanvasElement;
  },
  capturedAt = new Date().toISOString()
): Promise<FrozenFigure> {
  const svg = scene.svg.cloneNode(true) as SVGSVGElement;
  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));
  if (
    ![width, height].every((value) => Number.isFinite(value) && value > 0) ||
    width * height > 64 * 1024 * 1024
  )
    throw Error("The figure exceeds the supported image dimensions.");
  const { embedSvgFonts } = await import("../rendering/MapFonts");
  await embedSvgFonts(svg);
  let png = await new Promise<Blob>((resolve, reject) =>
    scene.canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(Error("PNG encoding failed.")),
      "image/png"
    )
  );
  const metadata = svg.querySelector("metadata")?.textContent;
  if (metadata) {
    const { appendPngProvenance } = await import("./PngProvenance");
    png = await appendPngProvenance(png, metadata);
  }
  return Object.freeze({
    svg: new XMLSerializer().serializeToString(svg),
    png,
    width,
    height,
    capturedAt,
  });
}

/** Only receives HiCT captures or snapshots rebuilt through the strict scene validator. */
export async function encodeFrozenFigure(
  figure: FrozenFigure,
  format: "png" | "svg" | "pdf",
  progress?: (fraction: number) => void
): Promise<Blob> {
  if (format === "png") return figure.png;
  if (format === "svg")
    return new Blob([figure.svg], { type: "image/svg+xml" });
  const document = new DOMParser().parseFromString(figure.svg, "image/svg+xml");
  if (document.querySelector("parsererror"))
    throw Error("The captured figure could not be read.");
  const svg = document.documentElement as unknown as SVGSVGElement;
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");
  const { embedPdfFonts, configureMapPdfFonts } = await import(
    "../rendering/MapFonts"
  );
  const { renderSvgToPdf, configurePdfTransparency } = await import(
    "./PdfCompatibility"
  );
  configureMapPdfFonts(jsPDF);
  const pdf = new jsPDF({
    compress: true,
    orientation: figure.width >= figure.height ? "landscape" : "portrait",
    unit: "px",
    format: [figure.width, figure.height],
    hotfixes: ["px_scaling"],
  });
  configurePdfTransparency(pdf);
  pdf.setProperties({ title: "HiCT figure", creator: "HiCT" });
  const metadata = svg.querySelector("metadata")?.textContent;
  if (metadata) pdf.addMetadata(metadata, "urn:hict:figure#");
  await embedPdfFonts(pdf);
  progress?.(0.25);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await renderSvgToPdf(pdf, svg, figure.width, figure.height);
  progress?.(1);
  return pdf.output("blob");
}
