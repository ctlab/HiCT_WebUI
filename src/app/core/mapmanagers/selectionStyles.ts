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

/**
 * Styles for the selection box, its handles and the selected contig.
 *
 * The matrix can be white, saturated or dark, and any colormap can be on top of it, so no single
 * hue is guaranteed to stand out. A selection is therefore drawn as two outlines: a dark one
 * underneath and a light dashed one on top, which is visible against light and dark pixels alike.
 * The dash pattern is a cue that does not depend on color, and a translucent warm fill marks the
 * selected area without hiding the signal. Selections are screen-only and are never exported.
 */
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";

export const SELECTION_DARK = "rgba(15, 23, 42, 0.95)";
export const SELECTION_LIGHT = "rgba(255, 255, 255, 0.98)";
export const SELECTION_FILL = "rgba(255, 176, 0, 0.28)";
export const SELECTION_DASH = [9, 6];

/** Outline widths in CSS pixels: the dark stroke is wider so a light rim of dark shows on both sides. */
const DARK_WIDTH = 5;
const LIGHT_WIDTH = 2;

export function selectionAreaStyle(): Style[] {
  return [
    new Style({
      fill: new Fill({ color: SELECTION_FILL }),
      stroke: new Stroke({ color: SELECTION_DARK, width: DARK_WIDTH }),
    }),
    new Style({
      stroke: new Stroke({
        color: SELECTION_LIGHT,
        width: LIGHT_WIDTH,
        lineDash: SELECTION_DASH,
      }),
    }),
  ];
}

/** The corner and edge handle of the drag-selection box. */
export function selectionPointerStyle(): Style[] {
  return [
    new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: SELECTION_DARK }),
      }),
    }),
    new Style({
      image: new CircleStyle({
        radius: 4.5,
        fill: new Fill({ color: "rgba(255, 176, 0, 1)" }),
        stroke: new Stroke({ color: SELECTION_LIGHT, width: 1.5 }),
      }),
    }),
  ];
}
