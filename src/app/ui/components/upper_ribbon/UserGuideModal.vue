<template>
  <div class="settings-backdrop" @click.self="emit('dismissed')">
    <section
      ref="dialog"
      class="settings-modal guide-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-guide-title"
    >
      <header class="settings-header">
        <h2 id="user-guide-title">User guide and shortcuts</h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close dialog"
          @click="emit('dismissed')"
        />
      </header>
      <div class="guide-content settings-body">
        <p v-if="loading" role="status">Loading guide…</p>
        <p v-else-if="!documentHtml" role="status">
          The guide is unavailable. Reopen it to try again.
        </p>
        <!-- The renderer accepts Markdown from bundled docs and discards raw HTML. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <article v-else v-html="documentHtml"></article>
      </div>
      <footer class="settings-footer">
        <button
          type="button"
          class="btn btn-primary"
          @click="emit('dismissed')"
        >
          Close
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { marked, Renderer } from "marked";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { useModalFocus } from "@/app/ui/modalFocus";

const emit = defineEmits<{ (event: "dismissed"): void }>();
const dialog = ref<HTMLElement | null>(null);
const loading = ref(true);
const documentHtml = ref("");
const abort = new AbortController();

useModalFocus(dialog, () => true);
useEscDismissableDialog({
  priority: 1041,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});

onMounted(async () => {
  const url = new URL("./docs/user-guide.md", document.baseURI);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (
      !response.ok ||
      response.headers.get("Content-Type")?.includes("text/html")
    )
      return;
    const renderer = new Renderer();
    renderer.html = () => "";
    renderer.image = () => "";
    const originalLink = renderer.link.bind(renderer);
    renderer.link = (href, title, text) => {
      if (!href) return text;
      const destination = new URL(href, url);
      if (destination.protocol !== "http:" && destination.protocol !== "https:")
        return text;
      return originalLink(destination.href, title, text);
    };
    documentHtml.value = marked.parse(await response.text(), {
      async: false,
      renderer,
      mangle: false,
    }) as string;
  } catch {
    // The dialog provides a readable status and can be reopened to retry.
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => abort.abort());
</script>

<style scoped>
.settings-backdrop {
  position: fixed;
  z-index: 1045;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(15, 23, 38, 0.42);
}
.guide-modal {
  display: flex;
  flex-direction: column;
  width: min(820px, 100%);
  max-height: min(780px, 92vh);
  background: white;
  border-radius: 12px;
  box-shadow: var(--hict-surface-shadow);
}
.settings-header,
.settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
}
.settings-header {
  border-bottom: 1px solid #eaecf0;
}
.settings-header h2 {
  margin: 0;
  font-size: 1.15rem;
}
.settings-footer {
  justify-content: flex-end;
  border-top: 1px solid #eaecf0;
}
.guide-content {
  overflow: auto;
  padding: 16px 24px;
}
.guide-content :deep(h1) {
  font-size: 1.4rem;
}
.guide-content :deep(h2) {
  font-size: 1.18rem;
  margin-top: 1rem;
}
.guide-content :deep(table) {
  margin-bottom: 1rem;
}
.guide-content :deep(th),
.guide-content :deep(td) {
  border: 1px solid #d0d5dd;
  padding: 5px 10px;
}
</style>
