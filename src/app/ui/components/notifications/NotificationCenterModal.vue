<template>
  <div v-if="notificationStore.isOpen">
    <div
      class="modal-backdrop fade show notification-center-backdrop"
      @click="notificationStore.isOpen = false"
    ></div>
    <div
      class="modal fade show notification-center-modal"
      style="display: block"
      tabindex="-1"
      role="dialog"
    >
      <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Notifications</h5>
            <button
              type="button"
              class="btn-close"
              @click="notificationStore.isOpen = false"
            ></button>
          </div>
          <div class="modal-body">
            <div class="notification-center-toolbar">
              <label class="form-check-label notification-limit-toggle">
                <input
                  class="form-check-input"
                  type="checkbox"
                  :checked="notificationStore.keepLast100"
                  @change="onToggleKeepLast100"
                />
                Keep only the last 100 notifications
              </label>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                @click="notificationStore.clear()"
              >
                Clear
              </button>
            </div>
            <div class="notification-list">
              <div
                v-for="entry in orderedEntries"
                :key="entry.id"
                class="notification-entry"
                :class="`notification-entry_${entry.level}`"
              >
                <div class="notification-entry-header">
                  <span class="notification-level">{{ formatLevel(entry.level) }}</span>
                  <span class="notification-time">{{ formatTimestamp(entry.createdAt) }}</span>
                </div>
                <div class="notification-message">{{ entry.message }}</div>
              </div>
              <div
                v-if="orderedEntries.length === 0"
                class="notification-empty-state"
              >
                No notifications yet
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click="notificationStore.isOpen = false"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  useNotificationCenterStore,
  type NotificationLevel,
} from "@/app/stores/notificationCenterStore";

const notificationStore = useNotificationCenterStore();

const orderedEntries = computed(() =>
  notificationStore.entries.slice().reverse()
);

const onToggleKeepLast100 = (event: Event) => {
  notificationStore.setKeepLast100(
    (event.target as HTMLInputElement).checked
  );
};

const formatTimestamp = (createdAt: number): string =>
  new Date(createdAt).toLocaleString();

const formatLevel = (level: NotificationLevel): string => {
  switch (level) {
    case "error":
      return "Error";
    case "warning":
      return "Warning";
    case "success":
      return "Success";
    case "info":
      return "Info";
    default:
      return "Message";
  }
};
</script>

<style scoped>
.notification-center-backdrop {
  z-index: 2050;
}

.notification-center-modal {
  z-index: 2060;
}

.modal-content {
  color: var(--hict-surface-fg);
}

.notification-center-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.notification-limit-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-list {
  max-height: min(70vh, 720px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification-entry {
  border-left: 5px solid transparent;
  border-radius: 8px;
  padding: 10px 12px;
  background: #f8f9fa;
  color: rgba(18, 25, 35, 0.95);
}

.notification-entry_error {
  border-left-color: #dc3545;
  background: #fff5f5;
}

.notification-entry_warning {
  border-left-color: #fd7e14;
  background: #fff7ed;
}

.notification-entry_success {
  border-left-color: #198754;
  background: #f0fff4;
}

.notification-entry_info,
.notification-entry_message {
  border-left-color: #0d6efd;
  background: #f4f8ff;
}

.notification-entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.notification-level {
  font-weight: 700;
  color: inherit;
}

.notification-time {
  color: #6c757d;
  font-size: 12px;
}

.notification-message {
  white-space: pre-wrap;
  word-break: break-word;
  color: inherit;
}

.notification-empty-state {
  color: #6c757d;
  padding: 12px 4px;
}
</style>
