import { ColorTranslator } from "colortranslator";
import { pipelineExpressionSignature } from "./pipelineEditorState";

type Expression = Record<string, unknown>;
export interface RenderPipelinePreset {
  enabled: boolean;
  swapUpperLower: boolean;
  upperExpression: Expression;
  lowerExpression: Expression;
  editorState?: { liteGraph: Record<string, unknown>; viewport?: unknown };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const colorTypes = new Set(["colormap", "rgb", "hsl", "hsv", "pixel_blend"]);
const choices: Record<string, Record<string, readonly string[]>> = {
  source: { source: ["PRIMARY", "SECONDARY"] },
  dynamic: {
    field: [
      "ROW_BP",
      "COL_BP",
      "ROW_BIN",
      "COL_BIN",
      "ROW_PX",
      "COL_PX",
      "ROW_WEIGHT",
      "COL_WEIGHT",
      "RESOLUTION_SCALING_COEFF",
      "RESOLUTION_LINEAR_SCALING_COEFF",
      "DIAG_BP_DISTANCE",
      "DIAG_BIN_DISTANCE",
      "DIAG_PX_DISTANCE",
      "BP_RESOLUTION",
    ],
  },
  unary: { op: ["ABS", "LOG", "LOG1P", "EXP", "NEG"] },
  binary: { op: ["ADD", "SUB", "MUL", "DIV", "MAX", "MIN"] },
};
const requiredChildren: Record<string, readonly string[]> = {
  unary: ["input"],
  binary: ["left", "right"],
  log: ["input"],
  log_input: ["input"],
  clamp: ["input"],
  colormap: ["input"],
};
const optionalChildren: Record<string, readonly string[]> = {
  log_input: ["base"],
  clamp: ["min", "max"],
  colormap: ["min", "max"],
  rgb: ["c1", "c2", "c3", "r", "g", "b", "a", "alpha"],
  hsl: ["c1", "c2", "c3", "h", "s", "l", "a", "alpha"],
  hsv: ["c1", "c2", "c3", "h", "s", "v", "a", "alpha"],
  pixel_blend: ["topOpacity", "topAlpha", "bottomOpacity", "bottomAlpha"],
};
const supportedTypes = new Set([
  "source",
  "track1d",
  "constant",
  "dynamic",
  ...Object.keys(requiredChildren),
  ...colorTypes,
]);

function invalid(reason: string): never {
  throw new Error(`Invalid rendering graph preset. ${reason}`);
}
function finite(value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value))
    invalid("Expected a finite numeric value.");
}

/** Session snapshots encode the original 8-bit sRGB colors as float components. */
export function snapshotColorToRGBA(value: unknown): string {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value.some(
      (component) =>
        typeof component !== "number" ||
        !Number.isFinite(component) ||
        component < 0 ||
        component > 1
    )
  )
    invalid("Invalid applied colormap color.");
  return `rgba(${Math.round(value[0] * 255)},${Math.round(
    value[1] * 255
  )},${Math.round(value[2] * 255)},${Math.round(value[3] * 255) / 255})`;
}

