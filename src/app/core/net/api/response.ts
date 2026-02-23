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

class CurrentSignalRangeResponse {
  public constructor(
    public readonly minSignalAtLevel: number[],
    public readonly maxSignalAtLevel: number[],
    public readonly globalMinSignal: number,
    public readonly globalMaxSignal: number
  ) {}
}

class TilePOSTResponse {
  public constructor(
    public readonly image_base64_source: string,
    public readonly ranges: CurrentSignalRangeResponse
  ) {}
}

class ConversionJobResponse {
  public constructor(
    public readonly jobId: string,
    public readonly status: string,
    public readonly sourceFilename: string,
    public readonly outputFilename: string,
    public readonly direction: string,
    public readonly overallProgress: number,
    public readonly resolutionProgress: number,
    public readonly currentResolution: number,
    public readonly elapsedMillis: number,
    public readonly etaMillis: number,
    public readonly resolutionElapsedMillis: number,
    public readonly resolutionEtaMillis: number,
    public readonly inputSizeBytes: number,
    public readonly outputSizeBytes: number,
    public readonly logs: string[],
    public readonly error: string
  ) {}
}

class NameMappingResponse {
  public constructor(
    public readonly contigs: {
      contigId: number;
      originalName: string;
      name: string;
    }[],
    public readonly scaffolds: {
      scaffoldId: number;
      originalName: string;
      name: string;
    }[]
  ) {}
}

export {
  CurrentSignalRangeResponse,
  TilePOSTResponse,
  ConversionJobResponse,
  NameMappingResponse,
};
