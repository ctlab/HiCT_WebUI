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

class ConverterStatusResponse {
  public constructor(
    public readonly isConverting: boolean,
    public readonly resolutionProgress: number,
    public readonly totalProgress: number
  ) {}
}

export {
  CurrentSignalRangeResponse,
  TilePOSTResponse,
  ConverterStatusResponse,
};
