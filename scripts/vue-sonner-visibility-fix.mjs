import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// vue-sonner 2.0.9, upstream issue #168. Keep the workaround local to this
// dependency and fail on upgrades so its lifecycle is reviewed again.
export const SONNER_VISIBILITY_FIX_VERSION = "2.0.9";
const pluginName = "hict-sonner-visibility-cleanup-v1";

export function fixSonnerVisibilityHook(code) {
  const hooks = code.match(/function useIsDocumentHidden\(\) \{[\s\S]*?\n\}/g);
  if (
    hooks?.length !== 1 ||
    !hooks[0].includes("watchEffect(() => {") ||
    !hooks[0].includes(
      'return () => window.removeEventListener("visibilitychange", callback);'
    )
  ) {
    throw new Error(
      "Recheck vue-sonner visibility cleanup and remove or update the HiCT workaround."
    );
  }
  const corrected = hooks[0]
    .replace("watchEffect(() => {", "watchEffect((onCleanup) => {")
    .replace(
      'return () => window.removeEventListener("visibilitychange", callback);',
      'onCleanup(() => document.removeEventListener("visibilitychange", callback));'
    );
  return code.replace(hooks[0], corrected);
}

export function sonnerVisibilityPlugins() {
  const entry = realpathSync(
    fileURLToPath(
      new URL("../node_modules/vue-sonner/lib/index.js", import.meta.url)
    )
  );
  const version = JSON.parse(
    readFileSync(
      new URL("../node_modules/vue-sonner/package.json", import.meta.url),
      "utf8"
    )
  ).version;
  if (version !== SONNER_VISIBILITY_FIX_VERSION) {
    throw new Error(
      `Recheck the vue-sonner visibility workaround before using ${version}.`
    );
  }
  // Check even when an optimizer cache would otherwise avoid reading the module.
  fixSonnerVisibilityHook(readFileSync(entry, "utf8"));
  return {
    vite: {
      name: pluginName,
      enforce: "pre",
      transform(code, id) {
        if (
          id.split("?")[0].replaceAll("\\", "/") !== entry.replaceAll("\\", "/")
        )
          return null;
        return { code: fixSonnerVisibilityHook(code), map: null };
      },
    },
    // Vite dev prebundles dependencies through esbuild before normal transforms.
    esbuild: {
      name: pluginName,
      setup(build) {
        build.onLoad(
          { filter: /[/\\]vue-sonner[/\\]lib[/\\]index\.js$/ },
          ({ path }) => {
            if (realpathSync(path) !== entry) return undefined;
            return {
              contents: fixSonnerVisibilityHook(readFileSync(path, "utf8")),
              loader: "js",
            };
          }
        );
      },
    },
  };
}
