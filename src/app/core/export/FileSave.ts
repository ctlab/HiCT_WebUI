import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";

export type FileSaveKind =
  | "session"
  | "fasta"
  | "agp"
  | "figure"
  | "bookmarks"
  | "preset"
  | "pipeline"
  | "other";
export type FileSaveResult =
  | { status: "cancelled" }
  | { status: "download-started"; filename: string }
  | {
      status: "saved";
      filename: string;
      path?: string;
      readFile?: () => Promise<File>;
    };
export interface FileSaveDestination {
  write(blob: Blob): Promise<FileSaveResult>;
  /** Native adapters may transfer the guarded request without sending file bytes through IPC. */
  writeRequest?(
    request: CoordinateDownloadRequest,
    signal?: AbortSignal
  ): Promise<FileSaveResult>;
  /** Present when this destination can consume bytes with bounded buffering. */
  writeStream?(
    stream: ReadableStream<Uint8Array>,
    signal?: AbortSignal
  ): Promise<FileSaveResult>;
}
export interface CoordinateDownloadRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}
interface BrowserFileHandle {
  name: string;
  createWritable(): Promise<{
    write(blob: Blob | Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort?(): Promise<void>;
  }>;
  getFile(): Promise<File>;
}
const lastHandles = new Map<FileSaveKind, BrowserFileHandle>();
export const cancelledFileSave: FileSaveResult = { status: "cancelled" };
export function sanitizeSaveFilename(filename: string): string {
  // eslint-disable-next-line no-control-regex
  return (
    filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() ||
    "hict-export.bin"
  );
}
function basename(path: string) {
  return path.split(/[\\/]/).at(-1) || path;
}

/** Call directly from the click handler, before preparing data, to retain browser activation. */
export async function prepareFileSave(
  filename: string,
  kind: FileSaveKind
): Promise<FileSaveDestination | undefined> {
  const name = sanitizeSaveFilename(filename);
  const browser = window as unknown as {
    hictDesktop?: {
      saveExport?: (payload: {
        filename: string;
        kind: FileSaveKind;
        bytes: Uint8Array;
      }) => Promise<{ saved: boolean; path?: string }>;
      saveCoordinateExport?: (payload: {
        filename: string;
        kind: FileSaveKind;
        operationId: string;
        request: CoordinateDownloadRequest;
      }) => Promise<{ saved: boolean; path?: string }>;
      cancelCoordinateExport?: (operationId: string) => Promise<void>;
    };
    __TAURI__?: {
      core?: {
        invoke?: (
          command: string,
          args: Record<string, unknown>
        ) => Promise<unknown>;
      };
      invoke?: (
        command: string,
        args: Record<string, unknown>
      ) => Promise<unknown>;
    };
    showSaveFilePicker?: (options: object) => Promise<BrowserFileHandle>;
  };
  const remember = (path: string) =>
    useUiSettingsStore().rememberSavedFile(kind, path);
  if (typeof browser.hictDesktop?.saveExport === "function") {
    const save = browser.hictDesktop.saveExport.bind(browser.hictDesktop);
    return {
      ...(browser.hictDesktop.saveCoordinateExport &&
      browser.hictDesktop.cancelCoordinateExport
        ? {
            async writeRequest(
              request: CoordinateDownloadRequest,
              signal?: AbortSignal
            ): Promise<FileSaveResult> {
              signal?.throwIfAborted();
              // getRandomValues is also available on trusted HTTP LAN origins.
              const operationId = Array.from(
                window.crypto.getRandomValues(new Uint8Array(16)),
                (value) => value.toString(16).padStart(2, "0")
              ).join("");
              const desktop = browser.hictDesktop!;
              const cancel = () => {
                void desktop.cancelCoordinateExport!(operationId).catch(
                  () => {}
                );
              };
              signal?.addEventListener("abort", cancel, { once: true });
              try {
                const result = await desktop.saveCoordinateExport!({
                  filename: name,
                  kind,
                  operationId,
                  request,
                });
                if (result?.saved === false) return cancelledFileSave;
                if (result?.saved !== true || !result.path)
                  throw Error(
                    "The desktop did not confirm that the file was saved."
                  );
                remember(result.path);
                return {
                  status: "saved",
                  filename: basename(result.path),
                  path: result.path,
                };
              } finally {
                signal?.removeEventListener("abort", cancel);
              }
            },
          }
        : {}),
      async write(blob) {
        const result = await save({
          filename: name,
          kind,
          bytes: new Uint8Array(await blob.arrayBuffer()),
        });
        if (result?.saved === false) return cancelledFileSave;
        if (result?.saved !== true)
          throw Error("The desktop did not confirm that the file was saved.");
        const savedName = result.path ? basename(result.path) : name;
        remember(result.path ?? savedName);
        return {
          status: "saved",
          filename: savedName,
          path: result.path,
          readFile: async () =>
            new File([blob], savedName, { type: blob.type }),
        };
      },
    };
  }
  const invoke = browser.__TAURI__?.core?.invoke ?? browser.__TAURI__?.invoke;
  if (typeof invoke === "function")
    return {
      async write(blob) {
        const result = await invoke("save_export", {
          filename: name,
          kind,
          bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
        });
        if (result === null) return cancelledFileSave;
        if (typeof result !== "string" || !result)
          throw Error("The desktop did not confirm that the file was saved.");
        const savedName = basename(result);
        remember(result);
        return {
          status: "saved",
          filename: savedName,
          path: result,
          readFile: async () =>
            new File([blob], savedName, { type: blob.type }),
        };
      },
    };
  if (typeof browser.showSaveFilePicker === "function") {
    let handle: BrowserFileHandle;
    try {
      handle = await browser.showSaveFilePicker({
        id: `hict-${kind}`,
        suggestedName: name,
        ...(lastHandles.has(kind) ? { startIn: lastHandles.get(kind) } : {}),
      });
    } catch (failure) {
      if ((failure as { name?: string })?.name === "AbortError")
        return undefined;
      throw failure; // A denied or failed picker must never silently download instead.
    }
    const saved = (): FileSaveResult => {
      lastHandles.set(kind, handle);
      remember(handle.name);
      return {
        status: "saved",
        filename: handle.name,
        readFile: () => handle.getFile(),
      };
    };
    return {
      async write(blob) {
        const writer = await handle.createWritable();
        try {
          await writer.write(blob);
          await writer.close();
        } catch (failure) {
          try {
            await writer.abort?.();
          } catch {
            /* Preserve the write error. */
          }
          throw failure;
        }
        return saved();
      },
      async writeStream(stream, signal) {
        const reader = stream.getReader();
        const abort = () => {
          void reader.cancel(signal?.reason).catch(() => {});
        };
        signal?.addEventListener("abort", abort, { once: true });
        let writer:
          | Awaited<ReturnType<BrowserFileHandle["createWritable"]>>
          | undefined;
        try {
          signal?.throwIfAborted();
          writer = await handle.createWritable();
          while (true) {
            signal?.throwIfAborted();
            const { done, value } = await reader.read();
            signal?.throwIfAborted();
            if (done) break;
            // Await each disk write before pulling another network chunk.
            await writer.write(value);
          }
          signal?.throwIfAborted();
          await writer.close();
          return saved();
        } catch (failure) {
          await reader.cancel(failure).catch(() => {});
          await writer?.abort?.().catch(() => {});
          throw failure;
        } finally {
          signal?.removeEventListener("abort", abort);
          reader.releaseLock();
        }
      },
    };
  }
  return {
    async write(blob) {
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = name;
        anchor.click();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      return { status: "download-started", filename: name };
    },
  };
}

export async function saveFileBlob(
  blob: Blob,
  filename: string,
  kind: FileSaveKind
): Promise<FileSaveResult> {
  const destination = await prepareFileSave(filename, kind);
  return destination ? destination.write(blob) : cancelledFileSave;
}

export function canPickLocalFile(): boolean {
  const browser = window as unknown as {
    showOpenFilePicker?: unknown;
    hictDesktop?: unknown;
    __TAURI__?: unknown;
  };
  return (
    !browser.hictDesktop &&
    !browser.__TAURI__ &&
    typeof browser.showOpenFilePicker === "function"
  );
}
export const canPickSessionFile = canPickLocalFile;
export async function pickSessionFile(): Promise<File | undefined> {
  const browser = window as unknown as {
    showOpenFilePicker: (options: object) => Promise<BrowserFileHandle[]>;
  };
  try {
    const [handle] = await browser.showOpenFilePicker({
      id: "hict-session",
      multiple: false,
      types: [
        {
          description: "HiCT session",
          accept: { "application/json": [".json"] },
        },
      ],
      ...(lastHandles.has("session")
        ? { startIn: lastHandles.get("session") }
        : {}),
    });
    return handle?.getFile();
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") return undefined;
    throw error;
  }
}

/** Uses the figure destination handle as the starting folder when the browser supports it. */
export async function pickFigureFile(): Promise<File | undefined> {
  const browser = window as unknown as {
    showOpenFilePicker: (options: object) => Promise<BrowserFileHandle[]>;
  };
  try {
    const [handle] = await browser.showOpenFilePicker({
      id: "hict-figure",
      multiple: false,
      types: [
        {
          description: "Exported figure",
          accept: { "image/png": [".png"], "image/svg+xml": [".svg"] },
        },
      ],
      ...(lastHandles.has("figure")
        ? { startIn: lastHandles.get("figure") }
        : {}),
    });
    if (!handle) return undefined;
    const file = await handle.getFile();
    lastHandles.set("figure", handle);
    return file;
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") return undefined;
    throw error;
  }
}
