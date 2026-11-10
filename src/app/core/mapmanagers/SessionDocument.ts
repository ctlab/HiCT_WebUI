import { ColorTranslator } from "colortranslator";

/** Validation shared by session import and its regression tests. */
export const MAX_SESSION_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_VALUES = 100000;

type RecordValue = Record<string, unknown>;

function invalid(path: string, reason: string): never {
  throw new Error(`Invalid session ${path}: ${reason}`);
}

function record(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "expected an object");
  }
  return value as RecordValue;
}

function finite(value: unknown, path: string, positive = false): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(path, "expected a finite number");
  }
  if (positive && value <= 0) invalid(path, "must be greater than zero");
}

function choice(
  value: unknown,
  path: string,
  choices: readonly unknown[]
): void {
  if (!choices.includes(value))
    invalid(path, `expected one of ${choices.join(", ")}`);
}

function color(value: unknown, path: string): void {
  if (typeof value !== "string" || !value.trim())
    invalid(path, "expected a color string");
  try {
    new ColorTranslator(value);
  } catch {
    invalid(path, "unsupported color");
  }
}

function booleans(item: RecordValue, path: string, keys: string[]): void {
  for (const key of keys) {
    if (key in item && typeof item[key] !== "boolean")
      invalid(`${path}.${key}`, "expected a boolean");
  }
}

function nonnegative(value: unknown, path: string): void {
  finite(value, path);
  if ((value as number) < 0) invalid(path, "must not be negative");
}

function ordered(
  item: RecordValue,
  path: string,
  lower: string,
  upper: string
): void {
  for (const key of [lower, upper])
    if (key in item) finite(item[key], `${path}.${key}`);
  if (
    lower in item &&
    upper in item &&
    (item[lower] as number) > (item[upper] as number)
  ) {
    invalid(`${path}.${upper}`, `must not be less than ${lower}`);
  }
}

function visualization(
  value: unknown,
  path: string,
  actionPreset = false
): void {
  const item = record(value, path);
  booleans(item, path, [
    "applyCoolerWeights",
    "resolutionScaling",
    "resolutionLinearScaling",
    "autoThresholdEnabled",
    "coolerWeightsHaveNaNs",
  ]);
  for (const key of ["preLogBase", "postLogBase"]) {
    if (!(key in item)) continue;
    finite(item[key], `${path}.${key}`);
    if (item[key] === 1)
      invalid(`${path}.${key}`, "logarithm base must not equal one");
  }
  if ("autoThresholdQuantile" in item) {
    finite(item.autoThresholdQuantile, `${path}.autoThresholdQuantile`, true);
    if ((item.autoThresholdQuantile as number) > 1)
      invalid(`${path}.autoThresholdQuantile`, "must not exceed one");
  }
  if ("coolerWeightsNaNCount" in item) {
    nonnegative(item.coolerWeightsNaNCount, `${path}.coolerWeightsNaNCount`);
    if (!Number.isSafeInteger(item.coolerWeightsNaNCount))
      invalid(`${path}.coolerWeightsNaNCount`, "expected an integer");
  }
  if ("signalDisplayMode" in item)
    choice(item.signalDisplayMode, `${path}.signalDisplayMode`, [
      "OBSERVED",
      "EXPECTED",
      "OBSERVED_OVER_EXPECTED",
    ]);
  if ("coolerWeightsNaNPolicy" in item)
    choice(item.coolerWeightsNaNPolicy, `${path}.coolerWeightsNaNPolicy`, [
      "DISABLE_WEIGHTS",
      "REPLACE_NANS_WITH_ONE",
      "REPLACE_NANS_WITH_ZERO",
    ]);
  if ("colormap" in item) {
    const cmap = record(item.colormap, `${path}.colormap`);
    if ("colormapType" in cmap)
      choice(
        cmap.colormapType,
        `${path}.colormap.colormapType`,
        actionPreset
          ? ["SimpleLinearGradient", "Unknown"]
          : ["SimpleLinearGradient"]
      );
    for (const key of ["startColorRGBAString", "endColorRGBAString"])
      if (key in cmap) color(cmap[key], `${path}.colormap.${key}`);
    ordered(cmap, `${path}.colormap`, "minSignal", "maxSignal");
  }
}

