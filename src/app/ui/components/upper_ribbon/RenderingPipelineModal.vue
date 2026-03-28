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
  <div class="pipeline-root">
    <div class="modal-backdrop fade show"></div>
    <div class="modal fade show" tabindex="-1" style="display: block" role="dialog">
      <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Rendering Pipeline</h5>
            <button type="button" class="btn-close" @click="emit('dismissed')"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-warning py-2">
              Normalization dropdown updates this pipeline, but pipeline edits are not fully back-synced to checkbox controls.
            </div>
            <div class="d-flex gap-3 align-items-center mb-3">
              <div class="form-check">
                <input id="pipeline-enabled" v-model="enabled" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="pipeline-enabled">Enable custom pipeline</label>
              </div>
              <div class="form-check">
                <input id="pipeline-swap" v-model="swapUpperLower" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="pipeline-swap">Swap upper/lower diagonal branches</label>
              </div>
              <button class="btn btn-sm btn-outline-secondary ms-auto" :disabled="loading || saving" @click="loadConfig">
                Reload
              </button>
            </div>

            <div class="pipeline-graph card mb-3">
              <div class="card-body p-2">
                <svg class="pipeline-svg" viewBox="0 0 980 220" preserveAspectRatio="none">
                  <line x1="170" y1="52" x2="355" y2="52" class="edge"></line>
                  <line x1="170" y1="168" x2="355" y2="168" class="edge"></line>
                  <line x1="585" y1="52" x2="770" y2="110" class="edge"></line>
                  <line x1="585" y1="168" x2="770" y2="110" class="edge"></line>
                </svg>
                <div class="node source-node top">Data Source: Primary (.hict.hdf5)</div>
                <div class="node source-node bottom">Data Source: Secondary (reserved)</div>
                <div class="node branch-node top">Upper Branch: {{ summarizeBranch(upperBranch) }}</div>
                <div class="node branch-node bottom">Lower Branch: {{ summarizeBranch(lowerBranch) }}</div>
                <div class="node sink-node">Render Sink</div>
              </div>
            </div>

            <div v-if="loading" class="py-3">
              <span class="spinner-border spinner-border-sm me-2"></span>
              Loading pipeline configuration…
            </div>
            <div v-else class="row g-3">
              <div class="col-12 col-lg-6">
                <div class="card h-100">
                  <div class="card-header fw-bold">Upper branch</div>
                  <div class="card-body">
                    <BranchEditor v-model="upperBranch" />
                  </div>
                </div>
              </div>
              <div class="col-12 col-lg-6">
                <div class="card h-100">
                  <div class="card-header fw-bold">Lower branch</div>
                  <div class="card-body">
                    <BranchEditor v-model="lowerBranch" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-danger me-auto" :disabled="saving" @click="resetConfig">
              Reset
            </button>
            <button class="btn btn-secondary" @click="emit('dismissed')">Close</button>
            <button class="btn btn-primary" :disabled="loading || saving" @click="saveConfig">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { computed, defineComponent, h, onMounted, ref, watch } from "vue";
import { toast } from "vue-sonner";

type SourceName = "PRIMARY" | "SECONDARY";
type UnaryOp = "ABS" | "LOG1P" | "EXP" | "NEG";
type BinaryOp = "ADD" | "SUB" | "MUL" | "DIV" | "MAX" | "MIN";
type DynamicField =
  | "ROW_BP"
  | "COL_BP"
  | "ROW_BIN"
  | "COL_BIN"
  | "ROW_PX"
  | "COL_PX"
  | "ROW_WEIGHT"
  | "COL_WEIGHT"
  | "DIAG_BP_DISTANCE"
  | "DIAG_BIN_DISTANCE"
  | "DIAG_PX_DISTANCE"
  | "BP_RESOLUTION";

type OperandSpec =
  | { kind: "SOURCE"; source: SourceName }
  | { kind: "CONSTANT"; value: number }
  | { kind: "DYNAMIC"; field: DynamicField };

type BranchSpec = {
  mode: "SOURCE" | "UNARY" | "BINARY";
  source: SourceName;
  unaryOp: UnaryOp;
  unaryInput: OperandSpec;
  binaryOp: BinaryOp;
  left: OperandSpec;
  right: OperandSpec;
};

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const enabled = ref(false);
const swapUpperLower = ref(false);
const loading = ref(false);
const saving = ref(false);

