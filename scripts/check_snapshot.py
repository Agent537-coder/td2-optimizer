"""Verify extracted snapshot and describe assets without guessing unused files."""
import argparse
from collections import defaultdict
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class PageAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'):
            self.paths.append(attrs['src'])
        elif tag == 'link' and attrs.get('href') and 'stylesheet' in attrs.get('rel', '').split():
            self.paths.append(attrs['href'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, help='Write grouped asset inventory as JSON')
    args = parser.parse_args()
    errors = []
    manifest = json.loads((ROOT / 'SOURCE-MANIFEST.json').read_text(encoding='utf-8'))
    for row in manifest['files']:
        path = ROOT / row['path']
        if not path.is_file():
            errors.append('missing: ' + row['path'])
        elif hashlib.sha256(path.read_bytes()).hexdigest() != row['snapshotSHA256']:
            errors.append('hash changed: ' + row['path'])

    json_count = 0
    groups = defaultdict(lambda: {'files': 0, 'bytes': 0})
    for path in sorted((ROOT / 'web').rglob('*')):
        if not path.is_file():
            continue
        if path.suffix.lower() == '.json':
            json_count += 1
            try:
                json.loads(path.read_text(encoding='utf-8'))
            except (ValueError, UnicodeError) as exc:
                errors.append(f'invalid JSON: {path.relative_to(ROOT).as_posix()}: {exc}')
        # Keep nested image types visible rather than listing thousands of files.
        group = path.parent.relative_to(ROOT).as_posix()
        groups[group]['files'] += 1
        groups[group]['bytes'] += path.stat().st_size

    page = PageAssets()
    page.feed((ROOT / 'web/dashboard_build.html').read_text(encoding='utf-8'))
    for src in page.paths:
        url = urlsplit(src)
        if url.scheme or url.netloc:
            continue
        path = ROOT / 'web' / unquote(url.path).lstrip('/')
        if not path.is_file():
            errors.append('missing page asset: ' + src)

    result = {
        'ok': not errors,
        'manifestFiles': len(manifest['files']),
        'parsedDataJSON': json_count,
        'pageScriptsAndStyles': len(page.paths),
        'webFiles': sum(group['files'] for group in groups.values()),
        'webBytes': sum(group['bytes'] for group in groups.values()),
        'groups': dict(sorted(groups.items())),
        'errors': errors,
        'scope': 'Snapshot integrity and directory inventory; not unused-asset detection or browser QA',
    }
    output = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output, encoding='utf-8')
    print(output, end='')
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
