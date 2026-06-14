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
    const expandedEntryIds = ref<number[]>([]);

    const add = (level: NotificationLevel, message: string): number => {
      const id = nextId.value++;
      entries.value.push({
        id,
        level,
        message,
        createdAt: Date.now(),
      });
      if (keepLast100.value && entries.value.length > 100) {
        entries.value.splice(0, entries.value.length - 100);
      }
      return id;
    };

    const clear = () => {
      entries.value = [];
      expandedEntryIds.value = [];
    };

    const setKeepLast100 = (enabled: boolean) => {
      keepLast100.value = enabled;
      if (enabled && entries.value.length > 100) {
        entries.value = entries.value.slice(-100);
      }
    };

    const isEntryExpanded = (entryId: number): boolean =>
      expandedEntryIds.value.includes(entryId);

    const expandEntry = (entryId: number): void => {
      if (!expandedEntryIds.value.includes(entryId)) {
        expandedEntryIds.value = [...expandedEntryIds.value, entryId];
      }
    };

    const collapseEntry = (entryId: number): void => {
      expandedEntryIds.value = expandedEntryIds.value.filter(
        (value) => value !== entryId
      );
    };

    const toggleEntryExpansion = (entryId: number): void => {
      if (isEntryExpanded(entryId)) {
        collapseEntry(entryId);
      } else {
        expandEntry(entryId);
      }
    };

    const openAndExpandEntry = (entryId: number): void => {
      isOpen.value = true;
      expandEntry(entryId);
    };

    return {
      entries,
      isOpen,
      keepLast100,
      expandedEntryIds,
      add,
      clear,
      setKeepLast100,
      isEntryExpanded,
      expandEntry,
      collapseEntry,
      toggleEntryExpansion,
      openAndExpandEntry,
    };
  }
);
