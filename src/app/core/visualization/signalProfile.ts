/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * The signal subtree that the sidebar edits, and its inverse.
 *
 * Only the exact shape that {@link buildSignalInput} emits counts as canonical. Reading from the
 * outside in:
 *
 *   [divide by constant]  [post log]  [x Cooler weights]  [x linear scaling]  [x quadratic scaling]
 *   [pre log]  source
 *
 * Every part is optional and the order is fixed. Each multiplication may have its coefficient on
 * either side. A graph of any other shape is left untouched by sidebar edits (`parse` returns null),
 * so a hand-built processing graph is never rewritten behind the user's back.
 *
 * Log convention everywhere: log(1 + x) / log(base), for a base that is finite, positive and not 1.
 */

export type SignalSource = "PRIMARY" | "SECONDARY";

export const BUILTIN_COOLER_WEIGHTS_TRACK_ID = "__builtin_cooler_weights__";

export type SignalFlags = {
  /** Legacy transform applied before scaling. Null when absent. */
  preLogBase: number | null;
  /** The signal transform shown in the sidebar. Null when linear. */
  postLogBase: number | null;
  applyCoolerWeights: boolean;
  /** Quadratic scaling across zoom. */
  resolutionScaling: boolean;
  /** Linear scaling across zoom. */
  resolutionLinearScaling: boolean;
};

export type SignalProfile = SignalFlags & {
  source: SignalSource;
  signalDivisor: number;
  hasExplicitSignalDivisor: boolean;
};

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const typeOf = (value: unknown): string =>
  isNode(value)
    ? String(value.type ?? "")
        .trim()
        .toLowerCase()
    : "";

/** A log base the server can apply: finite, positive and not 1. */
export const isValidLogBase = (value: unknown): value is number => {
  const base = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(base) && base > 0 && Math.abs(base - 1) > 1e-9;
};

const isDynamic = (value: unknown, field: string): boolean =>
  typeOf(value) === "dynamic" &&
  String((value as Node).field ?? "")
    .trim()
    .toUpperCase() === field;

const isWeightsTrack = (value: unknown, axis: "ROW" | "COL"): boolean =>
  typeOf(value) === "track1d" &&
  String((value as Node).trackId ?? "").trim() ===
    BUILTIN_COOLER_WEIGHTS_TRACK_ID &&
  String((value as Node).axis ?? "")
    .trim()
    .toUpperCase() === axis;

const isWeightsProduct = (value: unknown): boolean => {
  if (
    typeOf(value) !== "binary" ||
    String((value as Node).op ?? "")
      .trim()
      .toUpperCase() !== "MUL"
  )
    return false;
  const { left, right } = value as Node;
  return (
    (isWeightsTrack(left, "ROW") && isWeightsTrack(right, "COL")) ||
    (isWeightsTrack(left, "COL") && isWeightsTrack(right, "ROW"))
  );
};

// Position from the outside in: a larger rank is closer to the source.
const RANK_POST = 0;
const RANK_WEIGHTS = 1;
const RANK_LINEAR = 2;
const RANK_QUADRATIC = 3;
const RANK_PRE = 4;

const coefficientRank = (value: unknown): number | null => {
  if (isDynamic(value, "RESOLUTION_LINEAR_SCALING_COEFF")) return RANK_LINEAR;
  if (isDynamic(value, "RESOLUTION_SCALING_COEFF")) return RANK_QUADRATIC;
  if (isWeightsProduct(value)) return RANK_WEIGHTS;
  return null;
};