function styles(parent: RecordValue, path: string): void {
  if (!("trackStyles" in parent)) return;
  const bundle = record(parent.trackStyles, `${path}trackStyles`);
  // Early legacy documents used {} to mean that no style was saved.
  if (Object.keys(bundle).length === 0) {
    delete parent.trackStyles;
    return;
  }
  for (const track of ["contigs", "scaffolds"]) {
    const trackPath = `${path}trackStyles.${track}`;
    const item = record(bundle[track], trackPath);
    for (const key of ["borderColor", "fillColor"])
      color(item[key], `${trackPath}.${key}`);
    nonnegative(item.width, `${trackPath}.width`);
    choice(item.borderStyle, `${trackPath}.borderStyle`, [0, 1, 2, 3, 4, 5]);
    booleans(item, trackPath, ["borderOutline", "labelBold", "labelOutline"]);
    for (const key of [
      "labelSize",
      "labelOutlineWidth",
      "labelOffsetMultiplier",
    ])
      if (key in item) nonnegative(item[key], `${trackPath}.${key}`);
    if ("labelColor" in item) color(item.labelColor, `${trackPath}.labelColor`);
    if ("namePlacement" in item)
      choice(item.namePlacement, `${trackPath}.namePlacement`, [
        -1,
        0,
        1,
        2,
        3,
        4,
        "CENTER",
        "TOP",
        "BOTTOM",
        "HIDDEN",
        "LEFT",
        "RIGHT",
      ]);
  }
}

function action(value: unknown, path: string): void {
  const item = record(value, path);
  choice(item.type, `${path}.type`, [
    "sequence-overlay",
    "active-source-palette",
  ]);
  if (item.type === "sequence-overlay") {
    choice(item.mode, `${path}.mode`, ["overlay", "below"]);
    choice(item.kind, `${path}.kind`, ["moddotplot", "dotplot"]);
  } else {
    color(item.startColor, `${path}.startColor`);
    color(item.endColor, `${path}.endColor`);
  }
}

function view(value: unknown, path: string, bookmark = false): void {
  const item = record(value, path);
  const center = bookmark ? "center_point" : "center";
  if (center in item) {
    const coordinates = item[center];
    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      invalid(`${path}.${center}`, "expected exactly two coordinates");
    }
    coordinates.forEach((coordinate, index) =>
      finite(coordinate, `${path}.${center}[${index}]`)
    );
  } else if (bookmark) invalid(`${path}.${center}`, "is required");
  for (const key of ["resolution", "bpResolution", "rotation"]) {
    if (key in item) finite(item[key], `${path}.${key}`, key !== "rotation");
    else if (bookmark && key !== "bpResolution") {
      invalid(`${path}.${key}`, "is required");
    }
  }
}

function libraries(session: RecordValue, prefix: string): void {
  for (const key of ["savedLocations", "savedVisualizationPresets"]) {
    if (!(key in session)) continue;
    const items = session[key];
    if (!Array.isArray(items)) invalid(`${prefix}${key}`, "expected an array");
    const ids = new Set<number>();
    items.forEach((value, index) => {
      const path = `${prefix}${key}[${index}]`;
      const item = record(value, path);
      const id = key === "savedLocations" ? "location_id" : "option_id";
      finite(item[id], `${path}.${id}`);
      if (!Number.isSafeInteger(item[id]))
        invalid(`${path}.${id}`, "expected an integer");
      if (ids.has(item[id] as number)) invalid(`${path}.${id}`, "duplicate ID");
      ids.add(item[id] as number);
      if (key === "savedLocations") view(item, path, true);
      else {
        if (typeof item.name !== "string")
          invalid(`${path}.name`, "expected a string");
        if ("options" in item)
          visualization(item.options, `${path}.options`, "action" in item);
        if ("backgroundColor" in item)
          color(item.backgroundColor, `${path}.backgroundColor`);
        styles(item, `${path}.`);
        if ("signalThresholds" in item)
          ordered(
            record(item.signalThresholds, `${path}.signalThresholds`),
            `${path}.signalThresholds`,
            "lowerSignalBound",
            "upperSignalBound"
          );
        if ("action" in item) action(item.action, `${path}.action`);
      }
    });
  }
}

export const SESSION_FORMAT = "hict-session";

export interface SessionClientState {
  /** Fresh capture of view, scopes, styles and track visibility. */
  workspace?: Record<string, unknown>;
  savedLocations: unknown[];
  savedVisualizationPresets: unknown[];
  /** Weights the map used when the session was saved. Absent in older sessions (file weights). */
  normalizationWeights?: "FILE" | "SQRT_COVERAGE";
}

/** Builds the portable v3 document from a server snapshot and the client-only state. */
export function createSessionEnvelope(
  snapshot: RecordValue,
  client: SessionClientState,
  savedAt = new Date().toISOString()
): RecordValue {
  return {
    format: SESSION_FORMAT,
    version: 3,
    savedAt,
    snapshot,
    client: { ...client },
  };
}

