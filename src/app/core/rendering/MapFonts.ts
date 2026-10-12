/** The same licensed glyphs in Canvas, standalone SVG and editable PDF text. */
import regularWeb from "@/assets/fonts/DejaVuSans.woff2?url";
import boldWeb from "@/assets/fonts/DejaVuSans-Bold.woff2?url";
import monoWeb from "@/assets/fonts/DejaVuSansMono.woff2?url";
import regularPdf from "@/assets/fonts/DejaVuSans.ttf?url";
import boldPdf from "@/assets/fonts/DejaVuSans-Bold.ttf?url";
import monoPdf from "@/assets/fonts/DejaVuSansMono.ttf?url";
import type { jsPDF } from "jspdf";
const specs = [
  {
    family: "HiCT Sans",
    style: "normal",
    weight: "400",
    web: regularWeb,
    pdf: regularPdf,
  },
  {
    family: "HiCT Sans",
    style: "bold",
    weight: "700",
    web: boldWeb,
    pdf: boldPdf,
  },
  {
    family: "HiCT Mono",
    style: "normal",
    weight: "400",
    web: monoWeb,
    pdf: monoPdf,
  },
];
let fontsReady: Promise<void> | undefined;
export function ensureMapFonts(): Promise<void> {
  return (fontsReady ??= Promise.all(
    specs.map(async (spec) => {
      const face = new FontFace(spec.family, `url("${spec.web}")`, {
        weight: spec.weight,
      });
      await face.load();
      (
        document.fonts as FontFaceSet & { add(face: FontFace): FontFaceSet }
      ).add(face);
    })
  )
    .then(() => undefined)
    .catch((error) => {
      fontsReady = undefined;
      throw error;
    }));
}
const encoded = new Map<string, Promise<string>>();
function base64(url: string): Promise<string> {
  let result = encoded.get(url);
  if (!result) {
    result = fetch(url)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Could not load export font (${response.status}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let text = "";
        for (let i = 0; i < bytes.length; i += 8192)
          text += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(text);
      })
      .catch((error) => {
        encoded.delete(url);
        throw error;
      });
    encoded.set(url, result);
  }
  return result;
}
export async function embedSvgFonts(svg: SVGSVGElement): Promise<void> {
  const css = await Promise.all(
    specs.map(
      async (spec) =>
        `@font-face{font-family:"${
          spec.family
        }";font-style:normal;font-weight:${
          spec.weight
        };src:url(data:font/woff2;base64,${await base64(
          spec.web
        )}) format("woff2");}`
    )
  );
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = css.join("\n");
  svg.prepend(style);
}
export async function embedPdfFonts(pdf: jsPDF): Promise<void> {
  await Promise.all(
    specs.map(async (spec, i) => {
      const filename = `hict-export-${i}.ttf`;
      pdf.addFileToVFS(filename, await base64(spec.pdf));
      pdf.addFont(filename, spec.family, spec.style);
    })
  );
}

let pdfFontCollectionConfigured = false;
/** jsPDF 2.x writes the encoding name as the CID collection's Ordering.
 * Identity-H is an encoding; Adobe-Identity is the matching glyph collection.
 * Correct the font writer through its documented plugin hook, before offsets
 * are calculated, leaving embedded font bytes and Unicode mappings unchanged.
 */
export function configureMapPdfFonts(Pdf: typeof jsPDF): void {
  if (pdfFontCollectionConfigured) return;
  pdfFontCollectionConfigured = true;
  Pdf.API.events.push(["putFont", (options: {
    font: { fontName: string; encoding: string };
    out: (...lines: string[]) => unknown;
  }) => {
    if (!options.font.fontName.startsWith("HiCT ") || options.font.encoding !== "Identity-H") return;
    const write = options.out;
    options.out = (...lines) => write(...lines.map(line =>
      line === "/Ordering (Identity-H)" ? "/Ordering (Identity)" : line));
  }]);
}
