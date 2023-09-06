import { defineStore } from "pinia";
import { ref, Ref } from "vue";
import SimpleLinearGradient from "../core/visualization/colormap/SimpleLinearGradient";
import VisualizationOptions from "../core/visualization/VisualizationOptions";
import Colormap from "../core/visualization/colormap/Colormap";

export const useVisualizationOptionsStore = defineStore(
  "visualizationOptions",
  () => {
    const preLogBase = ref(-1);
    const applyCoolerWeights = ref(false);
    const postLogBase = ref(10);
    const colormap: Ref<Colormap> = ref(
      new SimpleLinearGradient("rgba(0,255,0,0)", "rgba(0,96,0,1)", 0, 1)
    );

    function asVisualizationOptions(): VisualizationOptions {
      return new VisualizationOptions(
        preLogBase.value,
        postLogBase.value,
        applyCoolerWeights.value,
        colormap.value
      );
    }

    function setVisualizationOptions(options: VisualizationOptions) {
      preLogBase.value = options.preLogBase;
      postLogBase.value = options.postLogBase;
      applyCoolerWeights.value = options.applyCoolerWeights;
      colormap.value = options.colormap;
    }

    return {
      preLogBase,
      applyCoolerWeights,
      postLogBase,
      colormap,
      asVisualizationOptions,
      setVisualizationOptions,
    };
  }
);