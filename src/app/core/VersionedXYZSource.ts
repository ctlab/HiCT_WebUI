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

import { ImageTile } from "ol";
import TileState from "ol/TileState";
import XYZ, { type Options as XYZOptions } from "ol/source/XYZ";
import { unref } from "vue";
import type { HiCViewAndLayersManager } from "./mapmanagers/HiCViewAndLayersManager";
import { CurrentSignalRangeResponseDTO } from "./net/dto/responseDTO";
import type { CurrentSignalRangeResponse } from "./net/api/response";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";

class VersionedXYZContactMapSource extends XYZ {
  protected sourceVersion: number;

  constructor(
    protected readonly layersManager: HiCViewAndLayersManager,
    protected readonly zoomLevel: number,
    protected readonly bpResolution: number,
    protected readonly matrixSource: "PRIMARY" | "SECONDARY" = "PRIMARY",
    readonly xyzOptions?: XYZOptions
  ) {
    super(xyzOptions);
    this.sourceVersion = 0;
    this.setTileLoadFunction((tile, src) => {
      console.assert(tile instanceof ImageTile);
      const imageTile: ImageTile = tile as ImageTile;
      const image: HTMLImageElement | HTMLVideoElement =
        imageTile.getImage() as HTMLImageElement | HTMLVideoElement;
      const uiSettingsStore = useUiSettingsStore();
      if (uiSettingsStore.binaryTileTransportEnabled) {
        this.loadBinarySignalTile(imageTile, image, src);
        return;
      }
      this.loadPngTile(imageTile, image, src);
    });
    this.do_reload();
  }

  private loadPngTile(
    tile: ImageTile,
    image: HTMLImageElement | HTMLVideoElement,
    src: string
  ): void {
    const xhr = new XMLHttpRequest();
    xhr.responseType = "json";
    xhr.addEventListener("loadend", () => {
      const data = xhr.response;
      if (data && data.image) {
        image.src = data.image;
        tile.setState(TileState.LOADED);
        // @ts-expect-error Adding field to object is ok in JS but not in TS
        tile.lastResponse = data;
        this.layersManager.callbackFns.contrastSliderRangesCallbacks.forEach(
          (callbackFn: (ranges: CurrentSignalRangeResponse) => void) => {
            callbackFn(
              new CurrentSignalRangeResponseDTO(data.ranges).toEntity()
            );
          }
        );
      } else {
        // @ts-expect-error If tile was loaded successfully at least once, last response is saved
        if (tile.lastResponse) {
          // @ts-expect-error If tile was loaded successfully at least once, last response is saved
          image.src = tile.lastResponse.image;
        } else {
          tile.setState(TileState.ERROR);
        }
      }
    });
    xhr.addEventListener("error", () => {
      // @ts-expect-error If tile was loaded successfully at least once, last response is saved
      if (tile.lastResponse) {
        // @ts-expect-error If tile was loaded successfully at least once, last response is saved
        image.src = tile.lastResponse.image;
      } else {
        tile.setState(TileState.ERROR);
      }
    });
    xhr.open("GET", src);
    xhr.send();
  }

