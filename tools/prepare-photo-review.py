#!/usr/bin/env python3
"""Prepare explicitly selected photo candidates; never approve automatically.

Input: a JSON list of {key, candidate, evidence, fit?}, or {key, title,
evidence, fit?} selecting an existing research candidate. It preserves research
metadata, downloads exact files and creates a local visual contact sheet.
"""
import concurrent.futures
import hashlib
import html
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/spot-images'
PROTO = ROOT / 'prototype'

def prepare(spec):
    key = spec['key']
    file = OUT / 'research' / (key + '.json')
    row = json.loads(file.read_text())
    if 'candidate' in spec:
        c = spec['candidate']
        row['candidates'] = [x for x in row['candidates'] if x['title'] != c['title']] + [c]
        file.write_text(json.dumps(row, ensure_ascii=False, indent=2) + '\n')
    else:
        c, = [x for x in row['candidates'] if x['title'] == spec['title']]
    ext = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}[c['mime']]
    rel = 'img/spots/' + hashlib.sha256(c['title'].encode()).hexdigest()[:16] + ext
    dest = PROTO / rel
    if not dest.exists():
        request = urllib.request.Request(c['download'], headers={'User-Agent': 'Touris-photo-audit/1.0'})
        dest.write_bytes(urllib.request.urlopen(request, timeout=45).read())
    return {'key': key, 'title': c['title'], 'rel': rel,
            'evidence': spec['evidence'], 'fit': spec.get('fit', 'contain')}

specs = json.loads(pathlib.Path(sys.argv[1]).read_text())
if len({s['key'] for s in specs}) != len(specs):
    raise ValueError('Duplicate place in review batch')
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    rows = list(pool.map(prepare, specs))
(OUT / 'next-review.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
cards = ['<article><h2>' + html.escape(r['key']) + '</h2><img src="' + r['rel']
         + '" alt="' + html.escape(r['key']) + '"><p>' + html.escape(r['evidence']) + '</p></article>' for r in rows]
(PROTO / '_photo-candidates.html').write_text(
    '<meta charset="utf-8"><title>Photo candidates</title><style>'
    'body{font:14px system-ui}main{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}'
    'h2{font-size:18px}img{width:100%;height:240px;object-fit:contain}p{font-size:12px}'
    '</style><main>' + ''.join(cards) + '</main>')
print(f'{len(rows)} exact candidates ready for visual review (not approved)')
