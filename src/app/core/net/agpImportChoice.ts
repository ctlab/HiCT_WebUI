import { shallowRef } from "vue";

export type MissingComponentsPolicy = "APPEND_UNPLACED" | "EXCLUDE" | "SCAFFOLDED_ONLY";
type ImportScope = { omittedPieces: number; omittedBp: number; unscaffoldedPieces?: number; unscaffoldedBp?: number };
export const agpImportChoice = shallowRef<ImportScope | null>(null);
let resolveChoice: ((value: MissingComponentsPolicy | null) => void) | undefined;

export function chooseMissingComponents(report: ImportScope): Promise<MissingComponentsPolicy | null> {
  if (resolveChoice) throw new Error("Another AGP import is awaiting a choice");
  agpImportChoice.value = report;
  return new Promise((resolve) => { resolveChoice = resolve; });
}
export function completeAgpImportChoice(value: MissingComponentsPolicy | null): void {
  const resolve = resolveChoice;
  resolveChoice = undefined;
  agpImportChoice.value = null;
  resolve?.(value);
}

export class AgpImportCancelledError extends Error {
  constructor() { super("AGP import cancelled; the assembly was not changed"); }
}
