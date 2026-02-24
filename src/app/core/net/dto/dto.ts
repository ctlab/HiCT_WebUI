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

import { ColorTranslator } from "colortranslator";
import type { AssemblyInfo } from "../../domain/AssemblyInfo";
import {
  ContigDirection,
  ContigHideType,
  QueryLengthUnit,
} from "../../domain/common";
import type { ContigDescriptor } from "../../domain/ContigDescriptor";
import type {
  ScaffoldBordersBP,
  ScaffoldDescriptor,
} from "../../domain/ScaffoldDescriptor";
import Colormap from "../../visualization/colormap/Colormap";
import SimpleLinearGradient from "../../visualization/colormap/SimpleLinearGradient";
import VisualizationOptions from "../../visualization/VisualizationOptions";
import type { OpenFileResponse } from "../netcommon";

abstract class InboundDTO<T> {
  public readonly error?: string;
  public readonly warning?: string;
  public readonly info?: string;
  public readonly message?: string;

  constructor(public readonly json: Record<string, unknown>) {
    this.error = (json["error"] as string) ?? undefined;
    this.warning = (json["warning"] as string) ?? undefined;
    this.info = (json["info"] as string) ?? undefined;
    this.message = (json["message"] as string) ?? undefined;
  }

  public abstract toEntity(): T;
}

abstract class OutboundDTO<T> {
  constructor(public readonly entity: T) {}

  abstract toDTO(): Record<string, unknown>;
}

function queryLengthUnitFromDTO(dto: number): QueryLengthUnit {
  const queryLengthUnits = [
    QueryLengthUnit.BASE_PAIRS,
    QueryLengthUnit.BINS,
    QueryLengthUnit.PIXELS,
  ];
  return queryLengthUnits[dto];
}

function contigDirectionFromDTO(dto: number): ContigDirection {
  const contigDirections = [ContigDirection.REVERSED, ContigDirection.FORWARD];
  return contigDirections[dto];
}

function contigHideTypeFromDTO(dto: number): ContigHideType {
  const contigHideTypes = [
    ContigHideType.AUTO_HIDDEN,
    ContigHideType.AUTO_SHOWN,
    ContigHideType.FORCED_HIDDEN,
    ContigHideType.FORCED_SHOWN,
  ];
  return contigHideTypes[dto];
}

class ContigDescriptorDTO extends InboundDTO<ContigDescriptor> {
  public toEntity(): ContigDescriptor {
    return {
      contigId: this.json.contigId as number,
      contigName: this.json.contigName as string,
      contigOriginalName: this.json.contigOriginalName as string,
      contigLengthBp: this.json.contigLengthBp as number,
      contigLengthBins: new Map(
        Array.from(
          Object.entries(this.json.contigLengthBins as Record<number, number>)
        ).map(([resolution, lengthBins]) => {
          return [Number(resolution), Number(lengthBins)];
        })
      ),
      direction: contigDirectionFromDTO(this.json.contigDirection as number),
      presenceAtResolution: new Map(
        Array.from(
          Object.entries(
            this.json.contigPresenceAtResolution as Record<number, number>
          )
        ).map(([resolution, chtIndex]) => [
          Number(resolution),
          contigHideTypeFromDTO(chtIndex),
        ])
      ),
    };
  }
}

class ScaffoldBordersBPDTO extends InboundDTO<ScaffoldBordersBP> {
  public toEntity(): ScaffoldBordersBP {
    return {
      startBP: this.json.startBP as number,
      endBP: this.json.endBP as number,
    };
  }
}

class ScaffoldDescriptorDTO extends InboundDTO<ScaffoldDescriptor> {
  public toEntity(): ScaffoldDescriptor {
    return {
      scaffoldId: this.json.scaffoldId as number,
      scaffoldName: this.json.scaffoldName as string,
      scaffoldOriginalName: this.json.scaffoldOriginalName as string,
      spacerLength: this.json.spacerLength as number,
      scaffoldBordersBP: this.json.scaffoldBordersBP
        ? new ScaffoldBordersBPDTO(
            this.json.scaffoldBordersBP as Record<string, unknown>
          ).toEntity()
        : null,
    };
  }
}

class AssemblyInfoDTO extends InboundDTO<AssemblyInfo> {
  public toEntity(): AssemblyInfo {
    return {
      contigDescriptors: (
        this.json.contigDescriptors as Record<string, unknown>[]
      ).map((cd) => new ContigDescriptorDTO(cd).toEntity()),
      scaffoldDescriptors: (
        this.json.scaffoldDescriptors as Record<string, unknown>[]
      ).map((sd) => new ScaffoldDescriptorDTO(sd).toEntity()),
    };
  }
}

