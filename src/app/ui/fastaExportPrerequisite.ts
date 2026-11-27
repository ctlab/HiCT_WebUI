import { askForConfirmation } from "./confirmAction";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";

export async function offerFastaLink(
  manager: ContactMapManager,
  resume: () => void
): Promise<void> {
  const file = manager.getOptions().filename.split(/[\\/]/).pop();
  const result = await askForConfirmation({
    title: "Link a FASTA file first",
    body: `Exporting sequence needs the FASTA that matches ${file}. Link it once and HiCT keeps it for this map and saved sessions.`,
    tone: "info",
    icon: "bi-link-45deg",
    confirmLabel: "Link FASTA…",
    confirmIcon: "bi-link-45deg",
  });
  if (result === "confirm" && !manager.isDisposed) {
    window.dispatchEvent(new CustomEvent("hict:link-fasta-for-export", {
      detail: { manager, resume },
    }));
  }
}
