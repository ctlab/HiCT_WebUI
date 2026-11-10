import type { CoolerWeightsNaNPolicy } from "./VisualizationOptions";

const KEY_PREFIX = "hict.excludedBinsPolicy:";

/**
 * How bins that the file's balancing excluded are treated, remembered per file name. "DISABLE_WEIGHTS"
 * stands for "do not use the weights from the file". Browser storage may be blocked, so every access
 * is guarded and the application works without it.
 */
export function rememberedExcludedBinsPolicy(
  file: string
): CoolerWeightsNaNPolicy | null {
  try {
    const value = window.localStorage.getItem(KEY_PREFIX + file);
    return value === "DISABLE_WEIGHTS" ||
      value === "REPLACE_NANS_WITH_ONE" ||
      value === "REPLACE_NANS_WITH_ZERO"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function rememberExcludedBinsPolicy(
  file: string,
  policy: CoolerWeightsNaNPolicy
): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + file, policy);
  } catch (error) {
    console.debug("Could not remember the excluded-bins choice", error);
  }
}
