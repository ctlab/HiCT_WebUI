import { toast } from "vue-sonner";

export interface ContextMenuItem {
  label: string;
  disabled?: boolean;
  run: () => void;
}

/** `name:12,345`, the form accepted by genome browsers (thousands separators allowed). */
export function formatLocus(contigName: string, inContigBp: number): string {
  const position = Number.isFinite(inContigBp) ? Math.max(0, Math.round(inContigBp)) : 0;
  return `${contigName}:${position.toLocaleString("en-US")}`;
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
  toast.error(`Could not copy ${label.toLowerCase()}. Select and copy it manually.`);
  return false;
}
