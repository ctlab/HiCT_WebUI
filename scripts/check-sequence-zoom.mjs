import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/app/core/visualization/sequenceZoom.ts',import.meta.url),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const zoom=exports.sequenceZoomResolution,base=1/12000,bin=1/800;
assert.equal(zoom(1,.0005,1,1000,[1000,800]),base);
assert.equal(zoom(base,.0005,1,1000,[1000,800]),bin);
assert.equal(zoom(base,base*(1+Number.EPSILON),1,1000,[1000,800]),base*(1+Number.EPSILON),'rounding must not exit base zoom');
assert.equal(zoom(bin,bin*(1-Number.EPSILON),1,1000,[1000,800]),bin*(1-Number.EPSILON));
assert.equal(zoom(1,.5,1,1000,[1000,800]),.5);
assert.equal(zoom(base,base/2,1,1000,[1000,800]),base/2);
assert.equal(zoom(1,0.001,1,10,[1000,800]),0.001,'fine input already has no unreadable interval');
console.log('Sequence zoom: entry, exit, continued base zoom and floating-point boundary stability pass.');
const boundaries={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/app/core/visualization/sequenceBoundaries.ts',import.meta.url),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:boundaries});
const lower=boundaries.coordinateLowerBound;
for(const values of [[],[0],[0,10,10,20],Array.from({length:100000},(_,i)=>i*31)]) {
 for(const target of [-1,0,10,11,20,31,10000,3100000]) {
  let calls=0;
  const actual=lower(values,target,x=>{calls++;return x;});
  const expected=values.findIndex(x=>x>=target);
  assert.equal(actual,expected<0?values.length:expected);
  assert.ok(calls<=Math.ceil(Math.log2(values.length+1)),`Unbounded work: ${calls}`);
 }
}
console.log('Sequence boundary lookup: endpoints, duplicate coordinates and logarithmic work pass.');
