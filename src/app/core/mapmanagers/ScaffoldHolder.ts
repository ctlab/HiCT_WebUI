/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

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

import { toast } from "vue-sonner";
import type {
  ScaffoldBordersBP,
  ScaffoldDescriptor,
} from "../domain/ScaffoldDescriptor";
import type ContigDimensionHolder from "./ContigDimensionHolder";

type ScaffoldId = number;
type SortedScaffoldSegment = [
  borders: ScaffoldBordersBP,
  scaffoldId: ScaffoldId
];

class ScaffoldHolder {
  public readonly scaffoldTable: Map<ScaffoldId, ScaffoldDescriptor> =
    new Map();

  public readonly scaffoldBordersBp: Map<ScaffoldId, ScaffoldBordersBP> =
    new Map();

  public readonly scaffoldBordersSorted: SortedScaffoldSegment[] = [];

  constructor(
    public readonly contigDimensionHolder: ContigDimensionHolder,
    scaffoldDescriptors?: ScaffoldDescriptor[] | undefined
  ) {
    if (scaffoldDescriptors) {
      this.updateScaffoldData(scaffoldDescriptors);
    }
  }

  public updateScaffoldData(scaffoldDescriptors: ScaffoldDescriptor[]): void {
    this.scaffoldTable.clear();
    this.scaffoldBordersBp.clear();
    this.scaffoldBordersSorted.length = 0;
    for (const sd of scaffoldDescriptors) {
      this.scaffoldTable.set(sd.scaffoldId, sd);
      if (sd.scaffoldBordersBP) {
        this.scaffoldBordersBp.set(sd.scaffoldId, sd.scaffoldBordersBP);
        this.scaffoldBordersSorted.push([sd.scaffoldBordersBP, sd.scaffoldId]);
      }
    }
    this.scaffoldBordersSorted.sort(([bp1, id1], [bp2, id2]) => {
      const leftBorders = bp1.startBP - bp2.startBP;
      const rightBordes = bp1.endBP - bp2.endBP;
      return leftBorders !== 0 ? leftBorders : rightBordes;
    });
  }

  public getScaffoldById(scaffoldId: ScaffoldId): ScaffoldDescriptor {
    const descriptor = this.scaffoldTable.get(scaffoldId);
    if (descriptor) {
      return descriptor;
    } else {
      toast.error(`Unknown scaffold with id=${scaffoldId}`);
      throw new Error(`Unknown scaffold with id=${scaffoldId}`);
    }
  }

  public getScaffoldLocusByBp(bp: number): {
    scaffoldId: ScaffoldId;
    scaffoldName: string;
    inScaffoldBp: number;
    startBp: number;
    endBp: number;
  } | null {
    let left = 0;
    let right = this.scaffoldBordersSorted.length - 1;
    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      const [borders, scaffoldId] = this.scaffoldBordersSorted[middle];
      if (bp < borders.startBP) {
        right = middle - 1;
        continue;
      }
      if (bp >= borders.endBP) {
        left = middle + 1;
        continue;
      }
      const descriptor = this.scaffoldTable.get(scaffoldId);
      if (!descriptor) {
        return null;
      }
      return {
        scaffoldId,
        scaffoldName: descriptor.scaffoldName,
        inScaffoldBp: bp - borders.startBP,
        startBp: borders.startBP,
        endBp: borders.endBP,
      };
    }
    return null;
  }
}

export { type ScaffoldId, ScaffoldHolder };
