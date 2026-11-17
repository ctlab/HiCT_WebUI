#!/usr/bin/env python3
"""Query OSV for crates.io packages in the native lockfile; retain local-source coverage gaps."""
import argparse
import datetime
import json
from pathlib import Path
import tomllib
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    packages = tomllib.loads((root / 'src-tauri/Cargo.lock').read_text())['package']
    registry = [p for p in packages if p.get('source', '').startswith('registry+')]
    report = {'checkedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'source': 'https://api.osv.dev/v1/querybatch',
              'scope': 'All crates.io lockfile entries, including inactive targets/build dependencies; reachability not inferred',
              'componentsChecked': len(registry),
              'localPackagesNotScanned': [{'name': p['name'], 'version': p['version']} for p in packages if 'source' not in p]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        answers = []
        for offset in range(0, len(registry), 500):
            batch = registry[offset:offset + 500]
            queries = [{'package': {'ecosystem': 'crates.io', 'name': p['name']}, 'version': p['version']} for p in batch]
            request = urllib.request.Request(report['source'], json.dumps({'queries': queries}).encode(),
                {'Content-Type': 'application/json', 'User-Agent': 'HiCT-native-release-audit/1'})
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.load(response)['results']
            assert len(result) == len(batch), 'Incomplete OSV response'
            answers.extend(result)
        findings = [{'package': p['name'], 'version': p['version'], 'advisories': r['vulns']}
                    for p, r in zip(registry, answers) if r.get('vulns')]
        report.update(status='completed', flaggedComponents=findings)
    except Exception as error:
        report.update(status='incomplete', error=type(error).__name__ + ': ' + str(error))
        args.output.write_text(json.dumps(report, indent=2) + '\n')
        raise
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'componentsChecked': len(registry), 'flaggedComponents': len(findings),
                      'localPackagesNotScanned': report['localPackagesNotScanned']}))
    return 1 if findings else 0


if __name__ == '__main__':
    raise SystemExit(main())
