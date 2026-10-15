/** Identity values remain numeric; colour is applied only when rendering. */
export function modDotPlotLowerExpression(minimumIdentity: number, scale = 10000) {
  if (!Number.isFinite(minimumIdentity) || minimumIdentity < 0 || minimumIdentity > 100)
    throw new Error("Identity threshold must be between 0 and 100");
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid identity score scale");
  return {
    type: "colormap" as const,
    mode: "MODDOTPLOT_IDENTITY" as const,
    input: {
      type: "binary" as const,
      op: "DIV" as const,
      left: { type: "source" as const, source: "SECONDARY" as const },
      right: { type: "constant" as const, value: scale },
    },
    // Keep missing and below-threshold cells transparent even if an older
    // server falls back from the identity colormap to linear interpolation.
    startColor: "#31369500", endColor: "#a50026ff",
    minSignal: minimumIdentity, maxSignal: 100,
  };
}
