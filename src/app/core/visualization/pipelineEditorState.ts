import type { LGraph, LiteGraph, LGraphNode } from "litegraph.js";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const scalar = (value: unknown): value is string | number | boolean =>
  (typeof value === "string" && value.length <= 4096) ||
  (typeof value === "number" && Number.isFinite(value)) ||
  typeof value === "boolean";
const pair = (value: unknown): [number, number] | null => {
  // LiteGraph serializes typed-array vectors as numeric-keyed objects.
  if (!Array.isArray(value) && !record(value)) return null;
  const vector = value as Record<number, unknown>;
  const x = vector[0],
    y = vector[1];
  return typeof x === "number" &&
    typeof y === "number" &&
    [x, y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e7)
    ? [x, y]
    : null;
};

/** Restore only supported node data, never arbitrary serialized runtime fields. */
export function restorePipelineEditorGraph(
  data: unknown,
  allowedTypes: ReadonlySet<string>,
  runtime: { LGraph: typeof LGraph; LiteGraph: typeof LiteGraph }
): LGraph {
  if (
    !record(data) ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.links) ||
    data.nodes.length > 1024 ||
    data.links.length > 4096
  )
    throw new Error("Invalid or oversized pipeline editor graph.");
  const graph = new runtime.LGraph();
  const nodes = new Map<number, LGraphNode>();
  for (const raw of data.nodes) {
    const position = record(raw) ? pair(raw.pos) : null;
    if (
      !record(raw) ||
      typeof raw.id !== "number" ||
      !Number.isSafeInteger(raw.id) ||
      raw.id < 0 ||
      raw.id > 1e6 ||
      nodes.has(raw.id) ||
      typeof raw.type !== "string" ||
      !allowedTypes.has(raw.type) ||
      !position
    )
      throw new Error("Invalid pipeline node identity, type or position.");
    const node = runtime.LiteGraph.createNode(raw.type) as LGraphNode | null;
    if (!node) throw new Error("Unsupported pipeline node.");
    node.id = raw.id;
    node.pos = position;
    if (typeof raw.title === "string") node.title = raw.title.slice(0, 256);
    const size = pair(raw.size);
    if (size && size.every((v) => v >= 20 && v <= 4096)) node.size = size;
    if (record(raw.flags))
      Object.assign(node.flags, {
        collapsed: raw.flags.collapsed === true,
        pinned: raw.flags.pinned === true,
      });
    if (record(raw.properties)) {
      for (const key of Object.keys(node.properties)) {
        const value = raw.properties[key];
        if (value !== undefined) {
          if (!scalar(value) || typeof value !== typeof node.properties[key])
            throw new Error(`Invalid property '${key}' in pipeline node.`);
          node.properties[key] = value;
        }
      }
    }
    const widgets =
      (node as LGraphNode & { widgets?: Array<{ value: unknown }> }).widgets ??
      [];
    if (Array.isArray(raw.widgets_values))
      raw.widgets_values.forEach((value, index) => {
        if (widgets[index] && scalar(value)) widgets[index].value = value;
      });
    graph.add(node);
    nodes.set(raw.id, node);
  }
  const targets = new Set<string>();
  const edges = new Map<number, number[]>();
  const indegree = new Map([...nodes.keys()].map((id) => [id, 0]));
  for (const link of data.links) {
    if (
      !Array.isArray(link) ||
      link.length !== 6 ||
      !link
        .slice(1, 5)
        .every((v) => typeof v === "number" && Number.isSafeInteger(v))
    )
      throw new Error("Invalid pipeline connection.");
    const [, fromId, output, toId, input] = link as number[];
    const from = nodes.get(fromId),
      to = nodes.get(toId);
    const target = `${toId}:${input}`;
    if (
      !from ||
      !to ||
      output < 0 ||
      input < 0 ||
      !from.outputs?.[output] ||
      !to.inputs?.[input] ||
      targets.has(target)
    )
      throw new Error("Missing or duplicate pipeline connection endpoint.");
    targets.add(target);
    if (!from.connect(output, to, input))
      throw new Error("Incompatible pipeline connection types.");
    edges.set(fromId, [...(edges.get(fromId) ?? []), toId]);
    indegree.set(toId, (indegree.get(toId) ?? 0) + 1);
  }
  const ready = [...indegree]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  const expandedSize = new Map([...nodes.keys()].map((id) => [id, 1]));
  const depth = new Map([...nodes.keys()].map((id) => [id, 1]));
  for (let index = 0; index < ready.length; index++) {
    for (const target of edges.get(ready[index]) ?? []) {
      const size =
        (expandedSize.get(target) ?? 1) + (expandedSize.get(ready[index]) ?? 1);
      const nextDepth = Math.max(
        depth.get(target) ?? 1,
        (depth.get(ready[index]) ?? 1) + 1
      );
      if (size > 20000 || nextDepth > 120)
        throw new Error("Pipeline expression expansion is too large.");
      expandedSize.set(target, size);
      depth.set(target, nextDepth);
      const degree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, degree);
      if (degree === 0) ready.push(target);
    }
  }
  if (ready.length !== nodes.size)
    throw new Error("The pipeline editor graph contains a cycle.");
  return graph;
}

/** Ignore editor-only range annotations and equivalent literal colormap bounds. */
export function pipelineExpressionSignature(value: unknown): string {
  const normalize = (value: unknown, depth: number): unknown => {
    if (depth > 128)
      throw new Error("Pipeline expression is too deeply nested.");
    if (Array.isArray(value)) return value.map((v) => normalize(v, depth + 1));
    if (!record(value)) return value;
    const result: Record<string, unknown> = { ...value };
    delete result.rangeSource;
    delete result.rangeOutput;
    if (result.type === "colormap") {
      result.min = result.min ?? { type: "constant", value: result.minSignal };
      result.max = result.max ?? { type: "constant", value: result.maxSignal };
      delete result.minSignal;
      delete result.maxSignal;
    }
    return Object.fromEntries(
      Object.keys(result)
        .sort()
        .filter((key) => result[key] !== undefined)
        .map((key) => [key, normalize(result[key], depth + 1)])
    );
  };
  return JSON.stringify(normalize(value, 0));
}
