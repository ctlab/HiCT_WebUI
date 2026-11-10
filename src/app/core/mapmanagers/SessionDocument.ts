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

/** Reject malformed legacy containers before any network request or state change.
 * Version 3 will add assembly, graph and source identity validation here.
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
  if (session.version !== 1 && session.version !== 2) {
    invalid("version", "supported legacy versions are 1 and 2");
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
  for (const key of ["savedLocations", "savedVisualizationPresets"]) {
    if (!(key in session)) continue;
    const items = session[key];
    if (!Array.isArray(items)) invalid(key, "expected an array");
    items.forEach((value, index) => {
      const path = `${key}[${index}]`;
      const item = record(value, path);
      const id = key === "savedLocations" ? "location_id" : "option_id";
      finite(item[id], `${path}.${id}`);
      if (!Number.isSafeInteger(item[id]))
        invalid(`${path}.${id}`, "expected an integer");
      if (key === "savedLocations") view(item, path, true);
      else {
        if (typeof item.name !== "string")
          invalid(`${path}.name`, "expected a string");
        for (const field of [
          "options",
          "trackStyles",
          "signalThresholds",
          "action",
        ]) {
          if (field in item) record(item[field], `${path}.${field}`);
        }
      }
    });
  }
  return session;
}
