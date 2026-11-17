# GLib 0.18 soundness backport

GTK3/WebKitGTK in Tauri 2 requires the GLib 0.18 API. Its last published patch is
0.18.5; replacing it with GLib 0.20 would create incompatible GTK object types.
The exact 0.18.5 source here carries only the two-line upstream fix for
`VariantStrIter::impl_get`: the C out-pointer is mutable and passed by `&mut`.

- Advisory: https://rustsec.org/advisories/RUSTSEC-2024-0429.html
- Alias: GHSA-wrw7-89jp-8q8g
- Upstream fix: https://github.com/gtk-rs/gtk-rs-core/commit/b5a4071e439bef2b5eea76c3aa25e5ae84839e34
- Original crate: https://static.crates.io/crates/glib/glib-0.18.5.crate
- Original SHA256: `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`

The original archive, all original/patched file hashes and upstream license/
copyright files are retained. `node scripts/check-native-dependency-patches.mjs`
compares every vendored file with that archive and permits only those two changed
lines. Normal frontend builds run this verifier; Cargo's patch selects this same
source. The Linux native test exercises forward, reverse, nth and last string
iteration in optimized builds. It crashes with the original dependency and
passes with the backport.

Version scanners may still flag `glib 0.18.5`; this is a source mitigation, not
an upstream release or an assertion that the advisory disappeared. Retire the
patch when the GTK/WebKit stack supports a compatible upstream fixed version.
Do not modify or upgrade this copy without updating the provenance, verifier,
license review and optimized regression evidence.
