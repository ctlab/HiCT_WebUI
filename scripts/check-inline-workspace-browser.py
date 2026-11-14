import os
import json,time,math
from pathlib import Path
from xml.etree import ElementTree as ET
from playwright.sync_api import sync_playwright
out=Path(os.environ.get('HICT_TEST_OUTPUT','test-results/inline-workspace'));out.mkdir(parents=True,exist_ok=True); checks=[]
def check(name,value,details=None):
 assert value,(name,details)
 checks.append({'check':name,'passed':True,'details':details});print('PASS: '+name,flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path=os.environ.get('HICT_TEST_CHROMIUM'))
 p=b.new_page(viewport={'width':1500,'height':1000});errors=[];bad=[];console=[];requests=[]
 p.route('http://localhost:5000/**',lambda r:r.continue_(url=r.request.url.replace('http://localhost:5000',os.environ.get('HICT_TEST_API','http://127.0.0.1:5191'))))
 p.on('console',lambda m:console.append({'type':m.type,'text':m.text}) if m.type in ('warning','error') else None)
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.on('response',lambda r:bad.append({'url':r.url,'status':r.status}) if r.status>=400 else None)
 p.on('request',lambda r:requests.append({'url':r.url,'body':r.post_data}))
 p.add_init_script('window.__HICT_BENCHMARK_ENABLED__=true')
 p.goto(os.environ.get('HICT_TEST_URL','http://127.0.0.1:8084'));p.wait_for_function('window.__hictBenchmark')
 p.evaluate("api=>window.__hictBenchmark.open('q4_primary.hict.hdf5',api,'q4.fa')",os.environ.get("HICT_TEST_API","http://127.0.0.1:5191"))
 p.evaluate("window.__hictBenchmark.manager().linearTrackManager.openTrack('sequence-axis-annotations.bed','Sequence features')")
 def zoom():
  p.evaluate('''()=>{const m=window.__hictBenchmark.manager(),x=m.getContigDimensionHolder().getFractionalPxOfBp(37450,1000);m.getView().setResolution(1);m.getView().setCenter([x,-x]);m.getView().setResolution(1/2000);}''')
  p.wait_for_function("[...document.querySelectorAll('.sequence-axis')].every(e=>e.offsetWidth&&Number(e.dataset.endBp)>Number(e.dataset.startBp))")
  p.wait_for_timeout(500)
 zoom()
 check('Inline FASTA keeps map and tracks visible',p.locator('.sequence-detail').count()==0 and p.locator('.ol-viewport').first.is_visible() and p.locator('#horizontal-igv-track-div').is_visible())
 check('FASTA does not force assembly read-only',not p.evaluate('window.__hictBenchmark.manager().networkManager.requestManager.sequenceViewReadOnly'))
 h=p.locator('canvas.sequence-axis.horizontal');v=p.locator('canvas.sequence-axis.vertical')
 geometry=p.evaluate('''()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {track:r('#horizontal-igv-track-div'),fasta:r('canvas.sequence-axis.horizontal'),ruler:r('.ruler-surface--sequence-horizontal'),map:window.__hictBenchmark.manager().getMap().getViewport().getBoundingClientRect().toJSON()}}''')
 check('FASTA is between annotations and ruler',geometry['track']['bottom']<=geometry['fasta']['top'] and geometry['fasta']['bottom']<=geometry['ruler']['top'],geometry)
 def state():return p.evaluate('''()=>{const m=window.__hictBenchmark.manager();return {center:m.getView().getCenter(),resolution:m.getView().getResolution()}}''')
 for axis,loc,dx,dy in [('columns',h,48,0),('rows',v,0,48)]:
  before=state();box=loc.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
  p.mouse.move(x,y);p.mouse.down();p.mouse.move(x+dx,y+dy,steps=8);p.mouse.up();p.wait_for_timeout(400);after=state()
  index=0 if axis=='columns' else 1
  expected=before['center'][index]+(-dx if index==0 else dy)*before['resolution']
  check('Drag FASTA '+axis+' synchronizes only its map axis',abs(after['center'][index]-expected)<1e-8 and after['center'][1-index]==before['center'][1-index],{'before':before,'after':after})
 before=state();h.hover();p.mouse.wheel(0,-100);p.wait_for_timeout(700)
 check('Wheel over FASTA zooms map',state()['resolution']<before['resolution'],{'before':before,'after':state()})
 before=state();h.focus();p.keyboard.press('ArrowRight');p.wait_for_timeout(200)
 check('Keyboard pans FASTA and map',state()['center'][0]>before['center'][0])
 zoom()
 # Hover a base and verify provenance is visible outside the 32px track.
 box=h.bounding_box();p.mouse.move(box['x']+25,box['y']+16);tip=p.get_by_role('tooltip');tip.wait_for(state='visible')
 check('FASTA hover has original/current coordinates',all(s in tip.inner_text() for s in ['Current assembly:','Original FASTA:','Contig:','Scaffold:']),tip.inner_text())
 check('FASTA tooltip escapes track clipping',tip.bounding_box()['height']>box['height'] and tip.evaluate('e=>e.parentElement===document.body'))
 p.keyboard.press('Escape');check('Escape dismisses tooltip',tip.count()==0)
 # Find the actual scaffold boundary in the current viewport.
 pixel=p.evaluate('''()=>{const m=window.__hictBenchmark.manager(),x=m.getContigDimensionHolder().getFractionalPxOfBp(37450,1000);return m.getMap().getPixelFromCoordinate([x,0])[0]}''')
 p.mouse.move(box['x']+pixel,box['y']+16);tip.wait_for(state='visible')
 check('Scaffold separator annotates configured Ns without spatial padding','1,000 Ns' in tip.inner_text() and 'gap-free' in tip.inner_text(),tip.inner_text())
 p.keyboard.press('Escape')
 # Annotation hover; use actual rendered feature hit testing, not a fake hit.
 hit=p.evaluate('''()=>{const m=window.__hictBenchmark.manager(),e=document.querySelector('#horizontal-igv-track-div'),r=e.getBoundingClientRect();for(let x=10;x<r.width-10;x+=5){const hit=m.linearTrackManager.getTrackHoverAt('horizontal',x,r.height/2);if(hit?.kind==='feature')return {x:r.left+x,y:r.top+r.height/2}}}''')
 check('Annotation feature is rendered',bool(hit),hit)
 p.mouse.move(hit['x'],hit['y']);p.wait_for_timeout(250);tip.wait_for(state='visible');rect=tip.bounding_box();host=p.locator('#horizontal-igv-track-div').bounding_box()
 check('Annotation tooltip escapes track clipping',rect['y']+rect['height']>host['y']+host['height'] and tip.evaluate('e=>e.parentElement===document.body'),{'tooltip':rect,'track':host})
 p.screenshot(path=str(out/'annotation-tooltip.png'))
 tip.hover();p.wait_for_timeout(200);check('Tooltip remains available when pointer enters it',tip.is_visible())
 p.keyboard.press('Escape');p.mouse.move(10,10)
 # Range editor: reproduce the very narrow range from the report.
 lower=p.get_by_role('spinbutton',name='Lower signal threshold');upper=p.get_by_role('spinbutton',name='Upper signal threshold')
 upper.fill('0.003');lower.fill('0');p.locator('.range-details summary').click()
 p.get_by_role('spinbutton',name='Slider maximum signal').fill('0.250397');p.get_by_role('spinbutton',name='Slider maximum signal').press('Tab');p.wait_for_timeout(700)
 p.locator('.range-details summary').click()
 lo=p.get_by_role('slider',name='Lower threshold',exact=True);hi=p.get_by_role('slider',name='Upper threshold',exact=True)
 a=lo.bounding_box();z=hi.bounding_box();check('Close threshold handles separate lower down and upper up',(a['y']+a['height']/2)-(z['y']+z['height']/2)>=18,{'lower':a,'upper':z})
 p.screenshot(path=str(out/'range-controls.png'))
 hi.focus();p.keyboard.press('ArrowRight');p.wait_for_timeout(500);check('Upper handle keyboard changes threshold',float(upper.input_value())>.003,upper.input_value())
 p.get_by_role('button',name='Focus range',exact=True).click();p.wait_for_timeout(100)
 check('Focus range spreads the handles',hi.bounding_box()['x']-lo.bounding_box()['x']>200)
 rail=p.locator('.signal-range').bounding_box();a=hi.bounding_box()
 p.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);p.mouse.down();p.mouse.move(rail['x']+rail['width']*.7,a['y']+a['height']/2,steps=8);p.mouse.up();p.wait_for_timeout(500)
 check('Dragging threshold changes numeric value',0<float(upper.input_value())<.0055,upper.input_value())
 old=upper.input_value();p.get_by_role('button',name='Log',exact=True).click();check('Log sensitivity preserves threshold',upper.input_value()==old)
 check('No whole-map scan triggered by navigation/threshold UI',not any('signal/range' in r['url'] or 'exact-range' in r['url'] for r in requests))
 # Exports contain both matrix images and editable sequence glyphs.
 p.mouse.move(10,10);downloads=[]
 for ext in ['svg','png','pdf']:
  started=time.perf_counter()
  with p.expect_download(timeout=60000) as download:p.locator('#export-'+ext+'-button').click()
  target=out/('inline-sequence.'+ext);download.value.save_as(target)
  check(ext.upper()+' export produces output',target.stat().st_size>1000)
  p.wait_for_function('!window.__hictBenchmark.manager().isExporting')
  downloads.append({'format':ext,'bytes':target.stat().st_size,'seconds':time.perf_counter()-started})
 svg=ET.parse(out/'inline-sequence.svg').getroot();ns={'s':'http://www.w3.org/2000/svg'};texts=[t.text or '' for t in svg.findall('.//s:text',ns)]
 check('SVG contains editable FASTA bases',sum(t in ['A','C','G','T','N'] for t in texts)>20)
 check('SVG retains raster matrix',len(svg.findall('.//s:image',ns))>0)
 check('SVG retains other tracks',any('Sequence features' in t for t in texts))
 p.screenshot(path=str(out/'inline-viewport.png'))
 # Zoom back to contact map scale and verify FASTA leaves the layout.
 p.evaluate('window.__hictBenchmark.manager().getView().setResolution(.1)');p.wait_for_timeout(500)
 check('Zoom out hides FASTA and keeps map',not h.is_visible() and p.locator('.ol-viewport').first.is_visible())
 p.set_viewport_size({'width':1000,'height':800});zoom();p.screenshot(path=str(out/'inline-narrow.png'))
 check('Narrow workspace keeps FASTA and map',h.is_visible() and p.locator('.ol-viewport').first.is_visible())
 seqreq=[json.loads(r['body']) for r in requests if '/sequence/region' in r['url']]
 check('FASTA requests remain bounded',bool(seqreq) and all(r['endBp']-r['startBp']<=4096 for r in seqreq),{'requests':len(seqreq),'maxBases':max(r['endBp']-r['startBp'] for r in seqreq)})
 check('No browser exceptions',not errors,errors);check('No browser warnings/errors',not console,console);check('No failed HTTP responses',not bad,bad)
 (out/'result.json').write_text(json.dumps({'passed':True,'checks':checks,'downloads':downloads,'errors':errors,'console':console,'nonOk':bad},indent=2))
 print(json.dumps({'passed':True,'checks':len(checks),'downloads':downloads},indent=2));b.close()
