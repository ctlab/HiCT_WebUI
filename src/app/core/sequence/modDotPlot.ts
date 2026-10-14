/** Identity values remain numeric; colour is applied only when rendering. */
export function modDotPlotLowerExpression(minimumIdentity: number, scale = 10000) {
  if (!Number.isFinite(minimumIdentity) || minimumIdentity < 0 || minimumIdentity > 100)
    throw new Error("Identity threshold must be between 0 and 100");
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid identity score scale");
  return {
    type: "colormap" as const,
    mode: "MODDOTPLOT_IDENTITY" as const,
    input: { type: "source" as const, source: "SECONDARY" as const },
    startColor: "#313695ff", endColor: "#a50026ff",
    minSignal: minimumIdentity * scale, maxSignal: 100 * scale,
  };
}
