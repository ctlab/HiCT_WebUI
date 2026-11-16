import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { loadElectronSource } from "./load-electron-source.mjs";
const { CoordinateExports } = loadElectronSource("CoordinateExports");
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "hict-native-coordinate-")
);
let mode = "small",
  received = 0,
  lastRequest;
const block = Buffer.from("ACGT".repeat(16384));
const server = createServer(async (req, res) => {
  res.on("error", () => {});
  let body = "";
  for await (const data of req) body += data;
  received++;
  lastRequest = { body, headers: req.headers };
  if (mode === "stale") {
    res.writeHead(409, { "content-type": "text/plain" });
    res.end("stale");
    return;
  }
  if (mode === "html") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>proxy failure</html>");
    return;
  }
  if (mode === "redirect") {
    res.writeHead(302, { location: "/close" });
    res.end();
    return;
  }
  res.writeHead(200, {
    "content-type": "text/plain",
    ...(mode === "truncated" ? { "content-length": "999999" } : {}),
  });
  try {
    const count = mode === "large" ? 2048 : mode === "slow" ? 1000 : 2;
    for (let i = 0; i < count && !res.destroyed; i++) {
      if (!res.write(block))
        await new Promise((resolve) => {
          const done = () => {
            res.removeListener("drain", done);
            res.removeListener("close", done);
            resolve();
          };
          res.once("drain", done);
          res.once("close", done);
        });
      if (mode === "slow")
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (mode === "truncated") res.destroy();
    else res.end();
  } catch {
    res.destroy();
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}/get_fasta_for_assembly`;
const manager = new CoordinateExports((raw) => new URL(raw));
const target = path.join(directory, "assembly.fa"),
  preference = path.join(directory, "last-fasta-directory.txt");
const payload = {
  filename: "assembly.fa",
  kind: "fasta",
  operationId: "export-1",
  request: {
    url,
    body: '{"preserveImportedGaps":true}',
    headers: {
      "X-HiCT-History-Session": "captured",
      "X-HiCT-History-Revision": "17",
    },
  },
};
const choose = async () => ({ path: target, preferencePath: preference });
const noStage = async () =>
  assert.equal(
    (await fs.readdir(directory)).filter((n) => n.startsWith(".hict-save-"))
      .length,
    0
  );
const hash = async (file) => {
  const h = createHash("sha256");
  for await (const data of createReadStream(file)) h.update(data);
  return h.digest("hex");
};
try {
  mode = "large";
  const result = await manager.save(1, payload, choose);
  assert.equal(result.saved, true);
  assert.equal((await fs.stat(target)).size, 128 * 1024 * 1024);
  const expected = createHash("sha256");
  for (let i = 0; i < 2048; i++) expected.update(block);
  const completeHash = await hash(target);
  assert.equal(completeHash, expected.digest("hex"));
  assert.equal(lastRequest.headers["x-hict-history-revision"], "17");
  assert.equal(lastRequest.body, payload.request.body);
  assert.equal(await fs.readFile(preference, "utf8"), directory);
  await noStage();
  for (const next of ["stale", "html", "truncated", "redirect"]) {
    mode = next;
    await assert.rejects(manager.save(1, payload, choose));
    assert.equal(await hash(target), completeHash);
    assert.equal(await fs.readFile(preference, "utf8"), directory);
    await noStage();
  }
  const requestsBefore = received;
  assert.equal(
    (await manager.save(1, payload, async () => undefined)).saved,
    false
  );
  assert.equal(received, requestsBefore);
  let release;
  const waiting = manager.save(
    1,
    payload,
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  manager.cancel(1, "export-1");
  release(await choose());
  assert.equal((await waiting).saved, false);
  assert.equal(received, requestsBefore);
  mode = "slow";
  let settled = false;
  const pending = manager.save(1, payload, choose).finally(() => {
    settled = true;
  });
  while (
    !(await fs.readdir(directory)).some((n) => n.startsWith(".hict-save-"))
  )
    await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(
    manager.save(1, { ...payload, operationId: "overlap" }, choose),
    /already running/
  );
  manager.cancel(2, "export-1");
  manager.cancel(1, "different-export");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(settled, false);
  manager.cancel(1, "export-1");
  assert.equal((await pending).saved, false);
  assert.equal(await hash(target), completeHash);
  await noStage();
  const closing = manager.save(1, payload, choose);
  await new Promise((resolve) => setTimeout(resolve, 20));
  manager.cancel(1);
  assert.equal((await closing).saved, false);
  assert.equal(await hash(target), completeHash);
  await noStage();
  mode = "small";
  const occupied = path.join(directory, "occupied");
  await fs.mkdir(occupied);
  await fs.writeFile(path.join(occupied, "sentinel"), "keep");
  await assert.rejects(
    manager.save(1, payload, async () => ({
      path: occupied,
      preferencePath: preference,
    }))
  );
  assert.equal(
    await fs.readFile(path.join(occupied, "sentinel"), "utf8"),
    "keep"
  );
  assert.equal(await hash(target), completeHash);
  await noStage();
  for (const bad of [
    { ...payload, operationId: "../bad" },
    {
      ...payload,
      request: {
        ...payload.request,
        url: url.replace("get_fasta_for_assembly", "close"),
      },
    },
    { ...payload, request: { ...payload.request, body: "not JSON" } },
  ])
    await assert.rejects(
      manager.save(1, bad, () =>
        assert.fail("Invalid requests cannot open a chooser")
      )
    );
  let closeChooser;
  const choosing = manager.save(
    1,
    payload,
    () =>
      new Promise((resolve) => {
        closeChooser = resolve;
      })
  );
  assert.equal(manager.hasTransfers, false);
  await manager.shutdown();
  closeChooser(await choose());
  assert.equal((await choosing).saved, false);
  mode = "slow";
  const quitting = manager.save(1, payload, choose);
  while (
    !(await fs.readdir(directory)).some((n) => n.startsWith(".hict-save-"))
  )
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(manager.hasTransfers, true);
  await manager.shutdown();
  assert.equal((await quitting).saved, false);
  assert.equal(manager.hasTransfers, false);
  await noStage();
  assert.equal(await hash(target), completeHash);
  console.log(
    "Native coordinate exports: exact 128 MiB HTTP/disk stream, captured revision, cancellation ownership, window disposal, truncated/error responses, rename failure and cleanup passed."
  );
} finally {
  manager.cancel(1);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(directory, { recursive: true, force: true });
}
