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

"use strict";

import { MousePosition } from "ol/control";
import {
  getTransformFromProjections,
  getUserProjection,
  identityTransform,
} from "ol/proj";
import TileLayer from "ol/layer/Tile";
import { inView } from "ol/layer/Layer";
import { containsCoordinate } from "ol/extent";
import { watch } from "vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";

import { formatBp, formatLength } from "./app/core/format/formatSignal";

function getOsdSettings() {
  try {
    return useUiSettingsStore();
  } catch {
    return null;
  }
}

function overlayStyle(position) {
  const location =
    position === "bottom-left"
      ? "left: 12px; bottom: 12px;"
      : "right: 12px; top: 12px;";
  return [
    "display: block",
    "position: absolute",
    location,
    "max-width: min(48rem, calc(100vw - 3rem))",
    "padding: 8px 10px",
    "background: rgba(255, 255, 255, 0.96)",
    "border: 1px solid #d0d5dd",
    "border-radius: 12px",
    "color: #344054",
    "box-shadow: 0 2px 8px #17203325",
    "pointer-events: none",
  ].join("; ");
}

export default class BinMousePosition extends MousePosition {
  constructor(opt_options) {
    super(opt_options);
    this.moreFields = false;
    this.element.addEventListener("click", (event) => {
      const button = event.target.closest(".hict-info-more");
      if (!button) return;
      event.stopPropagation();
      this.moreFields = !this.moreFields;
      this.updateHTML_(this.pointerPixel);
      this.element
        .querySelector(".hict-info-more")
        ?.focus({ preventScroll: true });
    });
    this.element.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".hict-info-more")) event.stopPropagation();
    });
    this.element.addEventListener("pointermove", (event) => {
      if (event.target.closest(".hict-info-more")) event.stopPropagation();
    });

    if (opt_options.dimension_holder) {
      this.dimension_holder = opt_options.dimension_holder;
    }
    if (opt_options.layers) {
      this.layers = opt_options.layers;
    }
    if (opt_options.scaffold_holder) {
      this.scaffold_holder = opt_options.scaffold_holder;
    }
    if (opt_options.layersManager) {
      this.layersManager = opt_options.layersManager;
    }
  }

  setMap(map) {
    this.stopSettingsWatch?.();
    this.stopSettingsWatch = null;
    super.setMap(map);
    this.refreshOnRender = false;
    if (!map) {
      this.pointerPixel = null;
      return;
    }
    const settings = getOsdSettings();
    if (settings)
      this.stopSettingsWatch = watch(
        () => [
          settings.osdOverlayVisible,
          settings.osdOverlayPosition,
          settings.osdOverlayFields,
          settings.osdOverlayFieldOrder,
        ],
        () => this.updateHTML_(this.pointerPixel),
        { deep: true }
      );
    this.listenerKeys.push(
      map.getView().on("change:resolution", () => {
        this.refreshOnRender = true;
      }),
      map.on("moveend", () => {
        this.refreshOnRender = true;
        map.render();
      }),
      map.on("rendercomplete", () => {
        if (this.pointerPixel) this.updateHTML_(this.pointerPixel);
      })
    );
  }

  disposeInternal() {
    this.stopSettingsWatch?.();
    this.stopSettingsWatch = null;
    super.disposeInternal();
  }

  visibleMatrixLayer(map, coordinate) {
    const extent = map.getView().getProjection().getExtent();
    if (extent && !containsCoordinate(extent, coordinate)) return null;
    const owned = new Set(this.layers ?? []);
    const viewState = map.getView().getState();
    let top = null;
    for (const state of map.getLayerGroup().getLayerStatesArray()) {
      if (
        !owned.has(state.layer) ||
        !(state.layer instanceof TileLayer) ||
        state.opacity <= 0 ||
        !inView(state, viewState) ||
        (state.extent && !containsCoordinate(state.extent, coordinate))
      )
        continue;
      if (!top || (state.zIndex ?? 0) >= (top.zIndex ?? 0)) top = state;
    }
    return top?.layer ?? null;
  }

  render(event) {
    super.render(event);
    if (event.frameState && this.refreshOnRender) {
      this.refreshOnRender = false;
      if (this.pointerPixel) this.updateHTML_(this.pointerPixel);
    }
  }

  getGuidanceResolutionDescriptor(fallbackDescriptor) {
    if (this.layersManager?.getFinestVisibleSourceResolutionDescriptor) {
      const descriptor =
        this.layersManager.getFinestVisibleSourceResolutionDescriptor();
      if (
        descriptor &&
        Number.isFinite(descriptor.bpResolution) &&
        Number.isFinite(descriptor.pixelResolution)
      ) {
        return this.layersManager?.ensureGuidanceResolutionDescriptor
          ? this.layersManager.ensureGuidanceResolutionDescriptor(descriptor)
          : descriptor;
      }
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

  updateHTML_(pixel) {
    this.pointerPixel = pixel;
    const osdSettings = getOsdSettings();
    if (osdSettings && !osdSettings.osdOverlayVisible) {
      if (this.renderedHTML_ !== "") this.element.innerHTML = "";
      this.renderedHTML_ = "";
      return;
    }
    let html = this.placeholder_;
    if (pixel && this.mapProjection_) {
      if (!this.transform_) {
        const projection = this.getProjection();
        if (projection) {
          this.transform_ = getTransformFromProjections(
            this.mapProjection_,
            projection
          );
        } else {
          this.transform_ = identityTransform;
        }
      }
      const map = this.getMap();
      const coordinate = map.getCoordinateFromPixelInternal(pixel);
      if (coordinate) {
        const mapCoordinate = [...coordinate];
        const userProjection = getUserProjection();
        if (userProjection) {
          this.transform_ = getTransformFromProjections(
            this.mapProjection_,
            userProjection
          );
        }
        this.transform_(coordinate, coordinate);

        // Coordinates and resolution do not depend on GPU pixel readback or loaded tiles.
        const hovered_layer = this.visibleMatrixLayer(map, mapCoordinate);
        if (hovered_layer) {
          try {
            const bpResolutionString = hovered_layer.get("bpResolution");
            const hoveredBpResolution = Number(bpResolutionString);
            const hoveredPixelResolution = Number(
              hovered_layer.get("pixelResolution")
            );
            const fallbackDescriptor = {
              sourceName:
                hovered_layer.get("sourceName") === "SECONDARY"
                  ? "SECONDARY"
                  : "PRIMARY",
              bpResolution: hoveredBpResolution,
              pixelResolution: hoveredPixelResolution,
            };
            const guidanceDescriptor =
              this.getGuidanceResolutionDescriptor(fallbackDescriptor);
            const dimensionHolder =
              this.getDimensionHolderForDescriptor(guidanceDescriptor);
            const bpResolution = guidanceDescriptor.bpResolution;
            const pixelResolution = guidanceDescriptor.pixelResolution;
            const fields = osdSettings?.osdOverlayFields ?? {};
            const fieldOrder = osdSettings?.osdOverlayFieldOrder ?? [];
            const osdLines = {};
            const fieldEnabled = (field) => fields[field] !== false;
            const appendLine = (field, text) => {
              if (fieldEnabled(field)) {
                osdLines[field] = String(text).replace(
                  /[&<>"']/g,
                  (character) =>
                    ({
                      "&": "&amp;",
                      "<": "&lt;",
                      ">": "&gt;",
                      '"': "&quot;",
                      "'": "&#39;",
                    }[character])
                );
              }
            };
            const fixed_coordinates = mapCoordinate.map((c) =>
              Math.ceil(c / pixelResolution)
            );
            const int_coordinates_px =
              dimensionHolder.clampPxCoordinatesAtResolution(
                [
                  Math.floor(fixed_coordinates[0]),
                  -Math.floor(fixed_coordinates[1]),
                ],
                bpResolution
              );

            this.element.style.position = "absolute";
            this.element.style.inset = "0";
            this.element.style.pointerEvents = "none";
            html = `<div style="${overlayStyle(
              osdSettings?.osdOverlayPosition
            )}">`;

            // html +=
            //   "Center coordinate: " + map.getView().getCenter().map(Math.floor);
            // html = html + "<";
            // html = html + "br/>";

            if (fixed_coordinates) {
              appendLine(
                "resolution",
                guidanceDescriptor.displayGrid === "SEQUENCE_BP"
                  ? "Base scale; native bins: " +
                      formatLength(guidanceDescriptor.sourceBpResolution)
                  : "Resolution: " + formatLength(bpResolution)
              );
              if (guidanceDescriptor.sourceName) {
                appendLine(
                  "source",
                  "Showing data from: " +
                    guidanceDescriptor.sourceName.toLowerCase()
                );
              }
              if (this.layersManager?.getVisibleSourceResolutionDescriptors) {
                const visible =
                  this.layersManager.getVisibleSourceResolutionDescriptors();
                const details = [
                  visible.primary
                    ? `Primary ${formatLength(
                        visible.primary.sourceBpResolution ??
                        visible.primary.bpResolution
                      )}`
                    : null,
                  visible.secondary
                    ? `Secondary ${formatLength(
                        visible.secondary.sourceBpResolution ??
                        visible.secondary.bpResolution
                      )}`
                    : null,
                ].filter(Boolean);
                if (details.length > 0) {
                  appendLine(
                    "visibleResolutions",
                    "Available resolutions: " + details.join("; ")
                  );
                }
              }
              appendLine(
                "pixels",
                "Matrix cell (display): " +
                  int_coordinates_px[0] +
                  " × " +
                  int_coordinates_px[1]
              );
            }

            if (dimensionHolder) {
              const int_coordinates_bins = dimensionHolder.pixelsToBins(
                int_coordinates_px,
                bpResolution
              );
              appendLine(
                "bins",
                "Matrix cell (stored): " +
                  int_coordinates_bins[0] +
                  " × " +
                  int_coordinates_bins[1]
              );
              const bp1 = dimensionHolder.getStartBpOfPx(
                int_coordinates_px[0],
                bpResolution
              );
              const bp2 = dimensionHolder.getStartBpOfPx(
                int_coordinates_px[1],
                bpResolution
              );
              const ctg1 = dimensionHolder.getContigNameByPx(
                int_coordinates_px[0],
                bpResolution
              );
              const ctg2 = dimensionHolder.getContigNameByPx(
                int_coordinates_px[1],
                bpResolution
              );
              appendLine(
                "global",
                `Position: ${formatBp(bp2 + 1)} × ${formatBp(bp1 + 1)} bp`
              );
              appendLine(
                "basePairs",
                `Map position (0-based): ${formatBp(bp2)} × ${formatBp(bp1)} bp`
              );
              appendLine("contigs", "Contigs: ctg1=" + ctg1 + " ctg2=" + ctg2);
              if (dimensionHolder.getContigLocusByPx) {
                const locus1 = dimensionHolder.getContigLocusByPx(
                  int_coordinates_px[0],
                  bpResolution
                );
                const locus2 = dimensionHolder.getContigLocusByPx(
                  int_coordinates_px[1],
                  bpResolution
                );
                appendLine(
                  "inContig",
                  "Position in contig: +" +
                    locus1.inContigBp +
                    " × +" +
                    locus2.inContigBp
                );
              }
              if (this.scaffold_holder?.getScaffoldLocusByBp) {
                const scaffold1 =
                  this.scaffold_holder.getScaffoldLocusByBp(bp1);
                const scaffold2 =
                  this.scaffold_holder.getScaffoldLocusByBp(bp2);
                appendLine(
                  "scaffolds",
                  "Scaffolds: scf1=" +
                    (scaffold1 ? scaffold1.scaffoldName : "unscaffolded") +
                    " × " +
                    (scaffold2 ? scaffold2.scaffoldName : "unscaffolded")
                );
                appendLine(
                  "inScaffold",
                  "Position in scaffold: " +
                    (scaffold1 ? "+" + scaffold1.inScaffoldBp : "n/a") +
                    " × " +
                    (scaffold2 ? "+" + scaffold2.inScaffoldBp : "n/a")
                );
              }
            }

            const orderedFields = [
              ...fieldOrder,
              ...Object.keys(osdLines).filter(
                (field) => !fieldOrder.includes(field)
              ),
            ];
            const mainFields = new Set(["global", "resolution"]);
            const base = orderedFields.filter((field) => mainFields.has(field));
            const extra = orderedFields.filter(
              (field) => !mainFields.has(field) && osdLines[field]
            );
            html += base
              .map((field) => osdLines[field])
              .filter(Boolean)
              .join("<br/>");
            if (extra.length) {
              html += ` <button type="button" class="btn btn-sm btn-link hict-info-more p-0"
                style="pointer-events: auto;" aria-expanded="${
                  this.moreFields
                }">${this.moreFields ? "Less" : "More…"}</button>`;
              if (this.moreFields)
                html +=
                  "<br/>" + extra.map((field) => osdLines[field]).join("<br/>");
            }
            html += "</div>";
          } catch (error) {
            console.warn("Unable to update map mouse position overlay", error);
            html = this.placeholder_;
          }
        }
      }
    }
    if (html !== this.renderedHTML_) {
      this.element.innerHTML = html;
      this.renderedHTML_ = html;
    }
  }
}
