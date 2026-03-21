<!--
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 -->

<template>
  <div
    class="modal fade in"
    id="loadAGPModal"
    ref="loadAGPModal"
    tabindex="-1"
    data-keyboard="false"
    data-backdrop="static"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Select AGP file</h5>
          <button
            type="button"
            class="btn-close"
            @click="onDismissClicked"
          ></button>
        </div>
        <div class="modal-body">
          <div class="d-flex align-items-center" v-if="errorMessage">
            Error: {{ errorMessage }}
          </div>
          <div class="d-flex align-items-center" v-if="loading">
            <strong>Loading...</strong>
            <div class="spinner-border ms-auto" role="status"></div>
          </div>
          <div>
            <select
              class="form-select form-select-lg mb-3"
              v-model="selectedAGPFilename"
            >
              <option selected>Select AGP file from the list below...</option>
              <option
                v-for="(filename, idx) in filenames"
                :key="idx"
                :value="filename"
              >
                {{ filename }}
              </option>
            </select>
            <div class="card flex justify-content-center" v-if="primeVueTree">
              <Tree
                :filter="true"
                filterMode="lenient"
                :value="[primeVueTree]"
                selectionMode="single"
                class="w-full md:w-60rem limited-height"
                @nodeSelect="onNodeSelect"
                @nodeUnselect="onNodeUnselect"
                :loading="loading"
                :expanded-keys="expandedKeys"
              ></Tree>
            </div>
          </div>
          <div class="modal-footer">
            <div class="row w-100 m-0 p-0">
              <div class="col-md-auto">
                <div class="input-group">
                  <button
                    class="btn btn-outline-success"
                    type="button"
                    @click="expandAll"
                  >
                    Expand
                  </button>
                  <button
                    class="btn btn-outline-danger"
                    type="button"
                    @click="collapseAll"
                  >
                    Collapse
                  </button>
                </div>
              </div>
              <div class="col-md-auto">
                <button
                  type="button"
                  class="btn btn-secondary"
                  @click="onDismissClicked"
                >
                  Dismiss
                </button>
              </div>
              <div class="col-md-auto">
                <button
                  type="button"
                  class="btn btn-primary"
                  @click="onSelectClicked"
                >
                  Load AGP
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type Ref, ref, onMounted } from "vue";
import { Modal } from "bootstrap";
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import { LoadAGPRequest } from "@/app/core/net/api/request";
import path from "path-browserify";
import { FileTreeNode, extensionToDataType } from "../ComponentCommon";
import Tree from "primevue/tree";

interface FinalTreeNode {
  isLeaf: boolean;
  originalPath: string;
}

interface RecursiveStringRecord {
  [index: string]: RecursiveStringRecord | FinalTreeNode;
}

const emit = defineEmits<{
  (e: "selected", agpFilename: string): void;
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
}>();

const selectedAGPFilename: Ref<string | null> = ref(null);
const filenames: Ref<string[] | null> = ref(null);
const loading: Ref<boolean> = ref(true);
const errorMessage: Ref<unknown | null> = ref(null);
const modal: Ref<Modal | null> = ref(null);

const fileTree: Ref<FileTreeNode | null> = ref(null);

const loadAGPModal = ref<HTMLElement | null>(null);

const expandedKeys: Ref<Record<string, boolean>> = ref({});

function recursiveRecordToFileTree(
  r: RecursiveStringRecord | FinalTreeNode,
  parentName: string | undefined,
  parentPath: string | undefined
): FileTreeNode {
  const pName = parentName ?? "DATA";
  const pPath = (parentPath ?? "") + pName + "/";
  if (r) {
    if ("isLeaf" in r) {
      const ftn = r as unknown as FinalTreeNode;
      if (ftn && ftn.isLeaf === true) {
        const originalPath = path.parse(ftn.originalPath);
        console.log("Original path: ", originalPath);
        console.log("Original path Format: ", path.format(originalPath));
        return {
          nodeName: originalPath.name,
          dataType: extensionToDataType(originalPath.ext),
          nodeType: "file",
          children: [],
          nodePath: path.format(originalPath),
        };
      }
    }
    return {
      nodeName: pName,
      dataType: undefined,
      nodeType: "directory",
      children: Object.entries(r).map(([key, value]) =>
        recursiveRecordToFileTree(value, key, pPath)
      ),
      nodePath: pPath,
    };
  }
  return {
    nodeName: "EMPTY",
    dataType: undefined,
    nodeType: "directory",
    children: [],
    nodePath: pPath,
  };
}

function getIconForNode(node: FileTreeNode): string {
  switch (node.nodeType) {
    case "file":
      switch (node.dataType) {
        case "hict":
          return "pi pi-fw pi-map";
        case "agp":
          return "pi pi-fw pi-sitemap";
        case "fasta":
          return "pi pi-fw pi-language";
        case "experiment":
          return "bi bi-eyedropper";
        default:
          return "pi pi-fw pi-question";
      }
    case "directory":
      return "pi pi-fw pi-folder-open";
    default:
      return "pi pi-fw pi-question-circle";
  }
}

