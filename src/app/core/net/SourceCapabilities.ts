export type CapabilityAvailability = {
  state: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  reasonCode: string;
  reason: string;
};

export type SourceCapabilities = {
  schemaVersion: 1;
  units:
    | "CONTACT_COUNT"
    | "ALIGNMENT_SAMPLE_COUNT"
    | "ALIGNMENT_PRESENCE"
    | "IDENTITY_PERCENT"
    | "SEQUENCE_ONLY"
    | "UNKNOWN";
  scoreScale: number;
  contactDataState: "PRESENT" | "ABSENT" | "UNKNOWN";
  resolutions: number[];
  importedWeightResolutions: number[];
  weightMetadataComplete: boolean;
  contactNormalization: CapabilityAvailability;
  importedWeights: CapabilityAvailability;
};

const units = new Set([
  "CONTACT_COUNT",
  "ALIGNMENT_SAMPLE_COUNT",
  "ALIGNMENT_PRESENCE",
  "IDENTITY_PERCENT",
  "SEQUENCE_ONLY",
  "UNKNOWN",
]);
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function levels(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((v) => Number.isSafeInteger(v) && v > 0) &&
    new Set(value).size === value.length
  );
}
function availability(value: unknown): value is CapabilityAvailability {
  return (
    object(value) &&
    ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"].includes(String(value.state)) &&
    typeof value.reasonCode === "string" &&
    typeof value.reason === "string"
  );
}

/** Older servers and unsupported metadata remain unknown instead of disabling working legacy controls. */
export function parseSourceCapabilities(
  value: unknown
): SourceCapabilities | undefined {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !units.has(String(value.units)) ||
    !["PRESENT", "ABSENT", "UNKNOWN"].includes(
      String(value.contactDataState)
    ) ||
    typeof value.scoreScale !== "number" ||
    !Number.isFinite(value.scoreScale) ||
    value.scoreScale <= 0 ||
    !levels(value.resolutions) ||
    !levels(value.importedWeightResolutions) ||
    !value.importedWeightResolutions.every((r) =>
      (value.resolutions as number[]).includes(r)
    ) ||
    typeof value.weightMetadataComplete !== "boolean" ||
    !availability(value.contactNormalization) ||
    !availability(value.importedWeights)
  )
    return undefined;
  return value as unknown as SourceCapabilities;
}

export function importedWeightsAvailability(
  capabilities: SourceCapabilities | undefined,
  resolution: number | undefined
): CapabilityAvailability | undefined {
  if (!capabilities) return undefined;
  if (capabilities.importedWeights.state === "UNAVAILABLE") {
    return capabilities.importedWeights;
  }
  if (
    resolution !== undefined &&
    !capabilities.importedWeightResolutions.includes(resolution)
  ) {
    return capabilities.weightMetadataComplete
      ? {
          state: "UNAVAILABLE",
          reasonCode: "NO_WEIGHTS_AT_RESOLUTION",
          reason: "This resolution has no imported balancing weights.",
        }
      : {
          state: "UNKNOWN",
          reasonCode: "INCOMPLETE_WEIGHT_METADATA",
          reason:
            "This file does not record whether weights were imported at this resolution.",
        };
  }
  return capabilities.importedWeights;
}
