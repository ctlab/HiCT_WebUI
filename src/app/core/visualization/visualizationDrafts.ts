import VisualizationOptions, {
  type CoolerWeightsNaNPolicy,
  type SignalDisplayMode,
} from "./VisualizationOptions";
import SimpleLinearGradient from "./colormap/SimpleLinearGradient";
import { ColorTranslator } from "colortranslator";

export type VisualizationContext = {
  source: "PRIMARY" | "SECONDARY";
  targetId: string | null;
  mode: SignalDisplayMode;
};
export type VisualizationDraft = {
  preLogBase?: number;
  postLogBase?: number;
  applyCoolerWeights?: boolean;
  resolutionScaling?: boolean;
  resolutionLinearScaling?: boolean;
  autoThresholdEnabled?: boolean;
  autoThresholdQuantile?: number;
  coolerWeightsNaNPolicy?: CoolerWeightsNaNPolicy;
  minSignal?: number;
  maxSignal?: number;
  startColor?: string;
  endColor?: string;
  gamma?: number;
  curve?: number[] | null;
  diagonalMask?: VisualizationOptions["diagonalMask"];
};
export const visualizationContextKey = (context: VisualizationContext) =>
  JSON.stringify([
    context.source,
    context.targetId,
    context.source === "PRIMARY" ? context.mode : "OBSERVED",
  ]);

/** Field revisions let an acknowledgement clear its own edits while retaining newer ones. */
export class VisualizationDrafts {
  private sequence = 0;
  private readonly revisions = new Map<string, number>();
  private readonly drafts = new Map<
    string,
    Map<keyof VisualizationDraft, { value: unknown; revision: number }>
  >();
  public checkpoint(): number {
    return ++this.sequence;
  }
  public note(
    context: VisualizationContext,
    patch: VisualizationDraft
  ): number {
    const key = visualizationContextKey(context);
    const revision = this.checkpoint();
    const fields = this.drafts.get(key) ?? new Map();
    for (const [field, value] of Object.entries(patch))
      if (value !== undefined)
        fields.set(field as keyof VisualizationDraft, { value, revision });
    this.drafts.set(key, fields);
    this.revisions.set(key, revision);
    return revision;
  }
  public revision(context: VisualizationContext): number {
    return this.revisions.get(visualizationContextKey(context)) ?? 0;
  }
  public read(context: VisualizationContext): VisualizationDraft {
    return Object.fromEntries(
      Array.from(this.drafts.get(visualizationContextKey(context)) ?? []).map(
        ([key, entry]) => [key, entry.value]
      )
    );
  }
  public discardBefore(revision: number): void {
    for (const [context, fields] of this.drafts) {
      for (const [field, entry] of fields)
        if (entry.revision < revision) fields.delete(field);
      if (!fields.size) this.drafts.delete(context);
    }
  }
  public acknowledge(
    context: VisualizationContext,
    through: number,
    selected?: readonly (keyof VisualizationDraft)[]
  ): void {
    const key = visualizationContextKey(context),
      fields = this.drafts.get(key);
    if (!fields) return;
    for (const [field, entry] of fields)
      if (entry.revision <= through && (!selected || selected.includes(field)))
        fields.delete(field);
    if (!fields.size) this.drafts.delete(key);
  }
}

export function applyVisualizationDraft(
  base: VisualizationOptions,
  patch: VisualizationDraft,
  displayMode: SignalDisplayMode = base.signalDisplayMode
): VisualizationOptions {
  const map = base.colormap;
  const hasPalette = [
    "minSignal",
    "maxSignal",
    "startColor",
    "endColor",
    "gamma",
    "curve",
  ].some((key) => key in patch);
  const colormap =
    hasPalette && map instanceof SimpleLinearGradient
      ? new SimpleLinearGradient(
          patch.startColor
            ? new ColorTranslator(patch.startColor, { legacyCSS: true })
            : map.startColorRGBA,
          patch.endColor
            ? new ColorTranslator(patch.endColor, { legacyCSS: true })
            : map.endColorRGBA,
          patch.minSignal ?? map.minSignal,
          patch.maxSignal ?? map.maxSignal,
          patch.gamma ?? map.gamma,
          patch.curve === undefined ? map.curve : patch.curve
        )
      : map;
  return new VisualizationOptions(
    patch.preLogBase ?? base.preLogBase,
    patch.postLogBase ?? base.postLogBase,
    patch.applyCoolerWeights ?? base.applyCoolerWeights,
    patch.resolutionScaling ?? base.resolutionScaling,
    patch.resolutionLinearScaling ?? base.resolutionLinearScaling,
    colormap,
    patch.autoThresholdEnabled ?? base.autoThresholdEnabled,
    patch.autoThresholdQuantile ?? base.autoThresholdQuantile,
    displayMode,
    patch.coolerWeightsNaNPolicy ?? base.coolerWeightsNaNPolicy,
    base.coolerWeightsHaveNaNs,
    base.coolerWeightsNaNCount,
    patch.diagonalMask ?? base.diagonalMask
  );
}

/** Full user preset intent, excluding server-owned weight metadata. */
export function visualizationOptionsDraft(
  options: VisualizationOptions
): VisualizationDraft {
  const gradient =
    options.colormap instanceof SimpleLinearGradient
      ? options.colormap
      : undefined;
  return {
    preLogBase: options.preLogBase,
    postLogBase: options.postLogBase,
    applyCoolerWeights: options.applyCoolerWeights ?? false,
    resolutionScaling: options.resolutionScaling ?? false,
    resolutionLinearScaling: options.resolutionLinearScaling ?? false,
    autoThresholdEnabled: options.autoThresholdEnabled,
    autoThresholdQuantile: options.autoThresholdQuantile,
    coolerWeightsNaNPolicy: options.coolerWeightsNaNPolicy,
    ...(gradient
      ? {
          minSignal: gradient.minSignal,
          maxSignal: gradient.maxSignal,
          startColor: gradient.startColorRGBA.HEXA,
          endColor: gradient.endColorRGBA.HEXA,
          gamma: gradient.gamma,
          ...(gradient.curve ? { curve: gradient.curve } : {}),
        }
      : {}),
  };
}
