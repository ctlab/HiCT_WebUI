/*
 * MIT License
 *
 * Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.
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

export type AttributionEntry = {
  name: string;
  authors: string;
  license: string;
  note?: string;
};

export const projectAttribution: AttributionEntry = {
  name: "HiCT",
  authors:
    "Computer Technologies Laboratory, ITMO University; Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and contributors.",
  license: "MIT License",
  note: "Hi-C scaffolding, visualization and conversion workstation.",
};

export const runtimeAttributions: AttributionEntry[] = [
  {
    name: "Eclipse Vert.x",
    authors: "Eclipse Foundation and Vert.x contributors.",
    license: "Apache License 2.0",
    note: "HTTP API, routing, concurrency and WebUI serving.",
  },
  {
    name: "HDF5 and JHDF5",
    authors: "The HDF Group, ETH Zurich/CISD and contributors.",
    license: "See bundled upstream notices and dependency metadata.",
    note: "HiCT matrix storage and native HDF5 access.",
  },
  {
    name: "hictk",
    authors: "Roberto Rossini, Jonas Paulsen and hictk contributors.",
    license: "MIT License",
    note: "Optional .hic conversion path. Cite Rossini R, Paulsen J. Bioinformatics 2024;40(7):btae408 when this path is used.",
  },
  {
    name: "HTSJDK and IGV BigWig",
    authors: "Broad Institute, IGV team and contributors.",
    license: "See upstream license metadata.",
    note: "FASTA/sequence and genomic track support.",
  },
  {
    name: "Apache Commons",
    authors: "Apache Software Foundation and contributors.",
    license: "Apache License 2.0",
    note: "General-purpose JVM utilities.",
  },
  {
    name: "SLF4J, Logback and picocli",
    authors: "QOS.ch, Remko Popma and contributors.",
    license: "See upstream license metadata.",
    note: "Logging and command-line interface.",
  },
];

export const webAttributions: AttributionEntry[] = [
  {
    name: "Vue, Pinia, Vite and TypeScript",
    authors: "Vue, Vite, TypeScript and open-source contributors.",
    license: "See package metadata.",
    note: "WebUI application framework and build tooling.",
  },
  {
    name: "Bootstrap, Bootstrap Icons, PrimeVue and PrimeIcons",
    authors: "Bootstrap, PrimeTek and contributors.",
    license: "See package metadata.",
    note: "Interface components, layout and icons.",
  },
  {
    name: "OpenLayers and igv.js",
    authors: "OpenLayers, IGV.js and contributors.",
    license: "See package metadata.",
    note: "Interactive map canvas and genomic track visualization.",
  },
  {
    name: "jsPDF, LiteGraph and color-picker libraries",
    authors: "Their respective authors and contributors.",
    license: "See package metadata.",
    note: "Export, rendering-pipeline editing and color controls.",
  },
];

export const redistributionNotes = [
  "Portable packages keep HiCT, WebUI, Java runtime and optional hictk notices with the release artifact.",
  "When hictk is bundled, its license and citation files are available under toolchains/<platform>/share.",
  "The Java runtime legal notices are kept under runtime/legal in portable packages.",
  "For exhaustive third-party details, inspect npm package metadata, Gradle dependency metadata and the bundled license folders.",
];

export const licenseText = `MIT License

Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

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
