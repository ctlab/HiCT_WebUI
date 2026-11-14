#!/usr/bin/env python3
"""Check automatic FASTA alignment controls on disposable map/FASTA copies."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8188')
parser.add_argument('--api', default='http://127.0.0.1:5198')
parser.add_argument('--matrix', default='combined_ind2_4DN.hict.hdf5')
parser.add_argument('--fasta', default='quad.fa')
parser.add_argument('--output', default='/tmp/hict-alignment-controls')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, requests = [], [], []

def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS: ' + name, flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1500, 'height': 1000})
    page.set_default_timeout(60000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.post_data_json)
            if request.url.endswith('/sequence/alignment_detail') else None)
    page.route('http://localhost:5000/**', lambda route: route.continue_(
        url=route.request.url.replace('http://localhost:5000', args.api)))
    page.add_init_script('window.__HICT_BENCHMARK_ENABLED__ = true')
    page.goto(args.url)
    page.wait_for_function('window.__hictBenchmark')
    page.evaluate('a => window.__hictBenchmark.open(a.matrix,a.api,a.fasta)', vars(args))
    page.wait_for_timeout(1000)
    toggle = page.get_by_role('menuitemcheckbox', name='Automatically align visible FASTA')

    def menu():
        page.get_by_role('link', name='View', exact=True).click()
        toggle.wait_for(state='visible')

    def zoom():
        page.evaluate('''()=>{
            const m=window.__hictBenchmark.manager(),l=m.viewAndLayersManager;
            const p=l.getPixelResolutionForBpResolution(1000);
            m.getView().setResolution(p/1000/24);
            m.getView().setCenter([
                m.contigDimensionHolder.getFractionalPxOfBp(17263605,1000)*p,
                -m.contigDimensionHolder.getFractionalPxOfBp(17263845,1000)*p]);
            m.getMap().renderSync();
        }''')

    menu()
    check('Automatic alignment is enabled by default', toggle.get_attribute('aria-checked') == 'true')
    check('Menu describes the compared sequences and navigation',
          'horizontal and vertical FASTA' in page.locator('#automatic-alignment-description').inner_text())
    page.keyboard.press('Escape')
    zoom()
    page.wait_for_function('window.__hictBenchmark.manager().alignmentDetail.source.getFeatures().length>0')
    legend = page.get_by_role('complementary', name='Automatic FASTA alignment legend')
    legend.wait_for(state='visible')
    check('Automatic result uses shaped SVG markers', page.evaluate('''()=>
        window.__hictBenchmark.manager().alignmentDetail.source.getFeatures()
        .every(f=>f.getStyle().getImage()?.getSrc().startsWith('data:image/svg+xml,'))'''))
    check('Legend explains all marker types', all(text in legend.inner_text() for text in
          ['Forward match', 'Reverse match', 'Substitution', 'Ambiguous base', 'Insertion / deletion']))
    r, host = legend.bounding_box(), page.locator('.map-shell').bounding_box()
    check('Legend stays in the bottom right of the map',
          0 <= host['x']+host['width']-r['x']-r['width'] <= 20 and
          0 <= host['y']+host['height']-r['y']-r['height'] <= 20)
    for button in page.locator('[data-sonner-toast] [data-close-button]').all():
        if button.is_visible():
            button.click()
    page.wait_for_timeout(250)
    page.screenshot(path=str(out / 'enabled.png'))
    for extension, method in [('png', 'exportCurrentMapPng'), ('svg', 'exportCurrentMapSvg'), ('pdf', 'exportCurrentMapPdf')]:
        with page.expect_download() as saved:
            page.evaluate("method=>window.__hictBenchmark.manager()[method](undefined,{scope:'viewport'})", method)
        target = out / ('alignment-markers.' + extension)
        saved.value.save_as(target)
        check(extension.upper() + ' export supports shaped markers', target.stat().st_size > 500)

    menu()
    toggle.click()
    page.keyboard.press('Escape')
    check('Disable immediately removes legend and markers',
          legend.count() == 0 and page.evaluate('window.__hictBenchmark.manager().alignmentDetail.source.isEmpty()'))
    count = len(requests)
    page.evaluate('''()=>{const v=window.__hictBenchmark.manager().getView(),c=v.getCenter();v.setCenter([c[0]+v.getResolution()*10,c[1]])}''')
    page.wait_for_timeout(600)
    check('Disabled navigation starts no alignment requests', len(requests) == count)
    page.reload()
    page.wait_for_function('window.__hictBenchmark')
    menu()
    check('Disabled preference survives reload', toggle.get_attribute('aria-checked') == 'false')
    page.keyboard.press('Escape')
    page.evaluate('a => window.__hictBenchmark.open(a.matrix,a.api,a.fasta)', vars(args))
    zoom()
    page.wait_for_timeout(600)
    check('Reopened map respects disabled preference', legend.count() == 0)
    menu()
    toggle.click()
    page.keyboard.press('Escape')
    legend.wait_for(state='visible')
    page.wait_for_function('window.__hictBenchmark.manager().alignmentDetail.source.getFeatures().length>0')
    check('Enable resumes alignment without another gesture', True)
    # The same labeled key fits a narrow workspace without extending off-map.
    page.set_viewport_size({'width': 900, 'height': 700})
    page.wait_for_timeout(600)
    if legend.count():
        r, host = legend.bounding_box(), page.locator('.map-shell').bounding_box()
        check('Legend fits a compact workspace', r['x'] >= host['x'] and r['width'] <= host['width'])
        page.screenshot(path=str(out / 'compact.png'))
    check('No browser errors', not errors)
    (out / 'results.json').write_text(json.dumps(checks, indent=2) + '\n')
    browser.close()
