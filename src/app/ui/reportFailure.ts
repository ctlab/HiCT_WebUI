import { toast } from "vue-sonner";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { useErrorToastStore } from "@/app/stores/errorToastStore";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";

const duplicateWindowMs = 1500;
const recentFailures = new Map<string, { at: number; message: string }>();

export function failureDetails(operation: string, error: unknown) {
  const description = extractErrorMessage(
    error,
    `Could not ${operation.toLowerCase()}.`
  );
  const message = description.split(/\r?\n\s+at /, 1)[0];
  type Failure = {
    response?: { status?: unknown };
    code?: unknown;
    stack?: unknown;
    cause?: unknown;
  };
  const failure = error as Failure | null;
  const cause = failure?.cause as Failure | undefined;
  const status = failure?.response?.status ?? cause?.response?.status;
  const code = failure?.code ?? cause?.code;
  const stack = cause?.stack ?? failure?.stack;
  const diagnostics = [
    operation,
    description,
    typeof status === "number" ? `HTTP ${status}` : "",
    typeof code === "string" ? code : "",
    typeof stack === "string" ? stack : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { message, diagnostics };
}

export function reportFailure(operation: string, error: unknown): void {
  const { message, diagnostics } = failureDetails(operation, error);
  const now = Date.now();
  for (const [key, failure] of recentFailures) {
    if (now - failure.at >= duplicateWindowMs) recentFailures.delete(key);
  }
  if (recentFailures.get(operation)?.message === message) return;
  recentFailures.set(operation, { at: now, message });

  const notifications = useNotificationCenterStore();
  const entry = notifications.add("error", message, diagnostics);
  if (!useErrorToastStore().requestErrorToastsEnabled) return;
  const options = {
    id: `failure:${operation}`,
    diagnosticsRecorded: true,
    action: {
      label: "Details",
      onClick: () => notifications.openAndExpandEntry(entry),
    },
  };
  toast.error(message, options);
}
