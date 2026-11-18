<template>
  <input
    ref="input"
    :value="draft"
    @input="onInput"
    @focus="editing = true"
    @blur="onBlur"
    @change="commitDraft"
  />
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

// A server refresh must not replace an uncommitted name or number under the cursor.
const props = defineProps<{
  modelValue: string | number;
  commit: (value: string) => Promise<void>;
}>();
const input = ref<HTMLInputElement | null>(null);
const draft = ref(String(props.modelValue));
let editing = false;
let pending = 0;
let revision = 0;
watch(
  () => props.modelValue,
  (value) => {
    if (!editing && pending === 0) draft.value = String(value);
  }
);
function onInput(event: Event): void {
  draft.value = (event.target as HTMLInputElement).value;
  revision++;
}
function onBlur(): void {
  editing = false;
  if (pending === 0) draft.value = String(props.modelValue);
}
async function commitDraft(): Promise<void> {
  const captured = revision;
  const value = draft.value;
  pending++;
  try {
    await props.commit(value);
  } finally {
    pending--;
    await nextTick();
    // A later edit belongs to the user, even if this request finishes afterwards.
    if (revision === captured && !editing && pending === 0)
      draft.value = String(props.modelValue);
  }
}
</script>