function envelope(session: RecordValue): void {
  if (session.format !== SESSION_FORMAT)
    invalid("format", `expected ${SESSION_FORMAT}`);
  if ("savedAt" in session && typeof session.savedAt !== "string")
    invalid("savedAt", "expected a string");
  const snapshot = record(session.snapshot, "snapshot");
  if (snapshot.snapshotVersion !== 1)
    invalid("snapshot.snapshotVersion", "unsupported snapshot version");
  if (snapshot.filesFingerprinted !== true)
    invalid(
      "snapshot.filesFingerprinted",
      "the session does not identify its files, so it cannot be restored safely"
    );
  const primary = record(snapshot.primary, "snapshot.primary");
  if (typeof primary.filename !== "string" || !primary.filename.trim())
    invalid("snapshot.primary.filename", "expected a file name");
  choice(snapshot.assemblySource, "snapshot.assemblySource", [
    "PRIMARY",
    "SECONDARY",
  ]);
  if (snapshot.secondary !== undefined && snapshot.secondary !== null)
    record(snapshot.secondary, "snapshot.secondary");
  if (snapshot.assemblySource === "SECONDARY" && !snapshot.secondary)
    invalid("snapshot.assemblySource", "SECONDARY needs a secondary source");
  if (!Array.isArray(snapshot.tracks))
    invalid("snapshot.tracks", "expected an array");
  record(snapshot.renderPipeline, "snapshot.renderPipeline");
  const client = record(session.client, "client");
  if ("normalizationWeights" in client)
    choice(client.normalizationWeights, "client.normalizationWeights", [
      "FILE",
      "SQRT_COVERAGE",
    ]);
  if ("workspace" in client && client.workspace !== null) {
    const workspace = record(client.workspace, "client.workspace");
    if (workspace.version !== 1)
      invalid("client.workspace.version", "unsupported workspace version");
    if ("background" in workspace)
      color(workspace.background, "client.workspace.background");
    if ("view" in workspace) view(workspace.view, "client.workspace.view");
    styles(workspace, "client.workspace.");
  }
  libraries(client, "client.");
}

/**
 * Reject malformed documents before any network request or state change. Version 3
 * checks its envelope here. The server validates the snapshot's resources in depth,
 * and does so before replacing anything.
 */
export function parseSessionDocument(text: string): RecordValue {
  if (new TextEncoder().encode(text).byteLength > MAX_SESSION_BYTES) {
    invalid("file", "exceeds the 8 MiB limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalid("file", "expected valid JSON");
  }
  let values = 0;
  function bounded(value: unknown, path: string, depth: number): void {
    if (++values > MAX_VALUES) invalid(path, "contains too many values");
    if (depth > MAX_DEPTH) invalid(path, "exceeds the nesting limit");
    if (typeof value === "number") finite(value, path);
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) {
          invalid(`${path}.${key}`, "reserved property name");
        }
        bounded(child, `${path}.${key}`, depth + 1);
      }
    }
  }
  bounded(parsed, "document", 0);
  const session = record(parsed, "document");
  if (session.version === 3) {
    envelope(session);
    return session;
  }
  if (session.version !== 1 && session.version !== 2) {
    invalid(
      "version",
      typeof session.version === "number" && session.version > 3
        ? "this session was saved by a newer HiCT. Update HiCT to open it"
        : "supported versions are 1, 2 and 3"
    );
  }
  for (const key of [
    "filename",
    "fastaFilename",
    "agpFilename",
    "backgroundColor",
  ]) {
    if (key in session && typeof session[key] !== "string") {
      invalid(key, "expected a string");
    }
  }
  for (const key of [
    "visualizationOptions",
    "trackStyles",
    "axisTrackVisibility",
  ]) {
    if (key in session) record(session[key], key);
  }
  if ("visualizationOptions" in session)
    visualization(session.visualizationOptions, "visualizationOptions");
  if ("backgroundColor" in session)
    color(session.backgroundColor, "backgroundColor");
  styles(session, "");
  if ("view" in session) view(session.view, "view");
  const visibility = session.axisTrackVisibility as RecordValue | undefined;
  for (const key of ["horizontalHidden", "verticalHidden"]) {
    if (visibility && key in visibility) {
      const ids = visibility[key];
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        invalid(`axisTrackVisibility.${key}`, "expected an array of track IDs");
      }
    }
  }
  libraries(session, "");
  return session;
}