/** The canonical profile of a signal expression, or null when it has any other shape. */
export const parseCanonicalSignal = (
  expression: unknown
): SignalProfile | null => {
  let node: unknown = expression;
  let divisor = 1;
  let hasExplicitSignalDivisor = false;
  // Divisors sit outermost. Several are allowed and multiply.
  while (
    typeOf(node) === "binary" &&
    String((node as Node).op ?? "")
      .trim()
      .toUpperCase() === "DIV"
  ) {
    const right = (node as Node).right;
    const value =
      typeOf(right) === "constant" ? Number((right as Node).value) : Number.NaN;
    if (!Number.isFinite(value) || value <= 0) return null;
    divisor *= value;
    hasExplicitSignalDivisor = true;
    node = (node as Node).left;
  }
  const flags: SignalFlags = {
    preLogBase: null,
    postLogBase: null,
    applyCoolerWeights: false,
    resolutionScaling: false,
    resolutionLinearScaling: false,
  };
  let last = -1;
  for (let guard = 0; guard < 16; guard++) {
    const type = typeOf(node);
    if (type === "source") {
      const source = String((node as Node).source ?? "PRIMARY")
        .trim()
        .toUpperCase();
      return {
        ...flags,
        source: source === "SECONDARY" ? "SECONDARY" : "PRIMARY",
        signalDivisor: divisor,
        hasExplicitSignalDivisor,
      };
    }
    if (type === "log") {
      const base = (node as Node).base;
      if (!isValidLogBase(base)) return null;
      // A log with nothing multiplied outside it is the signal transform. One that sits below a
      // multiplication (or below another log) is the legacy pre-log.
      if (last < RANK_POST) {
        flags.postLogBase = base;
        last = RANK_POST;
      } else if (last < RANK_PRE) {
        flags.preLogBase = base;
        last = RANK_PRE;
      } else return null;
      node = (node as Node).input;
      continue;
    }
    if (
      type === "binary" &&
      String((node as Node).op ?? "")
        .trim()
        .toUpperCase() === "MUL"
    ) {
      const { left, right } = node as Node;
      const rightRank = coefficientRank(right);
      const leftRank = coefficientRank(left);
      if ((rightRank === null) === (leftRank === null)) return null;
      const rank = (rightRank ?? leftRank) as number;
      if (rank <= last) return null;
      if (rank === RANK_WEIGHTS) flags.applyCoolerWeights = true;
      else if (rank === RANK_LINEAR) flags.resolutionLinearScaling = true;
      else flags.resolutionScaling = true;
      last = rank;
      node = rightRank !== null ? left : right;
      continue;
    }
    return null;
  }
  return null;
};

const logNode = (input: Node, base: number): Node => ({
  type: "log",
  input,
  base,
});
const productNode = (inner: Node, coefficient: Node): Node => ({
  type: "binary",
  op: "MUL",
  left: inner,
  right: coefficient,
});

/** Builds the canonical signal expression. Invalid or absent log bases are omitted. */
export const buildSignalInput = (
  source: SignalSource,
  flags: SignalFlags,
  divisor?: { value: number } | null
): Node => {
  let expression: Node = { type: "source", source };
  if (isValidLogBase(flags.preLogBase))
    expression = logNode(expression, flags.preLogBase);
  if (flags.resolutionScaling)
    expression = productNode(expression, {
      type: "dynamic",
      field: "RESOLUTION_SCALING_COEFF",
    });
  if (flags.resolutionLinearScaling)
    expression = productNode(expression, {
      type: "dynamic",
      field: "RESOLUTION_LINEAR_SCALING_COEFF",
    });
  if (flags.applyCoolerWeights)
    expression = productNode(expression, {
      type: "binary",
      op: "MUL",
      left: {
        type: "track1d",
        trackId: BUILTIN_COOLER_WEIGHTS_TRACK_ID,
        axis: "ROW",
      },
      right: {
        type: "track1d",
        trackId: BUILTIN_COOLER_WEIGHTS_TRACK_ID,
        axis: "COL",
      },
    });
  if (isValidLogBase(flags.postLogBase))
    expression = logNode(expression, flags.postLogBase);
  if (divisor && Number.isFinite(divisor.value) && divisor.value > 0)
    expression = {
      type: "binary",
      op: "DIV",
      left: expression,
      right: { type: "constant", value: divisor.value },
    };
  return expression;
};

/** Reads the transform off a flat options record: a positive base is on, anything else is off. */
export const flagsFromOptions = (options: {
  preLogBase?: number;
  postLogBase?: number;
  applyCoolerWeights?: boolean;
  resolutionScaling?: boolean;
  resolutionLinearScaling?: boolean;
}): SignalFlags => ({
  preLogBase: isValidLogBase(options.preLogBase) ? options.preLogBase : null,
  postLogBase: isValidLogBase(options.postLogBase) ? options.postLogBase : null,
  applyCoolerWeights: Boolean(options.applyCoolerWeights),
  resolutionScaling: Boolean(options.resolutionScaling),
  resolutionLinearScaling: Boolean(options.resolutionLinearScaling),
});
