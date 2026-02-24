import { BorderStyle } from "@/app/core/tracks/Track2DSymmetric";
import { NamePlacement } from "@/app/core/tracks/Track2DSymmetric";

export type TrackStylePreset = {
  borderColor: string;
  fillColor: string;
  width: number;
  labelSize?: number;
  borderStyle: BorderStyle;
  namePlacement?: NamePlacement | keyof typeof NamePlacement;
  labelBold?: boolean;
  labelOutline?: boolean;
  labelOutlineWidth?: number;
  labelOffsetMultiplier?: number;
  labelColor?: string;
};

export type TrackStylePresetBundle = {
  contigs: TrackStylePreset;
  scaffolds: TrackStylePreset;
};
