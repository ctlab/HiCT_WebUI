export const hiddenContigResolutions = [200_000, 100_000, 10_000];

export function hiddenContigDescriptors() {
  return [1_000_000, 300_000, ...Array(40).fill(15_000), 250_000].map(
    (length, id) => ({
      contigId: id,
      contigName: `c${id}`,
      contigLengthBp: length,
      direction: 1,
      contigLengthBins: new Map(
        hiddenContigResolutions.map((r) => [r, Math.ceil(length / r)])
      ),
      presenceAtResolution: new Map(
        hiddenContigResolutions.map((r) => [r, length >= r ? 1 : 0])
      ),
    })
  );
}
