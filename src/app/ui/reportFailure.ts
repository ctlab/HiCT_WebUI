import { describeHttpFailure, notify } from "./notifications/toastPolicy";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { useErrorToastStore } from "@/app/stores/errorToastStore";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";

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
  const failure = error as { response?: { status?: number }; cause?: { response?: { status?: number } };
    code?: string } | undefined;
  const status = failure?.response?.status ?? failure?.cause?.response?.status;
  const http = status !== undefined || failure?.code === "ERR_NETWORK"
    ? describeHttpFailure(status, message, operation.toLowerCase())
    : undefined;
  showFailure(http?.title ?? message, http?.description, diagnostics);
}

export function showFailure(
  title: string,
  description?: string,
  diagnostics?: string,
  showToast = useErrorToastStore().requestErrorToastsEnabled
): void {
  const notifications = useNotificationCenterStore();
  const entry = notifications.add("error", title, diagnostics);
  if (!showToast) return;
  notify("error", title, description, {
    label: "Details",
    onClick: () => notifications.openAndExpandEntry(entry),
  }, undefined, true);
}
