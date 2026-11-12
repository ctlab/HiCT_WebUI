import { ColorTranslator } from "colortranslator";

/** SVG 1.1 readers (including Inkscape) need alpha separate from paint colors. */
export function prepareSvgForEditors(svg: SVGSVGElement): void {
  for (const element of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
    const font = element.getAttribute("font-family");
    if (font?.includes("HiCT Sans"))
      element.setAttribute("font-family", `${font}, 'DejaVu Sans', sans-serif`);
    else if (font?.includes("HiCT Mono"))
      element.setAttribute(
        "font-family",
        `${font}, 'DejaVu Sans Mono', monospace`
      );
    for (const paint of ["fill", "stroke"] as const) {
      const value = element.getAttribute(paint);
      if (!value || value === "none" || value.startsWith("url(")) continue;
      const color = new ColorTranslator(value);
      const opacity = Number(element.getAttribute(`${paint}-opacity`) ?? 1);
      element.setAttribute(paint, color.HEX);
      element.setAttribute(`${paint}-opacity`, String(opacity * color.A));
    }
    if (element.tagName === "image") {
      const href = element.getAttribute("href");
      if (href)
        element.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "xlink:href",
          href
        );
    }
  }
}
