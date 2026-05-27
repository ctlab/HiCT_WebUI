import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const sourcePath = path.join(
  repoRoot,
  "src/app/core/mapmanagers/resolutionModel.ts"
);
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: sourcePath,
}).outputText;

const sandbox = {
  exports: {},
  module: { exports: {} },
  require,
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(compiled, sandbox, { filename: sourcePath });

const {
  buildSourceResolutionDescriptorSet,
  calculateMaximumScaledImageSize,
  getNavigationResolutionModel,
  getResolutionDescriptorForViewResolution,
  getVectorResolutionTuples,
} = sandbox.module.exports;

function assertResolutionDescriptor(set, viewResolution, expectedBpResolution, message) {
  assert.equal(
    getResolutionDescriptorForViewResolution(set, viewResolution).bpResolution,
    expectedBpResolution,
    message
  );
}

function assertContiguousVisibility(set) {
  const tuples = [...set.resolutionTuples].sort(
    (a, b) =>
      a.layerResolutionBorders.minResolutionInclusive -
      b.layerResolutionBorders.minResolutionInclusive
  );
  assert.equal(
    tuples[0].layerResolutionBorders.minResolutionInclusive,
    Number.NEGATIVE_INFINITY,
    `${set.sourceName} finest layer must be visible during overzoom`
  );
  assert.equal(
    tuples[tuples.length - 1].layerResolutionBorders.maxResolutionExclusive,
    Number.POSITIVE_INFINITY,
    `${set.sourceName} coarsest layer must cover far zoom`
  );
  for (let i = 1; i < tuples.length; i += 1) {
    assert.equal(
      tuples[i - 1].layerResolutionBorders.maxResolutionExclusive,
      tuples[i].layerResolutionBorders.minResolutionInclusive,
      `${set.sourceName} layer visibility intervals must not have gaps`
    );
  }
}

function assertNavigationModel(primarySet, secondarySet, expected) {
  const navigationModel = getNavigationResolutionModel(primarySet, secondarySet);
  assert.deepEqual(
    {
      resolutions: [...navigationModel.resolutions],
      pixelResolutionSet: [...navigationModel.pixelResolutionSet],
    },
    expected
  );
}

function assertVectorTuples(primarySet, secondarySet, expected, message) {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        getVectorResolutionTuples(primarySet, secondarySet).map((descriptor) => [
          descriptor.bpResolution,
          descriptor.pixelResolution,
        ])
      )
    ),
    expected,
    message
  );
}

const primaryCoarse = buildSourceResolutionDescriptorSet(
  "PRIMARY",
  [1000, 5000, 10000],
  [300000, 60000, 30000],
  250
);
const secondaryFine = buildSourceResolutionDescriptorSet(
  "SECONDARY",
  [250, 500, 1000, 2500, 5000, 10000, 20000],
  [1200000, 600000, 300000, 120000, 60000, 30000, 15000],
  250
);

assertContiguousVisibility(primaryCoarse);
assertContiguousVisibility(secondaryFine);

assert.deepEqual(primaryCoarse.pixelResolutionSet, [4, 20, 40]);
assert.deepEqual(secondaryFine.pixelResolutionSet, [1, 2, 4, 10, 20, 40, 80]);

assertResolutionDescriptor(
  primaryCoarse,
  0.5,
  1000,
  "primary source should overzoom its finest available 1:1000 layer"
);
assertResolutionDescriptor(
  secondaryFine,
  0.5,
  250,
  "secondary source should overzoom its finest available 1:250 layer"
);
assertResolutionDescriptor(
  primaryCoarse,
  3.9,
  1000,
  "primary source should remain at 1:1000 until its own next threshold"
);
assertResolutionDescriptor(
  secondaryFine,
  3.9,
  500,
  "secondary source should independently use 1:500 at the same view resolution"
);
assertResolutionDescriptor(primaryCoarse, 30, 5000);
assertResolutionDescriptor(secondaryFine, 30, 5000);
assertResolutionDescriptor(primaryCoarse, 120, 10000);
assertResolutionDescriptor(secondaryFine, 120, 20000);

