/*
 * MIT License
 *
 * Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov, Pavel Avdeyev, Nikolay Cherkasov and Computer Technologies Laboratory ITMO University team.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type AttributionLink = {
  label: string;
  href: string;
};

export type AttributionEntry = {
  name: string;
  authors: string;
  license: string;
  note?: string;
  links?: AttributionLink[];
};

export const projectAttribution: AttributionEntry = {
  name: "HiCT",
  authors:
    "Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov, Pavel Avdeyev, Nikolay Cherkasov and Computer Technologies Laboratory ITMO University team.",
  license: "MIT License",
  note: "Hi-C scaffolding, visualization and conversion workstation.",
  links: [
    { label: "HiCT JVM", href: "https://github.com/ctlab/HiCT_JVM" },
    { label: "HiCT WebUI", href: "https://github.com/ctlab/HiCT_WebUI" },
  ],
};

export const runtimeAttributions: AttributionEntry[] = [
  {
    name: "Eclipse Vert.x",
    authors: "Eclipse Foundation and Vert.x contributors.",
    license: "Apache License 2.0",
    note: "HTTP API, routing, concurrency and WebUI serving.",
    links: [{ label: "vertx.io", href: "https://vertx.io/" }],
  },
  {
    name: "HDF5 and JHDF5",
    authors: "The HDF Group, ETH Zurich/CISD and contributors.",
    license: "See bundled upstream notices and dependency metadata.",
    note: "HiCT matrix storage and native HDF5 access.",
    links: [
      { label: "HDF5", href: "https://www.hdfgroup.org/solutions/hdf5/" },
      { label: "JHDF5", href: "https://unlimited.ethz.ch/spaces/JHDF/overview" },
    ],
  },
  {
    name: "hictk",
    authors: "Roberto Rossini, Jonas Paulsen and hictk contributors.",
    license: "MIT License",
    note: "Optional .hic conversion path. Cite Rossini R, Paulsen J. Bioinformatics 2024;40(7):btae408 when this path is used.",
    links: [{ label: "hictk", href: "https://github.com/paulsengroup/hictk" }],
  },
  {
    name: "minimap2",
    authors: "Heng Li and minimap2 contributors.",
    license: "MIT License",
    note: "Optional FASTA self-alignment engine for dotplot generation.",
    links: [{ label: "minimap2", href: "https://github.com/lh3/minimap2" }],
  },
  {
    name: "mm2-plus",
    authors: "Ghanshyam Chandra, Md Vasimuddin, Sanchit Misra, Chirag Jain and contributors.",
    license: "See bundled upstream license file.",
    note: "Optional accelerated minimap2-compatible self-alignment engine for dotplot generation. Cite the 2024 bioRxiv preprint when this path is used.",
    links: [{ label: "mm2-plus", href: "https://github.com/at-cg/mm2-plus" }],
  },
  {
    name: "HTSJDK and IGV BigWig",
    authors: "Broad Institute, IGV team and contributors.",
    license: "See upstream license metadata.",
    note: "FASTA/sequence and genomic track support.",
    links: [
      { label: "HTSJDK", href: "https://github.com/samtools/htsjdk" },
      { label: "IGV", href: "https://github.com/igvteam/igv" },
    ],
  },
  {
    name: "Apache Commons",
    authors: "Apache Software Foundation and contributors.",
    license: "Apache License 2.0",
    note: "General-purpose JVM utilities.",
    links: [{ label: "Apache Commons", href: "https://commons.apache.org/" }],
  },
  {
    name: "SLF4J, Logback and picocli",
    authors: "QOS.ch, Remko Popma and contributors.",
    license: "See upstream license metadata.",
    note: "Logging and command-line interface.",
    links: [
      { label: "SLF4J", href: "https://www.slf4j.org/" },
      { label: "Logback", href: "https://logback.qos.ch/" },
      { label: "picocli", href: "https://picocli.info/" },
    ],
  },
  {
    name: "Tauri and Electron",
    authors: "Tauri Programme, OpenJS Foundation and contributors.",
    license: "See upstream license metadata.",
    note: "Optional bundled WebUI browser runtimes for portable packages.",
    links: [
      { label: "Tauri", href: "https://tauri.app/" },
      { label: "Electron", href: "https://www.electronjs.org/" },
    ],
  },
  {
    name: "Eclipse Temurin / OpenJDK",
    authors: "Eclipse Adoptium, OpenJDK and contributors.",
    license: "GPLv2 with Classpath Exception and bundled legal notices.",
    note: "Optional Java runtime used by portable HiCT packages.",
    links: [{ label: "Eclipse Temurin", href: "https://adoptium.net/temurin/" }],
  },
];

export const webAttributions: AttributionEntry[] = [
  {
    name: "Vue, Pinia, Vite and TypeScript",
    authors: "Vue, Vite, TypeScript and open-source contributors.",
    license: "See package metadata.",
    note: "WebUI application framework and build tooling.",
    links: [
      { label: "Vue", href: "https://vuejs.org/" },
      { label: "Pinia", href: "https://pinia.vuejs.org/" },
      { label: "Vite", href: "https://vite.dev/" },
      { label: "TypeScript", href: "https://www.typescriptlang.org/" },
    ],
  },
  {
    name: "Bootstrap, Bootstrap Icons, PrimeVue and PrimeIcons",
    authors: "Bootstrap, PrimeTek and contributors.",
    license: "See package metadata.",
    note: "Interface components, layout and icons.",
    links: [
      { label: "Bootstrap", href: "https://getbootstrap.com/" },
      { label: "Bootstrap Icons", href: "https://icons.getbootstrap.com/" },
      { label: "PrimeVue", href: "https://primevue.org/" },
      { label: "PrimeIcons", href: "https://primevue.org/icons/" },
    ],
  },
  {
    name: "OpenLayers and igv.js",
    authors: "OpenLayers, IGV.js and contributors.",
    license: "See package metadata.",
    note: "Interactive map canvas and genomic track visualization.",
    links: [
      { label: "OpenLayers", href: "https://openlayers.org/" },
      { label: "igv.js", href: "https://github.com/igvteam/igv.js" },
    ],
  },
  {
    name: "jsPDF, LiteGraph and color-picker libraries",
    authors: "Their respective authors and contributors.",
    license: "See package metadata.",
    note: "Export, rendering-pipeline editing and color controls.",
    links: [
      { label: "jsPDF", href: "https://github.com/parallax/jsPDF" },
      { label: "LiteGraph", href: "https://github.com/jagenjo/litegraph.js" },
      { label: "@thednp/color-picker", href: "https://github.com/thednp/color-picker" },
      { label: "toolcool-color-picker", href: "https://github.com/mzusin/toolcool-color-picker" },
      { label: "vanilla-picker", href: "https://github.com/Sphinxxxx/vanilla-picker" },
      { label: "vue-color-kit", href: "https://github.com/anish2690/vue-color-kit" },
      { label: "ColorTranslator", href: "https://github.com/elchininet/ColorTranslator" },
    ],
  },
];

export const redistributionNotes = [
  "Portable packages keep HiCT, WebUI, Java runtime and optional hictk notices with the release artifact.",
  "When hictk, minimap2 or mm2-plus are bundled, their license and citation files are available under toolchains/<platform>/share.",
  "The Java runtime legal notices are kept under runtime/legal in portable packages.",
  "For exhaustive third-party details, inspect npm package metadata, Gradle dependency metadata and the bundled license folders.",
];

export const licenseText = `MIT License

Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov, Pavel Avdeyev, Nikolay Cherkasov and Computer Technologies Laboratory ITMO University team.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
