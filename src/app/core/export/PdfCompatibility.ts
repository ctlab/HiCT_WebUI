import type { jsPDF } from "jspdf";

/** Keep a PDF viewer from resampling a one-to-one raster into an extra pixel.
 *
 * Splash rounds an image's upper edge with floor(edge) + 1, even when the
 * edge is already integral. At 1:1 that adds a row/column and changes dense
 * heatmap texture. Inset each raster by 0.0001 SVG units (or less for tiny
 * images), below display/print precision, without moving any vector geometry.
 * Cairo and MuPDF retain the same raster pixels; SVG/PNG are left untouched.
 */
export function prepareSvgForPdf(source: SVGSVGElement): SVGSVGElement {
  const svg = source.cloneNode(true) as SVGSVGElement;
  for (const image of Array.from(svg.querySelectorAll("image"))) {
    const x = Number(image.getAttribute("x") ?? 0);
    const y = Number(image.getAttribute("y") ?? 0);
    const width = Number(image.getAttribute("width"));
    const height = Number(image.getAttribute("height"));
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error("Cannot export a raster with invalid PDF image bounds.");
    }
    const dx = Math.min(0.0001, width / 1_000_000);
    const dy = Math.min(0.0001, height / 1_000_000);
    image.setAttribute("x", String(x + dx));
    image.setAttribute("y", String(y + dy));
    image.setAttribute("width", String(width - 2 * dx));
    image.setAttribute("height", String(height - 2 * dy));
  }
  return svg;
}

/** Avoid svg2pdf's backtracking data-URI regex, which rejects large PNGs in WebKit. */
export async function renderSvgToPdf(
  pdf: jsPDF,
  source: SVGSVGElement,
  width: number,
  height: number
): Promise<void> {
  const svg = prepareSvgForPdf(source);
  const urls = new Map<string, string>();
  try {
    for (const image of Array.from(svg.querySelectorAll("image"))) {
      const data =
        image.getAttribute("href") ?? image.getAttribute("xlink:href");
      if (!data?.startsWith("data:image/png;base64,"))
        throw new Error(
          "PDF export requires an embedded PNG for each raster layer."
        );
      let url = urls.get(data);
      if (!url) {
        // Decode locally: Electron's connect-src deliberately excludes data:
        // requests, even though embedded image data are allowed by img-src.
        const binary = atob(data.slice("data:image/png;base64,".length));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) {
          bytes[index] = binary.charCodeAt(index);
        }
        const blob = new Blob([bytes], { type: "image/png" });
        url = URL.createObjectURL(blob);
        urls.set(data, url);
      }
      // svg2pdf infers the format of non-data URLs from their suffix. A fragment
      // supplies that hint without changing the blob resource being requested.
      image.setAttribute("href", `${url}#.png`);
      image.setAttributeNS(
        "http://www.w3.org/1999/xlink",
        "xlink:href",
        `${url}#.png`
      );
    }
    await pdf.svg(svg, { x: 0, y: 0, width, height });
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}

/** jsPDF 2.x defaults to PDF 1.3, but transparent PNG soft masks need 1.4. */
export function configurePdfTransparency(pdf: jsPDF): void {
  // jsPDF exposes this setter through __private__, not its TypeScript API.
  // Keep this small compatibility boundary covered by actual PDF rendering.
  const versionApi = pdf as unknown as {
    __private__: { setPdfVersion: (version: string) => void };
  };
  versionApi.__private__.setPdfVersion("1.4");
}
