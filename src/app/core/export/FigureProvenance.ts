/** Keep file identification, units, assembly identity and scientific settings without copying all descriptors into each figure. */
export function compactFigureProvenance(
  snapshot: Record<string, unknown>
): Record<string, unknown> {
  const source = (value: unknown): Record<string, unknown> | null => {
    if (value == null) return null;
    if (typeof value !== "object" || Array.isArray(value))
      throw Error("The figure source provenance is invalid.");
    const record = value as Record<string, unknown>;
    if (
      typeof record.filename !== "string" ||
      typeof record.agpSha256 !== "string"
    )
      throw Error("The figure source is missing its assembly identity.");
    const result: Record<string, unknown> = {};
    for (const key of [
      "filename",
      "fastaFilename",
      "agpSha256",
      "fileFingerprint",
      "fastaFingerprint",
      "capabilities",
      "exampleProvenance",
    ])
      if (key in record) result[key] = record[key];
    return result;
  };
  const primary = source(snapshot.primary);
  if (!primary) throw Error("The figure has no primary source provenance.");
  const options = snapshot.visualizationOptions as {
    diagonalMask?: { enabled?: boolean; distanceBp?: number };
  } | undefined;
  const mask = options?.diagonalMask;
  return JSON.parse(
    JSON.stringify({
      primary,
      secondary: source(snapshot.secondary),
      assemblySource: snapshot.assemblySource,
      assemblyVerified: snapshot.assemblyVerified,
      filesFingerprinted: snapshot.filesFingerprinted,
      tracksVerified: snapshot.tracksVerified,
      renderPipeline: snapshot.renderPipeline,
      visualizationOptions: snapshot.visualizationOptions,
      ...(mask?.enabled && typeof mask.distanceBp === "number"
        ? { notes: [`Excluded contacts within ±${mask.distanceBp.toLocaleString("en-US")} bp of the main diagonal.`] }
        : {}),
      tracks: snapshot.tracks,
    })
  ) as Record<string, unknown>;
}
