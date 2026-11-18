import type { FrozenFigure } from "./FrozenFigure";
import { crc32 } from "./PngProvenance";

export const MAX_FIGURE_SNAPSHOTS = 8;
export const MAX_SNAPSHOT_BYTES = 24 * 1024 * 1024;
const MAX_PIXELS = 64 * 1024 * 1024;
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/** A portable captured scene, not a recipe to query or rebuild the live map. */
export interface FigureSnapshotDocument {
  version: 1;
  id: string;
  name: string;
  capturedAt: string;
  width: number;
  height: number;
  svg: string;
  png: string;
  sceneCrc32: string;
}
export interface FigureSnapshot {
  readonly document: Readonly<FigureSnapshotDocument>;
  readonly figure: FrozenFigure;
}
function fail(message: string): never {
  throw Error(`Invalid figure snapshot: ${message}`);
}
function bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}
function checksum(text: string): string {
  return crc32(new TextEncoder().encode(text)).toString(16).padStart(8, "0");
}
export function snapshotDocumentBytes(
  document: FigureSnapshotDocument
): number {
  return bytes(JSON.stringify(document));
}

/** Cheap bounded validation also used by synchronous session parsing; decode happens before restore. */
export function validateFigureSnapshotDocuments(
  value: unknown
): asserts value is FigureSnapshotDocument[] {
  if (!Array.isArray(value) || value.length > MAX_FIGURE_SNAPSHOTS)
    fail(`expected at most ${MAX_FIGURE_SNAPSHOTS} snapshots`);
  const ids = new Set<string>();
  let total = 0,
    totalPixels = 0;
  for (const item of value) {
    if (!item || typeof item !== "object" || item.version !== 1)
      fail("unsupported snapshot version");
    if (
      typeof item.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) ||
      ids.has(item.id)
    )
      fail("invalid or duplicate ID");
    ids.add(item.id);
    if (
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 100 ||
      [...item.name].some((character) => character.charCodeAt(0) < 32)
    )
      fail("a name of 1–100 printable characters is required");
    if (
      typeof item.capturedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(item.capturedAt) ||
      !Number.isFinite(Date.parse(item.capturedAt))
    )
      fail("invalid capture time");
    if (
      ![item.width, item.height].every(
        (n) => Number.isSafeInteger(n) && n > 0 && n <= 32768
      ) ||
      item.width * item.height > MAX_PIXELS
    )
      fail("image dimensions exceed the supported limit");
    if (
      typeof item.svg !== "string" ||
      typeof item.png !== "string" ||
      item.svg.length > MAX_SNAPSHOT_BYTES ||
      item.png.length > MAX_SNAPSHOT_BYTES
    )
      fail("scene exceeds the storage limit");
    if (
      typeof item.sceneCrc32 !== "string" ||
      !/^[a-f0-9]{8}$/.test(item.sceneCrc32) ||
      item.sceneCrc32 !== checksum(item.svg)
    )
      fail("scene checksum mismatch");
    totalPixels += item.width * item.height;
    if (totalPixels > 2 * MAX_PIXELS)
      fail(
        "combined snapshot dimensions exceed the supported image budget; capture smaller areas"
      );
    total += snapshotDocumentBytes(item);
    if (total > MAX_SNAPSHOT_BYTES)
      fail(
        "saved snapshots exceed 24 MiB; remove a snapshot or capture a smaller area"
      );
  }
}

