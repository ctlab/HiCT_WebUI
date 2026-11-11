export type MatrixSourceName = "PRIMARY" | "SECONDARY";

export interface LayerResolutionBorders {
  minResolutionInclusive: number;
  maxResolutionExclusive: number;
}

export interface LayerResolutionDescriptor {
  sourceName: MatrixSourceName;
  bpResolution: number;
  pixelResolution: number;
  layerResolutionBorders: LayerResolutionBorders;
  imageSizeIndex: number;
}

export interface SourceResolutionDescriptorSet {
  sourceName: MatrixSourceName;
  resolutions: number[];
  pixelResolutionSet: number[];
  imageSizes: number[];
  resolutionToPixelResolution: Map<number, number>;
  layerResolutionBorders: Map<number, LayerResolutionBorders>;
  resolutionTuples: LayerResolutionDescriptor[];
}

export interface NavigationResolutionModel {
  resolutions: number[];
  pixelResolutionSet: number[];
}

export function buildSourceResolutionDescriptorSet(
  sourceName: MatrixSourceName,
  resolutionsRaw: readonly number[],
  imageSizesRaw: readonly number[],
  coordinateBaseBp: number
): SourceResolutionDescriptorSet {
  const baseBp =
    Number.isFinite(coordinateBaseBp) && coordinateBaseBp > 0
      ? coordinateBaseBp
      : 1;
  const levels = new Map<number, number>();
  for (let i = 0; i < resolutionsRaw.length; i += 1) {
    const bp = resolutionsRaw[i];
    const size = imageSizesRaw[i];
    if (
      Number.isSafeInteger(bp) &&
      bp > 0 &&
      Number.isSafeInteger(size) &&
      size >= 0 &&
      !levels.has(bp)
    ) {
      levels.set(bp, size);
    }
  }
  const resolutions = [...levels.keys()];
  const imageSizes = [...levels.values()];
  const pixelResolutionSet = resolutions.map(
    (resolution) => resolution / baseBp
  );
  const resolutionToPixelResolution = new Map<number, number>();
  const layerResolutionBorders = new Map<number, LayerResolutionBorders>();
  const resolutionTuples: LayerResolutionDescriptor[] = [];

  for (let i = 0; i < resolutions.length; ++i) {
    const bpResolution = resolutions[i];
    const pixelResolution = pixelResolutionSet[i];
    resolutionToPixelResolution.set(bpResolution, pixelResolution);
    resolutionTuples.push({
      sourceName,
      bpResolution,
      pixelResolution,
      layerResolutionBorders: {
        minResolutionInclusive: Number.NaN,
        maxResolutionExclusive: Number.NaN,
      },
      imageSizeIndex: i,
    });
  }

  resolutionTuples.sort((a, b) => a.pixelResolution - b.pixelResolution);
  for (let i = 0; i < resolutionTuples.length; ++i) {
    const borders: LayerResolutionBorders = {
      minResolutionInclusive:
        i === 0
          ? Number.NEGATIVE_INFINITY
          : resolutionTuples[i].pixelResolution,
      maxResolutionExclusive:
        i === resolutionTuples.length - 1
          ? Number.POSITIVE_INFINITY
          : resolutionTuples[i + 1].pixelResolution,
    };
    resolutionTuples[i].layerResolutionBorders = borders;
    layerResolutionBorders.set(resolutionTuples[i].bpResolution, borders);
  }
  resolutionTuples.sort(
    (a, b) =>
      a.layerResolutionBorders.minResolutionInclusive -
      b.layerResolutionBorders.minResolutionInclusive
  );

  return {
    sourceName,
    resolutions,
    pixelResolutionSet,
    imageSizes,
    resolutionToPixelResolution,
    layerResolutionBorders,
    resolutionTuples,
  };
}

export function calculateMaximumScaledImageSize(
  primarySet: SourceResolutionDescriptorSet,
  secondarySet?: SourceResolutionDescriptorSet
): number {
  const candidates = [primarySet, secondarySet]
    .filter((set): set is SourceResolutionDescriptorSet => Boolean(set))
    .flatMap((set) =>
      set.imageSizes.map(
        (imageSize, index) => imageSize * (set.pixelResolutionSet[index] ?? 1)
      )
    );
  return Math.max(1, ...candidates);
}

