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

import { Extent, DragBox } from "ol/interaction";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import type { Options } from "ol/interaction/Extent";
import { platformModifierKeyOnly } from "ol/events/condition";
import { boundingExtent } from "ol/extent";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";

function diagonal(point: number[]) {
  const value = (point[0] - point[1]) / 2;
  return [value, -value];
}

export class ContactMapSelectionInteraction extends Extent {
  private anchor?: number[];
  constructor(options: Options, private readonly enabled: () => boolean) {
    super(options);
  }

  cancelGesture() {
    this.anchor = undefined;
  }

  handleEvent(event: MapBrowserEvent<PointerEvent>): boolean {
    if (!this.enabled()) {
      this.cancelGesture();
      return true;
    }
    const square = useUiSettingsStore().squareSelection;
    const point = square ? diagonal(event.coordinate) : event.coordinate;
    if (event.type === "pointerdown") {
      if (
        event.originalEvent.button !== 0 ||
        event.originalEvent.shiftKey ||
        event.originalEvent.altKey
      )
        return true;
      const extent = this.getExtent();
      let opposite: number[] | undefined;
      if (extent) {
        const [x0, y0, x1, y1] = extent;
        const corners = [
          [x0, y1],
          [x1, y0],
          ...(!square
            ? [
                [x0, y0],
                [x1, y1],
              ]
            : []),
        ];
        for (const corner of corners) {
          const pixel = event.map.getPixelFromCoordinate(corner);
          if (
            Math.hypot(pixel[0] - event.pixel[0], pixel[1] - event.pixel[1]) <=
            9
          ) {
            opposite = [corner[0] === x0 ? x1 : x0, corner[1] === y0 ? y1 : y0];
            break;
          }
        }
      }
      if (!opposite && !platformModifierKeyOnly(event)) return true;
      this.anchor = opposite ? (square ? diagonal(opposite) : opposite) : point;
      return false;
    }
    if (!this.anchor) return true;
    if (event.type === "pointerdrag" || event.type === "pointerup") {
      this.setExtent(boundingExtent([this.anchor, point]));
      if (event.type === "pointerup") this.cancelGesture();
      return false;
    }
    return true;
  }
}

/** Pass projected pixels to the stock drag box while retaining the original event for other tools. */
export class EntityDragBox extends DragBox {
  handleEvent(event: MapBrowserEvent<PointerEvent>): boolean {
    if (!useUiSettingsStore().squareSelection || !event.originalEvent)
      return super.handleEvent(event);
    const projected = Object.create(event) as MapBrowserEvent<PointerEvent>;
    projected.coordinate = diagonal(event.coordinate);
    projected.pixel = event.map.getPixelFromCoordinate(projected.coordinate);
    return super.handleEvent(projected);
  }
}