const defaultOperand = (): OperandSpec => ({ kind: "SOURCE", source: "PRIMARY" });
const defaultBranch = (): BranchSpec => ({
  mode: "SOURCE",
  source: "PRIMARY",
  unaryOp: "ABS",
  unaryInput: defaultOperand(),
  binaryOp: "MUL",
  left: defaultOperand(),
  right: { kind: "CONSTANT", value: 1.0 },
});

const upperBranch = ref<BranchSpec>(defaultBranch());
const lowerBranch = ref<BranchSpec>(defaultBranch());

const ensureMapManager = (): ContactMapManager => {
  if (!props.mapManager) {
    throw new Error("Map manager is unavailable");
  }
  return props.mapManager;
};

const summarizeOperand = (operand: OperandSpec): string => {
  if (operand.kind === "SOURCE") {
    return operand.source === "PRIMARY" ? "source(primary)" : "source(secondary)";
  }
  if (operand.kind === "CONSTANT") {
    return Number(operand.value).toString();
  }
  return operand.field;
};

const summarizeBranch = (branch: BranchSpec): string => {
  if (branch.mode === "SOURCE") {
    return summarizeOperand({ kind: "SOURCE", source: branch.source });
  }
  if (branch.mode === "UNARY") {
    return `${branch.unaryOp.toLowerCase()}(${summarizeOperand(branch.unaryInput)})`;
  }
  return `${branch.binaryOp.toLowerCase()}(${summarizeOperand(branch.left)}, ${summarizeOperand(branch.right)})`;
};

const operandToNode = (operand: OperandSpec): Record<string, unknown> => {
  if (operand.kind === "SOURCE") {
    return { type: "source", source: operand.source };
  }
  if (operand.kind === "CONSTANT") {
    return { type: "constant", value: Number.isFinite(operand.value) ? operand.value : 0 };
  }
  return { type: "dynamic", field: operand.field };
};

const branchToNode = (branch: BranchSpec): Record<string, unknown> => {
  if (branch.mode === "SOURCE") {
    return { type: "source", source: branch.source };
  }
  if (branch.mode === "UNARY") {
    return {
      type: "unary",
      op: branch.unaryOp,
      input: operandToNode(branch.unaryInput),
    };
  }
  return {
    type: "binary",
    op: branch.binaryOp,
    left: operandToNode(branch.left),
    right: operandToNode(branch.right),
  };
};

const parseOperand = (raw: unknown): OperandSpec => {
  const node = (raw ?? {}) as Record<string, unknown>;
  const type = String(node.type ?? "source").toUpperCase();
  if (type === "SOURCE") {
    const source = String(node.source ?? "PRIMARY").toUpperCase() === "SECONDARY" ? "SECONDARY" : "PRIMARY";
    return { kind: "SOURCE", source };
  }
  if (type === "CONSTANT") {
    const value = Number(node.value ?? 0);
    return { kind: "CONSTANT", value: Number.isFinite(value) ? value : 0 };
  }
  const dynamic = String(node.field ?? "ROW_BP").toUpperCase() as DynamicField;
  return { kind: "DYNAMIC", field: dynamic };
};

const parseBranch = (raw: unknown): BranchSpec => {
  const node = (raw ?? {}) as Record<string, unknown>;
  const type = String(node.type ?? "source").toUpperCase();
  if (type === "UNARY") {
    return {
      ...defaultBranch(),
      mode: "UNARY",
      unaryOp: (String(node.op ?? "ABS").toUpperCase() as UnaryOp) ?? "ABS",
      unaryInput: parseOperand(node.input),
    };
  }
  if (type === "BINARY") {
    return {
      ...defaultBranch(),
      mode: "BINARY",
      binaryOp: (String(node.op ?? "MUL").toUpperCase() as BinaryOp) ?? "MUL",
      left: parseOperand(node.left),
      right: parseOperand(node.right),
    };
  }
  return {
    ...defaultBranch(),
    mode: "SOURCE",
    source:
      String(node.source ?? "PRIMARY").toUpperCase() === "SECONDARY"
        ? "SECONDARY"
        : "PRIMARY",
  };
};

const loadConfig = async (): Promise<void> => {
  loading.value = true;
  try {
    const manager = ensureMapManager();
    const response = await manager.networkManager.requestManager.getRenderPipelineConfig();
    enabled.value = Boolean(response.enabled ?? false);
    swapUpperLower.value = Boolean(response.swapUpperLower ?? false);
    upperBranch.value = parseBranch(response.upperExpression ?? response.upper);
    lowerBranch.value = parseBranch(response.lowerExpression ?? response.lower);
  } catch (error) {
    toast.error(String(error));
  } finally {
    loading.value = false;
  }
};

