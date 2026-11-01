"""Exercise the actual canvas recorder in Chromium, including excluded widgets."""
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
source = subprocess.check_output(['node', '-e', '''
const fs=require('fs'), ts=require('typescript');
console.log(ts.transpileModule(fs.readFileSync('src/app/core/export/CanvasScene.ts','utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
'''], cwd=root, text=True)
selection_source = subprocess.check_output(['node', '-e', """
const fs=require('fs'), ts=require('typescript');
console.log(ts.transpileModule(fs.readFileSync('src/app/core/export/SelectionScene.ts','utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
"""], cwd=root, text=True)
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('HICT_TEST_CHROMIUM'))
    page = browser.new_page()
    page.route("http://localhost/export-test", lambda route: route.fulfill(body="<html></html>", content_type="text/html"))
    page.goto("http://localhost/export-test")
    page.set_content('''<style>body{margin:0}#workspace{position:relative;width:300px;height:200px;background:white}
      canvas{position:absolute;left:0;top:0}#minimap{position:absolute;left:200px;top:0;width:80px;height:80px}</style>
      <div id="workspace"><canvas id="map" width="200" height="200"></canvas>
      <div id="minimap"><canvas id="nav" width="80" height="80"></canvas></div></div>''')
    page.add_script_tag(content='var exports={};\n' + source + '\n' + selection_source)
    result = page.evaluate('''async () => {
      const workspace=document.querySelector('#workspace'), minimap=document.querySelector('#minimap');
      const map=document.querySelector('#map').getContext('2d'), nav=document.querySelector('#nav').getContext('2d');
      const render=async()=>{
        map.clearRect(0,0,200,200);map.fillStyle='red';map.fillRect(0,0,100,100);
        map.fillStyle='black';map.fillText('SCAFFOLD_LABEL',20,130);
        nav.fillStyle='blue';nav.fillRect(0,0,80,80);nav.fillText('MINIMAP_ONLY',0,40);
      };
      const original=CanvasRenderingContext2D.prototype.fillRect;
      const scene=await exports.captureCanvasScene(workspace,render,undefined,{excludedRoots:[minimap],mapRoot:document.querySelector('#map')});
      const context=scene.canvas.getContext('2d');
      const crop=exports.includeMapCaptions(scene.svg,{left:0,top:0,width:100,height:100},
        {left:0,top:0,width:200,height:200});
      if(crop.height<130) throw Error('Caption below map was cropped');
      const cropped=exports.cropSelectionScene(scene,{...crop,marginLeft:0,marginTop:0});
      if(!cropped.svg.textContent.includes('SCAFFOLD_LABEL')) throw Error('Lost vector label');
      const ns='http://www.w3.org/2000/svg';
      const ruler=document.createElementNS(ns,'text');
      ruler.setAttribute('x','2');ruler.setAttribute('y','105');
      ruler.textContent='END';scene.svg.append(ruler);
      const withRuler=exports.includeMapCaptions(scene.svg,{left:50,top:50,width:50,height:50},
        {left:50,top:50,width:150,height:150});
      if(withRuler.top+withRuler.height<109) throw Error('Terminal ruler label was cropped');
      let failed=false;
      try { await exports.captureCanvasScene(workspace,async()=>{throw Error('render failure')}); }
      catch {failed=true;}
      return {svg:new XMLSerializer().serializeToString(scene.svg),
        map:Array.from(context.getImageData(10,10,1,1).data),
        excluded:Array.from(context.getImageData(210,10,1,1).data),
        live:Array.from(nav.getImageData(10,10,1,1).data),
        restored:original===CanvasRenderingContext2D.prototype.fillRect,failed};
    }''')
    assert result['map'] == [255, 0, 0, 255], result
    assert result['live'] == [0, 0, 255, 255], result
    assert result['excluded'] == [255, 255, 255, 255], result
    assert 'SCAFFOLD_LABEL' in result['svg'] and 'MINIMAP_ONLY' not in result['svg']
    assert result['restored'] and result['failed']
    browser.close()
    print(json.dumps({'minimapExcluded': True, 'liveMinimapUnchanged': True,
                     'editableLabelsPreserved': True, 'hooksRestoredAfterFailure': True}))
