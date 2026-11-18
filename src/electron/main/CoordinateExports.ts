import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

interface ExportRequest {
  filename: string;
  kind: string;
  operationId: string;
  request: { url: string; body: string; headers: Record<string, string> };
}
export interface ExportDestination {
  path: string;
  preferencePath: string;
}

/** One owned transfer per window. Only the user's chooser supplies filesystem paths. */
export class CoordinateExports {
  private readonly active = new Map<
    number,
    {
      id: string;
      controller: AbortController;
      transferring: boolean;
      done: Promise<void>;
    }
  >();
  constructor(private readonly validateUrl: (url: string) => URL) {}
  get hasTransfers(): boolean {
    return [...this.active.values()].some(
      (operation) => operation.transferring
    );
  }
  async shutdown(): Promise<void> {
    const operations = [...this.active.values()];
    for (const operation of operations) operation.controller.abort();
    // An unanswered chooser owns no file. Its aborted signal prevents later I/O.
    await Promise.all(
      operations
        .filter((operation) => operation.transferring)
        .map((operation) => operation.done)
    );
  }
  cancel(owner: number, id?: string): void {
    const operation = this.active.get(owner);
    if (operation && (id === undefined || operation.id === id))
      operation.controller.abort();
  }
  async save(
    owner: number,
    payload: ExportRequest,
    choose: () => Promise<ExportDestination | undefined>
  ): Promise<{ saved: boolean; path?: string }> {
    if (this.active.has(owner))
      throw Error("Another export is already running in this window.");
    if (
      !payload ||
      typeof payload.operationId !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(payload.operationId)
    )
      throw Error("Invalid export operation.");
    const request = payload.request;
    if (
      !request ||
      typeof request.url !== "string" ||
      typeof request.body !== "string" ||
      Buffer.byteLength(request.body) > 65536
    )
      throw Error("Invalid export request.");
    const url = this.validateUrl(request.url);
    if (
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !/\/(get_fasta_for_assembly|get_fasta_for_selection|get_agp_for_assembly)$/.test(
        url.pathname
      )
    )
      throw Error("Unsupported export endpoint.");
    JSON.parse(request.body);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/plain",
    };
    for (const name of ["X-HiCT-History-Session", "X-HiCT-History-Revision"]) {
      const value = request.headers?.[name];
      if (value !== undefined) {
        if (
          typeof value !== "string" ||
          value.length > 200 ||
          /[\r\n]/.test(value)
        )
          throw Error("Invalid export revision.");
        headers[name] = value;
      }
    }
    let complete!: () => void;
    const done = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const operation = {
      id: payload.operationId,
      controller: new AbortController(),
      transferring: false,
      done,
    };
    this.active.set(owner, operation);
    const signal = operation.controller.signal;
    let temporary: string | undefined;
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const destination = await choose();
      if (!destination) return { saved: false };
      signal.throwIfAborted();
      operation.transferring = true;
      const response = await fetch(url, {
        method: "POST",
        body: request.body,
        headers,
        signal,
        redirect: "error",
      });
      const type = response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();
      if (
        !response.ok ||
        !response.body ||
        (type !== "text/plain" && type !== "application/octet-stream")
      ) {
        await response.body?.cancel();
        throw Error(
          response.status === 409
            ? "The displayed assembly changed. Refresh the map and export again."
            : `The server did not return an assembly file (HTTP ${response.status}). No file was saved.`
        );
      }
      reader = response.body.getReader();
      const mode = await stat(destination.path)
        .then((s) => s.mode & 0o777)
        .catch(() => 0o600);
      const candidate = join(
        dirname(destination.path),
        `.hict-save-${randomUUID()}.tmp`
      );
      file = await open(candidate, "wx", mode);
      temporary = candidate;
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        signal.throwIfAborted();
        if (next.done) break;
        await file.writeFile(next.value);
      }
      signal.throwIfAborted();
      await file.sync();
      await file.close();
      file = undefined;
      signal.throwIfAborted();
      await rename(temporary, destination.path);
      temporary = undefined;
      // The rename is the commit point; a later cancellation cannot undo a saved file.
      try {
        await mkdir(dirname(destination.preferencePath), { recursive: true });
        await writeFile(
          destination.preferencePath,
          dirname(destination.path),
          "utf8"
        );
      } catch (error) {
        console.warn(
          "Export saved, but its destination could not be remembered:",
          error
        );
      }
      return { saved: true, path: destination.path };
    } catch (error) {
      if (signal.aborted) return { saved: false };
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "EACCES" || code === "EPERM" || code === "EROFS")
        throw new Error(
          "Cannot save the export in this folder. Choose a writable folder.",
          { cause: error }
        );
      if (code === "ENOSPC" || code === "EDQUOT")
        throw new Error(
          "Not enough storage space to save the export. Free space or choose another folder.",
          { cause: error }
        );
      throw error;
    } finally {
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      await file?.close().catch(() => {});
      if (temporary) await rm(temporary, { force: true }).catch(() => {});
      if (this.active.get(owner) === operation) this.active.delete(owner);
      complete();
    }
  }
}
