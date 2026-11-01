import os
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(os.environ.get('HICT_TEST_OUTPUT','test-results/inline-workspace'));out.mkdir(parents=True,exist_ok=True);records={};key=None
for line in (Path(os.environ['HICT_TEST_DATA'])/'q4.fa').read_text().splitlines():
 if line.startswith('>'):key=line[1:].split()[0];records[key]=''
 else:records[key]+=line.strip().upper()
complement=str.maketrans('ACGTRYMKBDHVN','TGCAYRKMVHDBN')
checks=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path=os.environ.get('HICT_TEST_CHROMIUM'));p=b.new_page(viewport={'width':1500,'height':1000});errors=[];bad=[];console=[]
 p.route('http://localhost:5000/**',lambda r:r.continue_(url=r.request.url.replace('http://localhost:5000',os.environ.get('HICT_TEST_API','http://127.0.0.1:5191'))))
 p.on('console',lambda m:console.append(m.text) if m.type in ('warning','error') else None)
 p.on('pageerror',lambda e:errors.append(str(e)));p.on('response',lambda r:bad.append([r.url,r.status]) if r.status>=400 else None)
 p.add_init_script('''window.__HICT_BENCHMARK_ENABLED__=true;window.__baseDraws=new WeakMap();const fill=CanvasRenderingContext2D.prototype.fillRect,text=CanvasRenderingContext2D.prototype.fillText;
 CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){if(this.canvas.classList.contains('sequence-axis')&&x===0&&y===0&&w===this.canvas.width&&h===this.canvas.height)window.__baseDraws.set(this.canvas,[]);return fill.apply(this,arguments)};
 CanvasRenderingContext2D.prototype.fillText=function(t,x,y){if(this.canvas.classList.contains('sequence-axis')&&/^[ACGTN]$/.test(t)){const draws=window.__baseDraws.get(this.canvas)||[];draws.push({base:t,x,y});window.__baseDraws.set(this.canvas,draws)}return text.apply(this,arguments)};''')
 p.goto(os.environ.get('HICT_TEST_URL','http://127.0.0.1:8084'));p.wait_for_function('window.__hictBenchmark');p.evaluate("api=>window.__hictBenchmark.open('q4_primary.hict.hdf5',api,'q4.fa')",os.environ.get("HICT_TEST_API","http://127.0.0.1:5191"))
 def show():
  p.evaluate('''()=>{const m=window.__hictBenchmark.manager();m.getView().setResolution(1);const x=m.getContigDimensionHolder().getFractionalPxOfBp(30,1000);m.getView().setCenter([x,-x]);m.getView().setResolution(1/2000)}''');p.wait_for_timeout(700)
 def verify(label):
  actual=p.evaluate('''async()=>{const m=window.__hictBenchmark.manager(),c=document.querySelector('canvas.sequence-axis.horizontal'),start=Number(c.dataset.startBp),end=Number(c.dataset.endBp);return {start,end,drawn:(window.__baseDraws.get(c)||[]).map(x=>x.base).join(''),region:await m.networkManager.requestManager.querySequenceRegion(start,end)}}''')
  r=actual['region'];expected=''
  for s in r['segments']:
   lo=max(actual['start'],s['start']);hi=min(actual['end'],s['end'])
   if hi<=lo:continue
   seq=records[s['source']][s['sourceStart']:s['sourceEnd']]
   if s['reversed']:seq=seq.translate(complement)[::-1]
   expected+=seq[lo-s['start']:hi-s['start']]
  assert actual['drawn']==r['sequence']==expected,(label,actual,expected)
  checks.append({'check':label,'bases':len(expected),'passed':True});print('PASS '+label,flush=True)
  return actual
 def edit(action):
  rev=p.evaluate('window.__hictBenchmark.manager().networkManager.requestManager.history.applied.revision')
  p.evaluate('''action=>{const m=window.__hictBenchmark.manager();m.viewAndLayersManager.selectionCollections.selectedContigFeatures.push(window.__hictBenchmark.feature({contigDescriptor:m.contigDimensionHolder.contigDescriptors[0]}));m.eventManager[action]()}''',action)
  p.wait_for_function('r=>window.__hictBenchmark.manager().networkManager.requestManager.history.applied.revision>r',arg=rev);p.wait_for_timeout(700)
 show();initial=verify('Initial rendered bases match independent FASTA')
 edit('onReverseSelectionClicked');show();reversed_=verify('Reverse while inline FASTA is visible updates bases')
 assert reversed_['region']['segments'][0]['reversed']
 for action in ['undo','redo','undo']:
  p.evaluate("action=>window.__hictBenchmark.manager().networkManager.requestManager.restoreAssemblyHistory(action)",action);show();verify(action+' refreshes displayed FASTA')
 edit('onMoveToDebrisClicked');show();debris=verify('Debris excludes removed source from displayed FASTA')
 assert debris['region']['segments'][0]['source']!=initial['region']['segments'][0]['source']
 p.evaluate("window.__hictBenchmark.manager().networkManager.requestManager.restoreAssemblyHistory('undo')");show();verify('Undo debris restores bases')
 p.screenshot(path=str(out/'edit-roundtrip.png'))
 assert not errors and not bad and not console,(errors,bad,console)
 (out/'edit-results.json').write_text(json.dumps({'passed':True,'checks':checks,'pageErrors':errors,'nonOk':bad,'console':console},indent=2));b.close()
