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

import { contextBridge, ipcRenderer } from "electron";

async function invokeExport(channel: string, payload: unknown) {
  try {
    return await ipcRenderer.invoke(channel, payload);
  } catch (failure) {
    const detail = (failure as { message?: unknown })?.message;
    const message = typeof detail === "string" ? detail : String(failure);
    throw new Error(
      message.replace(
        /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
        ""
      )
    );
  }
}

contextBridge.exposeInMainWorld("hictDesktop", {
  platform: "electron",
  electron: process.versions.electron,
  chromium: process.versions.chrome,
  quit: () => ipcRenderer.invoke("hict:quit"),
  saveExport: (payload: {
    filename: string;
    kind?: string;
    bytes: number[] | Uint8Array;
  }) => invokeExport("hict:save-export", payload),
  saveCoordinateExport: (payload: unknown) =>
    invokeExport("hict:save-coordinate-export", payload),
  cancelCoordinateExport: (operationId: string) =>
    ipcRenderer.invoke("hict:cancel-coordinate-export", operationId),
});
