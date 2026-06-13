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

// @no-ts-check
import { MouseWheelZoom } from "ol/interaction";
import { clamp } from "ol/math";
import EventType from "ol/events/EventType.js";
import { DEVICE_PIXEL_RATIO, FIREFOX } from "ol/has.js";
import binarySearch from "binary-search";
import TileLayer from "ol/layer/Tile";

/**
 * @classdesc
 * Allows the user to zoom the map by scrolling the mouse wheel preserving the center of the Hi-C map in bp-coordinates.
 * @api
 */
export default class ContigMouseWheelZoom extends MouseWheelZoom {
  constructor(opt_options) {
    super(opt_options);
    this.dimension_holder = opt_options.dimension_holder;
    this.resolutions = [...opt_options.resolutions];
    this.pixelResolutionSet = [...opt_options.pixelResolutionSet];
    this.global_projection = opt_options.global_projection;
    this.layers = opt_options.layers;
    this.layersManager = opt_options.layersManager;
    this.isTrackPad = undefined;
  }

  setResolutionModel(resolutions, pixelResolutionSet, layers) {
    this.resolutions = [...resolutions];
    this.pixelResolutionSet = [...pixelResolutionSet];
    this.layers = layers;
  }

  getLayerResolutionDescriptor(layer) {
    return {
      sourceName:
        layer?.get("sourceName") === "SECONDARY" ? "SECONDARY" : "PRIMARY",
      bpResolution: Number(layer?.get("bpResolution")),
      pixelResolution: Number(layer?.get("pixelResolution")),
    };
  }

  getGuidanceResolutionDescriptorForViewResolution(
    viewResolution,
    fallbackDescriptor
  ) {
    if (
      this.layersManager?.getGuidanceResolutionDescriptorForViewResolution &&
      Number.isFinite(viewResolution)
    ) {
      return this.layersManager.getGuidanceResolutionDescriptorForViewResolution(
        viewResolution
      );
    }
    return this.layersManager?.ensureGuidanceResolutionDescriptor
      ? this.layersManager.ensureGuidanceResolutionDescriptor(
          fallbackDescriptor
        )
      : fallbackDescriptor;
  }

  getDimensionHolderForDescriptor(descriptor) {
    return (
      this.layersManager?.getDimensionHolderForSource?.(
        descriptor.sourceName ?? "PRIMARY"
      ) ?? this.dimension_holder
    );
  }

