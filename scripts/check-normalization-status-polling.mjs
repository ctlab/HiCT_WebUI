import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { setTimeout as wait } from "node:timers/promises";
import { effectScope, nextTick, ref, shallowRef, watch } from "vue";
import { parse } from "vue/compiler-sfc";
import ts from "typescript";

const path = new URL(
  "../src/app/ui/components/upper_ribbon/NormalizationSelector.vue",
  import.meta.url
);
const { descriptor, errors } = parse(readFileSync(path, "utf8"));
assert.deepEqual(errors, []);
assert.ok(
  descriptor.scriptSetup,
  "The normalization selector must have a setup script"
);
const ast = ts.createSourceFile(
  "NormalizationSelector.ts",
  descriptor.scriptSetup.content,
  ts.ScriptTarget.Latest,
  true
);
const refresh = ast.statements.filter(
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "refreshStatus"
);
const observers = ast.statements.filter(
  (node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(ast) === "watch" &&
    node.expression.arguments[1]?.getText(ast).includes("refreshStatus(")
);
assert.equal(refresh.length, 1);
assert.equal(observers.length, 1);

const calls = [];
const sources = ref({ PRIMARY: { revision: 1 }, SECONDARY: { revision: 3 } });
const activeSource = ref("PRIMARY");
let followCalls = 0;
const requestManager = {
  getNormalizationSourceRevision: (source) => sources.value[source].revision,
  async coverageNormalizationStatus(source) {
    calls.push({ source, revision: sources.value[source].revision });
    // Simulate a status reply invalidating reactive state with the same revision.
    // Bound the feedback so a broken watch fails by count without starving timers.
    if (calls.length < 10) sources.value[source] = { ...sources.value[source] };
    return { state: "READY" };
  },
};
const mapManager = shallowRef({ networkManager: { requestManager } });
const scope = effectScope();
const context = createContext({
  watch,
  props: {
    get mapManager() {
      return mapManager.value;
    },
  },
  activeSource,
  requests: () => mapManager.value?.networkManager.requestManager,
  sourceCurrent: (manager, source, revision) =>
    manager === mapManager.value &&
    requestManager.getNormalizationSourceRevision(source) === revision,
  preparations: {},
  waitForPreparation: async () => {
    ++followCalls;
  },
  console,
});
const script = ts.transpileModule(
  [...refresh, ...observers].map((node) => node.getText(ast)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
).outputText;

try {
  scope.run(() => runInContext(script, context));
  for (let second = 0; second < 10; ++second) {
    sources.value.PRIMARY = { ...sources.value.PRIMARY };
    await wait(1000);
  }
  assert.deepEqual(calls, [{ source: "PRIMARY", revision: 1 }]);
  assert.equal(
    followCalls,
    0,
    "A ready map must not start the preparation poll"
  );

  activeSource.value = "SECONDARY";
  await nextTick();
  sources.value.SECONDARY = { revision: 4 };
  await nextTick();
  assert.deepEqual(calls.slice(1), [
    { source: "SECONDARY", revision: 3 },
    { source: "SECONDARY", revision: 4 },
  ]);
} finally {
  scope.stop();
}
console.log(
  "Ready coverage made one status request in 10 seconds. Source and revision changes each made one."
);
