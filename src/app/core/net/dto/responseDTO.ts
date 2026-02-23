/*
 Copyright (c) 2021-2024 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

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

import {
  ConversionJobResponse,
  CurrentSignalRangeResponse,
  NameMappingResponse,
  TilePOSTResponse,
} from "../api/response";
import { InboundDTO } from "./dto";

class CurrentSignalRangeResponseDTO extends InboundDTO<CurrentSignalRangeResponse> {
  public toEntity(): CurrentSignalRangeResponse {
    const minSignalAtLevel: number[] = [];
    Object.entries(this.json.lowerBounds as object).forEach((kv) => {
      const [indexString, value] = kv;
      const indexInt: number = Number.parseInt(indexString);
      if (Number.isFinite(indexInt)) {
        minSignalAtLevel[indexInt] = Number.parseInt(value);
      }
    });
    const maxSignalAtLevel: number[] = [];
    Object.entries(this.json.upperBounds as object).forEach((kv) => {
      const [indexString, value] = kv;
      const indexInt: number = Number.parseInt(indexString);
      if (Number.isFinite(indexInt)) {
        maxSignalAtLevel[indexInt] = Number.parseInt(value);
      }
    });
    return {
      minSignalAtLevel: minSignalAtLevel,
      maxSignalAtLevel: maxSignalAtLevel,
      globalMinSignal: Math.min(
        ...minSignalAtLevel.filter((v) => Number.isFinite(v))
      ),
      globalMaxSignal: Math.max(
        ...maxSignalAtLevel.filter((v) => Number.isFinite(v))
      ),
    };
  }
}

class TilePOSTResponseDTO extends InboundDTO<TilePOSTResponse> {
  public toEntity(): TilePOSTResponse {
    return new TilePOSTResponse(
      this.json.image as string,
      new CurrentSignalRangeResponseDTO(
        this.json.ranges as Record<string, unknown>
      ).toEntity()
    );
  }
}

class ConversionJobResponseDTO extends InboundDTO<ConversionJobResponse> {
  public toEntity(): ConversionJobResponse {
    return new ConversionJobResponse(
      this.json["jobId"] as string,
      this.json["status"] as string,
      this.json["sourceFilename"] as string,
      this.json["outputFilename"] as string,
      this.json["direction"] as string,
      this.json["overallProgress"] as number,
      this.json["resolutionProgress"] as number,
      this.json["currentResolution"] as number,
      this.json["elapsedMillis"] as number,
      this.json["etaMillis"] as number,
      this.json["resolutionElapsedMillis"] as number,
      this.json["resolutionEtaMillis"] as number,
      this.json["inputSizeBytes"] as number,
      this.json["outputSizeBytes"] as number,
      (this.json["logs"] as string[]) ?? [],
      (this.json["error"] as string) ?? ""
    );
  }
}

class NameMappingResponseDTO extends InboundDTO<NameMappingResponse> {
  public toEntity(): NameMappingResponse {
    return new NameMappingResponse(
      (this.json["contigs"] as Record<string, unknown>[]).map((item) => ({
        contigId: item["contigId"] as number,
        originalName: item["originalName"] as string,
        name: item["name"] as string,
      })),
      (this.json["scaffolds"] as Record<string, unknown>[]).map((item) => ({
        scaffoldId: item["scaffoldId"] as number,
        originalName: item["originalName"] as string,
        name: item["name"] as string,
      }))
    );
  }
}

export {
  CurrentSignalRangeResponseDTO,
  TilePOSTResponseDTO,
  ConversionJobResponseDTO,
  NameMappingResponseDTO,
};