const saveConfig = async (): Promise<void> => {
  saving.value = true;
  try {
    const manager = ensureMapManager();
    await manager.networkManager.requestManager.setRenderPipelineConfig({
      enabled: enabled.value,
      swapUpperLower: swapUpperLower.value,
      upperExpression: branchToNode(upperBranch.value),
      lowerExpression: branchToNode(lowerBranch.value),
    });
    await manager.reloadTilesFromBackend();
    toast.success("Rendering pipeline updated");
  } catch (error) {
    toast.error(String(error));
  } finally {
    saving.value = false;
  }
};

const resetConfig = async (): Promise<void> => {
  saving.value = true;
  try {
    const manager = ensureMapManager();
    const response = await manager.networkManager.requestManager.resetRenderPipelineConfig();
    enabled.value = Boolean(response.enabled ?? false);
    swapUpperLower.value = Boolean(response.swapUpperLower ?? false);
    upperBranch.value = parseBranch(response.upperExpression ?? response.upper);
    lowerBranch.value = parseBranch(response.lowerExpression ?? response.lower);
    await manager.reloadTilesFromBackend();
    toast.success("Rendering pipeline reset");
  } catch (error) {
    toast.error(String(error));
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  void loadConfig();
});

const operandOptions = computed(() => [
  { label: "Source: primary", value: "SOURCE_PRIMARY" },
  { label: "Source: secondary", value: "SOURCE_SECONDARY" },
  { label: "Constant", value: "CONSTANT" },
  { label: "Dynamic value", value: "DYNAMIC" },
]);

const dynamicFieldOptions: { label: string; value: DynamicField }[] = [
  { label: "row_bp", value: "ROW_BP" },
  { label: "col_bp", value: "COL_BP" },
  { label: "row_bin", value: "ROW_BIN" },
  { label: "col_bin", value: "COL_BIN" },
  { label: "row_px", value: "ROW_PX" },
  { label: "col_px", value: "COL_PX" },
  { label: "row_weight", value: "ROW_WEIGHT" },
  { label: "col_weight", value: "COL_WEIGHT" },
  { label: "diag_bp_distance", value: "DIAG_BP_DISTANCE" },
  { label: "diag_bin_distance", value: "DIAG_BIN_DISTANCE" },
  { label: "diag_px_distance", value: "DIAG_PX_DISTANCE" },
  { label: "bp_resolution", value: "BP_RESOLUTION" },
];

const coerceOperandKind = (operand: OperandSpec): string => {
  if (operand.kind === "SOURCE") {
    return operand.source === "SECONDARY" ? "SOURCE_SECONDARY" : "SOURCE_PRIMARY";
  }
  return operand.kind;
};

const applyOperandKind = (operand: OperandSpec, kind: string): OperandSpec => {
  if (kind === "SOURCE_SECONDARY") {
    return { kind: "SOURCE", source: "SECONDARY" };
  }
  if (kind === "SOURCE_PRIMARY") {
    return { kind: "SOURCE", source: "PRIMARY" };
  }
  if (kind === "CONSTANT") {
    return { kind: "CONSTANT", value: operand.kind === "CONSTANT" ? operand.value : 1.0 };
  }
  return {
    kind: "DYNAMIC",
    field: operand.kind === "DYNAMIC" ? operand.field : "DIAG_BP_DISTANCE",
  };
};

