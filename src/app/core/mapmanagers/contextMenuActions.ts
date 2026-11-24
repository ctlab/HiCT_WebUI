import { toast } from "vue-sonner";
import type { ContactMapManager } from "./ContactMapManager";
import {
  formatBoundary,
  getCoordinateReferences,
  type CoordinateConvention,
  type CoordinateFrame,
  type RegionBounds,
} from "./regionSelection";

const assemblyReferences = { contigs: [], scaffolds: [] };

export interface ContextMenuItem {
  label: string;
  disabled?: boolean;
  title?: string;
  run: () => void;
}

/** Copyable genome locus: ungrouped ASCII coordinates, independent of locale. */
export function formatLocus(contigName: string, inContigBp: number): string {
  const position = Number.isFinite(inContigBp)
    ? Math.max(0, Math.round(inContigBp))
    : 0;
  return `${contigName}:${position}`;
}

function copyWithTextarea(text: string): boolean {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } finally {
    area.remove();
    previouslyFocused?.focus?.();
  }
}

/**
 * Copies text and reports the outcome. The asynchronous Clipboard API needs a secure context
 * (HTTPS or localhost), so sessions served over plain HTTP use the textarea fallback.
 */
export async function copyText(text: string, label: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
      return true;
    }
  } catch {
    // Permission denied or document not focused: try the fallback below.
  }
  try {
    if (copyWithTextarea(text)) {
      toast.success(`${label} copied`);
      return true;
    }
  } catch {
    // Reported below.
  }
  toast.error(
    `Could not copy ${label.toLowerCase()}. Select and copy it manually.`
  );
  return false;
}

export function copySelectionCoordinates(
  manager: ContactMapManager,
  frame: CoordinateFrame = "assembly"
): void {
  const layers = manager.viewAndLayersManager;
  const region = layers.getRegionBounds();
  if (region) {
    void copyRegionCoordinates(manager, region, frame, "one-based");
    return;
  }
  const range = layers.getSelectedEntityRange();
  if (!range) return;
  const references =
    frame === "assembly"
      ? assemblyReferences
      : getCoordinateReferences(manager);
  const start = formatBoundary(
    range.startBP,
    false,
    "one-based",
    references,
    frame
  );
  const end = formatBoundary(range.endBP, true, "one-based", references, frame);
  void copyText(
    `${coordinateHeading(frame, "one-based")}\n${start}\t${end}`,
    "Selection coordinates"
  );
}

function coordinateHeading(
  frame: CoordinateFrame,
  convention: CoordinateConvention
): string {
  const name = frame[0].toUpperCase() + frame.slice(1);
  const indexing =
    convention === "one-based" ? "1-based inclusive" : "0-based, end excluded";
  return `${name} coordinates (bp, ${indexing})`;
}

export function copyRegionCoordinates(
  manager: ContactMapManager,
  region: RegionBounds,
  frame: CoordinateFrame,
  convention: CoordinateConvention
): Promise<boolean> {
  const references =
    frame === "assembly"
      ? assemblyReferences
      : getCoordinateReferences(manager);
  const interval = (start: number, end: number) =>
    [
      formatBoundary(start, false, convention, references, frame),
      formatBoundary(end, true, convention, references, frame),
    ].join("\t");
  return copyText(
    [
      coordinateHeading(frame, convention),
      `Rows\t${interval(region.rowStart, region.rowEnd)}`,
      `Columns\t${interval(region.columnStart, region.columnEnd)}`,
    ].join("\n"),
    "Selection coordinates"
  );
}

export async function copySelectionPng(
  manager: ContactMapManager
): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    toast.error("Image clipboard is unavailable. Use Export → Image as PNG…");
    return;
  }
  const png = manager.renderCurrentMapPng({ scope: "selection" });
  try {
    // Start the write in the click handler while rendering resolves the PNG.
    const write = navigator.clipboard.write([
      new ClipboardItem({ "image/png": png }),
    ]);
    await Promise.all([png, write]);
    toast.success("Selection copied as PNG");
  } catch {
    try {
      await png;
      toast.error(
        "Could not write to the clipboard. Use Export → Image as PNG…"
      );
    } catch (error) {
      toast.error(`Could not render the selected region: ${String(error)}`);
    }
  }
}
