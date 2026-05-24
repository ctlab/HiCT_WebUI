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
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import VisualizationOptions from "../visualization/VisualizationOptions";
import SimpleLinearGradient from "../visualization/colormap/SimpleLinearGradient";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";
import {
  buildColorExpression,
  type SourceName,
} from "../visualization/renderPipelineWizard";
import { ColorTranslator } from "colortranslator";

type ViewportPixelBounds = {
  bpResolution: number;
  startRowPx: number;
  endRowPx: number;
  startColPx: number;
  endColPx: number;
};

type PipelineSignalProfile = {
  source: SourceName;
  preLogBase: number | null;
  postLogBase: number | null;
  applyCoolerWeights: boolean;
  resolutionScaling: boolean;
  resolutionLinearScaling: boolean;
};

type ColormapTarget = {
  node: Record<string, unknown>;
  profile: PipelineSignalProfile;
  minSignal: number;
  maxSignal: number;
};

const BUILTIN_COOLER_WEIGHTS_TRACK_ID = "__builtin_cooler_weights__";

const clampQuantile = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0.995;
  }
  return Math.min(0.999999, Math.max(0.5, value));
};

const computeFiniteQuantile = (values: Float32Array, quantile: number): number | null => {
  const filtered: number[] = [];
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      filtered.push(value);
    }
  }
  if (filtered.length === 0) {
    return null;
  }
  filtered.sort((left, right) => left - right);
  const position = Math.min(
    filtered.length - 1,
    Math.max(0, Math.floor(clampQuantile(quantile) * (filtered.length - 1)))
  );
  return filtered[position] ?? filtered[filtered.length - 1] ?? null;
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
  currentMaxSignal: number
): number | null => {
  const quantileValue = computeFiniteQuantile(values, quantile);
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

const safeColorTranslator = (value: unknown, fallback: string): ColorTranslator => {
  if (typeof value !== "string" || value.length > 128) {
    return new ColorTranslator(fallback, { legacyCSS: true });
  }
  try {
    return new ColorTranslator(value, { legacyCSS: true });
  } catch {
    return new ColorTranslator(fallback, { legacyCSS: true });
  }
};

const withAlphaZero = (value: unknown, fallback: string): string => {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^#[0-9a-f]{8}$/i.test(normalized)) {
      return `${normalized.slice(0, 7)}00`;
    }
    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
      return `${normalized}00`;
    }
  }
  try {
    const translated = new ColorTranslator(String(value ?? fallback), {
      legacyCSS: true,
    });
    return `${translated.HEXA.slice(0, 7)}00`;
  } catch {
    return fallback;
  }
};

const normalizePositiveLogBase = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || Math.abs(numeric - 1) < 1e-9) {
    return null;
  }
  return numeric;
};

const isDynamicFieldNode = (value: unknown, field: string): boolean =>
  isRecord(value) &&
  String(value.type ?? "").trim().toLowerCase() === "dynamic" &&
  String(value.field ?? "").trim().toUpperCase() === field;

const isCoolerWeightsTrackNode = (value: unknown, axis: "ROW" | "COL"): boolean =>
  isRecord(value) &&
  String(value.type ?? "").trim().toLowerCase() === "track1d" &&
  String(value.trackId ?? "").trim() === BUILTIN_COOLER_WEIGHTS_TRACK_ID &&
  String(value.axis ?? "").trim().toUpperCase() === axis;

const isCoolerWeightsExpression = (value: unknown): boolean => {
  if (!isRecord(value) || String(value.type ?? "").trim().toLowerCase() !== "binary") {
    return false;
  }
  if (String(value.op ?? "").trim().toUpperCase() !== "MUL") {
    return false;
  }
  const left = value.left;
  const right = value.right;
  return (
    (isCoolerWeightsTrackNode(left, "ROW") && isCoolerWeightsTrackNode(right, "COL")) ||
    (isCoolerWeightsTrackNode(left, "COL") && isCoolerWeightsTrackNode(right, "ROW"))
  );
};

