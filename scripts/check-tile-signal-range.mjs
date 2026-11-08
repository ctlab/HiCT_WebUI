import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/app/core/visualization/tileSignalRange.ts', import.meta.url), 'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports});
const {aggregateTileSignals: aggregate, histogramQuantile, robustUpperLimit, mergeHistograms} = exports;
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
// Quarter-octave histograms (server bucket = ((exponent - minExponent) << 2) | top two mantissa bits).
const bucketOf = (value, minExponent=-64) => { const e = Math.floor(Math.log2(value)); const q = Math.floor((value / 2 ** e - 1) * 4); return ((e - minExponent) << 2) | q; };
const histogram = (values) => { const counts = new Map(); for (const v of values) counts.set(bucketOf(v), (counts.get(bucketOf(v)) ?? 0) + 1);
  return {minExponent:-64, zeros:0, buckets:[...counts.entries()].sort((a,b)=>a[0]-b[0])}; };
const heavy = [...Array(9990).fill(0.008), ...Array(10).fill(1690)];
const h = histogram(heavy);
const q995 = histogramQuantile(h, 0.995);
assert.ok(q995 >= 0.008 && q995 <= 0.008 * 1.25 + 1e-12, `quantile bucket edge ${q995}`);
const robust = robustUpperLimit({min:0,max:1690,count:heavy.length,histogram:h});
assert.ok(robust < 0.05 && robust >= 4 * 0.008, `robust slider limit ignores rare extremes: ${robust}`);
assert.equal(robustUpperLimit({min:0,max:1690,count:3}), 1690, 'older servers without histograms keep the exact maximum');
assert.equal(robustUpperLimit({min:0,max:1,count:3,histogram:histogram([0.5,0.75,1])}), 1, 'never exceed the exact maximum');
const zeroHeavy = {...histogram([...Array(500).fill(0.01), ...Array(500).fill(0.5)]), zeros: 99000};
assert.ok(histogramQuantile(zeroHeavy, 0.995, {includeZeros: true}) <= 0.0125, 'zeros count as lowest values');
assert.ok(histogramQuantile(zeroHeavy, 0.995) >= 0.5, 'positive-only quantile ignores zeros');
assert.equal(histogramQuantile({...histogram([1]), zeros: 10000}, 0.5, {includeZeros: true}), null, 'quantile inside zeros');
assert.ok(robustUpperLimit({min:0,max:1690,count:1,histogram:{...histogram([1]), zeros: 10000}}) <= 5, 'all-zero viewport falls back to positive quantile');
assert.equal(mergeHistograms([histogram([1]), {...histogram([1]), minExponent:-10}]), null, 'incompatible layouts are not mixed');
const tileWithHistogram = (values) => ({source:'PRIMARY',bpResolution:1000,revision:'a',raw:range(0,10),
  processed:[{expression:'',range:{...range(Math.min(...values),Math.max(...values),values.length),histogram:histogram(values)}}]});
const merged = aggregate([tileWithHistogram([0.008,0.008]), tileWithHistogram([0.008,1690])],'PRIMARY',1000,expr).processed.histogram;
assert.equal(merged.buckets.reduce((s,[,c])=>s+c,0), 4, 'tile histograms are summed');
console.log('Signal histograms: quarter-octave quantiles, robust slider limits, legacy fallback and merge isolation pass.');
console.log('Loaded tile ranges: finite extrema, constant data, source/resolution/expression isolation and stale-generation rejection pass.');
