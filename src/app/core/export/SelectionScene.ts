/** Crop a captured map and its aligned rulers/tracks without rasterizing vectors. */
export function cropSelectionScene(
  scene: { svg: SVGSVGElement; canvas: HTMLCanvasElement },
  crop: { left: number; top: number; width: number; height: number; marginLeft: number; marginTop: number }
): { svg: SVGSVGElement; canvas: HTMLCanvasElement } {
  const { left, top, width, height, marginLeft, marginTop } = crop;
  if (![left, top, width, height, marginLeft, marginTop].every(Number.isFinite) || width <= 0 || height <= 0 ||
      left < marginLeft || top < marginTop || marginLeft < 0 || marginTop < 0 ||
      left + width > scene.canvas.width + 1 || top + height > scene.canvas.height + 1)
    throw new Error("Selected region is outside the rendered export scene");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("xmlns", ns);
  svg.setAttribute("width", String(marginLeft + width));
  svg.setAttribute("height", String(marginTop + height));
  svg.setAttribute("viewBox", `0 0 ${marginLeft + width} ${marginTop + height}`);
  const defs = document.createElementNS(ns, "defs");
  const id = `hict-selection-${crypto.randomUUID()}`;
  svg.append(defs);
  let copyIndex = 0;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(marginLeft + width); canvas.height = Math.ceil(marginTop + height);
  const context = canvas.getContext("2d")!;
  for (const [sx, sy, w, h, dx, dy] of [
    [0, 0, marginLeft, marginTop, 0, 0],
    [left, 0, width, marginTop, marginLeft, 0],
    [0, top, marginLeft, height, 0, marginTop],
    [left, top, width, height, marginLeft, marginTop],
  ]) {
    if (w <= 0 || h <= 0) continue;
    const clip = document.createElementNS(ns, "clipPath");
    const clipId = `${id}-clip-${dx}-${dy}`;
    clip.id = clipId; clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    const rectangle = document.createElementNS(ns, "rect");
    for (const [key, value] of Object.entries({ x: dx, y: dy, width: w, height: h })) rectangle.setAttribute(key, String(value));
    clip.append(rectangle); defs.append(clip);
    const tile = document.createElementNS(ns, "g"); tile.setAttribute("clip-path", `url(#${clipId})`);
    const shifted = document.createElementNS(ns, "g"); shifted.setAttribute("transform", `translate(${dx - sx} ${dy - sy})`);
    // svg2pdf.js does not consistently transform referenced groups with nested
    // clips. Explicit vector copies avoid that bug; each copy needs unique IDs.
    const copy = document.createElementNS(ns, "g");
    for (const child of Array.from(scene.svg.childNodes)) copy.append(child.cloneNode(true));
    const ids = new Map<string, string>();
    const prefix = `${id}-copy-${copyIndex++}-`;
    for (const element of Array.from(copy.querySelectorAll("[id]"))) {
      const old = element.id, next = prefix + old; ids.set(old, next); element.id = next;
    }
    for (const element of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
      for (const attribute of Array.from(element.attributes)) {
        let value = attribute.value.replace(/url\(#([^)]*)\)/g, (all, old) => ids.has(old) ? `url(#${ids.get(old)})` : all);
        if ((attribute.name === "href" || attribute.name === "xlink:href") && value.startsWith("#") && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
        element.setAttribute(attribute.name, value);
      }
    }
    shifted.append(copy); tile.append(shifted); svg.append(tile);
    context.drawImage(scene.canvas, sx, sy, w, h, dx, dy, w, h);
  }
  return { svg, canvas };
}
