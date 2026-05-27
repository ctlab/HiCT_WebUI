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
  const resolutions = resolutionsRaw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  const imageSizes = imageSizesRaw
    .slice(0, resolutions.length)
    .map((value) => Number(value));
  const pixelResolutionSet = resolutions.map((resolution) => resolution / baseBp);
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
        i === 0 ? Number.NEGATIVE_INFINITY : resolutionTuples[i].pixelResolution,
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
  secondarySet?: SourceResolutionDescriptorSet
): LayerResolutionDescriptor[] {
  const descriptors = [
    ...primarySet.resolutionTuples,
    ...(secondarySet?.resolutionTuples ?? []),
  ];
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
