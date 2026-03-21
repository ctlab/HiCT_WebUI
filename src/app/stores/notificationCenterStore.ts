import { defineStore } from "pinia";
import { ref } from "vue";

export type NotificationLevel =
  | "error"
  | "warning"
  | "success"
  | "info"
  | "message";

export type NotificationEntry = {
  id: number;
  level: NotificationLevel;
  message: string;
  createdAt: number;
};

export const useNotificationCenterStore = defineStore(
  "notificationCenter",
  () => {
    const entries = ref<NotificationEntry[]>([]);
    const isOpen = ref(false);
    const keepLast100 = ref(true);
    const nextId = ref(1);

    const add = (level: NotificationLevel, message: string) => {
      entries.value.push({
        id: nextId.value++,
        level,
        message,
        createdAt: Date.now(),
      });
      if (keepLast100.value && entries.value.length > 100) {
        entries.value.splice(0, entries.value.length - 100);
      }
    };

    const clear = () => {
      entries.value = [];
    };

    const setKeepLast100 = (enabled: boolean) => {
      keepLast100.value = enabled;
      if (enabled && entries.value.length > 100) {
        entries.value = entries.value.slice(-100);
      }
    };

    return {
      entries,
      isOpen,
      keepLast100,
      add,
      clear,
      setKeepLast100,
    };
  }
);
