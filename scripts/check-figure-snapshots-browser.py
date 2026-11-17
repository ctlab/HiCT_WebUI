"""Exercise portable scene validation and snapshot lifetime in a real Chromium DOM."""

import json
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
sources = json.loads(
    subprocess.check_output(
        [
            "node",
            "-e",
            """
const fs=require('fs'),ts=require('typescript'),out={};
for(const name of ['FigureSnapshotDocument','PngProvenance','FigureSnapshotLibrary'])
 out[name]=ts.transpileModule(fs.readFileSync(`src/app/core/export/${name}.ts`,'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
console.log(JSON.stringify(out));
""",
        ],
        cwd=root,
        text=True,
    )
)
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page()
    requests = []
    page.route(
        "http://localhost/snapshot-test",
        lambda route: route.fulfill(content_type="text/html", body="<html></html>"),
    )
    page.goto("http://localhost/snapshot-test")
    page.on("request", lambda request: requests.append(request.url))
    result = page.evaluate(
        r"""async sources=>{
      const loaded={};
      function load(name){
        name=name.split('/').at(-1);
        if(name==='vue')return {ref:value=>({value}),shallowRef:value=>({value})};
        if(name==='MapFonts')return {embedSvgFonts:async()=>{}}; // Font encoding is covered by the full UI journey.
        if(loaded[name])return loaded[name];
        const exports={};loaded[name]=exports;new Function('exports','require',sources[name])(exports,load);return exports;
      }
      const api=load('FigureSnapshotDocument'),pngApi=load('PngProvenance'),{FigureSnapshotLibrary}=load('FigureSnapshotLibrary');
      const assert=(value,message)=>{if(!value)throw Error(message)};
      const metadata=JSON.stringify({format:'hict-figure',version:1,capturedAt:'2026-11-17T03:00:00.000Z',provenance:{filename:'тест.hict.hdf5'}});
      const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
      const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,32,32);ctx.fillStyle='black';ctx.font='10px "HiCT Sans"';ctx.fillText('Test',2,16);
      const png=await pngApi.appendPngProvenance(await new Promise(resolve=>canvas.toBlob(resolve)),metadata);
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><metadata>'+metadata+'</metadata><defs><clipPath id="clip1"><rect width="32" height="32"/></clipPath></defs><g clip-path="url(#clip1)"><rect width="32" height="32" fill="#ff0000"/><text x="2" y="16" fill="#000000" style=\'font: 10px "HiCT Sans"; white-space: pre\'>Test</text></g></svg>';
      const figure={svg,png,width:32,height:32,capturedAt:'2026-11-17T03:00:00.000Z'};
      const snapshot=await api.createFigureSnapshot(figure,'До разреза');
      assert(!new DOMParser().parseFromString(snapshot.document.svg,'image/svg+xml').querySelector('style,[style]'),'Portable scene must contain no CSS');
      assert(snapshot.document.svg.includes('font-family'),'Vector label font attributes retained');
      const restored=await api.restoreFigureSnapshots([snapshot.document]);
      const before=new Uint8Array(await png.arrayBuffer()),after=new Uint8Array(await restored[0].figure.png.arrayBuffer());
      assert(before.length===after.length&&before.every((byte,i)=>byte===after[i]),'PNG bytes changed across restore');
      assert(restored[0].document.name==='До разреза','Unicode name lost');
      let rejected=0;
      const attacks=[
        '<script>fetch("https://example.invalid/leak")</script>',
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">bad</div></foreignObject>',
        '<image width="32" height="32" href="https://example.invalid/image.png"/>',
        '<use href="https://example.invalid/a.svg#x"/>',
        '<rect width="32" height="32" onload="alert(1)"/>',
        '<rect width="32" height="32" fill="url(https://example.invalid/a)"/>',
        '<style>@import "https://example.invalid/a.css";</style>',
        '<text style="font:10px Arial">bad</text>',
        '<g clip-path="url(#missing)"/>',
        '<clipPath id="clip1"/>',
      ];
      for(const attack of attacks){
        const text=snapshot.document.svg.replace('</svg>',attack+'</svg>');
        const doc={...snapshot.document,svg:text,sceneCrc32:pngApi.crc32(new TextEncoder().encode(text)).toString(16).padStart(8,'0')};
        let failed=false;try{await api.restoreFigureSnapshots([doc]);}catch{failed=true;rejected++;}
        assert(failed,'Unsafe scene accepted: '+attack);
      }
      for(const text of ['<!DOCTYPE svg [<!ENTITY x SYSTEM "https://example.invalid/x">]>'+snapshot.document.svg,snapshot.document.svg.replace('xmlns="http://www.w3.org/2000/svg"','xmlns="urn:wrong"')]){
        let failed=false;try{api.readSnapshotScene(text,32,32);}catch{failed=true;rejected++;}assert(failed,'Unsafe XML accepted');
      }
      let nested={};for(let i=0;i<170;i++)nested={child:nested};
      for(const [text,reason] of [[JSON.stringify({format:'hict-figure',version:1,capturedAt:figure.capturedAt,nested}),'nesting'],['{"format":"hict-figure","version":1,"bad":1e999}','non-finite']]){
        const parsed=new DOMParser().parseFromString(snapshot.document.svg,'image/svg+xml');parsed.querySelector('metadata').textContent=text;
        let failed=false;try{api.readSnapshotScene(new XMLSerializer().serializeToString(parsed),32,32);}catch(error){failed=error.message.includes(reason);rejected++;}
        assert(failed,'Opaque provenance must have a '+reason+' guard');
      }
      let timeMismatch=false;try{await api.restoreFigureSnapshots([{...snapshot.document,capturedAt:'2026-11-17T04:00:00.000Z'}]);}catch{timeMismatch=true;rejected++;}assert(timeMismatch,'Capture timestamps must match recorded provenance');
      const badPng=snapshot.document.png.slice(0,-12)+'AAAAAAAAAAAA';
      let failed=false;try{await api.restoreFigureSnapshots([{...snapshot.document,png:badPng}]);}catch{failed=true;rejected++;}assert(failed,'Corrupt PNG accepted');
      const duplicate=await pngApi.appendPngProvenance(png,metadata);
      const dupBytes=new Uint8Array(await duplicate.arrayBuffer());let binary='';for(const b of dupBytes)binary+=String.fromCharCode(b);
      failed=false;try{await api.restoreFigureSnapshots([{...snapshot.document,png:'data:image/png;base64,'+btoa(binary)}]);}catch{failed=true;rejected++;}assert(failed,'Duplicate raster provenance accepted');
      let bounded=false;try{api.validateFigureSnapshotDocuments([0,1,2].map(index=>({...snapshot.document,id:'large-'+index,width:8192,height:8192})));}catch{bounded=true;}assert(bounded,'Aggregate decoded image area must be bounded before decoding');
      const library=new FigureSnapshotLibrary();library.add(snapshot);assert(library.dirty,'Added snapshot must be unsaved');
      const revision=library.revision;library.add({...snapshot,document:Object.freeze({...snapshot.document,id:'second'})});library.markSaved(revision);assert(library.dirty,'A late save must not mark a newer snapshot clean');
      library.markSaved(library.revision);assert(!library.dirty,'Confirmed save should mark captured revision clean');
      library.remove('second');assert(library.dirty,'Removing a snapshot must be unsaved');
      library.restore(restored);assert(!library.dirty,'Restored library must start clean');
      for(let i=1;i<8;i++)library.add({...snapshot,document:Object.freeze({...snapshot.document,id:'more-'+i})});
      failed=false;try{library.add({...snapshot,document:Object.freeze({...snapshot.document,id:'ninth'})});}catch{failed=true;}assert(failed&&library.snapshots.length===8,'Budget failure must preserve the library');
      return {roundTripPngBytes:before.length,vectorLabelRetained:true,unsafeInputsRejected:rejected,dirtyStateAndLateSave:true,budgetAtomicity:true};
    }""",
        sources,
    )
    assert not requests, requests
    print(json.dumps(result))
    browser.close()
