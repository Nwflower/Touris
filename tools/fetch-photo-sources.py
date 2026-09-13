#!/usr/bin/env python3
"""Append candidates from explicitly identified Commons files/categories."""
import importlib,json,time
m=importlib.import_module('spot-photo-research');root=m.ROOT/'docs/spot-images'
for key,sources in json.loads((root/'direct-sources.json').read_text()).items():
 path=m.OUT/(key+'.json');r=json.loads(path.read_text()) if path.exists() else dict(zip(['city','name'],key.split('·',1)),candidates=[],review='pending')
 for source in sources:
  if source in r.get('directSources',[]):continue
  params={'action':'query','prop':'imageinfo','iiprop':'url|size|mime|extmetadata','iiurlwidth':640}
  if source.startswith('Category:'):params.update(generator='categorymembers',gcmtitle=source,gcmtype='file',gcmlimit=30)
  else:params['titles']=source
  result=m.request(params);cs=[m.summarize(p) for p in result.get('query',{}).get('pages',{}).values() if 'imageinfo' in p]
  titles={c['title'] for c in r['candidates']};r['candidates'] += [c for c in cs if c['title'] not in titles]
  r.setdefault('directSources',[]).append(source);path.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(key,source,len(cs),flush=True);time.sleep(2)
