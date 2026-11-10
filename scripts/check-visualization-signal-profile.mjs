import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../src/app/core/visualization/signalProfile.ts", import.meta.url),
  "utf8"
);
const sandbox = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  sandbox
);
const {
  parseCanonicalSignal,
  buildSignalInput,
  flagsFromOptions,
  isValidLogBase,
} = sandbox.exports;
// Objects made inside the vm have a different realm: compare through JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));

const off = {
  preLogBase: null,
  postLogBase: null,
  applyCoolerWeights: false,
  resolutionScaling: false,
  resolutionLinearScaling: false,
};

// Log validity: base 1, zero, negative and non-numbers can never be applied.
for (const base of [
  1,
  1 + 1e-12,
  0,
  -2,
  Number.NaN,
  Infinity,
  "2",
  null,
  undefined,
])
  assert.equal(isValidLogBase(base), false, `base ${String(base)}`);
for (const base of [2, 10, 0.5, 1.0001, Math.E])
  assert.equal(isValidLogBase(base), true, `base ${base}`);

// Build and extract are inverse for every combination of flags and for several bases.
let combinations = 0;
for (const pre of [null, 2, 10])
  for (const post of [null, 2, 10])
    for (const quadratic of [false, true])
      for (const linear of [false, true])
        for (const weights of [false, true])
          for (const source of ["PRIMARY", "SECONDARY"]) {
            const flags = {
              preLogBase: pre,
              postLogBase: post,
              applyCoolerWeights: weights,
              resolutionScaling: quadratic,
              resolutionLinearScaling: linear,
            };
            const expression = buildSignalInput(source, flags);
            const profile = parseCanonicalSignal(expression);
            assert.ok(profile, `canonical: ${JSON.stringify(flags)}`);
            const {
              source: parsedSource,
              signalDivisor,
              hasExplicitSignalDivisor,
              ...parsed
            } = plain(profile);
            assert.equal(parsedSource, source);
            assert.equal(signalDivisor, 1);
            assert.equal(hasExplicitSignalDivisor, false);
            // `pre log, then nothing` builds log(source), which is the same graph as a post log. It is
            // reported as the signal transform, and the numbers are identical.
            const aliased =
              pre !== null &&
              post === null &&
              !quadratic &&
              !linear &&
              !weights;
            const expectedFlags = aliased
              ? { ...flags, preLogBase: null, postLogBase: pre }
              : flags;
            assert.deepEqual(
              parsed,
              expectedFlags,
              `round trip: ${JSON.stringify(flags)}`
            );
            // Rebuilding the parsed profile reproduces the same graph exactly.
            assert.deepEqual(
              plain(buildSignalInput(source, parsed)),
              plain(expression)
            );
            combinations++;
          }
assert.equal(combinations, 3 * 3 * 2 * 2 * 2 * 2);

// A single log is the signal transform (the post log), wherever the Cooler weights are.
assert.deepEqual(
  plain(
    parseCanonicalSignal({
      type: "log",
      base: 2,
      input: { type: "source", source: "PRIMARY" },
    })
  ),
  {
    ...off,
    postLogBase: 2,
    source: "PRIMARY",
    signalDivisor: 1,
    hasExplicitSignalDivisor: false,
  }
);
// A log under a multiplication is the legacy pre-log, so the post-log toggle is not misreported.
const preOnly = {
  type: "binary",
  op: "MUL",
  left: { type: "log", base: 10, input: { type: "source", source: "PRIMARY" } },
  right: { type: "dynamic", field: "RESOLUTION_LINEAR_SCALING_COEFF" },
};
const preOnlyProfile = plain(parseCanonicalSignal(preOnly));
assert.equal(preOnlyProfile.preLogBase, 10);
assert.equal(preOnlyProfile.postLogBase, null);

// Both operand orders of a multiplication are accepted.
const swapped = {
  type: "binary",
  op: "MUL",
  left: { type: "dynamic", field: "RESOLUTION_SCALING_COEFF" },
  right: { type: "source", source: "PRIMARY" },
};
assert.equal(plain(parseCanonicalSignal(swapped)).resolutionScaling, true);
const swappedWeights = {
  type: "binary",
  op: "MUL",
  left: {
    type: "binary",
    op: "MUL",
    left: {
      type: "track1d",
      trackId: "__builtin_cooler_weights__",
      axis: "COL",
    },
    right: {
      type: "track1d",
      trackId: "__builtin_cooler_weights__",
      axis: "ROW",
    },
  },
  right: { type: "source", source: "PRIMARY" },
};
assert.equal(
  plain(parseCanonicalSignal(swappedWeights)).applyCoolerWeights,
  true
);

// Divisors survive an edit: the rebuild keeps them outermost.
const divided = {
  type: "binary",
  op: "DIV",
  left: buildSignalInput("PRIMARY", { ...off, postLogBase: 2 }),
  right: { type: "constant", value: 4 },
};
const dividedProfile = plain(parseCanonicalSignal(divided));
assert.equal(dividedProfile.signalDivisor, 4);
assert.equal(dividedProfile.hasExplicitSignalDivisor, true);
assert.deepEqual(
  plain(
    buildSignalInput(
      "PRIMARY",
      { ...off, postLogBase: 2 },
      { value: dividedProfile.signalDivisor }
    )
  ),
  plain(divided)
);

