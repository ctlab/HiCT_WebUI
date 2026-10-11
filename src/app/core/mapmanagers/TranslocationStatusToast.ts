import { defineComponent, h, markRaw, onUnmounted, ref, type Ref } from "vue";
import { toast } from "vue-sonner";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";

const instructions = "You've entered translocation mode. Click on arrow at the contig boxes to put selection before or after that arrow. Click again on translocation mode button to leave translocation mode.";
let current: Ref<boolean> | undefined;

/** One live tool-status view; notification history still records every change. */
export function showTranslocationStatus(active: boolean): void {
  const message = active ? instructions : "Translocation mode deactivated";
  useNotificationCenterStore().add(active ? "message" : "success", message);
  if (current) {
    current.value = active;
    return;
  }
  const state = ref(active);
  current = state;
  const closed = () => { if (current === state) current = undefined; };
  // vue-sonner 0.4 publishes duplicate DOM entries even for an existing id.
  // Updating a reactive title avoids re-publishing and keeps close/expiry intact.
  toast.custom(markRaw(defineComponent({
    name: "TranslocationStatusToast",
    emits: ["close-toast"],
    setup: (_, { emit }) => {
      onUnmounted(closed);
      return () => h("div", { style: { display: "flex", gap: "12px", padding: "16px",
        width: "var(--width)", background: "var(--normal-bg)", color: "var(--normal-text)",
        border: "1px solid var(--normal-border)", borderRadius: "8px", boxSizing: "border-box" } }, [
        // Keep stack offsets correct when the title changes without remounting.
        h("div", { style: { position: "relative", flex: "1" } }, [
          h("span", { "aria-hidden": "true", style: { visibility: "hidden" } }, instructions),
          h("span", { class: state.value ? undefined : "text-success",
            style: { position: "absolute", inset: "0" } },
            state.value ? instructions : "Translocation mode deactivated"),
        ]),
        h("button", { type: "button", "aria-label": "Close translocation status",
          style: { alignSelf: "flex-start", border: "none", background: "transparent", color: "inherit" },
          onClick: () => { closed(); emit("close-toast"); } }, "×"),
      ]);
    },
  })), { duration: 10000, onDismiss: closed, onAutoClose: closed });
}
