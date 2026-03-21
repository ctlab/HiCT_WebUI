/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import path from "path-browserify";

/**
 * Interface that is used to signal normalization settings change.
 */
interface NormalizationSettings {
  /**
   * Number which determines whether to apply logarithmic normalization prior to applying Cooler weights.
   * Values that are greater than one mean that this normalization is enabled.
   * Values less than one mean that this normalization is disabled.
   */
  preLogBase: number;
  /**
   * Whether to apply Cooler weights.
   */
  applyCoolerWeights: boolean;
  /**
   * Number which determines whether to apply logarithmic normalization after applying Cooler weights.
   * Values that are greater than one mean that this normalization is enabled.
   * Values less than one mean that this normalization is disabled.
   */
  postLogBase: number;
}

/**
 * Describes current contrast settings.
 */
interface ContrastRangeSettings {
  /**
   * All pixels with values smaller than lower bound will be drawn in background color.
   */
  lowerSignalBound: number;
  /**
   * All pixels with values smaller than lower bound will be drawn in solid color.
   */
  upperSignalBound: number;
}

function extensionToDataType(
  ext: string
): "hict" | "agp" | "fasta" | "experiment" | undefined {
  const extMap: Record<string, "hict" | "agp" | "fasta" | "experiment"> = {
    hict: "hict",
    "hict.hdf5": "hict",
    hdf5: "hict",
    agp: "agp",
    fasta: "fasta",
    hictexp: "experiment",
  };
  const extLower = ext.toLowerCase().substring(1);
  // console.log("extLower = ", extLower);
  if (extLower in extMap) {
    return extMap[extLower];
  } else {
    return undefined;
  }
}

interface FileTreeNode {
  nodeName: string;
  nodeType: "file" | "directory";
  dataType?: "hict" | "agp" | "fasta" | "experiment";
  nodePath: string;
  children: FileTreeNode[];
  originalIndex?: number;
}

export {
  type NormalizationSettings,
  type ContrastRangeSettings,
  type FileTreeNode,
  extensionToDataType,
};
