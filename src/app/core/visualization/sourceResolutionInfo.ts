import type { SourceCapabilities } from "../net/SourceCapabilities";

type MatrixSource = "PRIMARY" | "SECONDARY";
type Placement = "upper" | "lower" | "base" | "overlay";

export interface SourceResolutionInfo {
  name: string;
  filename: string;
  placement: Placement;
  requestedBp: number;
  displayedBp?: number;
  loading: boolean;
}

function sourceReferences(value: unknown, found = new Set<MatrixSource>()) {
  if (!value || typeof value !== "object") return found;
  if (
    "source" in value &&
    (value.source === "PRIMARY" || value.source === "SECONDARY")
  )
    found.add(value.source);
  for (const child of Object.values(value)) sourceReferences(child, found);
  return found;
}

const cachedPlacements = new WeakMap<
  Record<string, unknown>,
  [Placement, Placement]
>();

export function sourcePlacements(
  config: Record<string, unknown> | undefined
): [Placement, Placement] {
  if (!config) return ["upper", "lower"];
  const cached = cachedPlacements.get(config);
  if (cached) return cached;
  let result: [Placement, Placement] = ["upper", "lower"];
  if (config.enabled) {
    const upper = sourceReferences(config.upperExpression);
    const lower = sourceReferences(config.lowerExpression);
    if (
      upper.size === 1 &&
      lower.size === 1 &&
      upper.has("SECONDARY") &&
      lower.has("PRIMARY")
    )
      result = ["lower", "upper"];
    else if (
      !(
        upper.size === 1 &&
        lower.size === 1 &&
        upper.has("PRIMARY") &&
        lower.has("SECONDARY")
      )
    )
      result = ["base", "overlay"];
  }
  if (config.swapUpperLower && result[0] !== "base")
    result = [result[1], result[0]];
  cachedPlacements.set(config, result);
  return result;
}

export function resolutionSourceName(
  source: MatrixSource,
  filename: string,
  capabilities?: SourceCapabilities
): string {
  switch (capabilities?.units) {
    case "CONTACT_COUNT":
      return source === "PRIMARY" ? "Hi-C" : "Hi-C (2nd map)";
    case "IDENTITY_PERCENT":
      return "ModDotPlot";
    case "ALIGNMENT_PRESENCE":
    case "ALIGNMENT_SAMPLE_COUNT":
      return "Dotplot";
    case "SEQUENCE_ONLY":
      return "FASTA";
    default:
      return (
        filename
          .split(/[/\\]/)
          .at(-1)
          ?.replace(/\.(?:hict\.)?hdf5$|\.m?cool$|\.hic$/i, "") ||
        (source === "PRIMARY" ? "Hi-C" : "Secondary map")
      );
  }
}

export function sourceResolutionRatio(bp: number): string {
  return `1:${bp.toLocaleString("en-US")}`;
}

export function sourceResolutionValue(source: SourceResolutionInfo): string {
  const requested = sourceResolutionRatio(source.requestedBp);
  if (!source.loading)
    return sourceResolutionRatio(source.displayedBp ?? source.requestedBp);
  return source.displayedBp === undefined
    ? `${requested} · loading`
    : `${requested} · loading, showing ${sourceResolutionRatio(
        source.displayedBp
      )}`;
}

export function sourceResolutionLabel(
  sources: readonly SourceResolutionInfo[]
): string {
  return sources
    .map(
      (source) =>
        `${source.placement} ${source.name} ${sourceResolutionValue(source)}`
    )
    .join("; ");
}
