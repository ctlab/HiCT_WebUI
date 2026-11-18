/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

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

import {
  GetVisualizationOptionsRequest,
  SetVisualizationOptionsRequest,
} from "../net/api/request";
import { ContactMapManager } from "./ContactMapManager";
import {
  buildSignalInput,
  flagsFromOptions,
  parseCanonicalSignal,
  type SignalProfile,
} from "@/app/core/visualization/signalProfile";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { reportFailure } from "@/app/ui/reportFailure";
import { toast } from "vue-sonner";
import {
  diagnosticBounds,
  querySignalHistogram,
} from "../visualization/signalDiagnostics";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import {
  VisualizationDrafts,
  applyVisualizationDraft,
  visualizationOptionsDraft,
  visualizationContextKey,
  type VisualizationContext,
  type VisualizationDraft,
} from "../visualization/visualizationDrafts";
import { rememberExcludedBinsPolicy } from "../visualization/excludedBinsMemory";
import VisualizationOptions, {
  type CoolerWeightsNaNPolicy,
  type SignalDisplayMode,
} from "../visualization/VisualizationOptions";
import SimpleLinearGradient from "../visualization/colormap/SimpleLinearGradient";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";
import {
  buildColorExpression,
  type SourceName,
} from "../visualization/renderPipelineWizard";
import { ColorTranslator } from "colortranslator";

import { histogramQuantile } from "../visualization/tileSignalRange";
import { parseOePalette } from "../visualization/oePalette";
import type { DisplayPalette } from "../visualization/displayPaletteMemory";
import {
  recalledDisplayPalette,
  rememberDisplayPalette,
} from "../visualization/displayPaletteMemory";

type ViewportPixelBounds = {
  unit?: "PIXELS" | "BINS";
  bpResolution: number;
  startRowPx: number;
  endRowPx: number;
  startColPx: number;
  endColPx: number;
};

type PipelineSignalProfile = SignalProfile & {
  /**
   * True when the signal subtree has exactly the canonical shape, so sidebar edits may rebuild it.
   * False for a custom graph, which edits must leave untouched.
   */
  editableInput: boolean;
};

type ColormapTarget = {
  id: string;
  node: Record<string, unknown>;
  profile: PipelineSignalProfile;
  minSignal: number;
  maxSignal: number;
};

const OPENING_THRESHOLD_QUANTILE = 0.995;
const OPENING_THRESHOLD_MAX_MAP_SIZE_PX = 2000;

const clampQuantile = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0.995;
  }
  return Math.min(0.999999, Math.max(0.5, value));
};

const swapNumbers = (values: number[], left: number, right: number): void => {
  if (left === right) {
    return;
  }
  const tmp = values[left];
  values[left] = values[right];
  values[right] = tmp;
};

const selectNthNumber = (values: number[], index: number): number | null => {
  if (values.length === 0) {
    return null;
  }
  const target = Math.max(0, Math.min(values.length - 1, Math.trunc(index)));
  let left = 0;
  let right = values.length - 1;
  while (left <= right) {
    const pivot = values[Math.floor((left + right) / 2)];
    let lower = left;
    let cursor = left;
    let upper = right;
    while (cursor <= upper) {
      const value = values[cursor];
      if (value < pivot) {
        swapNumbers(values, lower, cursor);
        lower += 1;
        cursor += 1;
      } else if (value > pivot) {
        swapNumbers(values, cursor, upper);
        upper -= 1;
      } else {
        cursor += 1;
      }
    }
    if (target < lower) {
      right = lower - 1;
    } else if (target > upper) {
      left = upper + 1;
    } else {
      return values[target] ?? pivot;
    }
  }
  return values[target] ?? null;
};

const computeFiniteQuantile = (
  values: Float32Array,
  quantile: number,
  nearestRank = false
): number | null => {
  const filtered: number[] = [];
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      filtered.push(value);
    }
  }
  if (filtered.length === 0) {
    return null;
  }
  const position = Math.min(
    filtered.length - 1,
    Math.max(
      0,
      nearestRank
        ? Math.ceil(clampQuantile(quantile) * filtered.length) - 1
        : Math.floor(clampQuantile(quantile) * (filtered.length - 1))
    )
  );
  return selectNthNumber(filtered, position);
};

const computeFinitePositiveMax = (values: Float32Array): number | null => {
  let maxValue: number | null = null;
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      maxValue = maxValue == null ? value : Math.max(maxValue, value);
    }
  }
  return maxValue;
};

