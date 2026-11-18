import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src-tauri/vendor/", import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "glib-provenance.json"), "utf8")
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const archive = fs.readFileSync(path.join(root, "glib-0.18.5.crate"));
assert.equal(
  sha(archive),
  "233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5"
);
assert.equal(manifest.archiveSha256, sha(archive));
assert.deepEqual(manifest.changedFiles, ["src/variant_iter.rs"]);

// Read the pinned tar in memory without extracting or executing upstream files.
const tar = gunzipSync(archive, { maxOutputLength: 5 * 1024 * 1024 });
const originals = new Map();
for (let offset = 0; offset + 512 <= tar.length; ) {
  const header = tar.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) break;
  const text = (start, end) =>
    header.subarray(start, end).toString().split("\0")[0];
  const prefix = text(345, 500),
    name = (prefix ? prefix + "/" : "") + text(0, 100);
  const size = parseInt(text(124, 136).trim() || "0", 8);
  assert.ok(
    Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= tar.length
  );
  assert.ok(name.startsWith("glib-0.18.5/") && !name.split("/").includes(".."));
  if (header[156] === 0 || header[156] === 48) {
    const relative = name.slice("glib-0.18.5/".length);
    assert.ok(!originals.has(relative));
    originals.set(relative, tar.subarray(offset + 512, offset + 512 + size));
  } else
    assert.equal(
      header[156],
      53,
      "Only ordinary files/directories are expected"
    );
  offset += 512 + Math.ceil(size / 512) * 512;
}
assert.deepEqual(
  [...originals.keys()].sort(),
  Object.keys(manifest.originalFiles).sort()
);
const sourceRoot = path.join(root, "glib-0.18.5");
const files = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    assert.ok(
      entry.isDirectory() || entry.isFile(),
      "No linked/special vendored files"
    );
    return entry.isDirectory()
      ? files(filename)
      : [path.relative(sourceRoot, filename).split(path.sep).join("/")];
  });
assert.deepEqual(files(sourceRoot).sort(), [...originals.keys()].sort());
for (const [name, original] of originals) {
  assert.equal(sha(original), manifest.originalFiles[name], name);
  let expected = original;
  if (name === "src/variant_iter.rs") {
    const source = original.toString();
    const patched = source
      .replace(
        "let p: *mut libc::c_char = std::ptr::null_mut();",
        "let mut p: *mut libc::c_char = std::ptr::null_mut();"
      )
      .replace("                &p,\n", "                &mut p,\n");
    assert.notEqual(patched, source);
    expected = Buffer.from(patched);
  }
  const actual = fs.readFileSync(path.join(sourceRoot, name));
  assert.deepEqual(
    actual,
    expected,
    name + " must differ only by the upstream two-line fix"
  );
  assert.equal(sha(actual), manifest.patchedFiles[name], name);
}
const cargo = fs.readFileSync(
  new URL("../src-tauri/Cargo.toml", import.meta.url),
  "utf8"
);
assert.ok(
  cargo.includes("[patch.crates-io]") &&
    cargo.includes('glib = { path = "vendor/glib-0.18.5" }')
);
const lock = fs.readFileSync(
  new URL("../src-tauri/Cargo.lock", import.meta.url),
  "utf8"
).replaceAll("\r\n", "\n");
assert.match(
  lock,
  /\[\[package\]\]\nname = "glib"\nversion = "0\.18\.5"\ndependencies =/
);
console.log(
  `Pinned GLib archive and ${originals.size} source files verified; only upstream VariantStrIter fix applied`
);
