import { existsSync } from "node:fs";
import { realpath, stat, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, sep, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer, Server } from "node:http";
import { Socket } from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export function bundledUiRoot(mainDirectory: string): string {
  for (const root of [
    resolve(mainDirectory, ".."),
    resolve(mainDirectory, "../.."),
  ]) {
    if (
      existsSync(join(root, "index.html")) &&
      existsSync(join(root, "assets"))
    )
      return root;
  }
  throw Error("The bundled HiCT interface is missing.");
}

/** Public files only; canonical paths must remain inside the owned application bundle. */
export function bundledUiHandler(
  mainDirectory: string,
  origin: string,
  csp: string,
  fetchFile: (url: string) => Promise<Response>
) {
  return async (
    request: Pick<Request, "url" | "method">
  ): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    try {
      const url = new URL(request.url);
      if (url.origin !== origin || url.username || url.password)
        return new Response("Not found", { status: 404 });
      const root = await realpath(bundledUiRoot(mainDirectory));
      const file = await realpath(
        resolve(
          root,
          "." +
            decodeURIComponent(
              url.pathname === "/" ? "/index.html" : url.pathname
            )
        )
      );
      const name = relative(root, file);
      if (
        !name ||
        name === ".." ||
        name.startsWith(".." + sep) ||
        isAbsolute(name) ||
        ["main", "preload", "electron", "package.json"].includes(
          name.split(/[\\/]/)[0].toLowerCase()
        ) ||
        !(await stat(file)).isFile()
      )
        return new Response("Not found", { status: 404 });
      const response = await fetchFile(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", csp);
      headers.set("Cache-Control", "no-store");
      if (request.method === "HEAD") await response.body?.cancel();
      return new Response(request.method === "HEAD" ? null : response.body, {
        status: 200,
        headers,
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  };
}

/** Own the listener before navigating. A remembered port is never trusted as a server. */
export class BundledUiServer {
  private server?: Server;
  private sockets = new Set<Socket>();
  private pending?: Promise<string>;
  private origin = "";
  private closed = false;
  constructor(
    private mainDirectory: string,
    private portFile: string,
    private csp: string,
    private fetchFile: (url: string) => Promise<Response>
  ) {}
  isPageUrl(raw: string): boolean {
    try {
      const url = new URL(raw);
      return (
        !!this.origin &&
        !this.closed &&
        url.origin === this.origin &&
        !url.username &&
        !url.password &&
        url.pathname === "/index.html"
      );
    } catch {
      return false;
    }
  }
  url(): Promise<string> {
    if (this.closed)
      return Promise.reject(Error("The bundled interface was closed."));
    if (!this.pending)
      this.pending = this.start().catch((error) => {
        this.pending = undefined;
        throw error;
      });
    return this.pending;
  }
  private async start(): Promise<string> {
    bundledUiRoot(this.mainDirectory);
    let preferred = 0;
    try {
      const value = (await readFile(this.portFile, "utf8")).trim();
      if (
        /^\d+$/.test(value) &&
        Number(value) >= 1024 &&
        Number(value) <= 65535
      )
        preferred = Number(value);
    } catch {
      /* A fresh or read-only profile can use an ephemeral port. */
    }
    const server = createServer(async (request, reply) => {
      try {
        if (request.headers.host !== new URL(this.origin).host) {
          reply.writeHead(404).end();
          return;
        }
        const response = await bundledUiHandler(
          this.mainDirectory,
          this.origin,
          this.csp,
          this.fetchFile
        )({
          method: request.method || "",
          url: new URL(request.url || "/", this.origin).href,
        });
        reply.writeHead(
          response.status,
          Object.fromEntries(response.headers.entries())
        );
        if (response.body) {
          const reader = response.body.getReader();
          async function* chunks() {
            try {
              for (;;) {
                const item = await reader.read();
                if (item.done) return;
                yield item.value;
              }
            } finally {
              await reader.cancel().catch(() => {});
              reader.releaseLock();
            }
          }
          await pipeline(Readable.from(chunks()), reply);
        } else reply.end();
      } catch {
        if (!reply.headersSent) reply.writeHead(500);
        reply.end();
      }
    });
    this.server = server;
    server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
    });
    const listen = (port: number) =>
      new Promise<void>((resolve, reject) => {
        const failed = (error: Error) => {
          server.removeListener("listening", ready);
          reject(error);
        };
        const ready = () => {
          server.removeListener("error", failed);
          resolve();
        };
        server.once("error", failed);
        server.once("listening", ready);
        server.listen(port, "127.0.0.1");
      });
    try {
      await listen(preferred);
    } catch (error) {
      if (!preferred || (error as NodeJS.ErrnoException).code !== "EADDRINUSE")
        throw error;
      await listen(0);
    }
    if (this.closed) {
      server.close();
      throw Error("The bundled interface was closed.");
    }
    server.unref();
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Cannot start the bundled interface.");
    this.origin = `http://127.0.0.1:${address.port}`;
    try {
      await mkdir(dirname(this.portFile), { recursive: true });
      await writeFile(this.portFile, String(address.port), { mode: 0o600 });
    } catch {
      /* The owned listener remains usable without persistent preferences. */
    }
    return this.origin + "/index.html";
  }
  close(): void {
    this.closed = true;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.server?.close();
    this.origin = "";
  }
}
