#!/usr/bin/env python3
"""Supplement candidate searches with curated aliases; preserve earlier evidence."""
import importlib,json,time
m=importlib.import_module('spot-photo-research')
queries=json.loads((m.ROOT/'docs/spot-images/search-overrides.json').read_text())
for key,q in queries.items():
 p=m.OUT/(key+'.json')
 r=json.loads(p.read_text()) if p.exists() else dict(zip(['city','name'],key.split('·',1)),candidates=[],review='pending')
 q += ' filetype:bitmap -metro -地图' if key.endswith('站') else ' filetype:bitmap -metro -station -地图'
 if q in r.get('supplementalQueries',[]):continue
 try:
  cs=m.search(q)
  titles={c['title']for c in r['candidates']}
  r['candidates'] += [c for c in cs if c['title']not in titles]
  r.setdefault('supplementalQueries',[]).append(q)
  r.pop('error',None)
  print(key,len(cs),flush=True)
 except Exception as e:
  print(key,str(e),flush=True)
 p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
 time.sleep(4)
