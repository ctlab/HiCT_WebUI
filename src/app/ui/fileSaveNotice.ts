import { toast } from "vue-sonner";
import type { FileSaveResult } from "@/app/core/export/FileSave";
import { saveFileBlob, type FileSaveKind } from "@/app/core/export/FileSave";
import { reportFailure } from "./reportFailure";
export function notifyFileSave(result: FileSaveResult, label: string): void {
  if (result.status === "saved")
    toast.success(`${label} saved: ${result.filename}`);
  else if (result.status === "download-started")
    toast.message(
      `${label} download started. Your browser controls the destination; enable “Ask where to save” in its download settings.`,
      { duration: 8000 }
    );
}
export async function saveFileWithNotice(
  blob: Blob,
  filename: string,
  kind: FileSaveKind,
  label: string
): Promise<void> {
  try {
    notifyFileSave(await saveFileBlob(blob, filename, kind), label);
  } catch (failure) {
    reportFailure(label, failure);
  }
}
