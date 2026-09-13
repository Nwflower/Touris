#!/usr/bin/env python3
"""Collect photo candidates with Commons metadata; never auto-approve a search hit.

Results are checkpointed per city/spot. Re-running resumes completed queries.
Use --only NAME to inspect an individual query. TLS verification stays enabled.
"""
import concurrent.futures
import hashlib
import html
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/spot-images/research'
OUT.mkdir(parents=True, exist_ok=True)
UA = 'Touris-photo-audit/1.0 (Wikimedia Commons attribution research)'

def request(params):
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', **params})
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as res:
                result = json.load(res)
            if 'error' in result:
                raise RuntimeError(str(result['error']))
            return result
        except Exception as exc:
            if attempt == 2:
                raise
            delay = 5 * (attempt + 1)
            if isinstance(exc, urllib.error.HTTPError) and exc.code == 429:
                retry_after = exc.headers.get('Retry-After', '30')
                delay = max(30, int(retry_after)) if retry_after.isdigit() else 30
            time.sleep(delay)

def plain(value):
    return html.unescape(re.sub('<[^>]+>', '', value or '')).strip()

def summarize(page):
    ii = page.get('imageinfo', [{}])[0]
    meta = ii.get('extmetadata', {})
    return {
        'title': page['title'], 'pageId': page['pageid'],
        'source': ii.get('descriptionurl'), 'download': ii.get('thumburl', ii.get('url')),
        'original': ii.get('url'), 'width': ii.get('width'), 'height': ii.get('height'),
        'mime': ii.get('mime'),
        **{k: plain(meta.get(v, {}).get('value', '')) for k, v in {
            'description': 'ImageDescription', 'author': 'Artist',
            'license': 'LicenseShortName', 'licenseUrl': 'LicenseUrl',
            'categories': 'Categories', 'attribution': 'Attribution',
            'restrictions': 'Restrictions', 'credit': 'Credit'}.items()}}

def search(query, limit=6):
    result = request({'generator': 'search', 'gsrsearch': query, 'gsrnamespace': 6,
                      'gsrlimit': limit, 'prop': 'imageinfo',
                      'iiprop': 'url|extmetadata|size|mime', 'iiurlwidth': 640})
    pages = sorted(result.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 99))
    return [summarize(p) for p in pages if p.get('imageinfo')]

def work(row):
    key = row['city'] + '·' + row['name']
    dest = OUT / (key + '.json')
    if dest.exists() and 'error' not in json.loads(dest.read_text()):
        return key + ' cached'
    query = row['name'] + ' filetype:bitmap -地铁 -metro -station -地图'
    # Short/common names need an explicit city to avoid unrelated places.
    if len(row['name']) <= 4 or row['name'] in ['人民广场', '文化公园', '东湖公园']:
        query = row['city'] + ' ' + query
    result = {'city': row['city'], 'name': row['name'], 'query': query,
              'review': 'pending', 'candidates': []}
    try:
        result['candidates'] = search(query)
    except Exception as exc:
        result['error'] = str(exc)
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    time.sleep(1)
    return key + ': ' + (result.get('error') or str(len(result['candidates'])))

if __name__ == '__main__':
    rows = json.loads((ROOT / 'docs/spot-images/baseline.json').read_text())
    rows = [r for r in rows if not r['exists']]
    if '--only' in sys.argv:
        names = sys.argv[sys.argv.index('--only') + 1:]
        rows = [r for r in rows if r['name'] in names]
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        for status in pool.map(work, rows):
            print(status, flush=True)