interface PrimeVueFileTreeNode {
  key: string;
  label: string;
  data: unknown;
  icon: string;
  children: PrimeVueFileTreeNode[];
}

function fileTreeToPrimeVueTree(t: FileTreeNode): PrimeVueFileTreeNode {
  return {
    key: t.nodePath,
    data: t,
    label: t.nodeName,
    icon: getIconForNode(t),
    children: t.children.map(fileTreeToPrimeVueTree),
  } as PrimeVueFileTreeNode;
}

const primeVueTree: Ref<PrimeVueFileTreeNode | null> = ref(null);

function getAGPFilenamesList(): void {
  props.networkManager.requestManager
    .listAGPFiles()
    .then((lst) => {
      filenames.value = lst;
      loading.value = false;
      const np = lst.map((s) =>
        path.normalize(s).replaceAll("\\", "/").replaceAll(path.sep, "/")
      );
      const tree: RecursiveStringRecord = {};
      np.forEach((p) => {
        const parts = p.split("/");

        /*
        const preparedHierarchy = parts
          .slice(parts.length - 1, 1)
          .reduce((acc, path_part) => {
            acc[path_part] =
              acc[path_part] ||
              ({
                //isLeaf: true, originalPath: p
              } as FinalTreeNode);
            console.log("acc is", acc, "path_part is", path_part);
            return acc[path_part] as RecursiveStringRecord;
          }, tree);
        */

        let preparedHierarchy = tree;

        parts.slice(0, parts.length - 1).forEach((p) => {
          if (p in preparedHierarchy) {
            const nextNode = preparedHierarchy[p];
            if (!nextNode || "isLeaf" in nextNode) {
              throw new Error(
                `Unexpected hierarchy: ${p} is an existing Leaf in ${preparedHierarchy} but expected to be a Node`
              );
            }
            preparedHierarchy = nextNode;
          } else {
            preparedHierarchy[p] = {};
            preparedHierarchy = preparedHierarchy[p] as RecursiveStringRecord;
          }
        });

        console.log("parts", parts, "preparedHierarchy", preparedHierarchy);

        preparedHierarchy[parts[parts.length - 1]] = {
          isLeaf: true,
          originalPath: p,
        } as FinalTreeNode;
      });
      const ft = recursiveRecordToFileTree(tree, undefined, undefined);
      fileTree.value = ft;
      const pvt = fileTreeToPrimeVueTree(ft);
      primeVueTree.value = pvt;
      console.log("Path separator:", path.sep);
      console.log("Raw:");
      console.log(lst);
      console.log("Normalized:");
      console.log(np);
      console.log("Tree:");
      console.log(tree);
      console.log("FileTree:");
      console.log(ft);
      console.log("PrimeVueFileTree:");
      console.log(pvt);
    })
    .catch((e) => {
      errorMessage.value = e;
      loading.value = false;
    });
}

function resetState(): void {
  try {
    modal.value?.dispose();
  } catch (e: unknown) {
    // Expected
  } finally {
    modal.value = null;
    errorMessage.value = null;
    loading.value = false;
    filenames.value = null;
    selectedAGPFilename.value = null;
  }
}

function onDismissClicked(): void {
  resetState();
  emit("dismissed");
}

function onSelectClicked(): void {
  const selectedAGPFilenameString = selectedAGPFilename.value;
  if (!selectedAGPFilenameString) {
    //onDismissClicked();
    // throw new Error("Selected AGP filename was null?");
    errorMessage.value = "Please, select AGP file";
    return;
  }
  props.networkManager.requestManager
    .loadAGP(new LoadAGPRequest({ agpFilename: selectedAGPFilenameString }))
    .then(() => {
      emit("selected", selectedAGPFilenameString);
      resetState();
    })
    .catch((e) => {
      errorMessage.value = e;
    });
}

onMounted(() => {
  const fns = filenames.value;
  if (fns) {
    fns.length = 0;
  }
  loading.value = true;
  modal.value = new Modal(loadAGPModal.value ?? "loadAGPModal", {
    backdrop: "static",
    keyboard: false,
  });
  modal.value.show();
  getAGPFilenamesList();
});

function onNodeSelect(evt: unknown) {
  console.log(evt);
}

function onNodeUnselect(evt: unknown) {
  console.log(evt);
}

function expandAll() {
  const ptv = primeVueTree.value;
  if (ptv) {
    expandNode(ptv);
    expandedKeys.value = { ...expandedKeys.value };
  }
}

function collapseAll() {
  expandedKeys.value = {};
}

function expandNode(node: PrimeVueFileTreeNode) {
  if (node.children && node.children.length) {
    expandedKeys.value[node.key] = true;

    for (const child of node.children) {
      expandNode(child);
    }
  }
}
</script>

<style scoped>
.limited-height {
  max-height: 50vh;
  overflow-y: scroll;
}
</style>
