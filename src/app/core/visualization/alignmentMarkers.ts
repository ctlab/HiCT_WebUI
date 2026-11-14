/** Shared marker artwork keeps the map and its legend consistent. */
export const alignmentMarkers = [
  {
    id: "forward",
    label: "Forward match",
    color: "#047857",
    path: "M3 3H13V13H3Z",
    filled: true,
  },
  {
    id: "reverse",
    label: "Reverse match",
    color: "#7c3aed",
    path: "M8 1L15 8L8 15L1 8Z",
    filled: true,
  },
  {
    id: "substitution",
    label: "Substitution",
    color: "#c2410c",
    path: "M3 3L13 13M13 3L3 13",
    filled: false,
  },
  {
    id: "ambiguous",
    label: "Ambiguous base",
    color: "#475569",
    path: "M8 2L15 14H1Z",
    filled: true,
  },
  {
    id: "gap",
    label: "Insertion / deletion",
    color: "#475569",
    path: "M1 8H15",
    filled: false,
  },
] as const;

export function alignmentMarker(operation: string, reverse: boolean) {
  return alignmentMarkers[
    operation === "MATCH"
      ? reverse
        ? 1
        : 0
      : operation === "SUBSTITUTION"
      ? 2
      : operation === "AMBIGUOUS"
      ? 3
      : 4
  ];
}

export function alignmentMarkerSvg(
  marker: typeof alignmentMarkers[number]
): string {
  const fill = marker.filled ? marker.color : "none";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="${marker.path}" fill="${fill}" stroke="white" stroke-width="4" stroke-linejoin="round"/><path d="${marker.path}" fill="${fill}" stroke="${marker.color}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
