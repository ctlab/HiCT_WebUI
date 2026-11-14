#!/usr/bin/env python3
"""Read-only map navigation and contrast control regression checks.

Run against a local API with a disposable copy of a supported multi-resolution
map. Requires Playwright and its Chromium browser; no edits or saves are issued.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8188')
    parser.add_argument('--api', default='http://127.0.0.1:5198')
    parser.add_argument('--matrix', default='combined_ind2_4DN.hict.hdf5')
    parser.add_argument('--output', default='/tmp/hict-navigation-check')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    checks, errors = [], []

    def check(name, condition, details=None):
        assert condition, (name, details)
        checks.append({'check': name, 'details': details})
        print('PASS: ' + name, flush=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1500, 'height': 1000})
        page.set_default_timeout(60000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('http://localhost:5000/**', lambda route: route.continue_(
            url=route.request.url.replace('http://localhost:5000', args.api)))
        page.add_init_script('window.__HICT_BENCHMARK_ENABLED__ = true')
        page.goto(args.url)
        page.wait_for_function('window.__hictBenchmark')
        page.evaluate('args => window.__hictBenchmark.open(args.matrix,args.api)',
                      {'matrix': args.matrix, 'api': args.api})
        page.wait_for_timeout(1800)
        # Observe the production handlers without replacing their behavior.
        page.evaluate('''() => {
            const m = window.__hictBenchmark.manager();
            window.__navigationChecks = {reloads: 0, fits: 0};
            for (const key of ['reloadTiles', 'reloadTilesFromBackend']) {
                const original = m[key].bind(m);
                m[key] = (...args) => {
                    window.__navigationChecks.reloads++;
                    return original(...args);
                };
            }
            const vm = m.visualizationManager;
            const original = vm.applyOpeningViewportQuantileThreshold.bind(vm);
            vm.applyOpeningViewportQuantileThreshold = (...args) => {
                window.__navigationChecks.fits++;
                return original(...args);
            };
        }''')

        def snapshot():
            return page.evaluate('''() => {
                const m = window.__hictBenchmark.manager();
                return {
                    options: JSON.stringify(m.visualizationManager
                        .visualizationOptionsStore.asVisualizationOptions()),
                    revision: m.networkManager.requestManager.renderPipelineRevision,
                    bp: m.viewAndLayersManager.currentViewState
                        .resolutionDesciptor.bpResolution,
                    ...window.__navigationChecks
                };
            }''')

        baseline = snapshot()
        box = page.locator('.ol-viewport').first.bounding_box()
        x, y = box['x'] + box['width'] * .58, box['y'] + box['height'] * .58
        page.mouse.move(x, y)
        for _ in range(24):
            page.mouse.wheel(0, -400)
            page.wait_for_timeout(400)
            if snapshot()['bp'] != baseline['bp']:
                break
        check('Wheel crosses a pyramid resolution boundary',
              snapshot()['bp'] != baseline['bp'])
        for dx, dy in [(70, 0), (0, 60), (-80, -40)]:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x + dx, y + dy, steps=12)
            page.mouse.up()
            page.wait_for_timeout(650)
        page.wait_for_timeout(1500)
        after = snapshot()
        check('Wheel and pan preserve contrast and pipeline',
              after['options'] == baseline['options'] and
              after['revision'] == baseline['revision'])
        check('Navigation performs no contrast fits or extra tile reloads',
              after['reloads'] == 0 and after['fits'] == 0, after)
        status = page.get_by_test_id('exact-range-status').text_content()
        check('Slider data follows loaded viewport tiles',
              'Loaded viewport tiles' in status, status)
        page.screenshot(path=str(output / 'navigation.png'))

        lower = page.get_by_role('spinbutton', name='Lower signal threshold')
        upper = page.get_by_role('spinbutton', name='Upper signal threshold')
        lower.fill('0')
        upper.fill('0.0001')
        page.locator('.range-details summary').click()
        maximum = page.get_by_role('spinbutton', name='Slider maximum signal')
        maximum.fill('1')
        maximum.press('Tab')
        page.locator('.range-details summary').click()
        page.wait_for_timeout(800)
        lo = page.get_by_role('slider', name='Lower threshold', exact=True)
        hi = page.get_by_role('slider', name='Upper threshold', exact=True)
        a, z = lo.bounding_box(), hi.bounding_box()
        check('Close handles separate lower down and upper up',
              a['y'] - z['y'] >= 18, {'lower': a, 'upper': z})
        page.locator('.threshold-compact-card').screenshot(
            path=str(output / 'close-handles.png'))
        for handle, field, other in [(hi, upper, lower), (lo, lower, upper)]:
            previous, unchanged = float(field.input_value()), other.input_value()
            rect = handle.bounding_box()
            cx, cy = rect['x'] + rect['width'] / 2, rect['y'] + rect['height'] / 2
            page.mouse.move(cx, cy)
            page.mouse.down()
            check('Grabbing ' + handle.get_attribute('aria-label') + ' keeps its value',
                  float(field.input_value()) == previous)
            page.mouse.move(cx + 20, cy, steps=8)
            page.mouse.up()
            page.wait_for_timeout(500)
            check('Dragging ' + handle.get_attribute('aria-label') + ' is independent',
                  float(field.input_value()) > previous and other.input_value() == unchanged)
        previous = float(upper.input_value())
        hi.focus()
        page.keyboard.press('ArrowRight')
        page.wait_for_timeout(500)
        check('Keyboard increases the upper threshold', float(upper.input_value()) > previous)
        before = (lower.input_value(), upper.input_value())
        page.get_by_role('button', name='Log', exact=True).click()
        check('Log slider sensitivity preserves thresholds',
              (lower.input_value(), upper.input_value()) == before)
        page.get_by_role('button', name='Linear', exact=True).first.click()
        page.get_by_role('button', name='Focus range', exact=True).click()
        check('Focus range spreads the handles',
              hi.bounding_box()['x'] - lo.bounding_box()['x'] > 200)
        check('No browser errors', not errors, errors)
        (output / 'results.json').write_text(json.dumps(checks, indent=2) + '\n')
        browser.close()


if __name__ == '__main__':
    main()
