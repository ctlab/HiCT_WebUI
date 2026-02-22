/*
 Copyright (c) 2021-2024 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

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
import { toast } from "vue-sonner";

const pinia = createPinia();

//import igv from "igv";

const app = createApp(App);
app.use(pinia);
app.mount("#app");

const errorToastStore = useErrorToastStore(pinia);

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  originalConsoleError(...args);
  if (!errorToastStore.webuiErrorToastsEnabled) return;
  try {
    const message = args
      .map((arg) => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === "string") return arg;
        return JSON.stringify(arg);
      })
      .join(" ");
    toast.error(message);
  } catch (_e) {
    toast.error("WebUI error (see console for details)");
  }
};

window.addEventListener("error", (event) => {
  if (!errorToastStore.webuiErrorToastsEnabled) return;
  const msg = event.error?.message ?? event.message ?? "WebUI error";
  toast.error(msg);
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
  toast.error(msg);
});
