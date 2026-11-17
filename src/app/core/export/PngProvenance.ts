const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value;
}
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** Add UTF-8 scientific provenance to our canvas PNG without touching any image data. */
export async function appendPngProvenance(
  png: Blob,
  metadata: string
): Promise<Blob> {
  const text = new TextEncoder().encode(metadata);
  if (text.length > 2 * 1024 * 1024 || metadata.includes("\0"))
    throw Error(
      "The figure provenance exceeds the supported PNG metadata size."
    );
  const header = new Uint8Array(await png.slice(0, 8).arrayBuffer());
  const tail = new Uint8Array(await png.slice(-12).arrayBuffer());
  if (
    ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => header[i] === v) ||
    tail.length !== 12 ||
    new DataView(tail.buffer).getUint32(0) !== 0 ||
    String.fromCharCode(...tail.slice(4, 8)) !== "IEND"
  )
    throw Error("PNG encoding returned an invalid image.");
  const keyword = new TextEncoder().encode("HiCT provenance");
  // Keyword separator, compression flag/method, empty language and translated keyword.
  const payload = new Uint8Array(keyword.length + 5 + text.length);
  payload.set(keyword);
  payload.set(text, keyword.length + 5);
  const chunk = new Uint8Array(payload.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length);
  chunk.set([105, 84, 88, 116], 4);
  chunk.set(payload, 8);
  view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
  return new Blob([png.slice(0, png.size - 12), chunk, png.slice(-12)], {
    type: "image/png",
  });
}
