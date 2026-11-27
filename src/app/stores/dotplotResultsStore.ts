import { defineStore } from "pinia";
import { ref, watch } from "vue";

const outlinesKey = "hict.ui.dotplot.outlines";

export const useDotplotResultsStore = defineStore("dotplotResults", () => {
  const dialogOpen = ref(false);
  const showOutlines = ref(localStorage.getItem(outlinesKey) !== "false");
  watch(showOutlines, (value) => localStorage.setItem(outlinesKey, String(value)));
  return { dialogOpen, showOutlines };
});