const resolveSafeAutoUpperBound = (
  values: Float32Array,
  quantile: number,
  minSignal: number,
  currentMaxSignal: number,
  nearestRank = false
): number | null => {
  const quantileValue = computeFiniteQuantile(values, quantile, nearestRank);
  const maxValue = computeFinitePositiveMax(values);
  const minGap = Math.max(Math.abs(minSignal) * 1e-6, 1e-12);
  const candidate =
    quantileValue != null && quantileValue > minSignal + minGap
      ? quantileValue
      : maxValue != null && maxValue > minSignal + minGap
      ? maxValue
      : null;
  if (candidate == null || !Number.isFinite(candidate)) {
    return null;
  }
  if (Math.abs(candidate - currentMaxSignal) < 1e-9) {
    return currentMaxSignal;
  }
  return candidate;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeColorTranslator = (
  value: unknown,
  fallback: string
): ColorTranslator => {
  if (typeof value !== "string" || value.length > 128) {
    return new ColorTranslator(fallback, { legacyCSS: true });
  }
  try {
    return new ColorTranslator(value, { legacyCSS: true });
  } catch {
    return new ColorTranslator(fallback, { legacyCSS: true });
  }
};

const extractPipelineSignalProfile = (
  expression: unknown
): PipelineSignalProfile | null => {
  const profile = parseCanonicalSignal(expression);
  return profile ? { ...profile, editableInput: true } : null;
};

const collectColormapTargets = (
  expression: unknown,
  output: ColormapTarget[],
  path = "root"
): void => {
  if (!isRecord(expression)) {
    return;
  }
  const type = String(expression.type ?? "")
    .trim()
    .toLowerCase();
  if (type === "colormap") {
    let profile = extractPipelineSignalProfile(expression.input);
    if (!profile) {
      const sources = new Set<SourceName>();
      const visit = (node: unknown): void => {
        if (!isRecord(node)) return;
        if (node.type === "source")
          sources.add(node.source === "SECONDARY" ? "SECONDARY" : "PRIMARY");
        Object.values(node).forEach(visit);
      };
      visit(expression.input);
      if (sources.size === 1) {
        const bare = extractPipelineSignalProfile({
          type: "source",
          source: [...sources][0],
        });
        // The graph is custom: the target can be selected for colors and range, never for signal edits.
        profile = bare ? { ...bare, editableInput: false } : null;
      }
    }
    if (profile) {
      output.push({
        id: path,
        node: expression,
        profile,
        minSignal: toFiniteNumber(
          isRecord(expression.min) && expression.min.type === "constant"
            ? expression.min.value
            : expression.minSignal,
          0
        ),
        maxSignal: toFiniteNumber(
          isRecord(expression.max) && expression.max.type === "constant"
            ? expression.max.value
            : expression.maxSignal,
          1
        ),
      });
    }
  }
  [
    "input",
    "left",
    "right",
    "top",
    "bottom",
    "c1",
    "c2",
    "c3",
    "alpha",
  ].forEach((key) => {
    if (key in expression) {
      collectColormapTargets(expression[key], output, `${path}.${key}`);
    }
  });
};

export type VisualizationPipelineTarget = {
  id: string;
  source: SourceName;
  /** Triangle the colormap feeds: `upperExpression` or `lowerExpression`. */
  half: "upper" | "lower";
  label: string;
  mode: string;
  displayUnit: "PERCENT" | null;
};

const collectConfigColormapTargets = (
  config: Record<string, unknown>
): ColormapTarget[] => {
  const targets: ColormapTarget[] = [];
  collectColormapTargets(config.upperExpression, targets, "upper");
  collectColormapTargets(config.lowerExpression, targets, "lower");
  return targets;
};

const cloneRecord = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const replaceColormapNode = (
  target: ColormapTarget,
  replacement: Record<string, unknown>,
  signalInput?: Record<string, unknown>
): void => {
  // Signal edits (transform, scaling, weights) arrive as a rebuilt canonical input. A custom graph
  // gets none, so its processing is never reconstructed by colour or contrast edits.
  if (signalInput) target.node.input = signalInput;
  const previousMode = String(target.node.mode ?? "LINEAR").toUpperCase();
  target.node.type = "colormap";
  target.node.mode = ["MODDOTPLOT_IDENTITY", "OBSERVED_OVER_EXPECTED"].includes(
    previousMode
  )
    ? previousMode
    : replacement.mode ?? "LINEAR";
  target.node.startColor = replacement.startColor;
  target.node.endColor = replacement.endColor;
  if (replacement.gamma === undefined) delete target.node.gamma;
  else target.node.gamma = replacement.gamma;
  target.node.minSignal = replacement.minSignal;
  target.node.maxSignal = replacement.maxSignal;
  for (const [key, value] of [
    ["min", replacement.minSignal],
    ["max", replacement.maxSignal],
  ] as const) {
    const previous = target.node[key];
    target.node[key] = {
      ...(isRecord(previous) ? previous : {}),
      type: "constant",
      value,
      rangeSource: target.profile.source,
      rangeOutput: key === "min" ? "selectedMin" : "selectedMax",
    };
  }
};

const visualizationOptionsFromTarget = (
  target: ColormapTarget,
  currentOptions: VisualizationOptions
): VisualizationOptions =>
  new VisualizationOptions(
    target.profile.preLogBase ?? -1,
    target.profile.postLogBase ?? -1,
    target.profile.applyCoolerWeights,
    target.profile.resolutionScaling,
    target.profile.resolutionLinearScaling,
    new SimpleLinearGradient(
      safeColorTranslator(target.node.startColor, "#ffffff00"),
      safeColorTranslator(target.node.endColor, "#006000ff"),
      target.minSignal,
      target.maxSignal,
      Number(target.node.gamma ?? 1)
    ),
    currentOptions.autoThresholdEnabled,
    currentOptions.autoThresholdQuantile,
    currentOptions.signalDisplayMode,
    // An explicit weight product is enabled even when the other source uses no weights.
    target.profile.applyCoolerWeights &&
    currentOptions.coolerWeightsNaNPolicy === "DISABLE_WEIGHTS"
      ? "REPLACE_NANS_WITH_ZERO"
      : currentOptions.coolerWeightsNaNPolicy,
    currentOptions.coolerWeightsHaveNaNs,
    currentOptions.coolerWeightsNaNCount
  );

const swapPixelBlendLayers = (expression: unknown): boolean => {
  if (!isRecord(expression)) {
    return false;
  }
  let changed = false;
  if (
    String(expression.type ?? "")
      .trim()
      .toLowerCase() === "pixel_blend"
  ) {
    const top = expression.top;
    expression.top = expression.bottom;
    expression.bottom = top;
    const topOpacity = expression.topOpacity;
    expression.topOpacity = expression.bottomOpacity;
    expression.bottomOpacity = topOpacity;
    changed = true;
  }
  [
    "input",
    "left",
    "right",
    "top",
    "bottom",
    "c1",
    "c2",
    "c3",
    "alpha",
  ].forEach((key) => {
    if (key in expression && swapPixelBlendLayers(expression[key])) {
      changed = true;
    }
  });
  return changed;
};

const transformSignalsForProfile = (
  values: Float32Array,
  profile: PipelineSignalProfile,
  scalingCoefficients: { quadratic: number; linear: number }
): Float32Array => {
  const transformed = new Float32Array(values.length);
  const preLogDivisor =
    profile.preLogBase != null ? Math.log(profile.preLogBase) : null;
  const postLogDivisor =
    profile.postLogBase != null ? Math.log(profile.postLogBase) : null;
  for (let index = 0; index < values.length; index += 1) {
    let signal = values[index] ?? 0;
    if (!Number.isFinite(signal) || signal < 0) {
      signal = 0;
    }
    signal /= profile.signalDivisor;
    if (preLogDivisor != null && preLogDivisor > 0) {
      signal = Math.log1p(signal) / preLogDivisor;
    }
    if (profile.resolutionScaling) {
      signal *= scalingCoefficients.quadratic;
    }
    if (profile.resolutionLinearScaling) {
      signal *= scalingCoefficients.linear;
    }
    if (postLogDivisor != null && postLogDivisor > 0) {
      signal =
        Number.isFinite(signal) && signal > 0
          ? Math.log1p(signal) / postLogDivisor
          : 0;
    }
    transformed[index] = Number.isFinite(signal) && signal > 0 ? signal : 0;
  }
  return transformed;
};

class VisualizationManager {
  public static readonly VISUALIZATION_OPTIONS_UPDATED_EVENT =
    "hict:visualization-options-updated";
  public readonly visualizationOptionsStore = useVisualizationOptionsStore();
  private readonly moveEndListener?: EventsKey;
  private expectedProfileSyncInFlight = false;
  private pendingExpectedProfileRefresh = false;
  private readonly pendingOptionRequests = new Set<Promise<unknown>>();
  private visualizationOptionsLoadGeneration = 0;
  private observedDisplayOptions: VisualizationOptions | null = null;
  private readonly drafts = new VisualizationDrafts();
  private readonly draftTimers = new Map<
    string,
    { context: VisualizationContext; timer: number }
  >();
  private mutationTail: Promise<unknown> = Promise.resolve();
  private mutationContext: VisualizationContext | undefined;
  private readonly latestApplications = new Map<string, number>();
  private applicationSequence = 0;
  private readonly normalizationFits = new Map<
    string,
    { revision: number; quantile: number }
  >();

  // Opening fits contrast once. Navigation may update the slider domain, but
  // must not refit thresholds, publish a pipeline or invalidate decoded tiles.

  public constructor(public readonly mapManager: ContactMapManager) {
    this.moveEndListener = this.mapManager.getMap().on("moveend", () => {
      void this.refreshExpectedProfileOnMoveEnd();
    });
  }

  public dispose(): void {
    ++this.visualizationOptionsLoadGeneration;
    this.latestApplications.clear();
    this.normalizationFits.clear();
    for (const { timer } of this.draftTimers.values())
      window.clearTimeout(timer);
    this.draftTimers.clear();
    if (this.moveEndListener) {
      unByKey(this.moveEndListener);
    }
  }

  public async waitForPendingOptionRequests(): Promise<void> {
    this.flushVisualizationDrafts();
    while (this.pendingOptionRequests.size > 0 || this.draftTimers.size > 0) {
      this.flushVisualizationDrafts();
      await Promise.allSettled([...this.pendingOptionRequests]);
    }
  }

  private trackOptionRequest<T>(request: Promise<T>): Promise<T> {
    this.pendingOptionRequests.add(request);
    void request.then(
      () => this.pendingOptionRequests.delete(request),
      () => this.pendingOptionRequests.delete(request)
    );
    return request;
  }

  public captureVisualizationContext(
    source?: SourceName,
    targetId?: string | null
  ): VisualizationContext {
    const view = useMatrixViewStore();
    const resolvedSource = source ?? view.activeVisualizationSource;
    const mode = this.visualizationOptionsStore.signalDisplayMode;
    return {
      source: resolvedSource,
      targetId:
        resolvedSource === "PRIMARY" && mode !== "OBSERVED"
          ? null
          : targetId === undefined
          ? view.activeVisualizationTargetId
          : targetId,
      mode,
    };
  }

  private refreshVisualizationDraftState(): void {
    if (this.mapManager.isDisposed) return;
    const context = this.captureVisualizationContext();
    this.visualizationOptionsStore.visualizationDraftState = Object.keys(
      this.drafts.read(context)
    ).length
      ? this.draftTimers.has(visualizationContextKey(context))
        ? "scheduled"
        : "unapplied"
      : null;
  }

  private acknowledgeVisualizationDraft(
    context: VisualizationContext,
    revision: number,
    fields?: readonly (keyof VisualizationDraft)[]
  ): void {
    this.drafts.acknowledge(context, revision, fields);
    this.refreshVisualizationDraftState();
  }

  public noteVisualizationDraft(patch: VisualizationDraft, valid = true): void {
    if (this.mapManager.isDisposed || !Object.keys(patch).length) return;
    const context = this.captureVisualizationContext();
    this.drafts.note(context, patch);
    if (
      ["minSignal", "maxSignal", "startColor", "endColor", "gamma"].some(
        (field) => field in patch
      )
    )
      this.normalizationFits.delete(visualizationContextKey(context));
    this.cancelDraftTimer(context);
    if (!valid) {
      this.refreshVisualizationDraftState();
      return;
    }
    const key = visualizationContextKey(context);
    const timer = window.setTimeout(() => {
      this.draftTimers.delete(key);
      void this.queueVisualizationApplication(context).catch(
        (error) =>
          !this.mapManager.isDisposed &&
          reportFailure("Apply visualization settings", error)
      );
    }, 350);
    this.draftTimers.set(key, { context, timer });
    this.refreshVisualizationDraftState();
  }

  private cancelDraftTimer(context: VisualizationContext): void {
    const key = visualizationContextKey(context),
      pending = this.draftTimers.get(key);
    if (pending) window.clearTimeout(pending.timer);
    this.draftTimers.delete(key);
  }

  private flushVisualizationDrafts(): void {
    for (const { context, timer } of Array.from(this.draftTimers.values())) {
      window.clearTimeout(timer);
      this.draftTimers.delete(visualizationContextKey(context));
      void this.queueVisualizationApplication(context).catch(
        (error) =>
          !this.mapManager.isDisposed &&
          reportFailure("Apply visualization settings", error)
      );
    }
  }

  private runVisualizationMutation<T>(
    context: VisualizationContext,
    work: () => Promise<T>
  ): Promise<T> {
    this.visualizationOptionsStore.pendingVisualizationMutations++;
    const request = this.mutationTail
      .catch(() => undefined)
      .then(async () => {
        if (this.mapManager.isDisposed)
          throw new Error(
            "The map was closed before the visualization change was applied."
          );
        ++this.visualizationOptionsLoadGeneration;
        this.mutationContext = context;
        try {
          return await work();
        } finally {
          this.mutationContext = undefined;
          ++this.visualizationOptionsLoadGeneration;
          if (!this.mapManager.isDisposed) {
            const active = this.captureVisualizationContext();
            await this.loadVisualizationOptionsForSource(
              active.source,
              active.targetId
            ).catch(() => undefined);
          }
        }
      })
      .finally(() => {
        this.visualizationOptionsStore.pendingVisualizationMutations--;
      });
    this.mutationTail = request;
    return this.trackOptionRequest(request);
  }

  private projectVisualizationOptions(
    options: VisualizationOptions,
    context = this.mutationContext ?? this.captureVisualizationContext()
  ): VisualizationOptions {
    if (this.mapManager.isDisposed) return options;
    // Display mode belongs to the primary map even while the sidebar shows Secondary.
    if (context.source === "PRIMARY")
      this.visualizationOptionsStore.signalDisplayMode =
        options.signalDisplayMode;
    const projectedContext = {
      ...context,
      targetId:
        context.source === "PRIMARY" && options.signalDisplayMode !== "OBSERVED"
          ? null
          : context.targetId,
      mode: options.signalDisplayMode,
    };
    const visible = this.captureVisualizationContext();
    if (
      projectedContext.source !== visible.source ||
      projectedContext.targetId !== visible.targetId ||
      visualizationContextKey(projectedContext) !==
        visualizationContextKey(visible)
    )
      return options;
    const projected = applyVisualizationDraft(
      options,
      this.drafts.read(projectedContext)
    );
    this.visualizationOptionsStore.setVisualizationOptions(projected);
    this.refreshVisualizationDraftState();
    return projected;
  }

  private async freshVisualizationOptions(
    context: VisualizationContext
  ): Promise<VisualizationOptions> {
    const api = this.mapManager.networkManager.requestManager;
    const primary = await api.getVisualizationOptions(
      new GetVisualizationOptionsRequest({})
    );
    if (
      context.source === "PRIMARY" &&
      primary.signalDisplayMode !== "OBSERVED"
    )
      return primary;
    const config = await this.getActiveRenderPipelineConfig();
    if (!config) {
      if (context.source === "SECONDARY")
        throw new Error("The Secondary colormap is no longer available.");
      return primary;
    }
    const targets = collectConfigColormapTargets(config).filter(
      (target) => target.profile.source === context.source
    );
    const target = context.targetId
      ? targets.find((target) => target.id === context.targetId)
      : targets[0];
    if (!target)
      throw new Error(
        "The selected colormap changed. Select it again before applying edits."
      );
    return visualizationOptionsFromTarget(target, primary);
  }

  private queueVisualizationApplication(
    context: VisualizationContext,
    fallback?: VisualizationOptions
  ): Promise<VisualizationOptions> {
    this.cancelDraftTimer(context);
    const patch = this.drafts.read(context),
      revision = this.drafts.revision(context);
    if (!fallback && !Object.keys(patch).length)
      return Promise.resolve(
        this.visualizationOptionsStore.asVisualizationOptions()
      );
    const key = visualizationContextKey(context),
      ticket = ++this.applicationSequence;
    this.latestApplications.set(key, ticket);
    return this.runVisualizationMutation(context, async () => {
      const fresh = await this.freshVisualizationOptions(context);
      if (this.latestApplications.get(key) !== ticket) return fresh;
      if (
        context.source === "PRIMARY" &&
        fresh.signalDisplayMode !== context.mode
      )
        throw new Error(
          "The display mode changed. Reopen the color controls before applying edits."
        );
      const options = Object.keys(patch).length
        ? applyVisualizationDraft(fresh, patch)
        : fallback!;
      if (!this.validVisualizationRange(options, context)) {
        if (!fallback) return fresh;
        throw new Error(
          "Enter a finite range with Lower below Upper. O/E limits must surround 1."
        );
      }
      const result = await this.applyVisualizationSnapshot(context, options);
      const fit = this.normalizationFits.get(key);
      if (fit && this.drafts.revision(context) === revision) {
        await this.fitVisualizationContext(context, fit.quantile, revision);
        if (this.normalizationFits.get(key)?.revision === fit.revision)
          this.normalizationFits.delete(key);
      }
      this.acknowledgeVisualizationDraft(context, revision);
      return result;
    });
  }

  public fetchVisualizationOptions(): Promise<VisualizationOptions> {
    const context = this.captureVisualizationContext();
    if (context.source === "SECONDARY")
      return this.trackOptionRequest(
        this.loadVisualizationOptionsForSource(context.source, context.targetId)
      );
    const loadGeneration = ++this.visualizationOptionsLoadGeneration;
    if (this.mapManager.isDisposed) {
      return Promise.resolve(
        this.visualizationOptionsStore.asVisualizationOptions()
      );
    }
    const request = this.mapManager.networkManager.requestManager
      .getVisualizationOptions(new GetVisualizationOptionsRequest({}))
      .then((options) => {
        if (
          !this.mapManager.isDisposed &&
          loadGeneration === this.visualizationOptionsLoadGeneration
        ) {
          this.projectVisualizationOptions(options);
          window.dispatchEvent(
            new CustomEvent(
              VisualizationManager.VISUALIZATION_OPTIONS_UPDATED_EVENT,
              {
                detail: { source: "server_fetch", options },
              }
            )
          );
        }
        return options;
      });
    return this.trackOptionRequest(request);
  }

  public async loadVisualizationOptionsForSource(
    source?: SourceName,
    targetId?: string | null
  ): Promise<VisualizationOptions> {
    const captured = this.captureVisualizationContext(source, targetId);
    this.refreshVisualizationDraftState();
    const generation = ++this.visualizationOptionsLoadGeneration;
    if (this.mapManager.isDisposed)
      return this.visualizationOptionsStore.asVisualizationOptions();
    const primary =
      await this.mapManager.networkManager.requestManager.getVisualizationOptions(
        new GetVisualizationOptionsRequest({})
      );
    if (
      this.mapManager.isDisposed ||
      generation !== this.visualizationOptionsLoadGeneration
    )
      return this.visualizationOptionsStore.asVisualizationOptions();
    const context: VisualizationContext = {
      ...captured,
      targetId:
        captured.source === "PRIMARY" &&
        primary.signalDisplayMode !== "OBSERVED"
          ? null
          : captured.targetId,
      mode: primary.signalDisplayMode,
    };
    let options = primary,
      editable = true,
      origin = "server_fetch";
    if (
      source &&
      !(source === "PRIMARY" && primary.signalDisplayMode !== "OBSERVED")
    ) {
      const config = await this.getActiveRenderPipelineConfig();
      if (
        this.mapManager.isDisposed ||
        generation !== this.visualizationOptionsLoadGeneration
      )
        return this.visualizationOptionsStore.asVisualizationOptions();
      const targets = config
        ? collectConfigColormapTargets(config).filter(
            (target) => target.profile.source === source
          )
        : [];
      const target =
        targets.find((target) => target.id === context.targetId) ?? targets[0];
      if (target) {
        options = visualizationOptionsFromTarget(target, primary);
        editable = target.profile.editableInput;
        origin = "pipeline_source_fetch";
      } else if (source === "SECONDARY") {
        if (this.captureVisualizationContext().source === "SECONDARY")
          this.visualizationOptionsStore.signalEditable = false;
        throw new Error(
          "No active Secondary colormap is available. Enable its rendering graph first."
        );
      }
    }
    if (
      this.mapManager.isDisposed ||
      generation !== this.visualizationOptionsLoadGeneration
    )
      return this.visualizationOptionsStore.asVisualizationOptions();
    // The header's optimistic mode is not evidence that a mode request committed.
    this.visualizationOptionsStore.signalDisplayMode =
      primary.signalDisplayMode;
    this.projectVisualizationOptions(options, context);
    if (
      visualizationContextKey(context) ===
      visualizationContextKey(this.captureVisualizationContext())
    )
      this.visualizationOptionsStore.signalEditable = editable;
    window.dispatchEvent(
      new CustomEvent(
        VisualizationManager.VISUALIZATION_OPTIONS_UPDATED_EVENT,
        { detail: { source: origin, context, options } }
      )
    );
    return options;
  }

  public async getVisualizationPipelineTargets(): Promise<
    VisualizationPipelineTarget[]
  > {
    const config = await this.getActiveRenderPipelineConfig();
    if (!config) return [];
    const counts = new Map<SourceName, number>();
    return collectConfigColormapTargets(config).map((target) => {
      const index = (counts.get(target.profile.source) ?? 0) + 1;
      counts.set(target.profile.source, index);
      const half = target.id.startsWith("upper") ? "upper" : "lower";
      const mode = String(target.node.mode ?? "LINEAR");
      return {
        id: target.id,
        source: target.profile.source,
        half,
        label: `${half} ${
          mode === "MODDOTPLOT_IDENTITY" ? "identity" : "colormap"
        } ${index}`,
        mode,
        displayUnit:
          mode === "MODDOTPLOT_IDENTITY" &&
          target.profile.hasExplicitSignalDivisor
            ? "PERCENT"
            : null,
      };
    });
  }

  public async getSourceSignalExpression(
    source: SourceName,
    targetId?: string | null
  ): Promise<Record<string, unknown>> {
    const config = await this.getActiveRenderPipelineConfig();
    if (!config)
      return (
        buildColorExpression(
          source,
          this.visualizationOptionsStore.asVisualizationOptions()
        ) as unknown as Record<string, unknown>
      ).input as Record<string, unknown>;
    const targets = collectConfigColormapTargets(config).filter(
      (target) => target.profile.source === source
    );
    const target =
      targets.find((target) => target.id === targetId) ?? targets[0];
    if (!target || !isRecord(target.node.input))
      throw new Error(`No numeric colormap input is available for ${source}.`);
    return cloneRecord(target.node.input);
  }

  private async getActiveRenderPipelineConfig(): Promise<Record<
    string,
    unknown
  > | null> {
    const config =
      await this.mapManager.networkManager.requestManager.getRenderPipelineConfig();
    return isRecord(config) && Boolean(config.enabled ?? false) ? config : null;
  }

  private updateRenderPipelineSource(
    config: Record<string, unknown>,
    source: SourceName,
    options: VisualizationOptions,
    targetId?: string | null
  ): boolean {
    const targets = collectConfigColormapTargets(config);
    const replacement = buildColorExpression(
      source,
      options
    ) as unknown as Record<string, unknown>;
    let changed = false;
    for (const target of targets) {
      if (
        target.profile.source === source &&
        (!targetId || target.id === targetId)
      ) {
        replaceColormapNode(
          target,
          replacement,
          target.profile.editableInput
            ? buildSignalInput(
                target.profile.source,
                flagsFromOptions(options),
                target.profile.hasExplicitSignalDivisor
                  ? { value: target.profile.signalDivisor }
                  : null
              )
            : undefined
        );
        changed = true;
      }
    }
    return changed;
  }

  private resolveResolutionScalingCoefficients(): {
    quadratic: number;
    linear: number;
  } {
    const descriptor =
      this.mapManager.viewAndLayersManager.currentViewState.resolutionDesciptor;
    const resolutions = this.mapManager.getOptions().response.resolutions ?? [];
    const resolutionIndex = Math.max(
      0,
      Math.trunc(
        Number.isFinite(descriptor.imageSizeIndex)
          ? descriptor.imageSizeIndex
          : 0
      )
    );
    if (resolutionIndex <= 1) {
      return { quadratic: 1, linear: 1 };
    }
    const referenceResolution = Number(
      resolutions[1] ?? descriptor.bpResolution
    );
    const currentResolution = Number(
      resolutions[resolutionIndex] ?? descriptor.bpResolution
    );
    if (
      !Number.isFinite(referenceResolution) ||
      !Number.isFinite(currentResolution) ||
      referenceResolution <= 0 ||
      currentResolution <= 0
    ) {
      return { quadratic: 1, linear: 1 };
    }
    const ratio = currentResolution / referenceResolution;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return { quadratic: 1, linear: 1 };
    }
    return {
      quadratic: 1 / (ratio * ratio),
      linear: 1 / ratio,
    };
  }

  private resolveViewportPixelBounds(
    paddingPx = 0
  ): ViewportPixelBounds | null {
    const size = this.mapManager.map.getSize();
    if (!size || size.length < 2 || size[0] <= 0 || size[1] <= 0) {
      return null;
    }
    const descriptor =
      this.mapManager.viewAndLayersManager.currentViewState.resolutionDesciptor;
    if (descriptor.displayGrid === "SEQUENCE_BP")
      return this.mapManager.viewAndLayersManager.getNativeMatrixBounds(
        this.mapManager.getView().calculateExtent(size)
      );
    if (
      !Number.isFinite(descriptor.bpResolution) ||
      !Number.isFinite(descriptor.pixelResolution) ||
      descriptor.pixelResolution <= 0
    ) {
      return null;
    }
    const rawMapSizePx = Number(
      this.mapManager.viewAndLayersManager.imageSizes[
        descriptor.imageSizeIndex
      ] ?? NaN
    );
    if (!Number.isFinite(rawMapSizePx) || rawMapSizePx <= 0) {
      return null;
    }
    const mapSizePx = Math.max(1, Math.round(rawMapSizePx));
    const view = this.mapManager.getView();
    const center = view.getCenter();
    const resolution = view.getResolution();
    if (
      !center ||
      center.length < 2 ||
      !center.every((value) => Number.isFinite(value)) ||
      resolution === undefined ||
      !Number.isFinite(resolution)
    ) {
      return null;
    }
    const extent = view.calculateExtent(size);
    const pad = Math.max(0, Math.round(paddingPx));
    const clampLowerBound = (value: number): number =>
      Math.max(0, Math.min(mapSizePx - 1, value));
    const clampUpperBound = (value: number): number =>
      Math.max(0, Math.min(mapSizePx, value));
    const startColPx = clampLowerBound(
      Math.floor((extent[0] ?? 0) / descriptor.pixelResolution) - pad
    );
    const endColPx = Math.min(
      mapSizePx,
      Math.max(
        startColPx + 1,
        clampUpperBound(
          Math.ceil((extent[2] ?? 0) / descriptor.pixelResolution) + pad
        )
      )
    );
    const startRowPx = clampLowerBound(
      Math.floor(-(extent[3] ?? 0) / descriptor.pixelResolution) - pad
    );
    const endRowPx = Math.min(
      mapSizePx,
      Math.max(
        startRowPx + 1,
        clampUpperBound(
          Math.ceil(-(extent[1] ?? 0) / descriptor.pixelResolution) + pad
        )
      )
    );
    return {
      bpResolution: descriptor.bpResolution,
      startRowPx,
      endRowPx,
      startColPx,
      endColPx,
    };
  }

  public resolveExpectedProfileBounds(): ViewportPixelBounds | null {
    return this.resolveViewportPixelBounds(
      Math.max(0, Math.round(this.mapManager.getOptions().tileSize || 0))
    );
  }

  private resolveOpeningFullMapPixelBounds(
    maxMapSizePx = OPENING_THRESHOLD_MAX_MAP_SIZE_PX
  ): ViewportPixelBounds | null {
    const safeMaxMapSizePx = Math.max(1, Math.floor(maxMapSizePx));
    const viewAndLayersManager = this.mapManager.viewAndLayersManager;
    const candidates = viewAndLayersManager.resolutionTuples
      .map((descriptor) => {
        const rawMapSizePx = Number(
          viewAndLayersManager.imageSizes[descriptor.imageSizeIndex] ?? NaN
        );
        const mapSizePx = Number.isFinite(rawMapSizePx)
          ? Math.max(1, Math.round(rawMapSizePx))
          : NaN;
        return { descriptor, mapSizePx };
      })
      .filter(({ descriptor, mapSizePx }) => {
        return (
          Number.isFinite(descriptor.bpResolution) &&
          Number.isFinite(descriptor.pixelResolution) &&
          descriptor.bpResolution > 0 &&
          descriptor.pixelResolution > 0 &&
          Number.isFinite(mapSizePx) &&
          mapSizePx > 0 &&
          mapSizePx <= safeMaxMapSizePx
        );
      })
      .sort((left, right) => {
        const byPixelResolution =
          right.descriptor.pixelResolution - left.descriptor.pixelResolution;
        if (Math.abs(byPixelResolution) > 1e-9) {
          return byPixelResolution;
        }
        return right.descriptor.bpResolution - left.descriptor.bpResolution;
      });

    const selected = candidates[0];
    if (!selected) {
      return null;
    }
    return {
      bpResolution: selected.descriptor.bpResolution,
      startRowPx: 0,
      endRowPx: selected.mapSizePx,
      startColPx: 0,
      endColPx: selected.mapSizePx,
    };
  }

  public async syncExpectedProfileToViewport(): Promise<boolean> {
    const options = this.visualizationOptionsStore.asVisualizationOptions();
    if (options.signalDisplayMode === "OBSERVED") {
      return false;
    }
    const bounds = this.resolveExpectedProfileBounds();
    if (!bounds) {
      return false;
    }
    await this.mapManager.networkManager.requestManager.setViewportExpectedProfile(
      bounds
    );
    return true;
  }

  private async refreshExpectedProfileOnMoveEnd(): Promise<void> {
    if (this.mapManager.isExporting) return;
    const options = this.visualizationOptionsStore.asVisualizationOptions();
    if (options.signalDisplayMode === "OBSERVED") {
      return;
    }
    if (this.expectedProfileSyncInFlight) {
      this.pendingExpectedProfileRefresh = true;
      return;
    }
    this.expectedProfileSyncInFlight = true;
    try {
      const updated = await this.syncExpectedProfileToViewport();
      if (updated && !this.mapManager.isExporting) {
        this.mapManager.reloadTiles();
      }
    } catch {
      // Keep the current view visible even if viewport-profile refresh fails.
    } finally {
      this.expectedProfileSyncInFlight = false;
      if (this.pendingExpectedProfileRefresh) {
        this.pendingExpectedProfileRefresh = false;
        void this.refreshExpectedProfileOnMoveEnd();
      }
    }
  }

  public async syncAutoThresholdToViewport(): Promise<number | null> {
    const options = this.visualizationOptionsStore.asVisualizationOptions();
    if (!options.autoThresholdEnabled) {
      return null;
    }
    if (!(options.colormap instanceof SimpleLinearGradient)) {
      return null;
    }
    const bounds = this.resolveViewportPixelBounds();
    if (!bounds) {
      return null;
    }
    const response =
      await this.mapManager.networkManager.requestManager.queryMatrixFloat32({
        ...bounds,
        signalMode: "TRADITIONAL_NORMALIZED",
      });
    const nextUpperBound = resolveSafeAutoUpperBound(
      response.values,
      options.autoThresholdQuantile,
      options.colormap.minSignal,
      options.colormap.maxSignal
    );
    if (
      nextUpperBound == null ||
      !Number.isFinite(nextUpperBound) ||
      nextUpperBound <= options.colormap.minSignal
    ) {
      return null;
    }
    if (Math.abs(nextUpperBound - options.colormap.maxSignal) < 1e-9) {
      return nextUpperBound;
    }
    this.projectVisualizationOptions(
      new VisualizationOptions(
        options.preLogBase,
        options.postLogBase,
        options.applyCoolerWeights,
        options.resolutionScaling,
        options.resolutionLinearScaling,
        new SimpleLinearGradient(
          options.colormap.startColorRGBA,
          options.colormap.endColorRGBA,
          options.colormap.minSignal,
          nextUpperBound,
          options.colormap.gamma
        ),
        options.autoThresholdEnabled,
        options.autoThresholdQuantile,
        options.signalDisplayMode,
        options.coolerWeightsNaNPolicy,
        options.coolerWeightsHaveNaNs,
        options.coolerWeightsNaNCount
      )
    );
    return nextUpperBound;
  }

  private openingHistogramUpperBound(
    source: SourceName,
    expression: unknown,
    quantile: number,
    minSignal: number
  ): number | null {
    const range =
      this.mapManager.viewAndLayersManager.loadedViewportSignalRange(
        source,
        expression
      )?.processed;
    const candidate =
      histogramQuantile(range?.histogram, quantile, { includeZeros: true }) ??
      histogramQuantile(range?.histogram, quantile);
    const upper = Math.min(candidate ?? Infinity, range?.max ?? -Infinity);
    return candidate != null && upper > minSignal ? upper : null;
  }

  private async syncPipelineAutoThresholdForBounds(
    bounds: ViewportPixelBounds | null,
    config?: Record<string, unknown>,
    sourceFilter?: SourceName,
    targetId?: string | null,
    behavior?: {
      requireAutoThresholdEnabled?: boolean;
      quantile?: number;
      reloadTiles?: boolean;
      useViewportHistogram?: boolean;
    }
  ): Promise<boolean> {
    const api = this.mapManager.networkManager.requestManager;
    const revision = api.renderPipelineRevision;
    const options = this.visualizationOptionsStore.asVisualizationOptions();
    if (
      (behavior?.requireAutoThresholdEnabled ?? true) &&
      !options.autoThresholdEnabled
    ) {
      return false;
    }
    const activeConfig = config ?? (await this.getActiveRenderPipelineConfig());
    if (!activeConfig) {
      return false;
    }
    const originalConfig = JSON.stringify(activeConfig);

    const targets: ColormapTarget[] = [];
    collectColormapTargets(activeConfig.upperExpression, targets);
    collectColormapTargets(activeConfig.lowerExpression, targets);
    const filteredTargets = sourceFilter
      ? targets.filter(
          (target) =>
            target.profile.source === sourceFilter &&
            (!targetId || target.id === targetId)
        )
      : targets;
    if (filteredTargets.length === 0) {
      return false;
    }

    const scalingCoefficients = this.resolveResolutionScalingCoefficients();
    const thresholdCache = new Map<string, number | null>();
    let changed = false;

    for (const target of filteredTargets) {
      const cacheKey = JSON.stringify(target.profile);
      const quantile = behavior?.quantile ?? options.autoThresholdQuantile;
      let nextUpperBound = behavior?.useViewportHistogram
        ? this.openingHistogramUpperBound(
            target.profile.source,
            target.node.input,
            quantile,
            target.minSignal
          ) ?? thresholdCache.get(cacheKey)
        : thresholdCache.get(cacheKey);
      if (nextUpperBound === undefined) {
        if (!bounds || !target.profile.editableInput) continue;
        const response =
          await this.mapManager.networkManager.requestManager.queryMatrixFloat32(
            {
              ...bounds,
              source: target.profile.source,
              signalMode: target.profile.applyCoolerWeights
                ? "COOLER_WEIGHTED"
                : "RAW_COUNTS",
            }
          );
        nextUpperBound = resolveSafeAutoUpperBound(
          transformSignalsForProfile(
            response.values,
            target.profile,
            scalingCoefficients
          ),
          quantile,
          target.minSignal,
          target.maxSignal
        );
        thresholdCache.set(cacheKey, nextUpperBound);
      }

      if (
        nextUpperBound != null &&
        Number.isFinite(nextUpperBound) &&
        nextUpperBound > target.minSignal &&
        Math.abs(nextUpperBound - target.maxSignal) >= 1e-9
      ) {
        target.node.maxSignal = nextUpperBound;
        // The range is also carried by a constant node, and that one is what a reader prefers.
        if (isRecord(target.node.max) && target.node.max.type === "constant")
          target.node.max.value = nextUpperBound;
        changed = true;
      }
    }

    // Queries can finish after a newer explicit edit; never commit that obsolete snapshot.
    const latestConfig = await this.getActiveRenderPipelineConfig();
    if (
      api.renderPipelineRevision !== revision ||
      JSON.stringify(latestConfig) !== originalConfig ||
      JSON.stringify(
        this.visualizationOptionsStore.asVisualizationOptions()
      ) !== JSON.stringify(options)
    )
      return false;
    if (behavior?.useViewportHistogram) {
      const target = collectConfigColormapTargets(activeConfig).find(
        (item) => item.profile.source === "PRIMARY"
      );
      const current = target
        ? visualizationOptionsFromTarget(target, options)
        : options;
      this.projectVisualizationOptions(
        new VisualizationOptions(
          current.preLogBase,
          current.postLogBase,
          current.applyCoolerWeights,
          current.resolutionScaling,
          current.resolutionLinearScaling,
          current.colormap,
          false,
          behavior.quantile,
          current.signalDisplayMode,
          current.coolerWeightsNaNPolicy,
          current.coolerWeightsHaveNaNs,
          current.coolerWeightsNaNCount
        )
      );
      await this.sendVisualizationOptionsToServer({
        skipAutoThresholdRefresh: true,
        renderPipeline: activeConfig,
      });
      return true;
    }
    if (!changed) return true;
    await api.setRenderPipelineConfig(activeConfig);
    if (behavior?.reloadTiles !== false) {
      await this.mapManager.reloadTilesFromBackend();
    }
    return true;
  }

  private async syncPipelineAutoThresholdToViewport(
    config?: Record<string, unknown>,
    sourceFilter?: SourceName,
    targetId?: string | null,
    behavior?: {
      requireAutoThresholdEnabled?: boolean;
      quantile?: number;
      reloadTiles?: boolean;
      useViewportHistogram?: boolean;
    }
  ): Promise<boolean> {
    const bounds = this.resolveViewportPixelBounds();
    if (!bounds) {
      return false;
    }
    return this.syncPipelineAutoThresholdForBounds(
      bounds,
      config,
      sourceFilter,
      targetId,
      behavior
    );
  }

  public async applyOpeningViewportQuantileThreshold(
    quantile = OPENING_THRESHOLD_QUANTILE,
    expectedPipelineRevision = this.mapManager.networkManager.requestManager
      .renderPipelineRevision,
    viewportOnly = false
  ): Promise<number | null> {
    const api = this.mapManager.networkManager.requestManager;
    if (
      api.renderPipelineRevision !== expectedPipelineRevision ||
      this.mapManager.isDisposed
    )
      return null;
    const optionsBeforeFit =
      this.visualizationOptionsStore.asVisualizationOptions();
    if (optionsBeforeFit.signalDisplayMode !== "OBSERVED") return null;
    await this.mapManager.reloadTilesFromBackend();
    const map = this.mapManager.getMap();
    await new Promise<void>((resolve) => {
      const done = () => {
        window.clearTimeout(timeout);
        map.un("rendercomplete", done);
        resolve();
      };
      const timeout = window.setTimeout(done, 3000);
      map.once("rendercomplete", done);
      map.renderSync();
    });
    const bounds = viewportOnly
      ? this.resolveViewportPixelBounds()
      : this.resolveOpeningFullMapPixelBounds();
    const pipelineConfig = await this.getActiveRenderPipelineConfig();
    if (
      api.renderPipelineRevision !== expectedPipelineRevision ||
      this.mapManager.isDisposed
    )
      return null;
    if (pipelineConfig) {
      await this.syncPipelineAutoThresholdForBounds(
        bounds,
        pipelineConfig,
        undefined,
        undefined,
        {
          requireAutoThresholdEnabled: false,
          quantile,
          reloadTiles: false,
          useViewportHistogram: true,
        }
      );
      return null;
    }

    const options = this.visualizationOptionsStore.asVisualizationOptions();
    if (!(options.colormap instanceof SimpleLinearGradient)) {
      return null;
    }
    let nextUpperBound = this.openingHistogramUpperBound(
      "PRIMARY",
      undefined,
      quantile,
      options.colormap.minSignal
    );
    if (nextUpperBound == null && bounds) {
      const response = await api.queryMatrixFloat32({
        ...bounds,
        signalMode: "TRADITIONAL_NORMALIZED",
      });
      nextUpperBound = resolveSafeAutoUpperBound(
        response.values,
        quantile,
        options.colormap.minSignal,
        options.colormap.maxSignal
      );
    }
    if (
      api.renderPipelineRevision !== expectedPipelineRevision ||
      this.mapManager.isDisposed
    )
      return null;
    if (
      JSON.stringify(
        this.visualizationOptionsStore.asVisualizationOptions()
      ) !== JSON.stringify(options)
    )
      return null;
    const updatedMaxSignal =
      nextUpperBound != null &&
      Number.isFinite(nextUpperBound) &&
      nextUpperBound > options.colormap.minSignal
        ? nextUpperBound
        : options.colormap.maxSignal;
    this.projectVisualizationOptions(
      new VisualizationOptions(
        options.preLogBase,
        options.postLogBase,
        options.applyCoolerWeights,
        options.resolutionScaling,
        options.resolutionLinearScaling,
        new SimpleLinearGradient(
          options.colormap.startColorRGBA,
          options.colormap.endColorRGBA,
          options.colormap.minSignal,
          updatedMaxSignal,
          options.colormap.gamma
        ),
        false,
        quantile,
        options.signalDisplayMode,
        options.coolerWeightsNaNPolicy,
        options.coolerWeightsHaveNaNs,
        options.coolerWeightsNaNCount
      )
    );
    await this.sendVisualizationOptionsToServer({
      skipAutoThresholdRefresh: true,
    });
    return updatedMaxSignal;
  }

  /** Publish the active primary O/E palette without replacing the Observed graph. */
  public applyObservedExpectedPalette(
    palette: DisplayPalette
  ): Promise<VisualizationOptions> {
    const parsed = parseOePalette(palette);
    // An inactive editor must not leave a draft that unexpectedly appears on a later mode change.
    if (
      this.visualizationOptionsStore.signalDisplayMode !==
      "OBSERVED_OVER_EXPECTED"
    )
      return Promise.reject(
        new Error("Select Show O/E before editing its palette.")
      );
    const context: VisualizationContext = {
      source: "PRIMARY",
      targetId: null,
      mode: "OBSERVED_OVER_EXPECTED",
    };
    this.drafts.note(context, {
      minSignal: parsed.min,
      maxSignal: parsed.max,
      startColor: parsed.startColor,
      endColor: parsed.endColor,
    });
    return this.queueVisualizationApplication(context).then((result) => {
      window.dispatchEvent(new CustomEvent("hict:render-pipeline-changed"));
      return result;
    });
  }

  private rememberDerivedPalette(options: VisualizationOptions): void {
    const cmap = options.colormap;
    if (
      options.signalDisplayMode === "OBSERVED" ||
      !(cmap instanceof SimpleLinearGradient)
    )
      return;
    rememberDisplayPalette(options.signalDisplayMode, {
      min: cmap.minSignal,
      max: cmap.maxSignal,
      startColor: cmap.startColorRGBA.HEXA,
      endColor: cmap.endColorRGBA.HEXA,
      ...(cmap.gamma !== 1 ? { gamma: cmap.gamma } : {}),
    });
  }

  /** Display modes are primary-only views. Never rebuild the user's rendering graph. */
  public setSignalDisplayMode(mode: SignalDisplayMode): Promise<void> {
    this.flushVisualizationDrafts();
    return this.runVisualizationMutation(
      { source: "PRIMARY", targetId: null, mode },
      () => this.setSignalDisplayModeNow(mode)
    );
  }

  private async setSignalDisplayModeNow(
    mode: SignalDisplayMode
  ): Promise<void> {
    const api = this.mapManager.networkManager.requestManager;
    const previous = await api.getVisualizationOptions(
      new GetVisualizationOptionsRequest({})
    );
    const config = await api.getRenderPipelineConfig();
    const primary = config.enabled
      ? collectConfigColormapTargets(config).find(
          (target) => target.profile.source === "PRIMARY"
        )
      : undefined;
    const observed = primary
      ? visualizationOptionsFromTarget(primary, previous)
      : previous.signalDisplayMode === "OBSERVED"
      ? previous
      : this.observedDisplayOptions ?? previous;
    if (previous.signalDisplayMode === "OBSERVED")
      this.observedDisplayOptions = observed;
    this.rememberDerivedPalette(previous);
    const remembered =
      mode === "OBSERVED" ? undefined : recalledDisplayPalette(mode);
    const colormap = remembered
      ? new SimpleLinearGradient(
          new ColorTranslator(remembered.startColor, { legacyCSS: true }),
          new ColorTranslator(remembered.endColor, { legacyCSS: true }),
          remembered.min,
          remembered.max,
          remembered.gamma ?? 1
        )
      : mode === "OBSERVED_OVER_EXPECTED"
      ? new SimpleLinearGradient(
          new ColorTranslator("#2166acff", { legacyCSS: true }),
          new ColorTranslator("#b2182bff", { legacyCSS: true }),
          0.5,
          2
        )
      : observed.colormap;
    const next = new VisualizationOptions(
      observed.preLogBase,
      observed.postLogBase,
      observed.applyCoolerWeights,
      observed.resolutionScaling,
      observed.resolutionLinearScaling,
      colormap,
      previous.autoThresholdEnabled,
      previous.autoThresholdQuantile,
      mode,
      previous.coolerWeightsNaNPolicy,
      previous.coolerWeightsHaveNaNs,
      previous.coolerWeightsNaNCount
    );
    try {
      await this.sendVisualizationOptionsToServer({
        skipAutoThresholdRefresh: true,
        preserveCustomPipeline: true,
        visualizationOptions: next,
      });
    } catch (error) {
      // Expected-profile refresh can fail after options were committed. Read back
      // the committed mode rather than claiming the old view is still active.
      await this.fetchVisualizationOptions().catch(() => {
        this.visualizationOptionsStore.signalDisplayMode =
          previous.signalDisplayMode;
      });
      window.dispatchEvent(new CustomEvent("hict:render-pipeline-changed"));
      throw error;
    }
    // The shared sidebar may show SECONDARY. Hydrate that source again instead
    // of leaving the temporary primary palette in its controls.
    window.dispatchEvent(new CustomEvent("hict:render-pipeline-changed"));
    await this.mapManager.reloadTilesFromBackend();
  }

  public resolveOpeningVisualizationOptions(
    options: VisualizationOptions
  ): VisualizationOptions {
    if (
      !options.applyCoolerWeights ||
      this.mapManager.getOptions().response.usableCoolerWeights !== false
    )
      return options;
    toast.message(
      "This file has no usable Cooler weights. HiCT opened the map without file weights.",
      { id: "unusable-cooler-weights" }
    );
    return { ...options, applyCoolerWeights: false };
  }

  public async sendVisualizationOptionsToServer(options?: {
    skipAutoThresholdRefresh?: boolean;
    preserveCustomPipeline?: boolean;
    renderPipeline?: Record<string, unknown>;
    visualizationOptions?: VisualizationOptions;
  }): Promise<VisualizationOptions> {
    if (!options?.skipAutoThresholdRefresh) {
      await this.syncAutoThresholdToViewport().catch(() => null);
    }
    return this.mapManager.networkManager.requestManager
      .setVisualizationOptions(
        new SetVisualizationOptionsRequest({
          options:
            options?.visualizationOptions ??
            this.visualizationOptionsStore.asVisualizationOptions(),
          preserveRenderPipeline: options?.preserveCustomPipeline ?? false,
          renderPipeline: options?.renderPipeline,
        })
      )
      .then((options) => {
        this.rememberDerivedPalette(options);
        this.projectVisualizationOptions(options);
        window.dispatchEvent(
          new CustomEvent(
            VisualizationManager.VISUALIZATION_OPTIONS_UPDATED_EVENT,
            {
              detail: { source: "server", options },
            }
          )
        );
        return options;
      })
      .then(async (updatedOptions) => {
        if (updatedOptions.signalDisplayMode !== "OBSERVED") {
          await this.syncExpectedProfileToViewport();
        }
        return updatedOptions;
      });
  }

  public async sendVisualizationOptionsAndReload(options?: {
    skipAutoThresholdRefresh?: boolean;
    preserveCustomPipeline?: boolean;
    renderPipeline?: Record<string, unknown>;
  }): Promise<VisualizationOptions> {
    const result = await this.sendVisualizationOptionsToServer(options);
    this.mapManager.reloadTiles();
    return result;
  }

  public applyVisualizationSettingsAndReload(): Promise<VisualizationOptions> {
    return this.applyVisualizationSettingsForSourceAndReload("PRIMARY", null);
  }

  public applyVisualizationSettingsForSourceAndReload(
    source: SourceName,
    targetId?: string | null
  ): Promise<VisualizationOptions> {
    return this.queueVisualizationApplication(
      this.captureVisualizationContext(source, targetId ?? null),
      this.visualizationOptionsStore.asVisualizationOptions()
    );
  }

  public applyVisualizationPreset(
    options: VisualizationOptions,
    pipeline?: Record<string, unknown>
  ): Promise<VisualizationOptions> {
    this.flushVisualizationDrafts();
    const context: VisualizationContext = {
      source: "PRIMARY",
      targetId: null,
      mode: options.signalDisplayMode,
    };
    const snapshot = applyVisualizationDraft(options, {});
    const config = pipeline ? cloneRecord(pipeline) : undefined;
    const revision = this.drafts.note(
      context,
      visualizationOptionsDraft(snapshot)
    );
    this.drafts.discardBefore(revision);
    this.normalizationFits.clear();
    this.refreshVisualizationDraftState();
    return this.runVisualizationMutation(context, async () => {
      if (!this.validVisualizationRange(snapshot, context))
        throw new Error("This preset has an invalid color range.");
      const previous =
        await this.mapManager.networkManager.requestManager.getVisualizationOptions(
          new GetVisualizationOptionsRequest({})
        );
      if (
        previous.signalDisplayMode === "OBSERVED" &&
        snapshot.signalDisplayMode !== "OBSERVED"
      )
        this.observedDisplayOptions = previous;
      const result = await this.sendVisualizationOptionsToServer({
        skipAutoThresholdRefresh: true,
        visualizationOptions: snapshot,
        renderPipeline: config,
      });
      this.acknowledgeVisualizationDraft(context, revision);
      await this.mapManager.reloadTilesFromBackend();
      return result;
    });
  }

  public applyVisualizationSourcePreset(
    options: VisualizationOptions,
    source: SourceName,
    targetId?: string | null
  ): Promise<VisualizationOptions> {
    this.flushVisualizationDrafts();
    const context = this.captureVisualizationContext(source, targetId ?? null);
    if (source === "PRIMARY") context.mode = options.signalDisplayMode;
    const patch = visualizationOptionsDraft(options);
    const revision = this.drafts.note(context, patch);
    this.normalizationFits.delete(visualizationContextKey(context));
    this.refreshVisualizationDraftState();
    return this.runVisualizationMutation(context, async () => {
      const fresh = await this.freshVisualizationOptions(context);
      const next = applyVisualizationDraft(
        fresh,
        patch,
        source === "PRIMARY"
          ? options.signalDisplayMode
          : fresh.signalDisplayMode
      );
      const result = await this.applyVisualizationSnapshot(context, next);
      this.acknowledgeVisualizationDraft(context, revision);
      return result;
    });
  }

  private validVisualizationRange(
    options: VisualizationOptions,
    context: VisualizationContext
  ): boolean {
    const palette = options.colormap;
    return (
      !(palette instanceof SimpleLinearGradient) ||
      (Number.isFinite(palette.minSignal) &&
        Number.isFinite(palette.maxSignal) &&
        palette.maxSignal > palette.minSignal &&
        (context.source !== "PRIMARY" ||
          context.mode !== "OBSERVED_OVER_EXPECTED" ||
          (palette.minSignal > 0 &&
            palette.minSignal < 1 &&
            palette.maxSignal > 1)))
    );
  }

  private async applyVisualizationSnapshot(
    context: VisualizationContext,
    options: VisualizationOptions
  ): Promise<VisualizationOptions> {
    if (this.mapManager.isDisposed)
      throw new Error(
        "The map was closed before the visualization change was applied."
      );
    if (!this.validVisualizationRange(options, context))
      throw new Error(
        "The color range is invalid. Correct Lower and Upper before applying changes."
      );
    if (
      context.source === "PRIMARY" &&
      options.signalDisplayMode !== "OBSERVED"
    ) {
      const result = await this.sendVisualizationOptionsToServer({
        skipAutoThresholdRefresh: true,
        preserveCustomPipeline: true,
        visualizationOptions: options,
      });
      await this.mapManager.reloadTilesFromBackend();
      return result;
    }
    const config = await this.getActiveRenderPipelineConfig();
    if (!config) {
      if (context.source === "SECONDARY")
        throw new Error("The Secondary colormap is no longer available.");
      const result = await this.sendVisualizationOptionsToServer({
        skipAutoThresholdRefresh: true,
        visualizationOptions: options,
      });
      await this.mapManager.reloadTilesFromBackend();
      return result;
    }
    if (
      !this.updateRenderPipelineSource(
        config,
        context.source,
        options,
        context.targetId
      )
    )
      throw new Error("The selected colormap is no longer editable.");
    if (context.source === "PRIMARY")
      await this.sendVisualizationOptionsToServer({
        skipAutoThresholdRefresh: true,
        renderPipeline: config,
        visualizationOptions: options,
      });
    else
      await this.mapManager.networkManager.requestManager.setRenderPipelineConfig(
        config
      );
    await this.mapManager.reloadTilesFromBackend();
    return options;
  }

  /**
   * Sets how weights from the file are used, rewrites the signal chain of an enabled pipeline from
   * that choice, and fits the color range to the result. Options, pipeline and sidebar then agree,
   * whichever choice was made.
   */
  public applyCoolerWeightsPolicy(
    policy: CoolerWeightsNaNPolicy,
    keepWeights: boolean,
    context = this.captureVisualizationContext()
  ): Promise<void> {
    this.cancelDraftTimer(context);
    const revision = this.drafts.note(context, {
      coolerWeightsNaNPolicy: policy,
      applyCoolerWeights: keepWeights,
    });
    const patch = this.drafts.read(context);
    const key = visualizationContextKey(context);
    const fit = {
      revision,
      quantile:
        keepWeights && policy === "REPLACE_NANS_WITH_ONE"
          ? 0.9
          : OPENING_THRESHOLD_QUANTILE,
    };
    this.normalizationFits.set(key, fit);
    this.projectVisualizationOptions(
      applyVisualizationDraft(
        this.visualizationOptionsStore.asVisualizationOptions(),
        patch
      ),
      context
    );
    return this.runVisualizationMutation(context, async () => {
      try {
        const current = await this.freshVisualizationOptions(context);
        const options = applyVisualizationDraft(current, patch);
        await this.applyVisualizationSnapshot(context, options);
        if (context.source === "PRIMARY")
          rememberExcludedBinsPolicy(
            this.mapManager.getOptions().filename,
            keepWeights ? policy : "DISABLE_WEIGHTS"
          );
        // An explicit edit made after normalization began owns its range and transform.
        if (
          this.normalizationFits.get(key)?.revision === fit.revision &&
          this.drafts.revision(context) === revision
        ) {
          await this.fitVisualizationContext(context, fit.quantile, revision);
          if (this.normalizationFits.get(key)?.revision === fit.revision)
            this.normalizationFits.delete(key);
        }
        this.acknowledgeVisualizationDraft(context, revision);
      } catch (error) {
        if (this.normalizationFits.get(key)?.revision === fit.revision)
          this.normalizationFits.delete(key);
        this.acknowledgeVisualizationDraft(context, revision, [
          "coolerWeightsNaNPolicy",
          "applyCoolerWeights",
        ]);
        throw error;
      }
    });
  }

  private async fitVisualizationContext(
    context: VisualizationContext,
    quantile: number,
    revision: number
  ): Promise<void> {
    const options = await this.freshVisualizationOptions(context);
    if (
      context.source === "PRIMARY" &&
      options.signalDisplayMode !== "OBSERVED"
    )
      return;
    const config = await this.getActiveRenderPipelineConfig();
    const targets = config
      ? collectConfigColormapTargets(config).filter(
          (target) => target.profile.source === context.source
        )
      : [];
    const target = context.targetId
      ? targets.find((target) => target.id === context.targetId)
      : targets[0];
    const expression =
      target && isRecord(target.node.input)
        ? cloneRecord(target.node.input)
        : undefined;
    if (!(options.colormap instanceof SimpleLinearGradient)) return;
    const sample = await querySignalHistogram(
      this.mapManager,
      diagnosticBounds(this.mapManager),
      {
        source: expression ? "PRIMARY" : context.source,
        signalMode: expression ? "PIPELINE_SIGNAL" : "TRADITIONAL_NORMALIZED",
        expression,
        domain: "matrix",
        tileEdge: 64,
        concurrency: 4,
      }
    );
    const next = resolveSafeAutoUpperBound(
      sample.values,
      quantile,
      options.colormap.minSignal,
      options.colormap.maxSignal,
      true // Match the nearest-rank convention of loaded-tile histograms.
    );
    if (
      this.mapManager.isDisposed ||
      this.drafts.revision(context) !== revision ||
      next == null
    )
      return;
    await this.applyVisualizationSnapshot(
      context,
      applyVisualizationDraft(options, { maxSignal: next })
    );
  }

  /** Swaps the top/bottom layers of every pixel blend; false when no blend exists. */
  public async swapRenderPipelineSourcesAndReload(): Promise<boolean> {
    const pipelineConfig = await this.getActiveRenderPipelineConfig();
    if (!pipelineConfig) {
      return false;
    }
    const upperChanged = swapPixelBlendLayers(pipelineConfig.upperExpression);
    const lowerChanged = swapPixelBlendLayers(pipelineConfig.lowerExpression);
    if (!upperChanged && !lowerChanged) {
      return false;
    }
    await this.mapManager.networkManager.requestManager.setRenderPipelineConfig(
      pipelineConfig
    );
    await this.mapManager.reloadTilesFromBackend();
    return true;
  }

  /** Exchanges the upper- and lower-triangle expressions. */
  public async swapRenderPipelineHalvesAndReload(): Promise<boolean> {
    const pipelineConfig = await this.getActiveRenderPipelineConfig();
    if (!pipelineConfig) {
      return false;
    }
    const upperExpression = pipelineConfig.upperExpression;
    pipelineConfig.upperExpression = pipelineConfig.lowerExpression;
    pipelineConfig.lowerExpression = upperExpression;
    await this.mapManager.networkManager.requestManager.setRenderPipelineConfig(
      pipelineConfig
    );
    await this.mapManager.reloadTilesFromBackend();
    return true;
  }

  public async swapRenderPipelineLayersAndReload(): Promise<boolean> {
    const pipelineConfig = await this.getActiveRenderPipelineConfig();
    if (!pipelineConfig) {
      return false;
    }
    let changed = false;
    changed = swapPixelBlendLayers(pipelineConfig.upperExpression) || changed;
    changed = swapPixelBlendLayers(pipelineConfig.lowerExpression) || changed;
    if (!changed) {
      const upperExpression = pipelineConfig.upperExpression;
      pipelineConfig.upperExpression = pipelineConfig.lowerExpression;
      pipelineConfig.lowerExpression = upperExpression;
      changed = true;
    }
    await this.mapManager.networkManager.requestManager.setRenderPipelineConfig(
      pipelineConfig
    );
    await this.mapManager.reloadTilesFromBackend();
    return changed;
  }

  public async refreshAutoThresholdAndReload(
    source?: SourceName
  ): Promise<number | null> {
    const pipelineConfig = await this.getActiveRenderPipelineConfig();
    if (pipelineConfig) {
      await this.syncPipelineAutoThresholdToViewport(pipelineConfig, source);
      return null;
    }
    const nextUpperBound = await this.syncAutoThresholdToViewport();
    if (nextUpperBound == null) {
      return null;
    }
    await this.sendVisualizationOptionsToServer({
      skipAutoThresholdRefresh: true,
    });
    this.mapManager.reloadTiles();
    return nextUpperBound;
  }
}

export { VisualizationManager };
