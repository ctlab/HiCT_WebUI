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
type NativeFileInvoke = (
  command: string,
  args: Record<string, unknown> | Uint8Array,
  options?: { headers: Record<string, string> }
) => Promise<unknown>;
// Cleanup is best effort and must preserve the original transfer error.
function ignoreCleanupFailure(): void {
  /* The caller reports the original outcome. */
}

function tryByteReader(stream: ReadableStream<Uint8Array>) {
  try {
    return stream.getReader({ mode: "byob" });
  } catch (failure) {
    // Older browsers and streams built without a byte controller use a
    // default reader. Do not mask other errors acquiring the stream.
    if ((failure as { name?: string })?.name !== "TypeError") throw failure;
    return undefined;
  }
}
const lastHandles = new Map<FileSaveKind, BrowserFileHandle>();
export const cancelledFileSave: FileSaveResult = { status: "cancelled" };
export function sanitizeSaveFilename(filename: string): string {
  return (
    // eslint-disable-next-line no-control-regex -- Replace characters forbidden in file names.
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
        invoke?: NativeFileInvoke;
      };
      invoke?: NativeFileInvoke;
    };
    __HICT_TAURI_EXPORT_STREAM_VERSION__?: number;
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
                  ignoreCleanupFailure
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
  if (
    typeof invoke === "function" &&
    browser.__HICT_TAURI_EXPORT_STREAM_VERSION__ === 1
  ) {
    const writeStream = async (
      stream: ReadableStream<Uint8Array>,
      signal?: AbortSignal
    ): Promise<FileSaveResult> => {
      const reader = stream.getReader();
      let id: string | undefined;
      let committed = false;
      const abort = () => {
        void reader.cancel(signal?.reason).catch(ignoreCleanupFailure);
      };
      signal?.addEventListener("abort", abort, { once: true });
      try {
        signal?.throwIfAborted();
        const selected = await invoke("begin_export_stream", {
          filename: name,
          kind,
        });
        if (selected === null) {
          await reader.cancel();
          return cancelledFileSave;
        }
        if (Array.isArray(selected) && typeof selected[0] === "string")
          id = selected[0];
        if (
          !id ||
          !Array.isArray(selected) ||
          typeof selected[1] !== "string" ||
          !selected[1]
        )
          throw Error("The desktop did not confirm an export destination.");
        const path = selected[1];
        let sequence = 0;
        for (;;) {
          signal?.throwIfAborted();
          const { done, value } = await reader.read();
          signal?.throwIfAborted();
          if (done) break;
          for (let offset = 0; offset < value.length; offset += 65_536) {
            signal?.throwIfAborted();
            // Give IPC its own bounded buffer, then await the native disk write.
            await invoke(
              "write_export_chunk",
              value.slice(offset, offset + 65_536),
              {
                headers: {
                  "x-hict-export-id": id,
                  "x-hict-export-sequence": String(sequence++),
                },
              }
            );
          }
        }
        signal?.throwIfAborted();
        const result = await invoke("finish_export_stream", { id });
        if (result !== path)
          throw Error("The desktop did not confirm that the file was saved.");
        committed = true;
        remember(path);
        return { status: "saved", filename: basename(path), path };
      } catch (failure) {
        await reader.cancel(failure).catch(ignoreCleanupFailure);
        throw failure;
      } finally {
        signal?.removeEventListener("abort", abort);
        reader.releaseLock();
        if (id && !committed)
          await invoke("abort_export_stream", { id }).catch(
            ignoreCleanupFailure
          );
      }
    };
    return {
      writeStream,
      async writeRequest(request, signal) {
        let id: string | undefined;
        let committed = false;
        const abort = () => {
          if (id)
            void invoke("abort_export_stream", { id }).catch(
              ignoreCleanupFailure
            );
        };
        signal?.addEventListener("abort", abort, { once: true });
        try {
          signal?.throwIfAborted();
          // Choose before connecting. WebKit can buffer an unread HTTP body.
          const selected = await invoke("begin_export_stream", {
            filename: name,
            kind,
          });
          if (selected === null) return cancelledFileSave;
          if (Array.isArray(selected) && typeof selected[0] === "string")
            id = selected[0];
          if (
            !id ||
            !Array.isArray(selected) ||
            typeof selected[1] !== "string" ||
            !selected[1]
          )
            throw Error("The desktop did not confirm an export destination.");
          const path = selected[1];
          signal?.throwIfAborted();
          const result = await invoke("download_export_request", {
            id,
            request,
          });
          if (result !== path)
            throw Error("The desktop did not confirm that the file was saved.");
          committed = true;
          remember(path);
          return { status: "saved", filename: basename(path), path };
        } catch (failure) {
          if (signal?.aborted) return cancelledFileSave;
          throw failure;
        } finally {
          signal?.removeEventListener("abort", abort);
          if (id && !committed)
            await invoke("abort_export_stream", { id }).catch(
              ignoreCleanupFailure
            );
        }
      },
      async write(blob) {
        // Node's ambient Blob type differs from the WebView's WHATWG stream.
        const result = await writeStream(
          blob.stream() as unknown as ReadableStream<Uint8Array>
        );
        return result.status === "saved"
          ? {
              ...result,
              readFile: async () =>
                new File([blob], result.filename, { type: blob.type }),
            }
          : result;
      },
    };
  }
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
        const byteReader = tryByteReader(stream);
        const defaultReader = byteReader ? undefined : stream.getReader();
        const reader = byteReader ?? defaultReader!;
        let buffer = byteReader ? new Uint8Array(64 * 1024) : undefined;
        const abort = () => {
          void reader.cancel(signal?.reason).catch(ignoreCleanupFailure);
        };
        signal?.addEventListener("abort", abort, { once: true });
        let writer:
          | Awaited<ReturnType<BrowserFileHandle["createWritable"]>>
          | undefined;
        try {
          signal?.throwIfAborted();
          writer = await handle.createWritable();
          for (;;) {
            signal?.throwIfAborted();
            const { done, value } = byteReader
              ? await byteReader.read(buffer!)
              : await defaultReader!.read();
            signal?.throwIfAborted();
            if (done) break;
            // Await each disk write before pulling another network chunk.
            await writer.write(value);
            // A byte read transfers the backing buffer and returns it in the
            // result view. Reuse the full allocation after the write settles.
            if (byteReader) buffer = new Uint8Array(value.buffer as ArrayBuffer);
          }
          signal?.throwIfAborted();
          await writer.close();
          return saved();
        } catch (failure) {
          await reader.cancel(failure).catch(ignoreCleanupFailure);
          await writer?.abort?.().catch(ignoreCleanupFailure);
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