export function getNavigationResolutionModel(
  primarySet: SourceResolutionDescriptorSet,
  secondarySet?: SourceResolutionDescriptorSet
): NavigationResolutionModel {
  const descriptors = [
    ...primarySet.resolutionTuples,
    ...(secondarySet?.resolutionTuples ?? []),
  ].sort((a, b) => a.pixelResolution - b.pixelResolution);
  const byPixelResolution = new Map<number, LayerResolutionDescriptor>();
  for (const descriptor of descriptors) {
    if (!byPixelResolution.has(descriptor.pixelResolution)) {
      byPixelResolution.set(descriptor.pixelResolution, descriptor);
    }
  }
  const uniqueDescriptors = [...byPixelResolution.values()].sort(
    (a, b) => a.pixelResolution - b.pixelResolution
  );
  return {
    resolutions: uniqueDescriptors.map((descriptor) => descriptor.bpResolution),
    pixelResolutionSet: uniqueDescriptors.map(
      (descriptor) => descriptor.pixelResolution
    ),
  };
}

export function getVectorResolutionTuples(
  primarySet: SourceResolutionDescriptorSet,
  // Vector overlays describe the current assembly state, not a matrix source.
  // Keep them on the primary assembly resolution pyramid; OpenLayers scales
  // their coordinates correctly while secondary data layers use their own
  // independent, possibly finer, tile pyramid.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  secondarySet?: SourceResolutionDescriptorSet
): LayerResolutionDescriptor[] {
  const descriptors = [...primarySet.resolutionTuples];
  const byBpResolution = new Map<number, LayerResolutionDescriptor>();
  for (const descriptor of descriptors) {
    const existing = byBpResolution.get(descriptor.bpResolution);
    if (!existing || descriptor.pixelResolution < existing.pixelResolution) {
      byBpResolution.set(descriptor.bpResolution, descriptor);
    }
  }
  return [...byBpResolution.values()].sort(
    (a, b) => a.pixelResolution - b.pixelResolution
  );
}

export function getFinestVisibleResolutionDescriptor(
  primarySet: SourceResolutionDescriptorSet,
  secondarySet: SourceResolutionDescriptorSet | undefined,
  viewResolution: number
): LayerResolutionDescriptor {
  const primaryDescriptor = getResolutionDescriptorForViewResolution(
    primarySet,
    viewResolution
  );
  if (!secondarySet) {
    return primaryDescriptor;
  }
  const secondaryDescriptor = getResolutionDescriptorForViewResolution(
    secondarySet,
    viewResolution
  );
  return secondaryDescriptor.pixelResolution < primaryDescriptor.pixelResolution
    ? secondaryDescriptor
    : primaryDescriptor;
}

export function getResolutionDescriptorForViewResolution(
  set: SourceResolutionDescriptorSet,
  viewResolution: number
): LayerResolutionDescriptor {
  const tuples = set.resolutionTuples;
  if (tuples.length === 0) {
    throw new Error("No resolutions available");
  }
  let descriptor = tuples[0];
  for (const tuple of tuples) {
    if (tuple.layerResolutionBorders.minResolutionInclusive <= viewResolution) {
      descriptor = tuple;
    } else {
      break;
    }
  }
  return descriptor;
}

// A 4% band around the crossover prevents repeated switching during wheel
// animation. At a fresh geometric-midpoint tie, select the finer level.
const RESOLUTION_HYSTERESIS = 1.04;

export function selectNearestResolution(
  sorted: readonly LayerResolutionDescriptor[],
  target: number,
  currentBp?: number
): LayerResolutionDescriptor {
  if (sorted.length === 0) throw new Error("No resolutions available");
  const currentIndex = sorted.findIndex(
    (level) => level.bpResolution === currentBp
  );
  if (currentIndex >= 0) {
    const current = sorted[currentIndex].pixelResolution;
    const lower = sorted[currentIndex - 1]?.pixelResolution ?? 0;
    const upper = sorted[currentIndex + 1]?.pixelResolution ?? Infinity;
    if (
      target >= Math.sqrt(lower * current) / RESOLUTION_HYSTERESIS &&
      target <= Math.sqrt(upper * current) * RESOLUTION_HYSTERESIS
    ) {
      return sorted[currentIndex];
    }
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const crossover = Math.sqrt(
      sorted[i].pixelResolution * sorted[i + 1].pixelResolution
    );
    if (target <= crossover || Number.isNaN(target)) return sorted[i];
  }
  return sorted[sorted.length - 1];
}
