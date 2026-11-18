import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { crc32 } from "node:zlib";
import ts from "typescript";

function load(name) {
  const exports = {};
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
    { exports, Blob, TextEncoder, Uint8Array, Uint32Array, DataView }
  );
  return exports;
}
const { compactFigureProvenance } = load("FigureProvenance");
const snapshot = {
  primary: {
    filename: "contacts.hict.hdf5",
    agpSha256: "a".repeat(64),
    fileFingerprint: { algorithm: "SAMPLED_SHA256", sha256: "b".repeat(64) },
    capabilities: { units: "CONTACT_COUNT" },
    assemblyInfo: { huge: [1, 2, 3] },
  },
  secondary: {
    filename: "identity.hict.hdf5",
    agpSha256: "c".repeat(64),
    capabilities: { units: "IDENTITY_PERCENT", scoreScale: 10000 },
    exampleProvenance: { citation: "Original attribution" },
  },
  assemblySource: "PRIMARY",
  assemblyVerified: true,
  filesFingerprinted: true,
  tracksVerified: true,
  renderPipeline: {
    enabled: true,
    lowerExpression: { type: "source", source: "SECONDARY" },
  },
  visualizationOptions: { signalDisplayMode: "OBSERVED" },
  tracks: [{ filename: "features.bed" }],
};
const compact = compactFigureProvenance(snapshot);
assert.equal(compact.primary.assemblyInfo, undefined);
assert.equal(compact.primary.fileFingerprint.algorithm, "SAMPLED_SHA256");
assert.equal(compact.secondary.capabilities.units, "IDENTITY_PERCENT");
assert.equal(compact.secondary.capabilities.scoreScale, 10000);
assert.equal(
  compact.secondary.exampleProvenance.citation,
  "Original attribution"
);
snapshot.renderPipeline.lowerExpression.source = "PRIMARY";
snapshot.secondary.capabilities.scoreScale = 1;
snapshot.tracks[0].filename = "replaced.bed";
assert.equal(compact.renderPipeline.lowerExpression.source, "SECONDARY");
assert.equal(compact.secondary.capabilities.scoreScale, 10000);
assert.equal(compact.tracks[0].filename, "features.bed");
assert.throws(
  () => compactFigureProvenance({ primary: null }),
  /primary source/
);
assert.throws(
  () => compactFigureProvenance({ primary: {} }),
  /assembly identity/
);

const { appendPngProvenance } = load("PngProvenance");
// Independent Pillow-generated RGBA fixture, with no browser or encoder implementation involved.
const original = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPQqvjfBAAElQIkvGMM1gAAAABJRU5ErkJggg==",
  "base64"
);
const metadata = JSON.stringify({ label: "Жёлтый", provenance: compact });
const png = Buffer.from(
  await (
    await appendPngProvenance(new Blob([original]), metadata)
  ).arrayBuffer()
);
const chunks = [];
for (let offset = 8; offset < png.length; ) {
  const length = png.readUInt32BE(offset),
    type = png.toString("ascii", offset + 4, offset + 8);
  assert.equal(
    png.readUInt32BE(offset + 8 + length),
    crc32(png.subarray(offset + 4, offset + 8 + length)),
    `${type} CRC`
  );
  chunks.push({
    type,
    bytes: png.subarray(offset, offset + length + 12),
    payload: png.subarray(offset + 8, offset + 8 + length),
  });
  offset += length + 12;
}
assert.equal(
  Buffer.compare(
    Buffer.concat([
      png.subarray(0, 8),
      ...chunks.filter((c) => c.type !== "iTXt").map((c) => c.bytes),
    ]),
    original
  ),
  0,
  "Image chunks remain byte-identical"
);
const text = chunks.find((c) => c.type === "iTXt").payload;
const keyword = text.indexOf(0);
assert.equal(text.subarray(0, keyword).toString(), "HiCT provenance");
assert.equal(
  text.subarray(keyword, keyword + 5).every((value) => value === 0),
  true
);
assert.equal(text.subarray(keyword + 5).toString("utf8"), metadata);
await assert.rejects(
  appendPngProvenance(new Blob(["not png"]), metadata),
  /invalid image/
);
await assert.rejects(
  appendPngProvenance(new Blob([original]), "x".repeat(2 * 1024 * 1024 + 1)),
  /metadata size/
);
await assert.rejects(
  appendPngProvenance(new Blob([original]), "bad\0text"),
  /metadata size/
);
console.log(
  "Figure provenance freezes units, source/assembly identity and settings; PNG UTF-8 metadata has independent CRC validation and byte-identical image chunks."
);
