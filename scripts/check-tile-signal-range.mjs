import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/app/core/visualization/tileSignalRange.ts', import.meta.url), 'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports});
const {aggregateTileSignals: aggregate} = exports;
const range = (min,max,count=3) => ({min,max,count});
const expr = {type:'source',source:'PRIMARY'};
const tile = (min,max,revision='a') => ({source:'PRIMARY',bpResolution:1000,revision,
  raw:range(0,10),processed:[{expression:'{"source":"PRIMARY","type":"source"}',range:range(min,max)}]});
assert.equal(aggregate([tile(-7,4),tile(0,9)],'PRIMARY',1000,expr).processed.max,9);
assert.equal(aggregate([tile(-7,4),tile(0,9)],'PRIMARY',1000,expr).processed.min,-7);
assert.equal(aggregate([tile(-7,4),tile(0,9,'b')],'PRIMARY',1000,expr),undefined,'never combine generations');
assert.equal(aggregate([tile(0,100)],'SECONDARY',1000,expr),undefined);
assert.equal(aggregate([tile(0,100)],'PRIMARY',5000,expr),undefined);
assert.equal(aggregate([tile(NaN,Infinity)],'PRIMARY',1000,expr).processed.count,0);
assert.equal(aggregate([tile(2,2)],'PRIMARY',1000,expr).processed.min,2,'constant data is valid');
assert.equal(aggregate([tile(0,10)],'PRIMARY',1000,{type:'constant',value:2}).processed.count,0,'never mix different inputs');
assert.equal(aggregate([tile(0,10)],'PRIMARY',1000,expr).raw.max,10);
console.log('Loaded tile ranges: finite extrema, constant data, source/resolution/expression isolation and stale-generation rejection pass.');
