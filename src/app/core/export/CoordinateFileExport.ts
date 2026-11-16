import { toast } from "vue-sonner";
import { failureDetails } from "@/app/ui/reportFailure";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
import type { RequestManager } from "../net/api/RequestManager";
import type {
  GetAGPForAssemblyRequest,
  GetFastaForAssemblyRequest,
  GetFastaForSelectionRequest,
} from "../net/api/request";
import type { FileSaveDestination, FileSaveResult } from "./FileSave";

/** Use a bounded transfer when the destination supports it; preserve legacy desktop/download adapters. */
export async function writeCoordinateFile(
  destination: FileSaveDestination,
  api: RequestManager,
  request:
    | GetFastaForAssemblyRequest
    | GetFastaForSelectionRequest
    | GetAGPForAssemblyRequest,
  version: RequestManager["history"]["applied"],
  title: string
): Promise<void> {
  const controller = new AbortController();
  const action = { label: "Cancel", onClick: () => controller.abort() };
  const transfer = async (): Promise<FileSaveResult> => {
    try {
      if (destination.writeStream) {
        const stream = await api.openCoordinateDownload(
          request,
          version,
          controller.signal
        );
        return await destination.writeStream(stream, controller.signal);
      }
      // Older desktop wrappers and download-only browsers still need a complete Blob.
      // Keep that compatibility path explicit until they have streaming adapters.
      const data = await api.sendRequest(request, {
        responseType: "arraybuffer",
        signal: controller.signal,
        headers: version
          ? {
              "X-HiCT-History-Session": version.session,
              "X-HiCT-History-Revision": String(version.revision),
            }
          : {},
      });
      controller.signal.throwIfAborted();
      return await destination.write(
        new Blob([data.data], { type: "text/plain" })
      );
    } catch (failure) {
      if (controller.signal.aborted) return { status: "cancelled" };
      throw failure;
    }
  };
  const notifications = useNotificationCenterStore();
  const outcome = transfer().finally(() => {
    action.label = "Close";
  });
  // The installed vue-sonner supports promise state changes on one toast.
  // Appending a reused ID or dismissing/replacing an in-flight toast can loop its layout.
  toast.promise(outcome, {
    loading: `Exporting ${title}…`,
    duration: 8000,
    action,
    success: (result: FileSaveResult) => {
      const message =
        result.status === "saved"
          ? `${title} saved: ${result.filename}`
          : result.status === "download-started"
          ? `${title} download started. Your browser controls the destination; enable “Ask where to save” in its download settings.`
          : `${title} export cancelled.`;
      notifications.add(
        result.status === "saved" ? "success" : "message",
        message
      );
      return message;
    },
    error: (failure: unknown) => {
      const details = failureDetails(`Export ${title}`, failure);
      notifications.add("error", details.message, details.diagnostics);
      return details.message;
    },
  });
  // The promise toast reports transfer failures once; callers still report picker failures.
  await outcome.catch(() => undefined);
}