const extractPipelineSignalProfile = (
  expression: unknown
): PipelineSignalProfile | null => {
  if (!isRecord(expression)) {
    return null;
  }
  const type = String(expression.type ?? "").trim().toLowerCase();
  if (type === "source") {
    return {
      source:
        String(expression.source ?? "PRIMARY").trim().toUpperCase() === "SECONDARY"
          ? "SECONDARY"
          : "PRIMARY",
      preLogBase: null,
      postLogBase: null,
      applyCoolerWeights: false,
      resolutionScaling: false,
      resolutionLinearScaling: false,
    };
  }
  if (type === "log") {
    const inputProfile = extractPipelineSignalProfile(expression.input);
    const base = normalizePositiveLogBase(expression.base);
    if (!inputProfile || base == null) {
      return null;
    }
    if (inputProfile.preLogBase == null) {
      return {
        ...inputProfile,
        preLogBase: base,
      };
    }
    if (inputProfile.postLogBase == null) {
      return {
        ...inputProfile,
        postLogBase: base,
      };
    }
    return null;
  }
  if (type === "binary" && String(expression.op ?? "").trim().toUpperCase() === "MUL") {
    const left = expression.left;
    const right = expression.right;
    const childProfile =
      extractPipelineSignalProfile(left) ?? extractPipelineSignalProfile(right);
    if (!childProfile) {
      return null;
    }
    if (
      isDynamicFieldNode(left, "RESOLUTION_SCALING_COEFF") ||
      isDynamicFieldNode(right, "RESOLUTION_SCALING_COEFF")
    ) {
      return {
        ...childProfile,
        resolutionScaling: true,
      };
    }
    if (
      isDynamicFieldNode(left, "RESOLUTION_LINEAR_SCALING_COEFF") ||
      isDynamicFieldNode(right, "RESOLUTION_LINEAR_SCALING_COEFF")
    ) {
      return {
        ...childProfile,
        resolutionLinearScaling: true,
      };
    }
    if (isCoolerWeightsExpression(left) || isCoolerWeightsExpression(right)) {
      return {
        ...childProfile,
        applyCoolerWeights: true,
      };
    }
  }
  return null;
};

