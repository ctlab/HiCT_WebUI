import { shallowRef } from "vue";

type Decision = "confirm" | "cancel" | "secondary";

export type Confirmation = {
  title: string;
  body: string;
  tone: "danger" | "info" | "warn";
  icon: string;
  confirmLabel: string;
  confirmIcon?: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  rememberKey?: string;
  details?: string[];
};

export const confirmation = shallowRef<Confirmation>();
let finish: ((decision: Decision) => void) | undefined;

export function askForConfirmation(options: Confirmation): Promise<Decision> {
  if (finish) return Promise.resolve("cancel");
  if (options.rememberKey) {
    try {
      if (localStorage.getItem(options.rememberKey) === "1") {
        return Promise.resolve("confirm");
      }
    } catch {
      // The dialog still works with storage disabled.
    }
  }
  return new Promise((resolve) => {
    confirmation.value = options;
    finish = resolve;
  });
}

export function settleConfirmation(decision: Decision, remember = false): void {
  const key = confirmation.value?.rememberKey;
  if (decision === "confirm" && remember && key) {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // The user's current confirmation still applies.
    }
  }
  const done = finish;
  finish = undefined;
  confirmation.value = undefined;
  done?.(decision);
}