class OpenFileResponseDTO extends InboundDTO<OpenFileResponse> {
  public toEntity(): OpenFileResponse {
    return {
      status: this.json.status as string,
      dtype: this.json.dtype as string,
      resolutions: this.json.resolutions as number[],
      pixelResolutions: this.json.pixelResolutions as number[],
      tileSize: this.json.tileSize as number,
      assemblyInfo: new AssemblyInfoDTO(
        this.json.assemblyInfo as Record<string, unknown>
      ).toEntity(),
      matrixSizesBins: this.json.matrixSizesBins as number[],
    };
  }
}

class SimpleLinearGradientDTO extends InboundDTO<SimpleLinearGradient> {
  private static safeColor(value: unknown, fallback: string): ColorTranslator {
    if (typeof value !== "string" || value.length > 128) {
      return new ColorTranslator(fallback, { legacyCSS: true });
    }
    try {
      return new ColorTranslator(value, { legacyCSS: true });
    } catch {
      return new ColorTranslator(fallback, { legacyCSS: true });
    }
  }

  public static fromEntity(e: SimpleLinearGradient) {
    return new SimpleLinearGradientDTO({
      startColorRGBAString: e.startColorRGBA.RGBA,
      endColorRGBAString: e.endColorRGBA.RGBA,
      minSignal: e.minSignal,
      maxSignal: e.maxSignal,
    });
  }

  public toEntity(): SimpleLinearGradient {
    const start = SimpleLinearGradientDTO.safeColor(
      this.json["startColorRGBAString"],
      "rgba(0,255,0,0.0)"
    );
    const end = SimpleLinearGradientDTO.safeColor(
      this.json["endColorRGBAString"],
      "rgba(0,96,0,1.0)"
    );
    const minSignalRaw = this.json["minSignal"];
    const maxSignalRaw = this.json["maxSignal"];
    const minSignal =
      typeof minSignalRaw === "number" && Number.isFinite(minSignalRaw)
        ? minSignalRaw
        : 0;
    const maxSignal =
      typeof maxSignalRaw === "number" && Number.isFinite(maxSignalRaw)
        ? maxSignalRaw
        : 1;
    return new SimpleLinearGradient(
      start,
      end,
      minSignal,
      maxSignal
    );
  }
}

class ColormapDTO extends InboundDTO<Colormap> {
  public static fromEntity(e: Colormap) {
    switch (e.colormapType) {
      case "SimpleLinearGradient":
        return new ColormapDTO({
          colormapType: e.colormapType,
          ...SimpleLinearGradientDTO.fromEntity(e as SimpleLinearGradient).json,
        });
      default:
        throw new Error("Unknown colormap type: " + e.colormapType);
    }
  }

  public toEntity(): Colormap {
    const colormapType = this.json["colormapType"] as string;
    switch (colormapType) {
      case "SimpleLinearGradient":
        return new SimpleLinearGradientDTO(this.json).toEntity();
      default:
        throw new Error("Unknown colormap type: " + colormapType);
    }
  }
}

class VisualizationOptionsDTO extends InboundDTO<VisualizationOptions> {
  public static fromEntity(e: VisualizationOptions) {
    // console.log("Called from entity: ", e);
    return new VisualizationOptionsDTO({
      preLogBase: e.preLogBase,
      postLogBase: e.postLogBase,
      applyCoolerWeights: e.applyCoolerWeights,
      resolutionScaling: e.resolutionScaling,
      resolutionLinearScaling: e.resolutionLinearScaling,
      colormap: ColormapDTO.fromEntity(e.colormap),
    });
  }

  public toEntity(): VisualizationOptions {
    // console.log("Called to entity: ", this);
    return new VisualizationOptions(
      this.json["preLogBase"] as number,
      this.json["postLogBase"] as number,
      this.json["applyCoolerWeights"] as boolean,
      this.json["resolutionScaling"] as boolean,
      this.json["resolutionLinearScaling"] as boolean,
      new ColormapDTO(
        this.json["colormap"] as Record<string, unknown>
      ).toEntity()
    );
  }
}

export {
  InboundDTO,
  OutboundDTO,
  ContigDescriptorDTO,
  ScaffoldBordersBPDTO,
  ScaffoldDescriptorDTO,
  AssemblyInfoDTO,
  OpenFileResponseDTO,
  queryLengthUnitFromDTO,
  contigDirectionFromDTO,
  contigHideTypeFromDTO,
  SimpleLinearGradientDTO,
  ColormapDTO,
  VisualizationOptionsDTO,
};
