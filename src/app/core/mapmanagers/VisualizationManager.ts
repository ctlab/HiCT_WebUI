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

  public async sendVisualizationOptionsToServer(options?: {
    skipAutoThresholdRefresh?: boolean;
  }): Promise<VisualizationOptions> {
    if (!options?.skipAutoThresholdRefresh) {
      await this.syncAutoThresholdToViewport().catch(() => null);
    }
    return this.mapManager.networkManager.requestManager
      .setVisualizationOptions(
        new SetVisualizationOptionsRequest({
          options: this.visualizationOptionsStore.asVisualizationOptions(),
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
  }): Promise<VisualizationOptions> {
    const result = await this.sendVisualizationOptionsToServer(options);
    this.mapManager.reloadTiles();
    return result;
  }

  public async refreshAutoThresholdAndReload(): Promise<number | null> {
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
