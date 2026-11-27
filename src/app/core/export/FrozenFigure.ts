import {
  figurePrintDimensions,
  printSizedPng,
  type FigurePrintOptions,
} from "./FigurePrintSize";

/** One rendered figure, reused for preview and every output format without rereading the map. */
export interface FrozenFigure {
  readonly svg: string;
  readonly png: Blob;
  readonly width: number;
  readonly height: number;
  readonly capturedAt: string;
}

async function rasterizePrintScene(
  svg: SVGSVGElement,
  width: number,
  height: number
): Promise<Blob> {
  const source = new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml",
  });
  const url = URL.createObjectURL(source);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(Error("The adjusted figure could not be rendered."));
      image.src = url;
    });
    canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(Error("PNG encoding failed.")),
        "image/png"
      )
    );
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
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
  progress?: (fraction: number) => void,
  printOptions?: FigurePrintOptions
): Promise<Blob> {
  if (!printOptions && format === "png") return figure.png;
  if (!printOptions && format === "svg")
    return new Blob([figure.svg], { type: "image/svg+xml" });
  const document = new DOMParser().parseFromString(figure.svg, "image/svg+xml");
  if (document.querySelector("parsererror"))
    throw Error("The captured figure could not be read.");
  const svg = document.documentElement as unknown as SVGSVGElement;
  const print = printOptions
    ? figurePrintDimensions(figure.width, figure.height, printOptions)
    : undefined;
  if (print) {
    const node = svg.querySelector("metadata");
    if (!node?.textContent)
      throw Error("The captured figure has no provenance.");
    const metadata = JSON.parse(node.textContent);
    metadata.outputSize = print;
    const requestedMinimum = printOptions?.minimumTextPoints;
    let adjustedText = false;
    if (requestedMinimum !== undefined) {
      const { applyMinimumPrintText } = await import(
        "./FigurePrintReadability"
      );
      adjustedText = applyMinimumPrintText(
        figure,
        svg,
        print.widthMm,
        requestedMinimum
      );
      metadata.outputSize.minimumTextPoints = requestedMinimum;
    }
    node.textContent = JSON.stringify(metadata);
    if (format === "png")
      return printSizedPng(
        adjustedText
          ? await rasterizePrintScene(svg, figure.width, figure.height)
          : figure.png,
        figure.width,
        print.widthMm,
        node.textContent
      );
    if (format === "svg") {
      svg.setAttribute("width", `${print.widthMm}mm`);
      svg.setAttribute("height", `${print.heightMm}mm`);
      return new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml",
      });
    }
  }
  // jsPDF silently caps larger pages at 14,400 points. Reject instead of
  // publishing a clipped figure; a column-width output usually avoids this.
  const pointsPerUnit = print ? 72 / 25.4 : 0.75;
  if (
    Math.max(print?.widthMm ?? figure.width, print?.heightMm ?? figure.height) *
      pointsPerUnit >
    14400
  )
    throw Error(
      "This PDF page is too large. Choose a column print size or capture a smaller area."
    );
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
    unit: print ? "mm" : "px",
    format: print
      ? [print.widthMm, print.heightMm]
      : [figure.width, figure.height],
    hotfixes: ["px_scaling"],
  });
  configurePdfTransparency(pdf);
  pdf.setProperties({ title: "HiCT figure", creator: "HiCT" });
  const metadata = svg.querySelector("metadata")?.textContent;
  if (metadata) pdf.addMetadata(metadata, "urn:hict:figure#");
  await embedPdfFonts(pdf);
  progress?.(0.25);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await renderSvgToPdf(
    pdf,
    svg,
    print?.widthMm ?? figure.width,
    print?.heightMm ?? figure.height
  );
  progress?.(1);
  return pdf.output("blob");
}
