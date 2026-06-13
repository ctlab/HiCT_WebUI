/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

import { onBeforeUnmount, onMounted } from "vue";

type EscDialogEntry = {
  priority: number;
  isOpen: () => boolean;
  requestClose: () => void;
  canClose?: () => boolean;
};

type RegisteredEscDialog = EscDialogEntry & {
  id: number;
};

const registeredDialogs: RegisteredEscDialog[] = [];
let nextDialogId = 0;

function registerEscDialog(entry: EscDialogEntry): () => void {
  const id = ++nextDialogId;
  registeredDialogs.push({
    id,
    ...entry,
  });
  return () => {
    const index = registeredDialogs.findIndex((dialog) => dialog.id === id);
    if (index >= 0) {
      registeredDialogs.splice(index, 1);
    }
  };
}

export function dismissTopmostEscDialog(): boolean {
  const activeDialogs = registeredDialogs.filter((dialog) => dialog.isOpen());
  if (activeDialogs.length === 0) {
    return false;
  }
  const topmostDialog = activeDialogs.reduce((best, candidate) => {
    if (candidate.priority !== best.priority) {
      return candidate.priority > best.priority ? candidate : best;
    }
    return candidate.id > best.id ? candidate : best;
  });
  if (topmostDialog.canClose && !topmostDialog.canClose()) {
    return true;
  }
  topmostDialog.requestClose();
  return true;
}

export function hasAnyOpenEscDialog(): boolean {
  return registeredDialogs.some((dialog) => dialog.isOpen());
}

export function useEscDismissableDialog(options: EscDialogEntry): void {
  let unregister: (() => void) | undefined;

  onMounted(() => {
    unregister = registerEscDialog(options);
  });

  onBeforeUnmount(() => {
    unregister?.();
    unregister = undefined;
  });
}
