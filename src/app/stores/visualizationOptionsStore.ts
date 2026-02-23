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

import { defineStore } from "pinia";
import { ref, Ref } from "vue";
import SimpleLinearGradient from "../core/visualization/colormap/SimpleLinearGradient";
import VisualizationOptions from "../core/visualization/VisualizationOptions";
import Colormap from "../core/visualization/colormap/Colormap";
import { ColorTranslator } from "colortranslator";

export const useVisualizationOptionsStore = defineStore(
  "visualizationOptions",
  () => {
    const preLogBase = ref(-1);
    const applyCoolerWeights = ref(false);
    const resolutionScaling = ref(false);
    const resolutionLinearScaling = ref(false);
    const postLogBase = ref(10);
    const colormap: Ref<Colormap> = ref(
      new SimpleLinearGradient(
        new ColorTranslator("rgba(0,255,0,0.0)", { legacyCSS: true }),
        new ColorTranslator("rgba(0,96,0,1.0)", { legacyCSS: true }),
        0,
        1
      )
    );

    function asVisualizationOptions(): VisualizationOptions {
      return new VisualizationOptions(
        preLogBase.value,
        postLogBase.value,
        applyCoolerWeights.value,
        resolutionScaling.value,
        resolutionLinearScaling.value,
        colormap.value
      );
    }

    function setVisualizationOptions(options: VisualizationOptions) {
      preLogBase.value = options.preLogBase;
      postLogBase.value = options.postLogBase;
      applyCoolerWeights.value = options.applyCoolerWeights ?? false;
      resolutionScaling.value = options.resolutionScaling ?? false;
      resolutionLinearScaling.value = options.resolutionLinearScaling ?? false;
      colormap.value = options.colormap;
    }

    return {
      preLogBase,
      applyCoolerWeights,
      resolutionScaling,
      resolutionLinearScaling,
      postLogBase,
      colormap,
      asVisualizationOptions,
      setVisualizationOptions,
    };
  }
);
