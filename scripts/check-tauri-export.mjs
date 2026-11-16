import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const source=await fs.readFile(new URL('../src-tauri/src/main.rs',import.meta.url),'utf8');
const start=source.indexOf('fn write_export_file('),end=source.indexOf('#[cfg(target_os = "linux")]',start);
assert.ok(start>=0 && end>start);
const native=source.slice(start,end);
assert.ok(!native.includes('tauri::'),'The isolated check must compile the actual filesystem implementation without replacing it');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hict-tauri-save-'));
try {
 const input=path.join(directory,'export.rs'),binary=path.join(directory,'export-tests');
 await fs.writeFile(input,native);
 const compile=spawnSync('rustc',['--test','--edition=2021',input,'-o',binary],{encoding:'utf8'});
 assert.equal(compile.status,0,compile.stderr);
 const run=spawnSync(binary,[],{encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);console.log(run.stdout.trim());
 console.log('Actual Tauri file-writing routine: complete replacement, failed destination preservation and temporary-file cleanup passed. Full wrapper compilation remains a separate toolchain gate.');
} finally {await fs.rm(directory,{recursive:true,force:true});}