const collectColormapTargets = (
  expression: unknown,
  output: ColormapTarget[]
): void => {
  if (!isRecord(expression)) {
    return;
  }
  const type = String(expression.type ?? "").trim().toLowerCase();
  if (type === "colormap") {
    const profile = extractPipelineSignalProfile(expression.input);
    if (profile) {
      output.push({
        node: expression,
        profile,
        minSignal: toFiniteNumber(expression.minSignal, 0),
        maxSignal: toFiniteNumber(expression.maxSignal, 1),
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
      collectColormapTargets(expression[key], output);
    }
  });
};

const collectTopLayerSources = (
  expression: unknown,
  output: Set<SourceName>
): void => {
  if (!isRecord(expression)) {
    return;
  }
  if (String(expression.type ?? "").trim().toLowerCase() === "pixel_blend") {
    const topTargets: ColormapTarget[] = [];
    collectColormapTargets(expression.top, topTargets);
    topTargets.forEach((target) => output.add(target.profile.source));
  }
  ["input", "left", "right", "top", "bottom", "c1", "c2", "c3", "alpha"].forEach(
    (key) => {
      if (key in expression) {
        collectTopLayerSources(expression[key], output);
      }
    }
  );
};

const cloneRecord = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const isTransparentMinimumColor = (color: unknown): boolean =>
  typeof color === "string" &&
  /^#[0-9a-f]{8}$/i.test(color.trim()) &&
  color.trim().slice(7).toLowerCase() === "00";

const preserveMinimumAlpha = (
  nextColor: unknown,
  previousColor: unknown
): unknown => {
  if (
    typeof nextColor !== "string" ||
    !/^#[0-9a-f]{8}$/i.test(nextColor.trim()) ||
    !isTransparentMinimumColor(previousColor)
  ) {
    return nextColor;
  }
  return `${nextColor.trim().slice(0, 7)}00`;
};

const replaceColormapNode = (
  target: ColormapTarget,
  replacement: Record<string, unknown>
): void => {
  const previousStartColor = target.node.startColor;
  target.node.type = "colormap";
  target.node.mode = replacement.mode ?? "LINEAR";
  target.node.input = cloneRecord(replacement.input);
  target.node.startColor = preserveMinimumAlpha(
    replacement.startColor,
    previousStartColor
  );
  target.node.endColor = replacement.endColor;
  target.node.minSignal = replacement.minSignal;
  target.node.maxSignal = replacement.maxSignal;
};

const visualizationOptionsFromTarget = (
  target: ColormapTarget,
  currentOptions: VisualizationOptions,
  forceTransparentMinimum = false
): VisualizationOptions =>
  new VisualizationOptions(
    target.profile.preLogBase ?? -1,
    target.profile.postLogBase ?? -1,
    target.profile.applyCoolerWeights,
    target.profile.resolutionScaling,
    target.profile.resolutionLinearScaling,
    new SimpleLinearGradient(
      safeColorTranslator(
        forceTransparentMinimum
          ? withAlphaZero(target.node.startColor, "#ffffff00")
          : target.node.startColor,
        "#ffffff00"
      ),
      safeColorTranslator(target.node.endColor, "#006000ff"),
      target.minSignal,
      target.maxSignal
    ),
    currentOptions.autoThresholdEnabled,
    currentOptions.autoThresholdQuantile,
    currentOptions.signalDisplayMode
  );

const forceMinimumAlphaZero = (target: ColormapTarget): void => {
  const color = target.node.startColor;
  if (typeof color === "string" && /^#[0-9a-f]{8}$/i.test(color.trim())) {
    target.node.startColor = `${color.trim().slice(0, 7)}00`;
  }
};

const applyTopLayerTransparency = (
  expression: unknown,
  source: SourceName
): void => {
  if (!isRecord(expression)) {
    return;
  }
  if (expression.type === "pixel_blend") {
    const topTargets: ColormapTarget[] = [];
    collectColormapTargets(expression.top, topTargets);
    topTargets
      .filter((target) => target.profile.source === source)
      .forEach(forceMinimumAlphaZero);
  }
  [
    "input",
    "left",
    "right",
    "upper",
    "lower",
    "bottom",
    "c1",
    "c2",
    "c3",
    "alpha",
  ].forEach((key) => {
    if (key in expression) {
      applyTopLayerTransparency(expression[key], source);
    }
  });
};

const swapPixelBlendLayers = (expression: unknown): boolean => {
  if (!isRecord(expression)) {
    return false;
  }
  let changed = false;
  if (String(expression.type ?? "").trim().toLowerCase() === "pixel_blend") {
    const top = expression.top;
    expression.top = expression.bottom;
    expression.bottom = top;
    const topOpacity = expression.topOpacity;
    expression.topOpacity = expression.bottomOpacity;
    expression.bottomOpacity = topOpacity;
    changed = true;
  }
  ["input", "left", "right", "top", "bottom", "c1", "c2", "c3", "alpha"].forEach(
    (key) => {
      if (key in expression && swapPixelBlendLayers(expression[key])) {
        changed = true;
      }
    }
  );
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

  public constructor(public readonly mapManager: ContactMapManager) {
    this.moveEndListener = this.mapManager.getMap().on("moveend", () => {
      void this.refreshExpectedProfileOnMoveEnd();
    });
  }

  public dispose(): void {
    if (this.moveEndListener) {
      unByKey(this.moveEndListener);
    }
  }

  public fetchVisualizationOptions(): Promise<VisualizationOptions> {
    return this.mapManager.networkManager.requestManager
      .getVisualizationOptions(new GetVisualizationOptionsRequest({}))
      .then((options) => {
        this.visualizationOptionsStore.setVisualizationOptions(options);
        window.dispatchEvent(
          new CustomEvent(VisualizationManager.VISUALIZATION_OPTIONS_UPDATED_EVENT, {
            detail: { source: "server_fetch", options },
          })
        );
        return options;
      });
  }

  public async loadVisualizationOptionsForSource(
    source?: SourceName
  ): Promise<VisualizationOptions> {
    if (!source) {
      return this.fetchVisualizationOptions();
    }
    const pipelineConfig = await this.getActiveRenderPipelineConfig();
    if (!pipelineConfig) {
      return this.fetchVisualizationOptions();
    }
    const targets: ColormapTarget[] = [];
    collectColormapTargets(pipelineConfig.upperExpression, targets);
    collectColormapTargets(pipelineConfig.lowerExpression, targets);
    const topLayerSources = new Set<SourceName>();
    collectTopLayerSources(pipelineConfig.upperExpression, topLayerSources);
    collectTopLayerSources(pipelineConfig.lowerExpression, topLayerSources);
    const target = targets.find((candidate) => candidate.profile.source === source);
    if (!target) {
      return this.fetchVisualizationOptions();
    }
    const options = visualizationOptionsFromTarget(
      target,
      this.visualizationOptionsStore.asVisualizationOptions(),
      topLayerSources.has(source)
    );
    this.visualizationOptionsStore.setVisualizationOptions(options);
    window.dispatchEvent(
      new CustomEvent(VisualizationManager.VISUALIZATION_OPTIONS_UPDATED_EVENT, {
        detail: { source: "pipeline_source_fetch", options },
      })
    );
    return options;
  }

  private async getActiveRenderPipelineConfig(): Promise<Record<string, unknown> | null> {
    const config =
      await this.mapManager.networkManager.requestManager
        .getRenderPipelineConfig()
        .catch(() => null);
    return isRecord(config) && Boolean(config.enabled ?? false) ? config : null;
  }

  private updateRenderPipelineSource(
    config: Record<string, unknown>,
    source: SourceName,
    options: VisualizationOptions
  ): boolean {
    const targets: ColormapTarget[] = [];
    collectColormapTargets(config.upperExpression, targets);
    collectColormapTargets(config.lowerExpression, targets);
    const replacement = buildColorExpression(source, options) as unknown as Record<
      string,
      unknown
    >;
    let changed = false;
    for (const target of targets) {
      if (target.profile.source === source) {
        replaceColormapNode(target, replacement);
        changed = true;
      }
    }
    applyTopLayerTransparency(config.upperExpression, source);
    applyTopLayerTransparency(config.lowerExpression, source);
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
        Number.isFinite(descriptor.imageSizeIndex) ? descriptor.imageSizeIndex : 0
      )
    );
    if (resolutionIndex <= 1) {
      return { quadratic: 1, linear: 1 };
    }
    const referenceResolution = Number(resolutions[1] ?? descriptor.bpResolution);
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

  private resolveViewportPixelBounds(paddingPx = 0): ViewportPixelBounds | null {
    const size = this.mapManager.map.getSize();
    if (!size || size.length < 2 || size[0] <= 0 || size[1] <= 0) {
      return null;
    }
    const descriptor =
      this.mapManager.viewAndLayersManager.currentViewState.resolutionDesciptor;
    if (
      !Number.isFinite(descriptor.bpResolution) ||
      !Number.isFinite(descriptor.pixelResolution) ||
      descriptor.pixelResolution <= 0
    ) {
      return null;
    }
    const rawMapSizePx = Number(
      this.mapManager.viewAndLayersManager.imageSizes[descriptor.imageSizeIndex] ?? NaN
    );
    if (!Number.isFinite(rawMapSizePx) || rawMapSizePx <= 0) {
      return null;
    }
    const mapSizePx = Math.max(1, Math.round(rawMapSizePx));
    const extent = this.mapManager.getView().calculateExtent(size);
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
      Math.max(startColPx + 1, clampUpperBound(
        Math.ceil((extent[2] ?? 0) / descriptor.pixelResolution) + pad
      ))
    );
    const startRowPx = clampLowerBound(
      Math.floor(-(extent[3] ?? 0) / descriptor.pixelResolution) - pad
    );
    const endRowPx = Math.min(
      mapSizePx,
      Math.max(startRowPx + 1, clampUpperBound(
        Math.ceil(-(extent[1] ?? 0) / descriptor.pixelResolution) + pad
      ))
    );
    return {
      bpResolution: descriptor.bpResolution,
      startRowPx,
      endRowPx,
      startColPx,
      endColPx,
    };
  }

  private resolveExpectedProfileBounds(): ViewportPixelBounds | null {
    return this.resolveViewportPixelBounds(
      Math.max(0, Math.round(this.mapManager.getOptions().tileSize || 0))
    );
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
      if (updated) {
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
    const response = await this.mapManager.networkManager.requestManager.queryMatrixFloat32(
      {
        ...bounds,
        signalMode: "TRADITIONAL_NORMALIZED",
      }
    );
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
    this.visualizationOptionsStore.setVisualizationOptions(
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
          nextUpperBound
        ),
        options.autoThresholdEnabled,
        options.autoThresholdQuantile,
        options.signalDisplayMode
      )
    );
    return nextUpperBound;
  }

  private async syncPipelineAutoThresholdToViewport(
    config?: Record<string, unknown>,
    sourceFilter?: SourceName
  ): Promise<boolean> {
    const options = this.visualizationOptionsStore.asVisualizationOptions();
    if (!options.autoThresholdEnabled) {
      return false;
    }
    const bounds = this.resolveViewportPixelBounds();
    if (!bounds) {
      return false;
    }
    const activeConfig = config ?? (await this.getActiveRenderPipelineConfig());
    if (!activeConfig) {
      return false;
    }

    const targets: ColormapTarget[] = [];
    collectColormapTargets(activeConfig.upperExpression, targets);
    collectColormapTargets(activeConfig.lowerExpression, targets);
    const filteredTargets = sourceFilter
      ? targets.filter((target) => target.profile.source === sourceFilter)
      : targets;
    if (filteredTargets.length === 0) {
      return false;
    }

    const scalingCoefficients = this.resolveResolutionScalingCoefficients();
    const thresholdCache = new Map<string, number | null>();
    let changed = false;

    for (const target of filteredTargets) {
      const cacheKey = JSON.stringify(target.profile);
      let nextUpperBound = thresholdCache.get(cacheKey);
      if (nextUpperBound === undefined) {
        const response =
          await this.mapManager.networkManager.requestManager.queryMatrixFloat32({
            ...bounds,
            source: target.profile.source,
            signalMode: target.profile.applyCoolerWeights
              ? "COOLER_WEIGHTED"
              : "RAW_COUNTS",
          });
        nextUpperBound = resolveSafeAutoUpperBound(
          transformSignalsForProfile(
            response.values,
            target.profile,
            scalingCoefficients
          ),
          options.autoThresholdQuantile,
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
        changed = true;
      }
    }

    if (!changed) {
      return true;
    }

    await this.mapManager.networkManager.requestManager.setRenderPipelineConfig(
      activeConfig
    );
    await this.mapManager.reloadTilesFromBackend();
    return true;
  }

  public async sendVisualizationOptionsToServer(options?: {
    skipAutoThresholdRefresh?: boolean;
    preserveCustomPipeline?: boolean;
  }): Promise<VisualizationOptions> {
    if (!options?.skipAutoThresholdRefresh) {
      await this.syncAutoThresholdToViewport().catch(() => null);
    }
    return this.mapManager.networkManager.requestManager
      .setVisualizationOptions(
        new SetVisualizationOptionsRequest({
          options: this.visualizationOptionsStore.asVisualizationOptions(),
          preserveRenderPipeline: options?.preserveCustomPipeline ?? false,
        })
      )
      .then((options) => {
        this.visualizationOptionsStore.setVisualizationOptions(options);
        window.dispatchEvent(
          new CustomEvent(VisualizationManager.VISUALIZATION_OPTIONS_UPDATED_EVENT, {
            detail: { source: "server", options },
          })
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
  }): Promise<VisualizationOptions> {
    const result = await this.sendVisualizationOptionsToServer(options);
    this.mapManager.reloadTiles();
    return result;
  }

  public async applyVisualizationSettingsAndReload(): Promise<VisualizationOptions> {
    if (!this.visualizationOptionsStore.autoThresholdEnabled) {
      return this.sendVisualizationOptionsAndReload();
    }
    const pipelineConfig = await this.getActiveRenderPipelineConfig();
    const preserveCustomPipeline = pipelineConfig != null;
    const result = await this.sendVisualizationOptionsToServer({
      skipAutoThresholdRefresh: true,
      preserveCustomPipeline,
    });
    await this.refreshAutoThresholdAndReload();
    return result;
  }

  public async applyVisualizationSettingsForSourceAndReload(
    source: SourceName
  ): Promise<VisualizationOptions> {
    const pipelineConfig = await this.getActiveRenderPipelineConfig();
    if (!pipelineConfig) {
      return this.applyVisualizationSettingsAndReload();
    }

    const options = this.visualizationOptionsStore.asVisualizationOptions();
    const updated = await this.sendVisualizationOptionsToServer({
      skipAutoThresholdRefresh: true,
      preserveCustomPipeline: true,
    });
    const changed = this.updateRenderPipelineSource(pipelineConfig, source, options);
    if (!changed) {
      await this.mapManager.reloadTilesFromBackend();
      return updated;
    }

    await this.mapManager.networkManager.requestManager.setRenderPipelineConfig(
      pipelineConfig
    );
    if (options.autoThresholdEnabled) {
      await this.syncPipelineAutoThresholdToViewport(pipelineConfig, source).catch(
        () => false
      );
    }
    await this.mapManager.reloadTilesFromBackend();
    return updated;
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
