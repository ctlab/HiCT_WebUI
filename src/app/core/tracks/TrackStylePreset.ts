import { BorderStyle } from "@/app/core/tracks/Track2DSymmetric";

export type TrackStylePreset = {
  borderColor: string;
  fillColor: string;
  width: number;
  labelSize?: number;
  borderStyle: BorderStyle;
};

export type TrackStylePresetBundle = {
  contigs: TrackStylePreset;
  scaffolds: TrackStylePreset;
};