// Anything that is not the exact canonical shape is rejected, so it is left untouched.
const sourceNode = { type: "source", source: "PRIMARY" };
const custom = [
  // base 1, zero, negative and missing bases
  { type: "log", base: 1, input: sourceNode },
  { type: "log", base: 0, input: sourceNode },
  { type: "log", base: -10, input: sourceNode },
  { type: "log", input: sourceNode },
  // wrong order: scaling outside the Cooler weights
  {
    type: "binary",
    op: "MUL",
    left: {
      type: "binary",
      op: "MUL",
      left: sourceNode,
      right: {
        type: "binary",
        op: "MUL",
        left: {
          type: "track1d",
          trackId: "__builtin_cooler_weights__",
          axis: "ROW",
        },
        right: {
          type: "track1d",
          trackId: "__builtin_cooler_weights__",
          axis: "COL",
        },
      },
    },
    right: { type: "dynamic", field: "RESOLUTION_SCALING_COEFF" },
  },
  // a constant multiplier (a user's x7 graph), a sum, a second source, a clamp, a track other than the weights
  {
    type: "binary",
    op: "MUL",
    left: sourceNode,
    right: { type: "constant", value: 7 },
  },
  {
    type: "binary",
    op: "ADD",
    left: sourceNode,
    right: { type: "constant", value: 1 },
  },
  {
    type: "binary",
    op: "MUL",
    left: sourceNode,
    right: { type: "source", source: "SECONDARY" },
  },
  { type: "clamp", input: sourceNode },
  {
    type: "binary",
    op: "MUL",
    left: sourceNode,
    right: {
      type: "binary",
      op: "MUL",
      left: { type: "track1d", trackId: "user_track", axis: "ROW" },
      right: { type: "track1d", trackId: "user_track", axis: "COL" },
    },
  },
  // a divisor below a log, zero or negative divisors
  {
    type: "log",
    base: 2,
    input: {
      type: "binary",
      op: "DIV",
      left: sourceNode,
      right: { type: "constant", value: 2 },
    },
  },
  {
    type: "binary",
    op: "DIV",
    left: sourceNode,
    right: { type: "constant", value: 0 },
  },
  {
    type: "binary",
    op: "DIV",
    left: sourceNode,
    right: { type: "constant", value: -3 },
  },
  // two multiplications by the same kind of coefficient
  {
    type: "binary",
    op: "MUL",
    left: {
      type: "binary",
      op: "MUL",
      left: sourceNode,
      right: { type: "dynamic", field: "RESOLUTION_SCALING_COEFF" },
    },
    right: { type: "dynamic", field: "RESOLUTION_SCALING_COEFF" },
  },
  // three logs
  {
    type: "log",
    base: 2,
    input: {
      type: "log",
      base: 2,
      input: { type: "log", base: 2, input: sourceNode },
    },
  },
  null,
  "source",
  [],
  { type: "colormap" },
];
for (const expression of custom)
  assert.equal(
    parseCanonicalSignal(expression),
    null,
    JSON.stringify(expression)
  );

// Rebuilding never reads or writes a base that cannot be applied.
assert.deepEqual(
  plain(buildSignalInput("PRIMARY", { ...off, postLogBase: 1 })),
  { type: "source", source: "PRIMARY" }
);
assert.deepEqual(
  plain(flagsFromOptions({ postLogBase: -10, preLogBase: -1 })),
  off
);
assert.deepEqual(
  plain(
    flagsFromOptions({
      postLogBase: 2,
      preLogBase: 1,
      applyCoolerWeights: true,
    })
  ),
  { ...off, postLogBase: 2, applyCoolerWeights: true }
);
assert.equal(flagsFromOptions({}).postLogBase, null);

// The documented convention: log(1 + x) / log(base). Evaluate a built graph with it.
const evaluate = (node, x) => {
  switch (node.type) {
    case "source":
      return x;
    case "log":
      return (
        Math.log1p(Math.max(0, evaluate(node.input, x))) / Math.log(node.base)
      );
    case "binary":
      if (node.op === "DIV") return evaluate(node.left, x) / node.right.value;
      throw new Error("unsupported in the evaluator");
    default:
      throw new Error(node.type);
  }
};
const log2 = buildSignalInput("PRIMARY", { ...off, postLogBase: 2 });
for (const [x, expected] of [
  [0, 0],
  [1, 1],
  [3, 2],
  [7, 3],
  [255, 8],
  [1023, 10],
])
  assert.ok(Math.abs(evaluate(log2, x) - expected) < 1e-12, `log2(1+${x})`);
const log10 = buildSignalInput("PRIMARY", { ...off, postLogBase: 10 });
assert.ok(Math.abs(evaluate(log10, 99) - 2) < 1e-12);
assert.ok(
  Math.abs(
    evaluate(
      buildSignalInput("PRIMARY", { ...off, postLogBase: 2 }, { value: 2 }),
      7
    ) - 1.5
  ) < 1e-12
);

console.log(
  `Signal profile: ${combinations} build/extract round trips, ${custom.length} custom graphs left untouched, log(1+x)/log(base) convention passed.`
);
