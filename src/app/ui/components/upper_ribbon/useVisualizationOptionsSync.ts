import { onMounted, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";

/**
 * Background jobs that used to live in the normalization dropdown:
 * reload visualization options when the source/map changes and keep the
 * auto upper threshold in sync with the viewport. Must be mounted by a
 * component that lives as long as the map (not by a sidebar panel).
 */
export function useVisualizationOptionsSync(
  getManager: () => ContactMapManager | undefined
): void {
  const visualizationOptionsStore = useVisualizationOptionsStore();
  const { autoThresholdEnabled, autoThresholdQuantile } = storeToRefs(
    visualizationOptionsStore
  );
  const matrixViewStore = useMatrixViewStore();
  const { presentationMode, activeVisualizationSource } =
    storeToRefs(matrixViewStore);

  let autoThresholdMoveEndKey: EventsKey | undefined;
  let autoThresholdTimer: number | undefined;

  const hasTwoSources = (): boolean => presentationMode.value !== "single";

  function activeSourceForOptions(): "PRIMARY" | "SECONDARY" | undefined {
    return hasTwoSources() ? activeVisualizationSource.value : undefined;
  }

  async function refreshOptionsForActiveSource(): Promise<void> {
    const manager = getManager();
    if (!manager) {
      return;
    }
    await manager.visualizationManager
      .loadVisualizationOptionsForSource(activeSourceForOptions())
      .catch(() => undefined);
  }

  function clearAutoThresholdTimer(): void {
    if (autoThresholdTimer !== undefined) {
      window.clearTimeout(autoThresholdTimer);
      autoThresholdTimer = undefined;
    }
  }

  function scheduleAutoThresholdRefresh(): void {
    clearAutoThresholdTimer();
    if (!autoThresholdEnabled.value || !getManager()) {
      return;
    }
    autoThresholdTimer = window.setTimeout(() => {
      getManager()
        ?.visualizationManager.refreshAutoThresholdAndReload(
          hasTwoSources() ? activeVisualizationSource.value : undefined
        )
        .catch(() => undefined);
    }, 180);
  }

  function detachAutoThresholdMoveListener(): void {
    if (autoThresholdMoveEndKey) {
      unByKey(autoThresholdMoveEndKey);
      autoThresholdMoveEndKey = undefined;
    }
  }

  watch(
    getManager,
    (manager) => {
      detachAutoThresholdMoveListener();
      clearAutoThresholdTimer();
      if (!manager) {
        return;
      }
      autoThresholdMoveEndKey = manager.getMap().on("moveend", () => {
        scheduleAutoThresholdRefresh();
      });
    },
    { immediate: true }
  );

  watch(
    () => autoThresholdEnabled.value,
    (enabled) => {
      if (enabled) {
        scheduleAutoThresholdRefresh();
      }
    }
  );

  watch(
    () => autoThresholdQuantile.value,
    () => {
      if (autoThresholdEnabled.value) {
        scheduleAutoThresholdRefresh();
      }
    }
  );

  watch(
    () => activeVisualizationSource.value,
    () => {
      void refreshOptionsForActiveSource();
      if (autoThresholdEnabled.value) {
        scheduleAutoThresholdRefresh();
      }
    }
  );

  watch(
    () => [getManager(), presentationMode.value] as const,
    () => {
      void refreshOptionsForActiveSource();
    },
    { immediate: true }
  );

  onMounted(() => {
    void refreshOptionsForActiveSource();
  });

  onUnmounted(() => {
    detachAutoThresholdMoveListener();
    clearAutoThresholdTimer();
  });
}
