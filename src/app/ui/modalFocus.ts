import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from "vue";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visibleFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0
  );
}

/**
 * Makes a hand-built modal behave like one for keyboard users: focus moves into it when it opens, Tab and
 * Shift+Tab stay inside it, and focus goes back to whatever opened it when it closes. Escape is handled
 * by the escape-dialog registry, not here.
 */
const activeDialogs: symbol[] = [];

export function useModalFocus(
  root: Ref<HTMLElement | null>,
  isOpen?: () => boolean
): void {
  const dialog = Symbol();
  let opener: HTMLElement | null = null;
  let active = false;

  function onKeydown(event: KeyboardEvent): void {
    const container = root.value;
    if (event.key !== "Tab" || !container || activeDialogs.at(-1) !== dialog)
      return;
    const items = visibleFocusable(container);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = !!active && container.contains(active);
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  async function activate(): Promise<void> {
    if (active) return;
    active = true;
    activeDialogs.push(dialog);
    opener = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", onKeydown, true);
    await nextTick();
    const container = root.value;
    if (
      activeDialogs.at(-1) === dialog &&
      container &&
      !container.contains(document.activeElement)
    ) {
      const target =
        container.querySelector<HTMLElement>("[autofocus]") ??
        visibleFocusable(container).find(
          (element) => !element.classList.contains("btn-close")
        ) ??
        visibleFocusable(container)[0];
      target?.focus();
    }
  }

  function deactivate(): void {
    if (!active) return;
    active = false;
    const topmost = activeDialogs.at(-1) === dialog;
    const index = activeDialogs.indexOf(dialog);
    if (index >= 0) activeDialogs.splice(index, 1);
    document.removeEventListener("keydown", onKeydown, true);
    if (
      topmost &&
      opener &&
      document.contains(opener) &&
      opener !== document.body
    ) {
      opener.focus();
    }
  }

  if (isOpen) {
    // A modal that stays mounted and is shown with v-if: follow its open state.
    watch(isOpen, (open) => (open ? void activate() : deactivate()), {
      flush: "post",
    });
  }
  onMounted(() => {
    if (!isOpen || isOpen()) void activate();
  });
  onBeforeUnmount(deactivate);
}