const BranchEditor = defineComponent({
  name: "BranchEditor",
  props: {
    modelValue: {
      type: Object as () => BranchSpec,
      required: true,
    },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const update = (patch: Partial<BranchSpec>) => {
      emit("update:modelValue", { ...props.modelValue, ...patch });
    };
    const updateOperand = (slot: "unaryInput" | "left" | "right", operand: OperandSpec) => {
      emit("update:modelValue", { ...props.modelValue, [slot]: operand });
    };
    const renderOperandEditor = (label: string, slot: "unaryInput" | "left" | "right") => {
      const operand = props.modelValue[slot];
      const operandKind = coerceOperandKind(operand);
      return h("div", { class: "mb-2" }, [
        h("label", { class: "form-label form-label-sm mb-1" }, label),
        h(
          "select",
          {
            class: "form-select form-select-sm mb-1",
            value: operandKind,
            onChange: (event: Event) => {
              const target = event.target as HTMLSelectElement;
              updateOperand(slot, applyOperandKind(operand, target.value));
            },
          },
          operandOptions.value.map((opt) =>
            h("option", { value: opt.value }, opt.label)
          )
        ),
        operand.kind === "CONSTANT"
          ? h("input", {
              class: "form-control form-control-sm",
              type: "number",
              value: Number.isFinite(operand.value) ? operand.value : 0,
              onInput: (event: Event) => {
                const target = event.target as HTMLInputElement;
                const value = Number(target.value);
                updateOperand(slot, {
                  kind: "CONSTANT",
                  value: Number.isFinite(value) ? value : 0,
                });
              },
            })
          : null,
        operand.kind === "DYNAMIC"
          ? h(
              "select",
              {
                class: "form-select form-select-sm",
                value: operand.field,
                onChange: (event: Event) => {
                  const target = event.target as HTMLSelectElement;
                  updateOperand(slot, {
                    kind: "DYNAMIC",
                    field: target.value as DynamicField,
                  });
                },
              },
              dynamicFieldOptions.map((opt) =>
                h("option", { value: opt.value }, opt.label)
              )
            )
          : null,
      ]);
    };
    return () =>
      h("div", {}, [
        h("div", { class: "mb-2" }, [
          h("label", { class: "form-label form-label-sm mb-1" }, "Branch mode"),
          h(
            "select",
            {
              class: "form-select form-select-sm",
              value: props.modelValue.mode,
              onChange: (event: Event) =>
                update({ mode: (event.target as HTMLSelectElement).value as BranchSpec["mode"] }),
            },
            [
              h("option", { value: "SOURCE" }, "Source"),
              h("option", { value: "UNARY" }, "Unary operation"),
              h("option", { value: "BINARY" }, "Binary operation"),
            ]
          ),
        ]),
        props.modelValue.mode === "SOURCE"
          ? h("div", { class: "mb-2" }, [
              h("label", { class: "form-label form-label-sm mb-1" }, "Source"),
              h(
                "select",
                {
                  class: "form-select form-select-sm",
                  value: props.modelValue.source,
                  onChange: (event: Event) =>
                    update({
                      source:
                        (event.target as HTMLSelectElement).value === "SECONDARY"
                          ? "SECONDARY"
                          : "PRIMARY",
                    }),
                },
                [
                  h("option", { value: "PRIMARY" }, "Primary"),
                  h("option", { value: "SECONDARY" }, "Secondary"),
                ]
              ),
            ])
          : null,
        props.modelValue.mode === "UNARY"
          ? h("div", {}, [
              h("div", { class: "mb-2" }, [
                h("label", { class: "form-label form-label-sm mb-1" }, "Unary operation"),
                h(
                  "select",
                  {
                    class: "form-select form-select-sm",
                    value: props.modelValue.unaryOp,
                    onChange: (event: Event) =>
                      update({
                        unaryOp: (event.target as HTMLSelectElement).value as UnaryOp,
                      }),
                  },
                  ["ABS", "LOG1P", "EXP", "NEG"].map((op) =>
                    h("option", { value: op }, op.toLowerCase())
                  )
                ),
              ]),
              renderOperandEditor("Input", "unaryInput"),
            ])
          : null,
        props.modelValue.mode === "BINARY"
          ? h("div", {}, [
              h("div", { class: "mb-2" }, [
                h("label", { class: "form-label form-label-sm mb-1" }, "Binary operation"),
                h(
                  "select",
                  {
                    class: "form-select form-select-sm",
                    value: props.modelValue.binaryOp,
                    onChange: (event: Event) =>
                      update({
                        binaryOp: (event.target as HTMLSelectElement).value as BinaryOp,
                      }),
                  },
                  ["ADD", "SUB", "MUL", "DIV", "MAX", "MIN"].map((op) =>
                    h("option", { value: op }, op.toLowerCase())
                  )
                ),
              ]),
              renderOperandEditor("Left operand", "left"),
              renderOperandEditor("Right operand", "right"),
            ])
          : null,
      ]);
  },
});
</script>

<style scoped>
.pipeline-root .modal {
  z-index: 1065;
}

.pipeline-graph {
  position: relative;
  min-height: 220px;
  overflow: hidden;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
}

.pipeline-svg {
  width: 100%;
  height: 220px;
}

.edge {
  stroke: rgba(59, 130, 246, 0.7);
  stroke-width: 2;
}

.node {
  position: absolute;
  border: 1px solid rgba(31, 41, 55, 0.25);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.93);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  white-space: nowrap;
}

.source-node.top {
  left: 18px;
  top: 22px;
}

.source-node.bottom {
  left: 18px;
  top: 138px;
}

.branch-node.top {
  left: 355px;
  top: 22px;
}

.branch-node.bottom {
  left: 355px;
  top: 138px;
}

.sink-node {
  right: 18px;
  top: 80px;
  background: rgba(236, 253, 245, 0.96);
}
</style>