  private loadBinarySignalTile(
    tile: ImageTile,
    image: HTMLImageElement | HTMLVideoElement,
    src: string
  ): void {
    const parsed = this.parseTileUrl(src);
    if (!parsed) {
      this.loadPngTile(tile, image, src);
      return;
    }
    const host = `${unref(this.layersManager.mapManager.networkManager.host)}`.replace(
      /\/+$/,
      ""
    );
    const payload = {
      bpResolution: this.bpResolution,
      unit: "PIXELS",
      startRowPx: parsed.startRowPx,
      endRowPx: parsed.endRowPx,
      startColPx: parsed.startColPx,
      endColPx: parsed.endColPx,
      source: this.matrixSource,
      signalMode: "TRADITIONAL_NORMALIZED",
      format: "BINARY_FLOAT32",
    };
    const xhr = new XMLHttpRequest();
    xhr.responseType = "arraybuffer";
    xhr.addEventListener("loadend", () => {
      const rows = Number.parseInt(xhr.getResponseHeader("x-hict-rows") || "0", 10);
      const cols = Number.parseInt(xhr.getResponseHeader("x-hict-cols") || "0", 10);
      const response = xhr.response;
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        response instanceof ArrayBuffer &&
        rows > 0 &&
        cols > 0
      ) {
        const values = this.decodeFloat32Array(response, rows * cols);
        const dataUrl = this.renderSignalTile(values, rows, cols);
        image.src = dataUrl;
        tile.setState(TileState.LOADED);
        // @ts-expect-error dynamic cache field
        tile.lastResponse = { image: dataUrl };
        return;
      }
      // @ts-expect-error dynamic cache field
      if (tile.lastResponse?.image) {
        // @ts-expect-error dynamic cache field
        image.src = tile.lastResponse.image;
      } else {
        tile.setState(TileState.ERROR);
      }
    });
    xhr.addEventListener("error", () => {
      // @ts-expect-error dynamic cache field
      if (tile.lastResponse?.image) {
        // @ts-expect-error dynamic cache field
        image.src = tile.lastResponse.image;
      } else {
        tile.setState(TileState.ERROR);
      }
    });
    xhr.open("POST", `${host}/matrix/query`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(payload));
  }

  private parseTileUrl(src: string):
    | {
        startRowPx: number;
        endRowPx: number;
        startColPx: number;
        endColPx: number;
      }
    | null {
    try {
      const url = new URL(src, window.location.href);
      const row = Number.parseInt(url.searchParams.get("row") || "0", 10);
      const col = Number.parseInt(url.searchParams.get("col") || "0", 10);
      const tileSize = Number.parseInt(
        url.searchParams.get("tile_size") ||
          String(unref(this.layersManager.tileSize)),
        10
      );
      if (
        !Number.isFinite(row) ||
        !Number.isFinite(col) ||
        !Number.isFinite(tileSize) ||
        tileSize <= 0
      ) {
        return null;
      }
      return {
        startRowPx: row * tileSize,
        endRowPx: (row + 1) * tileSize,
        startColPx: col * tileSize,
        endColPx: (col + 1) * tileSize,
      };
    } catch (error) {
      return null;
    }
  }

  private decodeFloat32Array(buffer: ArrayBuffer, expectedLength: number): Float32Array {
    const view = new DataView(buffer);
    const valueCount = Math.min(expectedLength, Math.floor(buffer.byteLength / 4));
    const out = new Float32Array(valueCount);
    for (let idx = 0; idx < valueCount; idx += 1) {
      out[idx] = view.getFloat32(idx * 4, true);
    }
    return out;
  }

  private renderSignalTile(values: Float32Array, rows: number, cols: number): string {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, cols);
    canvas.height = Math.max(1, rows);
    const context = canvas.getContext("2d");
    if (!context) {
      return "";
    }
    const imageData = context.createImageData(canvas.width, canvas.height);
    const visualizationOptionsStore = useVisualizationOptionsStore();
    const colormap = visualizationOptionsStore.colormap;
    let minSignal = 0;
    let maxSignal = 1;
    let start = this.parseRgba("rgba(0,255,0,0.0)");
    let end = this.parseRgba("rgba(0,96,0,1.0)");
    if (colormap instanceof SimpleLinearGradient) {
      minSignal = colormap.minSignal;
      maxSignal = colormap.maxSignal;
      start = this.parseRgba(colormap.startColorRGBA?.RGBA || "rgba(0,255,0,0.0)");
      end = this.parseRgba(colormap.endColorRGBA?.RGBA || "rgba(0,96,0,1.0)");
    }
    const signalRange = Math.max(1e-9, maxSignal - minSignal);
    const pixelCount = Math.min(values.length, rows * cols);
    for (let idx = 0; idx < pixelCount; idx += 1) {
      const signal = Number.isFinite(values[idx]) ? values[idx] : 0;
      const normalized = Math.max(0, Math.min(1, (signal - minSignal) / signalRange));
      const mix = normalized;
      const colorR = start[0] + (end[0] - start[0]) * mix;
      const colorG = start[1] + (end[1] - start[1]) * mix;
      const colorB = start[2] + (end[2] - start[2]) * mix;
      const alpha = start[3] + (end[3] - start[3]) * mix;
      const pixelIndex = idx * 4;
      imageData.data[pixelIndex] = this.clampByte(colorR);
      imageData.data[pixelIndex + 1] = this.clampByte(colorG);
      imageData.data[pixelIndex + 2] = this.clampByte(colorB);
      imageData.data[pixelIndex + 3] = this.clampByte(alpha);
    }
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  private parseRgba(color: string): [number, number, number, number] {
    const trimmed = (color ?? "").trim();
    const rgbaMatch = trimmed.match(
      /^rgba\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/i
    );
    if (rgbaMatch) {
      return [
        this.clampByte(Number.parseFloat(rgbaMatch[1])),
        this.clampByte(Number.parseFloat(rgbaMatch[2])),
        this.clampByte(Number.parseFloat(rgbaMatch[3])),
        this.clampByte(Number.parseFloat(rgbaMatch[4]) * 255.0),
      ];
    }
    const rgbMatch = trimmed.match(
      /^rgb\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)$/i
    );
    if (rgbMatch) {
      return [
        this.clampByte(Number.parseFloat(rgbMatch[1])),
        this.clampByte(Number.parseFloat(rgbMatch[2])),
        this.clampByte(Number.parseFloat(rgbMatch[3])),
        255,
      ];
    }
    return [255, 255, 255, 255];
  }

  private clampByte(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  /**
   * do_reload
   */
  public do_reload() {
    this.tileCache.expireCache({});
    this.tileCache.clear();
    ++this.sourceVersion;
    this.setTileUrlFunction(this.create_tile_url_function());
    this.changed();
  }

  public reloadWithVersion(version: number) {
    this.tileCache.expireCache({});
    this.tileCache.clear();
    this.sourceVersion = Math.max(0, Math.floor(version));
    this.setTileUrlFunction(this.create_tile_url_function());
    this.changed();
  }

  protected create_tile_url_function() {
    return (coord_zxy: number[]) => {
      const col = coord_zxy[1];
      const row = coord_zxy[2];
      const host = `${unref(this.layersManager.mapManager.networkManager.host)}`.replace(
        /\/+$/,
        ""
      );
      return (
        `${host}` +
        `/get_tile?version=${this.sourceVersion}` +
        `&level=${1 + this.zoomLevel}` +
        `&bpResolution=${this.bpResolution}` +
        `&source=${this.matrixSource}` +
        `&row=${row}` +
        `&col=${col}` +
        `&tile_size=${unref(this.layersManager.tileSize)}`
      );
    };
  }
}

export { VersionedXYZContactMapSource };
