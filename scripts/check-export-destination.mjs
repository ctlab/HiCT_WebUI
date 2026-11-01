import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hict-export-preference-'));
const exportsDirectory = path.join(directory, 'selected-destination');
await fs.mkdir(exportsDirectory);
let handler, nextDialog, options;
const fakeElectron = {
  app: { commandLine: { appendSwitch() {} }, setName() {}, on() {},
    whenReady: () => new Promise(() => {}), getPath: () => directory },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { async showSaveDialog(o) { options = o; return nextDialog; } },
  ipcMain: { handle(name, fn) { if (name === 'hict:save-export') handler = fn; } },
  Menu: { setApplicationMenu() {} },
  session: { defaultSession: { setPermissionRequestHandler() {}, webRequest: { onHeadersReceived() {} } } },
};
const source = await fs.readFile(new URL('../src/electron/main/main.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source + '\nconfigureSecurity(new URL("http://localhost:5000"));',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, {
  require: name => name === 'electron' ? fakeElectron : require(name),
  exports: {}, process: { platform: 'linux', env: {} }, Buffer, URL, console,
});
nextDialog = { canceled: true };
assert.deepEqual(JSON.parse(JSON.stringify(await handler({ sender: {} }, { filename: '../sample.png' }))), { saved: false });
assert.equal(options.defaultPath, '.._sample.png');
await assert.rejects(fs.readFile(path.join(directory, 'last-export-directory.txt')), { code: 'ENOENT' });
const target = path.join(exportsDirectory, 'map.png');
nextDialog = { canceled: false, filePath: target };
await handler({ sender: {} }, { filename: 'map.png', bytes: [1, 2, 3] });
assert.deepEqual([...await fs.readFile(target)], [1, 2, 3]);
assert.equal(await fs.readFile(path.join(directory, 'last-export-directory.txt'), 'utf8'), exportsDirectory);
nextDialog = { canceled: true };
await handler({ sender: {} }, { filename: 'next.svg' });
assert.equal(options.defaultPath, path.join(exportsDirectory, 'next.svg'));
nextDialog = { canceled: false, filePath: path.join(directory, 'missing', 'bad.pdf') };
await assert.rejects(handler({ sender: {} }, { filename: 'bad.pdf' }), { code: 'ENOENT' });
assert.equal(await fs.readFile(path.join(directory, 'last-export-directory.txt'), 'utf8'), exportsDirectory);
console.log('Export destination: successful save retained; cancellation/failure preserve preference; filename is sanitized.');
