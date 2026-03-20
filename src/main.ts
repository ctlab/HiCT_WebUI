/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import App from "./App.vue";
import "normalize.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";
import "primeflex/primeflex.css";
import "primevue/resources/themes/lara-light-teal/theme.css";
import "primevue/resources/primevue.min.css"; /* Deprecated */
import "primeicons/primeicons.css";
// import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import { useErrorToastStore } from "@/app/stores/errorToastStore";
import {
  useNotificationCenterStore,
  type NotificationLevel,
} from "@/app/stores/notificationCenterStore";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { toast } from "vue-sonner";
import { watch } from "vue";
import "./app/ui/zoomslider.css";

const pinia = createPinia();

//import igv from "igv";

const app = createApp(App);
app.use(pinia);
app.mount("#app");

function applyDefaultTooltips(root: ParentNode = document) {
  const candidates = root.querySelectorAll(
    "button, a, input, select, textarea, [role='button'], [role='menuitem']"
  );
  candidates.forEach((el) => {
    const element = el as HTMLElement;
    if (element.getAttribute("title")) return;
    const aria =
      element.getAttribute("aria-label") ||
      element.getAttribute("data-bs-title");
    const placeholder =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
        ? element.placeholder
        : "";
    const text = element.textContent?.trim() ?? "";
    const title = aria || placeholder || text;
    if (title) {
      element.setAttribute("title", title);
    }
  });
}

applyDefaultTooltips();
const tooltipObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        applyDefaultTooltips(node);
      }
    });
  }
});
tooltipObserver.observe(document.body, { childList: true, subtree: true });

const errorToastStore = useErrorToastStore(pinia);
const notificationCenterStore = useNotificationCenterStore(pinia);
const uiSettingsStore = useUiSettingsStore(pinia);

const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleInfo = console.info.bind(console);
const originalConsoleLog = console.log.bind(console);

const originalToastError = toast.error.bind(toast);
const originalToastSuccess = toast.success.bind(toast);
const originalToastMessage = toast.message.bind(toast);

const stringifyNotificationMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const pushNotification = (
  level: NotificationLevel,
  message: string,
  options?: { skipConsole?: boolean }
) => {
  if (!options?.skipConsole) {
    switch (level) {
      case "error":
        originalConsoleError(message);
        break;
      case "warning":
        originalConsoleWarn(message);
        break;
      case "success":
      case "info":
      case "message":
        originalConsoleInfo(message);
        break;
      default:
        originalConsoleLog(message);
        break;
    }
  }
  notificationCenterStore.add(level, message);
};

toast.error = ((message: unknown, data?: unknown) => {
  const normalized = stringifyNotificationMessage(message);
  pushNotification("error", normalized);
  return originalToastError(normalized, data as never);
}) as typeof toast.error;

toast.success = ((message: unknown, data?: unknown) => {
  const normalized = stringifyNotificationMessage(message);
  pushNotification("success", normalized);
  return originalToastSuccess(normalized, data as never);
}) as typeof toast.success;

toast.message = ((message: unknown, data?: unknown) => {
  const normalized = stringifyNotificationMessage(message);
  pushNotification("message", normalized);
  return originalToastMessage(normalized, data as never);
}) as typeof toast.message;

watch(
  () => uiSettingsStore.customZoomSliderEnabled,
  (enabled) => {
    document.body.classList.toggle("custom-zoomslider-enabled", enabled);
  },
  { immediate: true }
);

console.error = (...args: unknown[]) => {
  originalConsoleError(...args);
  if (!errorToastStore.webuiErrorToastsEnabled) return;
  try {
    const message = args.map(stringifyNotificationMessage).join(" ");
    pushNotification("error", message, { skipConsole: true });
    originalToastError(message);
  } catch (_e) {
    pushNotification("error", "WebUI error (see console for details)", {
      skipConsole: true,
    });
    originalToastError("WebUI error (see console for details)");
  }
};

window.addEventListener("error", (event) => {
  if (!errorToastStore.webuiErrorToastsEnabled) return;
  const msg = event.error?.message ?? event.message ?? "WebUI error";
  pushNotification("error", msg, { skipConsole: true });
  originalToastError(msg);
});

window.addEventListener("unhandledrejection", (event) => {
  if (!errorToastStore.webuiErrorToastsEnabled) return;
  const reason = event.reason;
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
      ? reason
      : "Unhandled promise rejection";
  pushNotification("error", msg, { skipConsole: true });
  originalToastError(msg);
});
