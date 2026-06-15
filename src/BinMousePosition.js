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
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";

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
    "padding: 14px 16px",
    "background: rgba(0, 0, 0, 0.35)",
    "border: 1px solid black",
    "border-radius: 12px",
    "color: white",
    "text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
    "pointer-events: none",
  ].join("; ");
}

export default class BinMousePosition extends MousePosition {
  constructor(opt_options) {
    super(opt_options);
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

        const layers = this.layers.filter((l) => l.getData(pixel));
        // map.forEachLayerAtPixel(pixel, function (layer) {
        //   layers.push(layer);
        // });
        const hovered_layer =
          layers.length === 0
            ? null
            : layers
                .filter((l) => l instanceof TileLayer)
                .sort((l1, l2) => l2.getZIndex() - l1.getZIndex())[0];
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
            const osdSettings = getOsdSettings();
            if (osdSettings && !osdSettings.osdOverlayVisible) {
              html = "";
              if (!this.renderedHTML_ || html !== this.renderedHTML_) {
                this.element.innerHTML = html;
                this.renderedHTML_ = html;
              }
              return;
            }
            const fields = osdSettings?.osdOverlayFields ?? {};
            const fieldOrder = osdSettings?.osdOverlayFieldOrder ?? [];
            const osdLines = {};
            const fieldEnabled = (field) => fields[field] !== false;
            const appendLine = (field, text) => {
              if (fieldEnabled(field)) {
                osdLines[field] = text;
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
            html = `<div style="${overlayStyle(osdSettings?.osdOverlayPosition)}">`;
            appendLine(
              "global",
              "Global projection coordinate: " + coordinate.map(Math.floor)
            );

            // html +=
            //   "Center coordinate: " + map.getView().getCenter().map(Math.floor);
            // html = html + "<";
            // html = html + "br/>";

            if (fixed_coordinates) {
              appendLine("resolution", "Bin resolution: 1:" + bpResolution);
              if (
                Number.isFinite(hoveredBpResolution) &&
                hoveredBpResolution !== bpResolution
              ) {
                appendLine(
                  "resolution",
                  "Hovered tile resolution: 1:" + hoveredBpResolution
                );
              }
              if (guidanceDescriptor.sourceName) {
                appendLine(
                  "source",
                  "Guidance source: " + guidanceDescriptor.sourceName
                );
              }
              if (this.layersManager?.getVisibleSourceResolutionDescriptors) {
                const visible =
                  this.layersManager.getVisibleSourceResolutionDescriptors();
                const details = [
                  visible.primary
                    ? `Primary 1:${visible.primary.bpResolution}`
                    : null,
                  visible.secondary
                    ? `Secondary 1:${visible.secondary.bpResolution}`
                    : null,
                ].filter(Boolean);
                if (details.length > 0) {
                  appendLine(
                    "visibleResolutions",
                    "Visible source resolutions: " + details.join("; ")
                  );
                }
              }
              appendLine(
                "pixels",
                "Position: px1=" +
                int_coordinates_px[0] +
                " px2=" +
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
                "Position: bin1=" +
                int_coordinates_bins[0] +
                " bin2=" +
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
              appendLine("basePairs", "Position: bp1=" + bp1 + " bp2=" + bp2);
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
                  "In-contig bp: ctg1=+" +
                  locus1.inContigBp +
                  " ctg2=+" +
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
                  " scf2=" +
                  (scaffold2 ? scaffold2.scaffoldName : "unscaffolded")
                );
                appendLine(
                  "inScaffold",
                  "In-scaffold bp: scf1=" +
                  (scaffold1 ? "+" + scaffold1.inScaffoldBp : "n/a") +
                  " scf2=" +
                  (scaffold2 ? "+" + scaffold2.inScaffoldBp : "n/a")
                );
              }
            }

            const orderedFields = [
              ...fieldOrder,
              ...Object.keys(osdLines).filter((field) => !fieldOrder.includes(field)),
            ];
            const orderedLines = orderedFields
              .map((field) => osdLines[field])
              .filter(Boolean);
            html += orderedLines.join("<br/>");
            html += "</div>";
          } catch (error) {
            console.warn("Unable to update map mouse position overlay", error);
            html = this.placeholder_;
          }
        }
      }
    }
    if (!this.renderedHTML_ || html !== this.renderedHTML_) {
      this.element.innerHTML = html;
      this.renderedHTML_ = html;
    }
  }
}