function decodePng(data: string): Uint8Array {
  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(data) ||
    data.length > MAX_SNAPSHOT_BYTES
  )
    fail("expected an embedded PNG");
  let raw: string;
  try {
    raw = atob(data.slice(22));
  } catch {
    return fail("invalid PNG encoding");
  }
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
/** Validate checksums and declared dimensions before handing compressed bytes to an image decoder. */
function inspectPng(
  data: string,
  maximumPixels: number
): { width: number; height: number; metadata?: string; blob: Blob } {
  const raw = decodePng(data),
    view = new DataView(raw.buffer);
  if (
    raw.length < 45 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => raw[i] === n)
  )
    fail("invalid PNG signature");
  let offset = 8,
    width = 0,
    height = 0,
    metadata: string | undefined,
    imageData = false,
    ended = false;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  while (offset < raw.length) {
    if (offset + 12 > raw.length) fail("truncated PNG chunk");
    const length = view.getUint32(offset),
      end = offset + length + 12;
    if (
      end > raw.length ||
      crc32(raw.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)
    )
      fail("PNG chunk checksum mismatch");
    const kind = String.fromCharCode(...raw.subarray(offset + 4, offset + 8));
    if (offset === 8) {
      if (kind !== "IHDR" || length !== 13) fail("missing PNG header");
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (
        !width ||
        !height ||
        width > 32768 ||
        height > 32768 ||
        width * height > maximumPixels
      )
        fail("embedded PNG dimensions exceed the supported limit");
    } else if (kind === "IHDR") fail("duplicate PNG header");
    if (["acTL", "fcTL", "fdAT"].includes(kind))
      fail("animated PNG is unsupported");
    if (kind === "IDAT") imageData = true;
    if (kind === "iTXt") {
      const payload = raw.subarray(offset + 8, end - 4),
        keyEnd = payload.indexOf(0);
      if (
        keyEnd >= 0 &&
        decoder.decode(payload.subarray(0, keyEnd)) === "HiCT provenance"
      ) {
        if (
          metadata !== undefined ||
          payload[keyEnd + 1] !== 0 ||
          payload[keyEnd + 2] !== 0
        )
          fail("unsupported or duplicate PNG provenance");
        let start = keyEnd + 3;
        for (let field = 0; field < 2; field++) {
          const separator = payload.indexOf(0, start);
          if (separator < 0) fail("truncated PNG provenance");
          start = separator + 1;
        }
        if (payload.length - start > 2 * 1024 * 1024)
          fail("PNG provenance exceeds the supported limit");
        metadata = decoder.decode(payload.subarray(start));
      }
    }
    offset = end;
    if (kind === "IEND") {
      if (length || offset !== raw.length || !imageData)
        fail("invalid PNG end");
      ended = true;
      break;
    }
  }
  if (!ended) fail("missing PNG end");
  return {
    width,
    height,
    metadata,
    blob: new Blob([raw], { type: "image/png" }),
  };
}

const numeric = new Set(
  "x y x1 y1 x2 y2 cx cy r rx ry width height opacity fill-opacity stroke-opacity stroke-width stroke-miterlimit stroke-dashoffset font-size textLength".split(
    " "
  )
);
const attributes = new Set(
  "viewBox transform d points fill stroke fill-rule clip-rule stroke-linejoin stroke-linecap stroke-dasharray text-anchor dominant-baseline font-family font-weight font-style lengthAdjust clip-path id clipPathUnits overflow data-hict-map-content data-hict-export-region".split(
    " "
  )
);
const tags = new Set(
  "svg metadata defs clipPath rect g text tspan path image line circle ellipse polyline polygon".split(
    " "
  )
);

