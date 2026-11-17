import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { effectScope, ref, watchEffect } from "vue";
import {
  fixSonnerVisibilityHook,
  sonnerVisibilityPlugins,
} from "./vue-sonner-visibility-fix.mjs";

const entry = new URL(
  "../node_modules/vue-sonner/lib/index.js",
  import.meta.url
);
const original = readFileSync(entry, "utf8");
const fixed = fixSonnerVisibilityHook(original);
function exercise(code, repeats) {
  const listeners = new Set();
  const document = {
    hidden: false,
    addEventListener(type, callback) {
      assert.equal(type, "visibilitychange");
      listeners.add(callback);
    },
    removeEventListener(type, callback) {
      assert.equal(type, "visibilitychange");
      assert.ok(listeners.delete(callback));
    },
  };
  const window = {
    removeEventListener() {
      throw Error("Wrong event target");
    },
  };
  const hook = code.match(/function useIsDocumentHidden\(\) \{[\s\S]*?\n\}/)[0];
  const useHidden = vm.runInNewContext(`(${hook})`, {
    document,
    window,
    ref,
    watchEffect,
  });
  for (let i = 0; i < repeats; i++) {
    const scope = effectScope();
    const state = scope.run(useHidden);
    document.hidden = true;
    [...listeners].forEach((callback) => callback());
    assert.equal(state.isDocumentHidden.value, true);
    document.hidden = false;
    [...listeners].forEach((callback) => callback());
    assert.equal(state.isDocumentHidden.value, false);
    scope.stop();
  }
  return listeners.size;
}
assert.equal(
  exercise(original, 100),
  100,
  "published hook reproduces one leak per toast"
);
assert.equal(
  exercise(fixed, 100),
  0,
  "Vue disposal removes every listener from its original target"
);
assert.throws(() => fixSonnerVisibilityHook(fixed), /Recheck/);
assert.throws(
  () => fixSonnerVisibilityHook("function useIsDocumentHidden() {}"),
  /Recheck/
);
const plugins = sonnerVisibilityPlugins();
assert.equal(plugins.vite.transform(original, entry.pathname).code, fixed);
assert.equal(plugins.vite.transform(original, "/some/other/module.js"), null);
let load;
plugins.esbuild.setup({
  onLoad(_filter, callback) {
    load = callback;
  },
});
assert.equal(load({ path: entry.pathname }).contents, fixed);
console.log(
  "Published notification hook leaks 100 listeners; fixed production/dev transforms release all and preserve visibility updates."
);