assertNavigationModel(
  primaryCoarse,
  secondaryFine,
  {
    resolutions: [250, 500, 1000, 2500, 5000, 10000, 20000],
    pixelResolutionSet: [1, 2, 4, 10, 20, 40, 80],
  }
);

assertVectorTuples(
  primaryCoarse,
  secondaryFine,
  [
    [1000, 4],
    [5000, 20],
    [10000, 40],
  ],
  "vector layers must use the primary assembly resolutions, not secondary-only tile resolutions"
);

assert.equal(
  calculateMaximumScaledImageSize(primaryCoarse, secondaryFine),
  1200000,
  "projection extent must cover the largest scaled source pyramid"
);

const primaryFine = buildSourceResolutionDescriptorSet(
  "PRIMARY",
  [250, 500, 1000, 2000],
  [1200000, 600000, 300000, 150000],
  250
);
const secondaryCoarse = buildSourceResolutionDescriptorSet(
  "SECONDARY",
  [1000, 5000, 10000],
  [300000, 60000, 30000],
  250
);

assertContiguousVisibility(primaryFine);
assertContiguousVisibility(secondaryCoarse);
assertResolutionDescriptor(
  primaryFine,
  0.5,
  250,
  "primary source may also be the finer source and must overzoom independently"
);
assertResolutionDescriptor(
  secondaryCoarse,
  0.5,
  1000,
  "secondary source may be coarser and must not pretend to have primary pixels"
);
assertResolutionDescriptor(primaryFine, 3.9, 500);
assertResolutionDescriptor(secondaryCoarse, 3.9, 1000);
assertNavigationModel(primaryFine, secondaryCoarse, {
  resolutions: [250, 500, 1000, 2000, 5000, 10000],
  pixelResolutionSet: [1, 2, 4, 8, 20, 40],
});

const primaryNonDivisible = buildSourceResolutionDescriptorSet(
  "PRIMARY",
  [750, 3000, 9000],
  [900000, 225000, 75000],
  250
);
const secondaryNonDivisible = buildSourceResolutionDescriptorSet(
  "SECONDARY",
  [1000, 2500, 7000],
  [675000, 270000, 96429],
  250
);

assertContiguousVisibility(primaryNonDivisible);
assertContiguousVisibility(secondaryNonDivisible);
assertResolutionDescriptor(primaryNonDivisible, 2.9, 750);
assertResolutionDescriptor(secondaryNonDivisible, 2.9, 1000);
assertResolutionDescriptor(primaryNonDivisible, 13, 3000);
assertResolutionDescriptor(secondaryNonDivisible, 13, 2500);
assertNavigationModel(primaryNonDivisible, secondaryNonDivisible, {
  resolutions: [750, 1000, 2500, 3000, 7000, 9000],
  pixelResolutionSet: [3, 4, 10, 12, 28, 36],
});
assertVectorTuples(
  primaryNonDivisible,
  secondaryNonDivisible,
  [
    [750, 3],
    [3000, 12],
    [9000, 36],
  ],
  "vector layers must remain stable on primary assembly resolutions when source resolutions are not multiples"
);

const equalPrimary = buildSourceResolutionDescriptorSet(
  "PRIMARY",
  [1000, 5000, 10000],
  [300000, 60000, 30000],
  1000
);
const equalSecondary = buildSourceResolutionDescriptorSet(
  "SECONDARY",
  [1000, 5000, 10000],
  [300000, 60000, 30000],
  1000
);
assertContiguousVisibility(equalPrimary);
assertContiguousVisibility(equalSecondary);
assertResolutionDescriptor(equalPrimary, 0.25, 1000);
assertResolutionDescriptor(equalSecondary, 0.25, 1000);
assertNavigationModel(equalPrimary, equalSecondary, {
  resolutions: [1000, 5000, 10000],
  pixelResolutionSet: [1, 5, 10],
});
assert.equal(
  calculateMaximumScaledImageSize(equalPrimary, equalSecondary),
  300000,
  "equal-pyramid overlay must keep the original edge-tile extent"
);

console.log("Map resolution model regression check passed.");
