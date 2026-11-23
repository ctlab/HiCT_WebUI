import { appendPngProvenance, crc32 } from "./PngProvenance";

export interface FigurePrintOptions {
  widthMm: number;
  minimumTextPoints?: number;
}

/** Physical output size only: source pixels and scientific coordinates never change. */
export function figurePrintDimensions(
  width: number,
  height: number,
  options: FigurePrintOptions
) {
  if (
    !Number.isFinite(options.widthMm) ||
    options.widthMm < 10 ||
    options.widthMm > 2000 ||
    ![width, height].every((value) => Number.isFinite(value) && value > 0)
  )
    throw Error("Choose a supported figure print size.");
  return {
    widthMm: options.widthMm,
    heightMm: (options.widthMm * height) / width,
    rasterWidthPx: width,
    rasterHeightPx: height,
    effectiveRasterDpi: (width * 25.4) / options.widthMm,
    rasterPolicy: "PRESERVE_CAPTURE_PIXELS" as const,
  };
}

/** Replace physical-size/provenance chunks without decoding or resampling the image. */
export async function printSizedPng(
  png: Blob,
  widthPx: number,
  widthMm: number,
  metadata: string
): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer());
  const input = new DataView(bytes.buffer);
  if (
    bytes.length < 45 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
  )
    throw Error("The captured PNG could not be read.");
  const physical = new Uint8Array(21),
    view = new DataView(physical.buffer);
  view.setUint32(0, 9);
  physical.set([112, 72, 89, 115], 4); // pHYs
  const pixelsPerMetre = Math.round((widthPx * 1000) / widthMm);
  view.setUint32(8, pixelsPerMetre);
  view.setUint32(12, pixelsPerMetre);
  physical[16] = 1;
  view.setUint32(17, crc32(physical.subarray(4, 17)));
  const chunks: BlobPart[] = [bytes.subarray(0, 8)];
  for (let offset = 8; offset < bytes.length; ) {
    if (offset + 12 > bytes.length)
      throw Error("The captured PNG contains a truncated chunk.");
    const length = input.getUint32(offset),
      end = offset + length + 12;
    if (end > bytes.length)
      throw Error("The captured PNG contains a truncated chunk.");
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const hictMetadata =
      kind === "iTXt" &&
      new TextDecoder().decode(bytes.subarray(offset + 8, offset + 8 + 16)) ===
        "HiCT provenance\0";
    if (kind !== "pHYs" && !hictMetadata)
      chunks.push(bytes.subarray(offset, end));
    if (kind === "IHDR") chunks.push(physical);
    offset = end;
  }
  return appendPngProvenance(new Blob(chunks, { type: "image/png" }), metadata);
}