/** Rebuild the tiny generated scene vocabulary. Imported markup never enters the application DOM. */
export function readSnapshotScene(
  source: string,
  width: number,
  height: number
): SVGSVGElement {
  if (
    bytes(source) > MAX_SNAPSHOT_BYTES ||
    /<!(?:DOCTYPE|ENTITY)|<\?/i.test(source)
  )
    fail("unsupported XML declaration");
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    parsed.querySelector("parsererror") ||
    parsed.documentElement.localName !== "svg"
  )
    fail("invalid SVG scene");
  const output = document.implementation.createDocument(SVG_NS, "svg", null);
  const ids = new Set<string>(),
    references: string[] = [];
  let count = 0,
    pixels = 0,
    metadataCount = 0;
  function clone(input: Element, depth: number): Element {
    if (++count > 50000 || depth > 80)
      fail("scene structure exceeds the supported limit");
    if (input.namespaceURI !== SVG_NS || !tags.has(input.localName))
      fail(`unsupported scene element ${input.localName}`);
    const node = output.createElementNS(SVG_NS, input.localName);
    for (const attribute of Array.from(input.attributes)) {
      const name = attribute.localName,
        value = attribute.value;
      if (attribute.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
      if (
        attribute.namespaceURI &&
        attribute.namespaceURI !== XLINK_NS &&
        !(
          attribute.namespaceURI === "http://www.w3.org/XML/1998/namespace" &&
          name === "space"
        )
      )
        fail("unsupported attribute namespace");
      if (name === "href" && input.localName === "image") {
        if (
          attribute.namespaceURI === XLINK_NS &&
          input.hasAttribute("href") &&
          input.getAttribute("href") !== value
        )
          fail("conflicting raster references");
        if (!input.hasAttribute("href") || !attribute.namespaceURI) {
          const image = inspectPng(value, MAX_PIXELS);
          pixels += image.width * image.height;
          if (pixels > 2 * MAX_PIXELS) fail("embedded raster budget exceeded");
        }
      } else if (
        name === "space" &&
        attribute.namespaceURI === "http://www.w3.org/XML/1998/namespace"
      ) {
        if (value !== "preserve") fail("unsupported text spacing");
      } else if (numeric.has(name)) {
        if (
          !/^[-+]?(?:[0-9]*\.)?[0-9]+(?:[eE][-+]?[0-9]+)?$/.test(value) ||
          !Number.isFinite(Number(value)) ||
          Math.abs(Number(value)) > 1e15
        )
          fail(`invalid numeric ${name}`);
      } else if (attributes.has(name)) {
        if (name === "id") {
          if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,100}$/.test(value) || ids.has(value))
            fail("invalid or duplicate scene ID");
          ids.add(value);
        } else if (name === "clip-path") {
          const match = /^url\(#([a-zA-Z][a-zA-Z0-9_.-]{0,100})\)$/.exec(value);
          if (!match) fail("only local clip references are supported");
          references.push(match[1]);
        } else if (name === "fill" || name === "stroke") {
          if (!/^(?:none|#[a-fA-F0-9]{3,8})$/.test(value))
            fail("unsupported scene paint");
        } else if (name === "transform") {
          if (
            !/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([0-9.eE+,\s-]+\)\s*)+$/.test(
              value
            )
          )
            fail("unsupported scene transform");
        } else if (
          name === "d" ||
          name === "points" ||
          name === "viewBox" ||
          name === "stroke-dasharray"
        ) {
          const pattern =
            name === "d"
              ? /^[MmLlHhVvCcSsQqTtAaZz0-9.eE+,\s-]*$/
              : /^(?:none|[0-9.eE+,\s-]+)$/;
          if (name === "stroke-dasharray" && value === "") {
            node.setAttribute(name, value);
            continue;
          }
          if (value.length > 2 * 1024 * 1024 || !pattern.test(value))
            fail(`invalid scene ${name}`);
        } else if (!/^[a-zA-Z0-9_\s'",.-]{0,160}$/.test(value))
          fail(`unsupported scene ${name}`);
      } else fail(`unsupported scene attribute ${attribute.name}`);
      if (attribute.namespaceURI)
        node.setAttributeNS(attribute.namespaceURI, attribute.name, value);
      else node.setAttribute(name, value);
    }
    if (input.localName === "metadata") {
      if (
        ++metadataCount > 1 ||
        depth !== 1 ||
        input.children.length ||
        bytes(input.textContent ?? "") > 2 * 1024 * 1024
      )
        fail("expected one root provenance record");
      let provenance;
      try {
        provenance = JSON.parse(input.textContent ?? "");
      } catch {
        return fail("invalid figure provenance");
      }
      if (provenance?.format !== "hict-figure" || provenance.version !== 1)
        fail("unsupported figure provenance");
      const pending: { value: unknown; depth: number }[] = [
        { value: provenance, depth: 0 },
      ];
      let values = 0;
      while (pending.length) {
        const { value, depth } = pending.pop()!;
        if (++values > 250000 || depth > 160)
          fail("provenance exceeds its nesting or value budget");
        if (typeof value === "number" && !Number.isFinite(value))
          fail("provenance contains a non-finite number");
        if (value && typeof value === "object") {
          const children = Object.values(value);
          if (values + pending.length + children.length > 250000)
            fail("provenance exceeds its value budget");
          for (const child of children)
            pending.push({ value: child, depth: depth + 1 });
        }
      }
    }
    for (const child of Array.from(input.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE)
        node.appendChild(clone(child as Element, depth + 1));
      else if (child.nodeType === Node.TEXT_NODE) {
        if (
          !["text", "tspan", "metadata"].includes(input.localName) &&
          child.textContent?.trim()
        )
          fail("unexpected scene text");
        node.appendChild(output.createTextNode(child.textContent ?? ""));
      } else fail("unsupported scene node");
    }
    return node;
  }
  const root = clone(parsed.documentElement, 0) as unknown as SVGSVGElement;
  if (
    Number(root.getAttribute("width")) !== width ||
    Number(root.getAttribute("height")) !== height ||
    root.getAttribute("viewBox") !== `0 0 ${width} ${height}`
  )
    fail("scene dimensions do not match the capture");
  if (metadataCount !== 1 || references.some((id) => !ids.has(id)))
    fail("missing provenance or local clip reference");
  return root;
}

export function portableFigureScene(figure: FrozenFigure): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(figure.svg, "image/svg+xml");
  if (parsed.querySelector("parsererror")) fail("invalid captured scene");
  // Use bundled fonts when reopening. No imported font program or CSS is retained.
  for (const style of Array.from(parsed.querySelectorAll("style")))
    style.remove();
  for (const element of Array.from(parsed.querySelectorAll("[style]"))) {
    if (!["text", "tspan"].includes(element.localName))
      fail("unsupported captured style");
    const probe = document.createElement("span");
    probe.style.cssText = element.getAttribute("style") ?? "";
    for (const [attribute, value] of [
      ["font-family", probe.style.fontFamily],
      ["font-size", probe.style.fontSize.replace(/px$/, "")],
      ["font-weight", probe.style.fontWeight],
      ["font-style", probe.style.fontStyle],
    ])
      if (value) element.setAttribute(attribute, value);
    element.setAttributeNS(
      "http://www.w3.org/XML/1998/namespace",
      "xml:space",
      "preserve"
    );
    element.removeAttribute("style");
  }
  const source = new XMLSerializer().serializeToString(parsed.documentElement);
  return readSnapshotScene(source, figure.width, figure.height);
}
export function portableFigureSvg(figure: FrozenFigure): string {
  return new XMLSerializer().serializeToString(portableFigureScene(figure));
}
async function pngData(blob: Blob): Promise<string> {
  const raw = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < raw.length; offset += 8192)
    binary += String.fromCharCode(...raw.subarray(offset, offset + 8192));
  return `data:image/png;base64,${btoa(binary)}`;
}
async function decodeImage(
  blob: Blob,
  width: number,
  height: number
): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth !== width || image.naturalHeight !== height)
      fail("decoded image dimensions differ");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function createFigureSnapshot(
  figure: FrozenFigure,
  name: string
): Promise<FigureSnapshot> {
  const scene = portableFigureScene(figure);
  const svg = new XMLSerializer().serializeToString(scene);
  const provenance = JSON.parse(scene.querySelector("metadata")!.textContent!);
  if (provenance.capturedAt !== figure.capturedAt) fail("capture times differ");
  const id = `figure-${Date.now().toString(36)}-${Array.from(
    crypto.getRandomValues(new Uint32Array(2)),
    (n) => n.toString(36)
  ).join("")}`;
  const record: FigureSnapshotDocument = {
    version: 1,
    id,
    name: name.trim(),
    capturedAt: figure.capturedAt,
    width: figure.width,
    height: figure.height,
    svg,
    png: await pngData(figure.png),
    sceneCrc32: checksum(svg),
  };
  validateFigureSnapshotDocuments([record]);
  return Object.freeze({ document: Object.freeze(record), figure });
}
/** Complete preflight before the session replacement request. No live map or DOM is changed. */
export async function restoreFigureSnapshots(
  value: unknown
): Promise<FigureSnapshot[]> {
  if (value === undefined) return [];
  validateFigureSnapshotDocuments(value);
  const prepared: FigureSnapshot[] = [];
  for (const item of value) {
    const svg = readSnapshotScene(item.svg, item.width, item.height);
    const provenance = JSON.parse(svg.querySelector("metadata")!.textContent!);
    if (provenance.capturedAt !== item.capturedAt) fail("capture times differ");
    const png = inspectPng(item.png, MAX_PIXELS);
    if (
      png.width !== item.width ||
      png.height !== item.height ||
      png.metadata !== svg.querySelector("metadata")?.textContent
    )
      fail("raster and vector provenance or dimensions differ");
    await decodeImage(png.blob, item.width, item.height);
    const { embedSvgFonts } = await import("../rendering/MapFonts");
    await embedSvgFonts(svg);
    const figure: FrozenFigure = Object.freeze({
      svg: new XMLSerializer().serializeToString(svg),
      png: png.blob,
      width: item.width,
      height: item.height,
      capturedAt: item.capturedAt,
    });
    prepared.push(
      Object.freeze({ document: Object.freeze({ ...item }), figure })
    );
  }
  return prepared;
}
