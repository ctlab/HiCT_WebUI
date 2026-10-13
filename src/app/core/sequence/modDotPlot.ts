/** Existing typed rendering nodes keep score data independent of display colours. */
export function modDotPlotLowerExpression(minimumIdentity: number): Record<string, unknown> {
  if (!Number.isFinite(minimumIdentity) || minimumIdentity < 0 || minimumIdentity > 100)
    throw new Error("Identity threshold must be between 0 and 100");
  const constant = (value: number) => ({ type: "constant", value });
  const signal = { type: "source", source: "SECONDARY" };
  const binary = (op: string, left: object, right: object) => ({ type: "binary", op, left, right });
  const fraction = { type: "clamp", input: binary("DIV",
    binary("SUB", signal, constant(minimumIdentity * 10000)),
    constant(Math.max(1, (100 - minimumIdentity) * 10000))), minValue: 0, maxValue: 1 };
  return {
    type: "hsv",
    h: binary("MUL", binary("SUB", constant(1), fraction), constant(240)),
    sValue: 0.85, vValue: 0.85,
    a: binary("MUL", { type: "clamp", input: signal, minValue: 0, maxValue: 1 }, constant(255)),
  };
}
