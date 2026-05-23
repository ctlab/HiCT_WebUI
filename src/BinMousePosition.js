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
  transform,
} from "ol/proj";
import TileLayer from "ol/layer/Tile";

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
                .sort((l1, l2) => l1.getZIndex() - l2.getZIndex())[0];
        if (hovered_layer) {
          const layer_projection = hovered_layer.getSource().getProjection();
          const pixelResolution = hovered_layer.get("pixelResolution");
          const fixed_coordinates = transform(
            coordinate,
            map.getView().getProjection(),
            layer_projection
          ).map((c) => Math.ceil(c / pixelResolution));
          const bpResolutionString = hovered_layer.get("bpResolution");
          const bpResolution = Number(bpResolutionString);
          const int_coordinates_px =
            this.dimension_holder.clampPxCoordinatesAtResolution(
              [
                Math.floor(fixed_coordinates[0]),
                -Math.floor(fixed_coordinates[1]),
              ],
              bpResolution
            );

          html =
            '<div style="display: block; padding: 20px; background: rgba(0, 0, 0, 0.35); border: 1px solid black; border-radius: 15px; color: white; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">';
          html += "Global projection coordinate: " + coordinate.map(Math.floor);
          html = html + "<";
          html = html + "br/>";

          // html +=
          //   "Center coordinate: " + map.getView().getCenter().map(Math.floor);
          // html = html + "<";
          // html = html + "br/>";

          if (fixed_coordinates) {
            html = html + "Bin resolution: 1:" + bpResolution;
            html = html + "<";
            html = html + "br/>";
            html =
              html +
              "Position: px1=" +
              int_coordinates_px[0] +
              " px2=" +
              int_coordinates_px[1];
          }

          if (this.dimension_holder) {
            const int_coordinates_bins = this.dimension_holder.pixelsToBins(
              int_coordinates_px,
              bpResolution
            );
            html = html + "<";
            html = html + "br/>";
            html =
              html +
              "Position: bin1=" +
              int_coordinates_bins[0] +
              " bin2=" +
              int_coordinates_bins[1];
            html = html + "<";
            html = html + "br/>";
            const bp1 = this.dimension_holder.getStartBpOfPx(
              int_coordinates_px[0],
              bpResolution
            );
            const bp2 = this.dimension_holder.getStartBpOfPx(
              int_coordinates_px[1],
              bpResolution
            );
            const ctg1 = this.dimension_holder.getContigNameByPx(
              int_coordinates_px[0],
              bpResolution
            );
            const ctg2 = this.dimension_holder.getContigNameByPx(
              int_coordinates_px[1],
              bpResolution
            );
            html = html + "Position: bp1=" + bp1 + " bp2=" + bp2;
            html = html + "<";
            html = html + "br/>";
            html = html + "Contigs: ctg1=" + ctg1 + " ctg2=" + ctg2;
            if (this.dimension_holder.getContigLocusByPx) {
              const locus1 = this.dimension_holder.getContigLocusByPx(
                int_coordinates_px[0],
                bpResolution
              );
              const locus2 = this.dimension_holder.getContigLocusByPx(
                int_coordinates_px[1],
                bpResolution
              );
              html = html + "<";
              html = html + "br/>";
              html =
                html +
                "In-contig bp: ctg1=+" +
                locus1.inContigBp +
                " ctg2=+" +
                locus2.inContigBp;
            }
            if (this.scaffold_holder?.getScaffoldLocusByBp) {
              const scaffold1 = this.scaffold_holder.getScaffoldLocusByBp(bp1);
              const scaffold2 = this.scaffold_holder.getScaffoldLocusByBp(bp2);
              html = html + "<";
              html = html + "br/>";
              html =
                html +
                "Scaffolds: scf1=" +
                (scaffold1 ? scaffold1.scaffoldName : "unscaffolded") +
                " scf2=" +
                (scaffold2 ? scaffold2.scaffoldName : "unscaffolded");
              html = html + "<";
              html = html + "br/>";
              html =
                html +
                "In-scaffold bp: scf1=" +
                (scaffold1 ? "+" + scaffold1.inScaffoldBp : "n/a") +
                " scf2=" +
                (scaffold2 ? "+" + scaffold2.inScaffoldBp : "n/a");
            }
          }

          html += "</div>";
        }
      }
    }
    if (!this.renderedHTML_ || html !== this.renderedHTML_) {
      this.element.innerHTML = html;
      this.renderedHTML_ = html;
    }
  }
}
