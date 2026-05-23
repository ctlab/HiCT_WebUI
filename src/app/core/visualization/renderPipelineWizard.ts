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

import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import VisualizationOptions from "@/app/core/visualization/VisualizationOptions";

export type WizardViewMode = "single" | "overlay" | "split";
export type WizardBlendMode =
  | "OVER"
  | "ADD"
  | "SUBTRACT"
  | "MULTIPLY"
  | "SCREEN"
  | "DIFFERENCE"
  | "LIGHTEN"
  | "DARKEN"
  | "XOR";

export type SourceName = "PRIMARY" | "SECONDARY";
type TrackAxis = "ROW" | "COL";

type PipelineExpression =
  | { type: "source"; source: SourceName }
  | { type: "track1d"; trackId: string; axis: TrackAxis }
  | {
      type: "dynamic";
      field: "RESOLUTION_SCALING_COEFF" | "RESOLUTION_LINEAR_SCALING_COEFF";
    }
  | { type: "log"; input: PipelineExpression; base: number }
  | {
      type: "binary";
      op: "MUL";
      left: PipelineExpression;
      right: PipelineExpression;
    }
  | {
      type: "colormap";
      mode: "LINEAR";
      input: PipelineExpression;
      startColor: string;
      endColor: string;
      minSignal: number;
      maxSignal: number;
    }
  | {
      type: "pixel_blend";
      mode: WizardBlendMode;
      top: PipelineExpression;
      bottom: PipelineExpression;
      topOpacity: number;
      bottomOpacity: number;
    };

const BUILTIN_COOLER_WEIGHTS_TRACK_ID = "__builtin_cooler_weights__";

const cloneExpression = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const safeHexa = (value: string, fallback: string): string => {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (/^#[0-9a-f]{8}$/.test(normalized)) {
    return normalized;
  }
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return `${normalized}ff`;
  }
  return fallback;
};

const buildSignalExpression = (
  source: SourceName,
  options: VisualizationOptions
): PipelineExpression => {
  let expression: PipelineExpression = {
    type: "source",
    source,
  };
  if (
    Number.isFinite(options.preLogBase) &&
    options.preLogBase > 0 &&
    Math.abs(options.preLogBase - 1) > 1e-9
  ) {
    expression = {
      type: "log",
      input: expression,
      base: options.preLogBase,
    };
  }
  if (options.resolutionScaling) {
    expression = {
      type: "binary",
      op: "MUL",
      left: expression,
      right: {
        type: "dynamic",
        field: "RESOLUTION_SCALING_COEFF",
      },
    };
  }
  if (options.resolutionLinearScaling) {
    expression = {
      type: "binary",
      op: "MUL",
      left: expression,
      right: {
        type: "dynamic",
        field: "RESOLUTION_LINEAR_SCALING_COEFF",
      },
    };
  }
  if (options.applyCoolerWeights) {
    expression = {
      type: "binary",
      op: "MUL",
      left: expression,
      right: {
        type: "binary",
        op: "MUL",
        left: {
          type: "track1d",
          trackId: BUILTIN_COOLER_WEIGHTS_TRACK_ID,
          axis: "ROW",
        },
        right: {
          type: "track1d",
          trackId: BUILTIN_COOLER_WEIGHTS_TRACK_ID,
          axis: "COL",
        },
      },
    };
  }
  if (
    Number.isFinite(options.postLogBase) &&
    options.postLogBase > 0 &&
    Math.abs(options.postLogBase - 1) > 1e-9
  ) {
    expression = {
      type: "log",
      input: expression,
      base: options.postLogBase,
    };
  }
  return expression;
};

export const buildColorExpression = (
  source: SourceName,
  options: VisualizationOptions
): PipelineExpression => {
  const gradient = options.colormap;
  const linearGradient =
    gradient instanceof SimpleLinearGradient ? gradient : undefined;
  return {
    type: "colormap",
    mode: "LINEAR",
    input: buildSignalExpression(source, options),
    startColor: safeHexa(
      linearGradient?.startColorRGBA?.HEXA ?? "#ffffff00",
      "#ffffff00"
    ),
    endColor: safeHexa(
      linearGradient?.endColorRGBA?.HEXA ?? "#006000ff",
      "#006000ff"
    ),
    minSignal:
      typeof linearGradient?.minSignal === "number"
        ? linearGradient.minSignal
        : 0,
    maxSignal:
      typeof linearGradient?.maxSignal === "number"
        ? linearGradient.maxSignal
        : 1,
  };
};

const withTransparentMinimumColor = (
  expression: PipelineExpression
): PipelineExpression => {
  if (expression.type !== "colormap") {
    return expression;
  }
  return {
    ...expression,
    startColor: `${expression.startColor.slice(0, 7)}00`,
  };
};

export const buildWizardRenderPipelineConfig = (options: {
  viewMode: WizardViewMode;
  primaryOptions: VisualizationOptions;
  secondaryOptions?: VisualizationOptions;
  blendMode?: WizardBlendMode;
  topOpacity?: number;
  bottomOpacity?: number;
}): Record<string, unknown> => {
  const primary = buildColorExpression("PRIMARY", options.primaryOptions);
  if (options.viewMode === "single" || !options.secondaryOptions) {
    return {
      enabled: true,
      swapUpperLower: false,
      upperExpression: primary,
      lowerExpression: cloneExpression(primary),
    };
  }

  const secondary = buildColorExpression("SECONDARY", options.secondaryOptions);
  if (options.viewMode === "overlay") {
    const overlay: PipelineExpression = {
      type: "pixel_blend",
      mode: options.blendMode ?? "OVER",
      top: withTransparentMinimumColor(primary),
      bottom: withTransparentMinimumColor(secondary),
      topOpacity:
        typeof options.topOpacity === "number" ? options.topOpacity : 0.5,
      bottomOpacity:
        typeof options.bottomOpacity === "number"
          ? options.bottomOpacity
          : 1.0,
    };
    return {
      enabled: true,
      swapUpperLower: false,
      upperExpression: overlay,
      lowerExpression: cloneExpression(overlay),
    };
  }

  return {
    enabled: true,
    swapUpperLower: false,
    upperExpression: primary,
    lowerExpression: secondary,
  };
};
