/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

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

import type { TrackStylePresetBundle } from "@/app/core/tracks/TrackStylePreset";
import defaultOptions from "@/app/core/visualization/colormap/default_options.json";
import type { SessionVisualizationPreset } from "@/app/stores/sessionStore";
import VisualizationOptions from "./VisualizationOptions";
import Colormap from "./colormap/Colormap";
import SimpleLinearGradient from "./colormap/SimpleLinearGradient";
import { ColorTranslator } from "colortranslator";

export type VisualizationPresetRecord = {
  option_id: number;
  name: string;
  options: VisualizationOptions;
  backgroundColor: string;
  trackStyles?: TrackStylePresetBundle;
  signalThresholds?: {
    lowerSignalBound?: number;
    upperSignalBound?: number;
  };
  origin: "builtin" | "session";
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const safeColor = (value: unknown, fallback: string): ColorTranslator => {
  if (typeof value !== "string" || value.length > 128) {
    return new ColorTranslator(fallback, { legacyCSS: true });
  }
  try {
    return new ColorTranslator(value, { legacyCSS: true });
  } catch {
    return new ColorTranslator(fallback, { legacyCSS: true });
  }
};

export const serializeVisualizationOptions = (
  options: VisualizationOptions
): Record<string, unknown> => {
  const cmap = options.colormap;
  if (cmap instanceof SimpleLinearGradient) {
    return {
      preLogBase: options.preLogBase,
      postLogBase: options.postLogBase,
      applyCoolerWeights: options.applyCoolerWeights ?? false,
      resolutionScaling: options.resolutionScaling ?? false,
      resolutionLinearScaling: options.resolutionLinearScaling ?? false,
      autoThresholdEnabled: options.autoThresholdEnabled ?? false,
      autoThresholdQuantile: options.autoThresholdQuantile ?? 0.995,
      signalDisplayMode: options.signalDisplayMode ?? "OBSERVED",
      coolerWeightsNaNPolicy:
        options.coolerWeightsNaNPolicy ?? "REPLACE_NANS_WITH_ONE",
      colormap: {
        colormapType: cmap.colormapType,
        startColorRGBAString: cmap.startColorRGBA.RGBA,
        endColorRGBAString: cmap.endColorRGBA.RGBA,
        minSignal: cmap.minSignal,
        maxSignal: cmap.maxSignal,
      },
    };
  }
  return {
    preLogBase: options.preLogBase,
    postLogBase: options.postLogBase,
    applyCoolerWeights: options.applyCoolerWeights ?? false,
    resolutionScaling: options.resolutionScaling ?? false,
    resolutionLinearScaling: options.resolutionLinearScaling ?? false,
    autoThresholdEnabled: options.autoThresholdEnabled ?? false,
    autoThresholdQuantile: options.autoThresholdQuantile ?? 0.995,
    signalDisplayMode: options.signalDisplayMode ?? "OBSERVED",
    coolerWeightsNaNPolicy:
      options.coolerWeightsNaNPolicy ?? "REPLACE_NANS_WITH_ONE",
    colormap: {
      colormapType: options.colormap?.colormapType ?? "Unknown",
    },
  };
};

export const deserializeVisualizationOptions = (
  raw: Record<string, unknown>
): VisualizationOptions => {
  const preLogBase = typeof raw.preLogBase === "number" ? raw.preLogBase : -1;
  const postLogBase =
    typeof raw.postLogBase === "number" ? raw.postLogBase : 10;
  const applyCoolerWeights =
    typeof raw.applyCoolerWeights === "boolean"
      ? raw.applyCoolerWeights
      : false;
  const resolutionScaling =
    typeof raw.resolutionScaling === "boolean" ? raw.resolutionScaling : false;
  const resolutionLinearScaling =
    typeof raw.resolutionLinearScaling === "boolean"
      ? raw.resolutionLinearScaling
      : false;
  const autoThresholdEnabled =
    typeof raw.autoThresholdEnabled === "boolean"
      ? raw.autoThresholdEnabled
      : false;
  const autoThresholdQuantile =
    typeof raw.autoThresholdQuantile === "number" &&
    Number.isFinite(raw.autoThresholdQuantile)
      ? raw.autoThresholdQuantile
      : 0.995;
  const signalDisplayMode =
    raw.signalDisplayMode === "EXPECTED" ||
    raw.signalDisplayMode === "OBSERVED_OVER_EXPECTED"
      ? raw.signalDisplayMode
      : "OBSERVED";
  const coolerWeightsNaNPolicy =
    raw.coolerWeightsNaNPolicy === "DISABLE_WEIGHTS" ||
    raw.coolerWeightsNaNPolicy === "REPLACE_NANS_WITH_ZERO" ||
    raw.coolerWeightsNaNPolicy === "REPLACE_NANS_WITH_ONE"
      ? raw.coolerWeightsNaNPolicy
      : "REPLACE_NANS_WITH_ONE";
  const cmapRaw = isRecord(raw.colormap) ? raw.colormap : {};
  const cmapType =
    typeof cmapRaw.colormapType === "string"
      ? cmapRaw.colormapType
      : "Unknown";
  let cmap: Colormap;
  if (cmapType === "SimpleLinearGradient") {
    const startColor =
      typeof cmapRaw.startColorRGBAString === "string"
        ? cmapRaw.startColorRGBAString
        : "rgba(0,255,0,0.0)";
    const endColor =
      typeof cmapRaw.endColorRGBAString === "string"
        ? cmapRaw.endColorRGBAString
        : "rgba(0,96,0,1.0)";
    const minSignal =
      typeof cmapRaw.minSignal === "number" ? cmapRaw.minSignal : 0;
    const maxSignal =
      typeof cmapRaw.maxSignal === "number" ? cmapRaw.maxSignal : 1;
    cmap = new SimpleLinearGradient(
      safeColor(startColor, "rgba(0,255,0,0.0)"),
      safeColor(endColor, "rgba(0,96,0,1.0)"),
      minSignal,
      maxSignal
    );
  } else {
    cmap = new Colormap(cmapType);
  }
  return new VisualizationOptions(
    preLogBase,
    postLogBase,
    applyCoolerWeights,
    resolutionScaling,
    resolutionLinearScaling,
    cmap,
    autoThresholdEnabled,
    autoThresholdQuantile,
    signalDisplayMode,
    coolerWeightsNaNPolicy
  );
};

export const getVisualizationSignalThresholds = (
  options: VisualizationOptions
): {
  lowerSignalBound?: number;
  upperSignalBound?: number;
} => {
  const cmap = options.colormap;
  if (cmap instanceof SimpleLinearGradient) {
    return {
      lowerSignalBound: cmap.minSignal,
      upperSignalBound: cmap.maxSignal,
    };
  }
  return {};
};

const toPresetRecord = (
  option: {
    option_id?: number;
    name?: string;
    options?: Record<string, unknown>;
    backgroundColor?: string;
    trackStyles?: TrackStylePresetBundle;
    signalThresholds?: {
      lowerSignalBound?: number;
      upperSignalBound?: number;
    };
  },
  optionId: number,
  origin: "builtin" | "session"
): VisualizationPresetRecord => ({
  option_id: option.option_id ?? optionId,
  name: option.name ?? `Preset ${optionId}`,
  options: deserializeVisualizationOptions(option.options ?? {}),
  backgroundColor: option.backgroundColor ?? "rgba(255,255,255,1.0)",
  trackStyles: option.trackStyles,
  signalThresholds:
    option.signalThresholds ??
    getVisualizationSignalThresholds(
      deserializeVisualizationOptions(option.options ?? {})
    ),
  origin,
});

const extractBuiltinPresetRows = (): Array<{
  option_id?: number;
  name?: string;
  options?: Record<string, unknown>;
  backgroundColor?: string;
  trackStyles?: TrackStylePresetBundle;
  signalThresholds?: {
    lowerSignalBound?: number;
    upperSignalBound?: number;
  };
}> => {
  const data = isRecord(defaultOptions)
    ? ((defaultOptions as UnknownRecord).data as UnknownRecord | undefined)
    : undefined;
  if (!data) {
    return [];
  }
  const source = Array.isArray(data.savedVisualizationPresets)
    ? data.savedVisualizationPresets
    : Array.isArray(data.savedLocations)
      ? data.savedLocations
      : [];
  return source.filter(isRecord) as Array<{
    option_id?: number;
    name?: string;
    options?: Record<string, unknown>;
    backgroundColor?: string;
    trackStyles?: TrackStylePresetBundle;
    signalThresholds?: {
      lowerSignalBound?: number;
      upperSignalBound?: number;
    };
  }>;
};

export const loadBuiltinVisualizationPresets = (): VisualizationPresetRecord[] =>
  extractBuiltinPresetRows().map((option, index) =>
    toPresetRecord(option, index, "builtin")
  );

export const mergeVisualizationPresets = (
  sessionPresets: SessionVisualizationPreset[]
): VisualizationPresetRecord[] => {
  const builtins = loadBuiltinVisualizationPresets();
  const session = sessionPresets.map((preset, index) =>
    toPresetRecord(
      {
        option_id: preset.option_id ?? index,
        name: preset.name,
        options: preset.options,
        backgroundColor: preset.backgroundColor,
        trackStyles: preset.trackStyles as TrackStylePresetBundle | undefined,
        signalThresholds: preset.signalThresholds,
      },
      index,
      "session"
    )
  );
  return [...builtins, ...session];
};
