#!/usr/bin/env python3
"""Exercise the FASTA-only folder picker and real gzip creation on synthetic data.

The isolated API DATA_DIR must contain root.fa, nested/assembly.FASTA.GZ,
nested/notes.txt and an empty directory named empty. See --output for evidence.
"""
import argparse
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8188')
parser.add_argument('--api', default='http://127.0.0.1:5198')
parser.add_argument('--output', default='/tmp/hict-fasta-picker/results')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, listings, recursive = [], [], [], []

def check(name, condition, details=None):
    assert condition, (name, details)
    checks.append({'check': name, 'details': details})
    print('PASS: ' + name, flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1500, 'height': 1000})
    page.set_default_timeout(30000)
    page.add_init_script('window.__HICT_BENCHMARK_ENABLED__ = true')
    page.on('pageerror', lambda error: errors.append(str(error)))
    def requested(request):
        if request.url.endswith('/list_directory'):
            listings.append(request.post_data_json['directory'])
        if request.url.endswith(('/list_fasta_files', '/list_files', '/list_files_detailed')):
            recursive.append(request.url)
    page.on('request', requested)
    page.route('http://localhost:5000/**', lambda route: route.continue_(
        url=route.request.url.replace('http://localhost:5000', args.api)))
    page.goto(args.url)
    page.wait_for_function('window.__hictBenchmark')
    started = time.perf_counter()
    page.get_by_role('button', name='Open FASTA only…', exact=True).click()
    dialog = page.get_by_role('dialog', name='Open FASTA only', exact=True)
    picker = dialog.get_by_role('group', name='Choose a FASTA file', exact=True)
    picker.get_by_text('root.fa', exact=True).first.wait_for()
    check('Opening lists just the root folder', listings == [''], listings.copy())
    check('No recursive file scan is requested', not recursive)
    check('Folder listing is responsive on the synthetic fixture', time.perf_counter()-started < 5,
          {'seconds': round(time.perf_counter()-started, 3)})
    start = dialog.get_by_role('button', name='Create and open', exact=True)
    check('Creation requires an explicit file selection', start.is_disabled())
    picker.get_by_text('root.fa', exact=True).first.click()
    check('Explorer selection enables creation', start.is_enabled())
    picker.get_by_text('nested', exact=True).first.click()
    picker.get_by_text('assembly.FASTA.GZ', exact=True).first.wait_for()
    check('Entering a folder clears the previous selection', start.is_disabled())
    check('Explorer filters unrelated files', picker.get_by_text('notes.txt', exact=True).count() == 0)
    picker.get_by_label('Show all files', exact=True).check()
    picker.get_by_text('notes.txt', exact=True).first.click()
    check('Unsupported files cannot start a FASTA job', start.is_disabled())
    picker.get_by_label('Show all files', exact=True).uncheck()
    picker.get_by_text('assembly.FASTA.GZ', exact=True).first.click()
    check('Compressed uppercase FASTA files are accepted', start.is_enabled())
    picker.get_by_role('button', name='Tree', exact=True).click()
    picker.get_by_text('assembly.FASTA.GZ', exact=True).first.click()
    check('Tree selection preserves the chosen FASTA path',
          dialog.locator('#fasta-only-file').inner_text() == 'nested/assembly.FASTA.GZ')
    page.screenshot(path=str(out / 'tree.png'))
    picker.get_by_role('button', name='Root', exact=True).click()
    picker.get_by_text('empty', exact=True).first.wait_for()
    picker.get_by_text('empty', exact=True).first.dblclick()
    page.wait_for_timeout(250)
    check('An empty folder cannot start creation', start.is_disabled() and listings[-1] == 'empty')
    path = picker.get_by_placeholder('Relative path in the HiCT data folder')
    path.fill('nested/assembly.FASTA.GZ')
    path.press('Enter')
    page.wait_for_function("document.querySelector('#fasta-only-file')?.textContent==='nested/assembly.FASTA.GZ'")
    check('A pasted relative file path selects the file', start.is_enabled())
    picker.get_by_role('button', name='Explorer', exact=True).click()
    # A failed folder lookup remains recoverable without leaving the dialog.
    path.fill('does-not-exist')
    path.press('Enter')
    picker.locator('.alert-danger').wait_for()
    picker.get_by_role('button', name='Root', exact=True).click()
    picker.get_by_text('root.fa', exact=True).first.wait_for()
    check('Folder errors can be recovered using Root', picker.locator('.alert-danger').count() == 0)
    page.keyboard.press('Escape')
    check('Escape dismisses the containing dialog', dialog.count() == 0)
    page.get_by_role('button', name='Open FASTA only…', exact=True).click()
    picker.get_by_text('root.fa', exact=True).first.wait_for()
    check('Reopening remembers explorer mode', picker.locator('.file-selection-table').count() == 1)
    page.set_viewport_size({'width': 800, 'height': 650})
    picker.get_by_text('nested', exact=True).first.click()
    picker.get_by_text('assembly.FASTA.GZ', exact=True).first.click()
    dialog.get_by_label('Split at runs of N', exact=True).check()
    minimum = dialog.get_by_label('Minimum consecutive N (bp)', exact=True)
    minimum.fill('0')
    check('Split settings reject invalid run lengths', start.is_disabled())
    minimum.fill('100')
    dialog.locator('.modal-body').evaluate('e=>e.scrollTop=0')
    page.screenshot(path=str(out / 'explorer-compact.png'))
    check('Compact dialog keeps its footer available', start.is_visible())
    check('Browsing never starts a recursive list', not recursive, recursive)
    start.click()
    page.wait_for_function('window.__hictBenchmark.manager()', timeout=60000)
    page.wait_for_timeout(500)
    check('Compressed FASTA creation opens the new assembly',
          dialog.count() == 0 and page.locator('.ol-viewport').first.is_visible())
    check('Split-at-N creates multiple contigs', page.evaluate(
          'window.__hictBenchmark.manager().contigDimensionHolder.contig_count') >= 3)
    check('No browser errors', not errors, errors)
    (out / 'results.json').write_text(json.dumps(checks, indent=2) + '\n')
    browser.close()
