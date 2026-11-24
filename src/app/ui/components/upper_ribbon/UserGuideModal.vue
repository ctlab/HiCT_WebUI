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
      <div v-if="loading || !documentHtml" class="guide-content settings-body">
        <p v-if="loading" role="status">Loading guide…</p>
        <p v-else role="status">
          The guide is unavailable. Reopen it to try again.
        </p>
      </div>
      <div v-else class="guide-reading-layout">
        <nav v-if="sections.length" class="guide-sections" aria-label="Guide sections">
          <a
            v-for="section in sections"
            :key="section.id"
            :href="`#${section.id}`"
            :aria-current="activeSection === section.id ? 'location' : undefined"
            @click.prevent="showSection(section.id)"
            >{{ section.title }}</a
          >
        </nav>
        <!-- The renderer accepts Markdown from bundled docs and discards raw HTML. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <article ref="article" class="guide-content" v-html="documentHtml"></article>
      </div>
      <footer class="settings-footer">
        <a v-if="guidePageUrl" :href="guidePageUrl" target="_blank" rel="noopener">
          Open in a new tab
        </a>
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
const article = ref<HTMLElement | null>(null);
const sections = ref<{ id: string; title: string }[]>([]);
const activeSection = ref("");
const guidePageUrl = ref("");
const abort = new AbortController();

useModalFocus(dialog, () => true);
useEscDismissableDialog({
  priority: 1041,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});

function showSection(id: string): void {
  const target = article.value?.querySelector<HTMLElement>(`#${id}`);
  if (!target) return;
  activeSection.value = id;
  target.scrollIntoView({ block: "start" });
  target.focus({ preventScroll: true });
}

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
    const markdown = await response.text();
    if (abort.signal.aborted) return;
    const rendered = marked.parse(markdown, {
      async: false,
      renderer,
      mangle: false,
    }) as string;
    const { body } = new DOMParser().parseFromString(rendered, "text/html");
    sections.value = Array.from(body.querySelectorAll("h2"), (heading, index) => {
      heading.id = `hict-guide-section-${index + 1}`;
      heading.tabIndex = -1;
      return { id: heading.id, title: heading.textContent ?? "" };
    });
    activeSection.value = sections.value[0]?.id ?? "";
    const html = body.innerHTML;
    documentHtml.value = html;
    guidePageUrl.value = URL.createObjectURL(new Blob([
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>HiCT user guide</title><style>',
      'body{font:1rem/1.6 system-ui;margin:2rem auto;max-width:50rem;padding:0 1rem}',
      'td,th{padding:.3rem .65rem;border:1px solid #d0d5dd}table{border-collapse:collapse}',
      '</style></head><body><main>',
      html,
      '</main></body></html>',
    ], { type: "text/html" }));
  } catch {
    // The dialog provides a readable status and can be reopened to retry.
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  abort.abort();
  if (guidePageUrl.value) URL.revokeObjectURL(guidePageUrl.value);
});
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
  justify-content: space-between;
  border-top: 1px solid #eaecf0;
}
.settings-footer button {
  margin-left: auto;
}
.guide-reading-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(9rem, 29%) minmax(0, 1fr);
}
.guide-sections {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
  padding: 16px 8px 16px 16px;
  border-right: 1px solid #eaecf0;
}
.guide-sections a {
  padding: 4px 8px;
  color: var(--hict-ui-fg);
  text-decoration: none;
  border-radius: var(--hict-radius-sm);
}
.guide-sections a:hover,
.guide-sections a[aria-current] {
  background: var(--hict-primary-soft);
  color: var(--hict-primary);
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
@media (max-width: 575.98px) {
  .guide-reading-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }
  .guide-sections {
    flex-direction: row;
    padding: 8px 16px;
    border-right: 0;
    border-bottom: 1px solid #eaecf0;
  }
  .guide-sections a {
    white-space: nowrap;
  }
}
</style>