  /**
   * Handles the {@link module:ol/MapBrowserEvent~MapBrowserEvent map browser event} (if it was a mousewheel-event) and eventually
   * zooms the map.
   * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Map browser event.
   * @return {boolean} `false` to stop event propagation.
   */
  handleEvent(mapBrowserEvent) {
    if (!this.condition_(mapBrowserEvent)) {
      return true;
    }
    const type = mapBrowserEvent.type;
    if (type !== EventType.WHEEL) {
      return true;
    }

    const map = mapBrowserEvent.map;
    const wheelEvent = /** @type {WheelEvent} */ (
      mapBrowserEvent.originalEvent
    );
    wheelEvent.preventDefault();

    const layers = this.layers
      .filter((l) => l instanceof TileLayer && l.getData(mapBrowserEvent.pixel))
      .sort((l1, l2) => (l2.getZIndex?.() ?? 0) - (l1.getZIndex?.() ?? 0)); //[];
    // map.forEachLayerAtPixel(mapBrowserEvent.pixel, function (layer) {
    //   layers.push(layer);
    // });
    const hovered_layer = layers.length === 0 ? null : layers[0];
    // .filter((l) => l instanceof TileLayer)
    // .sort((l1, l2) => l1.zIndex - l2.zIndex)[0];

    if (this.useAnchor_) {
      this.lastMouseCoord = mapBrowserEvent.coordinate;
      this.lastAnchor_ = mapBrowserEvent.coordinate;
      this.lastMousePixel = mapBrowserEvent.pixel;
      this.lastCenterPixel = [
        Math.round(map.getSize()[0] / 2),
        Math.round(map.getSize()[1] / 2),
      ];
    }

    if (hovered_layer) {
      try {
        const fallbackDescriptor =
          this.getLayerResolutionDescriptor(hovered_layer);
        const guidanceDescriptor =
          this.getGuidanceResolutionDescriptorForViewResolution(
            map.getView().getResolution(),
            fallbackDescriptor
          );
        const dimensionHolder =
          this.getDimensionHolderForDescriptor(guidanceDescriptor);
        const fixed_coordinates = mapBrowserEvent.coordinate.map(
          (c) => c / guidanceDescriptor.pixelResolution
        );
        const int_coordinates_bins =
          dimensionHolder.clampBinCoordinatesAtResolution(
            [
              Math.floor(fixed_coordinates[0]),
              -Math.floor(fixed_coordinates[1]),
            ],
            guidanceDescriptor.bpResolution
          );
        const bp1 = dimensionHolder.getStartBpOfBin(
          int_coordinates_bins[0],
          guidanceDescriptor.bpResolution
        );
        const bp2 = dimensionHolder.getStartBpOfBin(
          int_coordinates_bins[1],
          guidanceDescriptor.bpResolution
        );
        const coord_bp = [bp1, bp2];

        if (this.useAnchor_) {
          this.lastMouseBps = coord_bp;
          this.lastGuidanceDescriptor = guidanceDescriptor;
        }
      } catch (error) {
        console.warn("Unable to derive zoom guidance coordinate", error);
        this.lastMouseBps = null;
        this.lastGuidanceDescriptor = undefined;
      }
    } else {
      this.lastMouseBps = null;
      this.lastGuidanceDescriptor = undefined;
    }

    // Delta normalisation inspired by
    // https://github.com/mapbox/mapbox-gl-js/blob/001c7b9/js/ui/handler/scroll_zoom.js
    let delta;
    if (mapBrowserEvent.type == EventType.WHEEL) {
      delta = wheelEvent.deltaY;
      if (FIREFOX && wheelEvent.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        delta /= DEVICE_PIXEL_RATIO;
      }
      if (wheelEvent.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        delta *= 40;
      }
    }

    if (delta === 0) {
      return false;
    } else {
      this.lastDelta_ = delta;
    }

    const now = Date.now();

    if (this.startTime_ === undefined) {
      this.startTime_ = now;
    }

    if (
      this.isTrackPad === undefined ||
      now - this.startTime_ > this.trackpadEventGap_
    ) {
      this.isTrackPad = Math.abs(delta) < 4;
    }

    const view = map.getView();
    if (
      this.isTrackPad &&
      !(view.getConstrainResolution() || this.constrainResolution_)
    ) {
      if (this.trackpadTimeoutId_) {
        clearTimeout(this.trackpadTimeoutId_);
      } else {
        if (view.getAnimating()) {
          view.cancelAnimations();
        }
        view.beginInteraction();
      }
      this.trackpadTimeoutId_ = setTimeout(
        this.endInteraction_.bind(this),
        this.timeout_
      );
      view.adjustZoom(-delta / this.deltaPerZoom_, this.lastAnchor_);
      this.startTime_ = now;
      return false;
    }

    this.totalDelta_ += delta;

    const timeLeft = Math.max(this.timeout_ - (now - this.startTime_), 0);

    clearTimeout(this.timeoutId_);
    this.timeoutId_ = setTimeout(
      this.handleWheelZoom_.bind(this, map),
      timeLeft
    );

    return false;
  }

