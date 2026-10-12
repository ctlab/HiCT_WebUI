/** Records a requested render, using the application's own Canvas drawing commands.
 * Installed only while exporting: normal map and track rendering incur no recording cost.
 * Heatmap images remain raster; paths and text remain editable SVG elements.
 */
const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string | number> = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, String(value));
  return node;
};
let sequence = 0;
const matrix = (m: DOMMatrix) =>
  `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
const equal = (a: DOMMatrix, b: DOMMatrix) =>
  ["a", "b", "c", "d", "e", "f"].every((k) => a[k as "a"] === b[k as "a"]);
class Scene {
  vectorPaint = false;
  root = el("g");
  defs = el("defs");
  content = el("g");
  private path = "";
  private pathTransform = new DOMMatrix();
  private clipIds: string[] = [];
  private stack: string[][] = [];
  private raster: HTMLCanvasElement | undefined;
  private clips = new Map<string, { path: string; transform: DOMMatrix; rule: CanvasFillRule }>();
  finish() { this.flushRaster(); }
  private flushRaster() {
    if (!this.raster) return;
    this.content.append(el("image", {
      width: this.raster.width, height: this.raster.height,
      href: this.raster.toDataURL("image/png"),
    }));
    this.raster = undefined;
  }
  constructor(readonly context: CanvasRenderingContext2D) {
    this.reset();
  }
  reset() {
    this.root.replaceChildren(
      (this.defs = el("defs")),
      (this.content = el("g"))
    );
    this.clipIds = [];
    this.stack = [];
    this.path = "";
    this.vectorPaint = false;
    this.raster = undefined;
    this.clips.clear();
  }
  private append(node: SVGElement, transform = this.context.getTransform()) {
    node.setAttribute("transform", matrix(transform));
    node.setAttribute("opacity", String(this.context.globalAlpha));
    let group = this.content;
    for (const id of this.clipIds) {
      const next = el("g", { "clip-path": `url(#${id})` });
      group.append(next);
      group = next;
    }
    group.append(node);
  }
  private paint(stroke: boolean): Record<string, string | number> {
    const c = this.context,
      value = stroke ? c.strokeStyle : c.fillStyle;
    if (typeof value !== "string")
      throw new Error(
        "Vector export does not support this canvas paint style."
      );
    return stroke
      ? {
          fill: "none",
          stroke: value,
          "stroke-width": c.lineWidth,
          "stroke-linecap": c.lineCap,
          "stroke-linejoin": c.lineJoin,
          "stroke-miterlimit": c.miterLimit,
          "stroke-dasharray": c.getLineDash().join(" ") || "none",
          "stroke-dashoffset": c.lineDashOffset,
        }
      : { fill: value, stroke: "none" };
  }
  private pathCommand(command: string) {
    const transform = this.context.getTransform();
    if (!this.path) this.pathTransform = transform;
    if (!equal(transform, this.pathTransform))
      throw new Error(
        "Vector export encountered a path with changing coordinate transforms."
      );
    this.path += command;
  }
  call(method: string, args: unknown[]) {
    const c = this.context,
      n = args as number[];
    if (method === "clearRect" && this.raster && this.content.childNodes.length === 0) {
      // Tile renderers clear each destination rectangle before drawing it. Keep
      // those clears in the raster run instead of generating nested SVG masks
      // and one full-page PDF image per tile.
      const raster = this.raster.getContext("2d")!;
      raster.save();
      for (const id of this.clipIds) {
        const clip = this.clips.get(id)!;
        raster.setTransform(clip.transform);
        raster.clip(new Path2D(clip.path), clip.rule);
      }
      raster.setTransform(c.getTransform());
      raster.clearRect(n[0], n[1], n[2], n[3]);
      raster.restore();
      return;
    }
    if (["fill", "stroke", "fillRect", "strokeRect", "fillText", "strokeText", "clearRect"].includes(method)) this.flushRaster();
    switch (method) {
      case "save":
        this.stack.push([...this.clipIds]);
        break;
      case "restore":
        if (this.stack.length) this.clipIds = this.stack.pop()!;
        break;
      case "reset":
        this.reset();
        break;
      case "clearRect":
        if (
          n[0] <= 0 &&
          n[1] <= 0 &&
          n[2] >= c.canvas.width &&
          n[3] >= c.canvas.height &&
          equal(c.getTransform(), new DOMMatrix()) && this.clipIds.length === 0
        ) {
          // clearRect clears pixels, not the path or saved clipping state.
          this.content = el("g");
          this.root.replaceChildren(this.defs, this.content);
          this.vectorPaint = false;
        }
        else if (this.content.childNodes.length) {
          const id = `hict-clear-${sequence++}`,
            mask = el("mask", {
              id,
              maskUnits: "userSpaceOnUse",
              x: 0,
              y: 0,
              width: c.canvas.width,
              height: c.canvas.height,
            });
          mask.append(
            el("rect", {
              width: c.canvas.width,
              height: c.canvas.height,
              fill: "white",
            })
          );
          let erasedArea = mask;
          for (const clipId of this.clipIds) {
            const clipped = el("g", { "clip-path": `url(#${clipId})` });
            erasedArea.append(clipped); erasedArea = clipped;
          }
          erasedArea.append(
            el("rect", {
              x: n[0],
              y: n[1],
              width: n[2],
              height: n[3],
              fill: "black",
              transform: matrix(c.getTransform()),
            })
          );
          this.defs.append(mask);
          const old = this.content,
            newContent = el("g");
          old.setAttribute("mask", `url(#${id})`);
          this.root.append(newContent);
          this.content = newContent;
          newContent.append(old);
        }
        break;
      case "beginPath":
        this.path = "";
        break;
      case "closePath":
        this.path += "Z";
        break;
      case "moveTo":
        this.pathCommand(`M${n[0]} ${n[1]}`);
        break;
      case "lineTo":
        this.pathCommand(`L${n[0]} ${n[1]}`);
        break;
      case "bezierCurveTo":
        this.pathCommand(`C${n.join(" ")}`);
        break;
      case "quadraticCurveTo":
        this.pathCommand(`Q${n.join(" ")}`);
        break;
      case "rect":
        this.pathCommand(`M${n[0]} ${n[1]}h${n[2]}v${n[3]}h${-n[2]}Z`);
        break;
      case "arc": {
        const [x, y, r, start, end] = n,
          ccw = !!args[5],
          turn = 2 * Math.PI;
        let span = end - start;
        if (!ccw && span >= turn) span = turn;
        else if (ccw && -span >= turn) span = -turn;
        else
          span = ccw
            ? -(((start - end) % turn) + turn) % turn
            : (((end - start) % turn) + turn) % turn;
        const segments = Math.max(1, Math.ceil(Math.abs(span) / Math.PI));
        this.pathCommand(
          `${this.path ? "L" : "M"}${x + r * Math.cos(start)} ${
            y + r * Math.sin(start)
          }`
        );
        for (let i = 1; i <= segments; i++) {
          const angle = start + (span * i) / segments;
          this.pathCommand(
            `A${r} ${r} 0 0 ${ccw ? 0 : 1} ${x + r * Math.cos(angle)} ${
              y + r * Math.sin(angle)
            }`
          );
        }
        break;
      }
      case "clip": {
        if (args[0] instanceof Path2D)
          throw new Error("Vector export cannot record an opaque Path2D.");
        const id = `hict-clip-${sequence++}`,
          clip = el("clipPath", { id, clipPathUnits: "userSpaceOnUse" });
        clip.append(
          el("path", {
            d: this.path,
            transform: matrix(this.pathTransform),
            "clip-rule": String(args[0] ?? "nonzero"),
          })
        );
        this.defs.append(clip);
        this.clips.set(id, { path: this.path, transform: this.pathTransform, rule: (args[0] ?? "nonzero") as CanvasFillRule });
        this.clipIds.push(id);
        break;
      }
      case "fill":
      case "stroke":
        this.vectorPaint = true;
        if (args[0] instanceof Path2D)
          throw new Error("Vector export cannot record an opaque Path2D.");
        this.append(
          el("path", {
            d: this.path,
            ...this.paint(method === "stroke"),
            "fill-rule": String(args[0] ?? "nonzero"),
          }),
          this.pathTransform
        );
        break;
      case "fillRect":
      case "strokeRect":
        if (
          method === "strokeRect" ||
          n[0] !== 0 ||
          n[1] !== 0 ||
          n[2] !== c.canvas.width ||
          n[3] !== c.canvas.height
        )
          this.vectorPaint = true;
        this.append(
          el("rect", {
            x: n[0],
            y: n[1],
            width: n[2],
            height: n[3],
            ...this.paint(method === "strokeRect"),
          })
        );
        break;
      case "fillText":
      case "strokeText": {
        this.vectorPaint = true;
        const text = String(args[0]),
          measured = c.measureText(text),
          width = measured.width;
        const probe = document.createElement("canvas").getContext("2d")!;
        probe.font = c.font;
        probe.textBaseline = "alphabetic";
        const baselineY =
          n[2] +
          probe.measureText(text).actualBoundingBoxAscent -
          measured.actualBoundingBoxAscent;
        const node = el("text", {
          x: n[1],
          y: baselineY,
          style: `font: ${c.font}; white-space: pre`,
          ...this.paint(method === "strokeText"),
          "text-anchor":
            c.textAlign === "center"
              ? "middle"
              : c.textAlign === "right" || c.textAlign === "end"
              ? "end"
              : "start",
          "dominant-baseline": "alphabetic",
        });
        if (n[3] !== undefined && n[3] < width) {
          node.setAttribute("textLength", String(n[3]));
          node.setAttribute("lengthAdjust", "spacingAndGlyphs");
        }
        node.textContent = text;
        this.append(node);
        break;
      }
      case "drawImage": {
        // Rasterize consecutive tile draws exactly once with Canvas interpolation,
        // transforms and clips. Vector annotations remain separate. This prevents
        // SVG/PDF readers from resampling every tile differently or leaving seams.
        if (c.globalCompositeOperation !== "source-over") throw new Error("Vector export cannot preserve this raster blend mode.");
        if (!this.raster) {
          this.raster = document.createElement("canvas");
          this.raster.width = c.canvas.width; this.raster.height = c.canvas.height;
        }
        const raster = this.raster.getContext("2d")!;
        raster.save();
        for (const id of this.clipIds) {
          const clip = this.clips.get(id)!;
          raster.setTransform(clip.transform);
          raster.clip(new Path2D(clip.path), clip.rule);
        }
        raster.setTransform(c.getTransform());
        raster.globalAlpha = c.globalAlpha;
        raster.imageSmoothingEnabled = c.imageSmoothingEnabled;
        raster.imageSmoothingQuality = c.imageSmoothingQuality;
        raster.filter = c.filter;
        (nativeDrawImage as (...args: unknown[]) => void).apply(raster, args);
        raster.restore();
        break;
      }
      default:
        throw new Error(`Vector export cannot record ${method}.`);
    }
  }
}
const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
const methods = [
  "save",
  "restore",
  "reset",
  "clearRect",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "quadraticCurveTo",
  "rect",
  "arc",
  "clip",
  "fill",
  "stroke",
  "fillRect",
  "strokeRect",
  "fillText",
  "strokeText",
  "drawImage",
  "arcTo",
  "ellipse",
  "roundRect",
];
/** Record only canvas contexts inside the target workspace; restore hooks even on errors. */
export async function captureCanvasScene(
  workspace: HTMLElement,
  render: () => Promise<void>,
  metadata?: Record<string, unknown>
): Promise<{ svg: SVGSVGElement; canvas: HTMLCanvasElement }> {
  const proto = CanvasRenderingContext2D.prototype as unknown as Record<
    string,
    (...a: unknown[]) => unknown
  >;
  const saved = new Map<string, (...a: unknown[]) => unknown>(),
    scenes = new Map<HTMLCanvasElement, Scene>();
  let failure: unknown;
  try {
    for (const method of methods) {
      if (typeof proto[method] !== "function") continue;
      const original = proto[method];
      saved.set(method, original);
      proto[method] = function (
        this: CanvasRenderingContext2D,
        ...args: unknown[]
      ) {
        if (workspace.contains(this.canvas)) {
          let scene = scenes.get(this.canvas);
          if (!scene) {
            scene = new Scene(this);
            scenes.set(this.canvas, scene);
          }
          try {
            scene.call(method, args);
          } catch (error) {
            failure ??= error;
          }
        }
        return original.apply(this, args);
      };
    }
    await render();
  } finally {
    for (const [method, original] of saved) proto[method] = original;
  }
  if (failure) throw failure;
  for (const scene of scenes.values()) scene.finish();
  const rect = workspace.getBoundingClientRect();
  const svg = el("svg", {
    xmlns: NS,
    width: rect.width,
    height: rect.height,
    viewBox: `0 0 ${rect.width} ${rect.height}`,
  }) as SVGSVGElement;
  if (metadata) {
    const info = el("metadata");
    info.textContent = JSON.stringify(metadata);
    svg.append(info);
  }
  svg.append(
    el("rect", {
      width: rect.width,
      height: rect.height,
      fill: getComputedStyle(workspace).backgroundColor,
    })
  );
  const composite = document.createElement("canvas");
  composite.width = Math.ceil(rect.width);
  composite.height = Math.ceil(rect.height);
  const compositeContext = composite.getContext("2d")!;
  compositeContext.fillStyle = getComputedStyle(workspace).backgroundColor;
  compositeContext.fillRect(0, 0, composite.width, composite.height);
  for (const canvas of Array.from(workspace.querySelectorAll("canvas"))) {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) continue;
    let opacity = 1;
    let left = Math.max(rect.left, bounds.left),
      top = Math.max(rect.top, bounds.top),
      right = Math.min(rect.right, bounds.right),
      bottom = Math.min(rect.bottom, bounds.bottom);
    let visible = true;
    for (
      let parent: HTMLElement | null = canvas;
      parent && parent !== workspace;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent);
      opacity *= Number(style.opacity);
      if (style.display === "none" || style.visibility === "hidden")
        visible = false;
      if (
        parent !== canvas &&
        [style.overflow, style.overflowX, style.overflowY].some(
          (v) => v === "hidden" || v === "clip"
        )
      ) {
        const box = parent.getBoundingClientRect();
        left = Math.max(left, box.left);
        top = Math.max(top, box.top);
        right = Math.min(right, box.right);
        bottom = Math.min(bottom, box.bottom);
      }
    }
    if (!visible || opacity === 0 || right <= left || bottom <= top) continue;
    const container = el("svg", {
      x: left - rect.left,
      y: top - rect.top,
      width: right - left,
      height: bottom - top,
      viewBox: `${left - bounds.left} ${top - bounds.top} ${right - left} ${
        bottom - top
      }`,
      overflow: "hidden",
      opacity,
    });
    const scene = scenes.get(canvas);
    const style = getComputedStyle(canvas),
      transform =
        style.transform === "none"
          ? new DOMMatrix()
          : new DOMMatrix(style.transform);
    const width = canvas.offsetWidth,
      height = canvas.offsetHeight;
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
    const dx = Math.min(...corners.map((p) => p.x)),
      dy = Math.min(...corners.map((p) => p.y));
    const placement = new DOMMatrix([
      (transform.a * width) / canvas.width,
      (transform.b * width) / canvas.width,
      (transform.c * height) / canvas.height,
      (transform.d * height) / canvas.height,
      transform.e - dx,
      transform.f - dy,
    ]);
    const group = el("g", { transform: matrix(placement) });
    compositeContext.save();
    compositeContext.beginPath();
    compositeContext.rect(
      left - rect.left,
      top - rect.top,
      right - left,
      bottom - top
    );
    compositeContext.clip();
    compositeContext.globalAlpha = opacity;
    compositeContext.translate(bounds.left - rect.left, bounds.top - rect.top);
    compositeContext.transform(
      placement.a,
      placement.b,
      placement.c,
      placement.d,
      placement.e,
      placement.f
    );
    compositeContext.drawImage(canvas, 0, 0);
    compositeContext.restore();
    if (scene?.vectorPaint) group.append(scene.root);
    else
      group.append(
        el("image", {
          width: canvas.width,
          height: canvas.height,
          href: canvas.toDataURL("image/png"),
        })
      );
    // Bake raster-only geometry at viewport pixel resolution. PDF renderers use
    // different interpolation for scaled image XObjects; precomposing the heatmap
    // with the same Canvas transform as PNG avoids changing its apparent signal.
    // Paths and text keep their original coordinate system and remain vectors.
    for (const node of Array.from(group.querySelectorAll("image"))) {
      const source = new Image();
      source.src = node.getAttribute("href")!;
      await source.decode();
      const aligned = document.createElement("canvas");
      aligned.width = composite.width; aligned.height = composite.height;
      const painter = aligned.getContext("2d")!;
      painter.translate(bounds.left - rect.left, bounds.top - rect.top);
      painter.transform(placement.a, placement.b, placement.c, placement.d, placement.e, placement.f);
      painter.drawImage(source, 0, 0);
      node.setAttribute("href", aligned.toDataURL("image/png"));
      node.setAttribute("width", String(aligned.width));
      node.setAttribute("height", String(aligned.height));
      node.setAttribute("transform", matrix(placement.inverse().translate(-(bounds.left - rect.left), -(bounds.top - rect.top))));
    }
    container.append(group);
    svg.append(container);
  }
  return { svg, canvas: composite };
}
