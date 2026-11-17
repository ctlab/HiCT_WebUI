import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import zlib from "node:zlib";
import ts from "typescript";

const modules = {};
function load(name) {
  name = name.split("/").at(-1);
  if (modules[name]) return modules[name];
  const module = { exports: {} };
  modules[name] = module.exports;
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        new URL(`../src/app/core/export/${name}.ts`, import.meta.url),
        "utf8"
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    {
      module,
      exports: module.exports,
      require: load,
      Blob,
      Uint8Array,
      DataView,
      TextEncoder,
      TextDecoder,
      DOMParser: class {
        parseFromString() {
          return {
            querySelector: () => null,
            documentElement: {
              querySelector: () => ({
                textContent: '{"format":"hict-figure","version":1}',
              }),
            },
          };
        }
      },
    }
  );
  return module.exports;
}
const { figurePrintDimensions, printSizedPng } = load("FigurePrintSize");
const { appendPngProvenance } = load("PngProvenance");
for (const widthMm of [86, 178]) {
  const result = figurePrintDimensions(256, 128, { widthMm });
  assert.equal(result.heightMm, widthMm / 2);
  assert.equal(result.effectiveRasterDpi, (256 * 25.4) / widthMm);
  assert.equal(result.rasterPolicy, "PRESERVE_CAPTURE_PIXELS");
}
for (const width of [0, NaN, Infinity, -1])
  assert.throws(() => figurePrintDimensions(width, 128, { widthMm: 86 }));
assert.throws(() => figurePrintDimensions(256, 128, { widthMm: 100 }));

// Independent CRC and PNG fixture, including a pre-existing physical-size chunk.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, payload) {
  const body = Buffer.concat([Buffer.from(type), payload]),
    head = Buffer.alloc(4),
    tail = Buffer.alloc(4);
  head.writeUInt32BE(payload.length);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(256);
ihdr.writeUInt32BE(128, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const rows = Buffer.alloc(128 * (1 + 256 * 4), 0);
for (let y = 0; y < 128; y++) {
  for (let x = 0; x < 256; x++) {
    let i = y * (1 + 256 * 4) + 1 + x * 4;
    rows[i] = 255;
    rows[i + 3] = 255;
  }
}
const compressed = zlib.deflateSync(rows),
  physical = Buffer.alloc(9);
physical.writeUInt32BE(3780);
physical.writeUInt32BE(3780, 4);
physical[8] = 1;
const original = new Blob(
  [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("pHYs", physical),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ],
  { type: "image/png" }
);
const old = await appendPngProvenance(original, '{"original":true}');
for (const widthMm of [86, 178]) {
  const metadata = JSON.stringify({
    outputSize: figurePrintDimensions(256, 128, { widthMm }),
  });
  const output = Buffer.from(
    await (await printSizedPng(old, 256, widthMm, metadata)).arrayBuffer()
  );
  const chunks = [];
  let offset = 8;
  while (offset < output.length) {
    const length = output.readUInt32BE(offset),
      kind = output.toString("ascii", offset + 4, offset + 8),
      payload = output.subarray(offset + 8, offset + 8 + length);
    assert.equal(
      output.readUInt32BE(offset + 8 + length),
      crc32(output.subarray(offset + 4, offset + 8 + length))
    );
    chunks.push({ kind, payload });
    offset += length + 12;
  }
  assert.equal(offset, output.length);
  assert.equal(chunks.filter((x) => x.kind === "pHYs").length, 1);
  const phys = chunks.find((x) => x.kind === "pHYs").payload;
  assert.equal(phys.readUInt32BE(0), Math.round(256000 / widthMm));
  assert.equal(phys.readUInt32BE(4), phys.readUInt32BE(0));
  assert.equal(phys[8], 1);
  assert.equal(chunks[1].kind, "pHYs");
  assert.deepEqual(chunks.find((x) => x.kind === "IDAT").payload, compressed);
  assert.deepEqual(
    zlib.inflateSync(chunks.find((x) => x.kind === "IDAT").payload),
    rows
  );
  const text = chunks.filter((x) => x.kind === "iTXt");
  assert.equal(text.length, 1);
  assert.equal(text[0].payload.subarray(20).toString("utf8"), metadata);
}
await assert.rejects(
  printSizedPng(new Blob(["not PNG"]), 256, 86, "{}"),
  /PNG/
);
const { encodeFrozenFigure } = load("FrozenFigure");
await assert.rejects(
  encodeFrozenFigure({ svg: "", width: 20000, height: 10 }, "pdf"),
  /PDF page is too large/
);
await assert.rejects(
  encodeFrozenFigure({ svg: "", width: 1, height: 32768 }, "pdf", undefined, {
    widthMm: 178,
  }),
  /PDF page is too large/
);
console.log(
  "Figure print sizes preserve PNG image data and provenance and reject clipped PDF pages"
);
