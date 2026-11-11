# HiCT WebUI

The Vue interface for HiCT, a Hi-C scaffolding and visualization workstation.
It provides matrix navigation, assembly editing, sequence and annotation tracks,
comparison layers, background analyses and PNG, SVG and PDF export.

## Run a packaged application

Download the package for your platform from the JVM repository's releases.
It includes the server, this WebUI, Java and native analysis tools. Choose a
writable data folder in the Launcher, press Start and open the browser interface.
The default interface is `http://localhost:8080` with its API on port 5000.
[Installation and system requirements](https://github.com/ctlab/HiCT_JVM#readme).

For a first map, open **Help → Examples…** and choose **Open example** on the
Borrelia Hi-C card for a 2.31 MB download or the yeast Micro-C card for 50 bp
detail and a 170.76 MB download. HiCT converts the matrix and links its matching
FASTA. The 45 MB tardigrade quick start also remains available. The larger catalog
examples retain their conversion wizard.

Use **Open map…** for native `.hict.hdf5` files and **Open with options…** for
conversion. Select with a click or Shift-drag. The toolbar edits the assembly.
The Journal provides Undo and Redo. File saves and restores sessions. Assembly
exports AGP and FASTA. Export above the map produces PNG, SVG and PDF.
[User guide and shortcuts](https://github.com/ctlab/HiCT_JVM/blob/jvm-sfx-native/docs/user-guide.md).

## Develop

Use Node.js and npm. Keep `HiCT_JVM` beside this checkout for the integrated
packaged build. A WebUI-only build also works independently in this Git checkout.

```sh
npm ci
npm run build:web
npm run dev
```

The build runs TypeScript and map, API, ruler, track, pipeline and export
regressions. It embeds this repository's package version and Git revision for
About. Run ESLint without automatic edits when reviewing changes.

```sh
npx eslint . --ext .vue,.js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts --ignore-path .gitignore
```

The development UI connects to `http://localhost:5000`. Start the JVM server
with disposable data for integration testing. The backend serves its offline
API reference at `http://localhost:5000/api/v1/`. Remote use requires forwarding
both service ports or configuring the API address. Restrict the server's bind
host and network access as described in the JVM README.

Electron and Tauri payload build scripts are listed in `package.json`. The JVM
portable pipeline incorporates the selected browser payload. Desktop save-dialog
and installation behavior require platform validation in addition to web tests.

## Citation and licenses

Cite the software version and source revision using `CITATION.cff`, together
with the datasets and analysis tools used. HiCT uses the MIT License. Bundled
third-party components retain their upstream licenses. The JVM distribution
aggregates notices in `THIRD_PARTY_LICENSES.md` and preserves runtime and
native-tool license directories.