  handleWheelZoom_(map) {
    const view = map.getView();
    if (view.getAnimating()) {
      view.cancelAnimations();
    }
    let delta =
      -clamp(
        this.totalDelta_,
        -this.maxDelta_ * this.deltaPerZoom_,
        this.maxDelta_ * this.deltaPerZoom_
      ) / this.deltaPerZoom_;
    if (view.getConstrainResolution() || this.constrainResolution_) {
      // view has a zoom constraint, zoom by 1
      delta = delta ? (delta > 0 ? 1 : -1) : 0;
    }
    const currentZoom = view.getZoom();

    if (currentZoom === undefined) {
      return;
    }

    const zoomFactor = view.getZoomFactor ? view.getZoomFactor() : 2;
    const currentResolution = view.getResolution();
    if (currentResolution === undefined) {
      return;
    }
    const newResolution = currentResolution / Math.pow(zoomFactor, delta);
    if (newResolution === undefined) {
      return;
    }

    const minResolution = view.getMinResolution();
    const maxResolution = view.getMaxResolution();
    const constrainedResolution = Math.min(
      Math.max(newResolution, minResolution ?? newResolution),
      maxResolution ?? newResolution
    );

    let oldGuidanceDescriptor;
    let newGuidanceDescriptor;
    try {
      oldGuidanceDescriptor =
        this.getGuidanceResolutionDescriptorForViewResolution(
          currentResolution,
          this.lastGuidanceDescriptor
        );
      newGuidanceDescriptor =
        this.getGuidanceResolutionDescriptorForViewResolution(
          constrainedResolution,
          oldGuidanceDescriptor
        );
    } catch (error) {
      console.warn("Unable to derive zoom target guidance resolution", error);
    }
    if (
      this.lastMouseBps &&
      this.lastCenterPixel &&
      this.lastMousePixel &&
      this.lastMouseCoord &&
      !isNaN(this.lastMouseCoord[0])
    ) {
      if (newGuidanceDescriptor) {
        const dimensionHolder = this.getDimensionHolderForDescriptor(
          newGuidanceDescriptor
        );
        const finish_bin_1 = dimensionHolder.getBinContainingBp(
          this.lastMouseBps[0],
          newGuidanceDescriptor.bpResolution
        );
        const finish_bin_2 = dimensionHolder.getBinContainingBp(
          this.lastMouseBps[1],
          newGuidanceDescriptor.bpResolution
        );
        const finish_coordinate_bins = [finish_bin_1, finish_bin_2];
        // const finish_coordinate_on_map = this.transformFromLayerToGlobalCoordinate[new_level_index].apply(null, [finish_coordinate_bins]);
        const finish_coordinate_on_map = finish_coordinate_bins.map(
          (c) => c * newGuidanceDescriptor.pixelResolution
        );
        finish_coordinate_on_map[1] *= -1;
        const dx_px = this.lastCenterPixel[0] - this.lastMousePixel[0];
        const dy_px = this.lastCenterPixel[1] - this.lastMousePixel[1];
        view.animate({
          // duration: 50,
          duration: this.duration_,
          resolution: constrainedResolution,
          center: [
            finish_coordinate_on_map[0] + dx_px * constrainedResolution,
            finish_coordinate_on_map[1] - dy_px * constrainedResolution,
          ],
        });
      } else {
        view.animate({
          duration: this.duration_,
          resolution: constrainedResolution,
          anchor: this.lastMouseCoord,
        });
      }
    } else {
      view.animate({
        duration: this.duration_,
        resolution: constrainedResolution,
        anchor: this.lastMouseCoord,
      });
    }

    this.mode_ = undefined;
    this.totalDelta_ = 0;
    this.startTime_ = undefined;
    this.timeoutId_ = undefined;
    // this.lastMousePixel = null;
    // this.lastCenterPixel = null;
  }

  getClosestResolutionIndex(resolution) {
    if (!this.pixelResolutionSet.length) {
      return 0;
    }
    let bestIdx = 0;
    let bestDist = Math.abs(this.pixelResolutionSet[0] - resolution);
    for (let i = 1; i < this.pixelResolutionSet.length; ++i) {
      const dist = Math.abs(this.pixelResolutionSet[i] - resolution);
      if (dist < bestDist) {
        bestIdx = i;
        bestDist = dist;
      }
    }
    return bestIdx;
  }
}