/** Validate before staging any library changes, preserving the original expressions. */
export function parseRenderPipelinePreset(
  value: RenderPipelinePreset
): RenderPipelinePreset;
export function parseRenderPipelinePreset(value: undefined): undefined;
export function parseRenderPipelinePreset(
  value: unknown
): RenderPipelinePreset | undefined;
export function parseRenderPipelinePreset(
  value: unknown
): RenderPipelinePreset | undefined {
  if (value === undefined) return undefined;
  let values = 0;
  const bounded = (value: unknown, depth: number): void => {
    if (++values > 100000 || depth > 128)
      invalid("The graph exceeds the size or nesting limit.");
    if (typeof value === "number") finite(value);
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          invalid("Reserved property name.");
        bounded(child, depth + 1);
      }
    }
  };
  bounded(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 2_000_000)
    invalid("The graph exceeds 2 MB.");
  if (
    !record(value) ||
    typeof value.enabled !== "boolean" ||
    typeof value.swapUpperLower !== "boolean"
  )
    invalid("Expected graph enable and triangle-swap flags.");
  const validate = (raw: unknown, numeric = false, depth = 0): void => {
    if (depth > 120) invalid("The expression exceeds the nesting limit.");
    if (!record(raw) || typeof raw.type !== "string")
      invalid("Expected an expression object.");
    const type = raw.type.toLowerCase();
    if (!supportedTypes.has(type) || (numeric && colorTypes.has(type)))
      invalid("Unsupported expression type.");
    for (const [key, allowed] of Object.entries(choices[type] ?? {})) {
      if (
        typeof raw[key] !== "string" ||
        !allowed.includes((raw[key] as string).toUpperCase())
      )
        invalid(`Unsupported ${key}.`);
    }
    if (type === "constant") finite(raw.value);
    if (type === "track1d") {
      if (typeof raw.trackId !== "string" || !raw.trackId.trim())
        invalid("A track expression requires a track ID.");
      if (
        raw.axis !== undefined &&
        !["ROW", "COL", "COLUMN"].includes(String(raw.axis).toUpperCase())
      )
        invalid("Unsupported track axis.");
    }
    for (const key of requiredChildren[type] ?? [])
      validate(raw[key], true, depth + 1);
    for (const key of optionalChildren[type] ?? []) {
      if (raw[key] === undefined) continue;
      if (record(raw[key])) validate(raw[key], true, depth + 1);
      else finite(raw[key]);
    }
    for (const key of [
      "minValue",
      "maxValue",
      "minSignal",
      "maxSignal",
      "baseValue",
      "c1Value",
      "c2Value",
      "c3Value",
      "rValue",
      "gValue",
      "bValue",
      "hValue",
      "sValue",
      "lValue",
      "vValue",
      "aValue",
      "alphaValue",
      "topOpacityValue",
      "bottomOpacityValue",
    ]) {
      if (raw[key] !== undefined) finite(raw[key]);
    }
    if (type === "log" && raw.base !== undefined) finite(raw.base);
    const base =
      type === "log" || type === "log_input"
        ? record(raw.base) && String(raw.base.type).toLowerCase() === "constant"
          ? raw.base.value
          : raw.base
        : undefined;
    if (typeof base === "number" && (base <= 0 || Math.abs(base - 1) < 1e-9))
      invalid("The logarithm base must be positive and different from one.");
    if (type === "colormap") {
      if (
        raw.mode !== undefined &&
        !["LINEAR", "MODDOTPLOT_IDENTITY"].includes(
          String(raw.mode).toUpperCase()
        )
      )
        invalid("Unsupported colormap mode.");
      for (const key of ["startColor", "endColor"]) {
        if (raw[key] !== undefined) {
          if (typeof raw[key] !== "string") invalid("Expected a color string.");
          new ColorTranslator(raw[key] as string, { legacyCSS: true });
        }
      }
    }
    if (type === "pixel_blend") {
      if (
        raw.mode !== undefined &&
        ![
          "OVER",
          "ADD",
          "SUBTRACT",
          "MULTIPLY",
          "SCREEN",
          "DIFFERENCE",
          "LIGHTEN",
          "DARKEN",
          "XOR",
        ].includes(String(raw.mode).toUpperCase())
      )
        invalid("Unsupported blend mode.");
      for (const key of [
        "top",
        "foreground",
        "upper",
        "bottom",
        "background",
        "lower",
      ]) {
        if (raw[key] !== undefined) {
          validate(raw[key], false, depth + 1);
          if (
            !colorTypes.has(String((raw[key] as Expression).type).toLowerCase())
          )
            invalid("A blend input requires a color expression.");
        }
      }
    }
  };
  validate(value.upperExpression);
  validate(value.lowerExpression);
  if (value.editorState !== undefined) {
    const state = value.editorState;
    if (
      !record(state) ||
      !record(state.liteGraph) ||
      !Array.isArray(state.liteGraph.nodes) ||
      !Array.isArray(state.liteGraph.links) ||
      state.liteGraph.nodes.length > 1024 ||
      state.liteGraph.links.length > 4096
    )
      invalid("Invalid editor layout.");
  }
  return JSON.parse(JSON.stringify(value)) as RenderPipelinePreset;
}

export const pipelineEditorStorageKey = (host: string): string =>
  `hict.renderPipeline.editor.v1:${host}`;
const expressionSignature = (preset: RenderPipelinePreset): string =>
  pipelineExpressionSignature([preset.upperExpression, preset.lowerExpression]);

export function captureRenderPipelinePreset(
  config: unknown,
  host: string
): RenderPipelinePreset {
  const preset = parseRenderPipelinePreset(config);
  if (!preset) invalid("No applied rendering graph is available.");
  try {
    const cached = JSON.parse(
      sessionStorage.getItem(pipelineEditorStorageKey(host)) ?? "null"
    );
    if (cached?.expressionSignature === expressionSignature(preset)) {
      const withEditor: RenderPipelinePreset = {
        ...preset,
        editorState: { liteGraph: cached.liteGraph, viewport: cached.viewport },
      };
      return parseRenderPipelinePreset(withEditor);
    }
  } catch {
    /* Browser storage is optional. The rendering expressions remain complete. */
  }
  return preset;
}

export function restorePresetEditorState(
  preset: RenderPipelinePreset,
  host: string
): void {
  try {
    if (preset.editorState)
      sessionStorage.setItem(
        pipelineEditorStorageKey(host),
        JSON.stringify({
          ...preset.editorState,
          expressionSignature: expressionSignature(preset),
        })
      );
    else sessionStorage.removeItem(pipelineEditorStorageKey(host));
  } catch {
    /* The editor can reconstruct its layout from the applied expressions. */
  }
}
