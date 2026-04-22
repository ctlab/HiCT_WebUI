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

type ViewportPixelBounds = {
  bpResolution: number;
  startRowPx: number;
  endRowPx: number;
  startColPx: number;
  endColPx: number;
};

type SourceName = "PRIMARY" | "SECONDARY";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
  public constructor(public readonly mapManager: ContactMapManager) {}

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

  private async getActiveRenderPipelineConfig(): Promise<Record<string, unknown> | null> {
    const config =
      await this.mapManager.networkManager.requestManager
        .getRenderPipelineConfig()
        .catch(() => null);
    return isRecord(config) && Boolean(config.enabled ?? false) ? config : null;
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

  private resolveViewportPixelBounds(): ViewportPixelBounds | null {
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
    const extent = this.mapManager.getView().calculateExtent(size);
    const startColPx = Math.max(
      0,
      Math.floor((extent[0] ?? 0) / descriptor.pixelResolution)
    );
    const endColPx = Math.max(
      startColPx + 1,
      Math.ceil((extent[2] ?? 0) / descriptor.pixelResolution)
    );
    const startRowPx = Math.max(
      0,
      Math.floor(-(extent[3] ?? 0) / descriptor.pixelResolution)
    );
    const endRowPx = Math.max(
      startRowPx + 1,
      Math.ceil(-(extent[1] ?? 0) / descriptor.pixelResolution)
    );
    return {
      bpResolution: descriptor.bpResolution,
      startRowPx,
      endRowPx,
      startColPx,
      endColPx,
    };
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
    const nextUpperBound = computeFiniteQuantile(
      response.values,
      options.autoThresholdQuantile
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
    config?: Record<string, unknown>
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
    if (targets.length === 0) {
      return false;
    }

    const scalingCoefficients = this.resolveResolutionScalingCoefficients();
    const thresholdCache = new Map<string, number | null>();
    let changed = false;

    for (const target of targets) {
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
        nextUpperBound = computeFiniteQuantile(
          transformSignalsForProfile(
            response.values,
            target.profile,
            scalingCoefficients
          ),
          options.autoThresholdQuantile
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

  public async refreshAutoThresholdAndReload(): Promise<number | null> {
    const pipelineConfig = await this.getActiveRenderPipelineConfig();
    if (pipelineConfig) {
      await this.syncPipelineAutoThresholdToViewport(pipelineConfig);
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
