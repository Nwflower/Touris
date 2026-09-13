#!/usr/bin/env python3
"""Recover source metadata for existing photos without assuming they match the spot."""
import importlib,json,urllib.parse,time
m=importlib.import_module('spot-photo-research');root=m.ROOT
rows=json.loads((root/'docs/spot-images/baseline.json').read_text())
sources=json.loads((root/'tools/image-sources.json').read_text())['sources']
credits=json.loads((root/'docs/cities/new-image-credits.json').read_text())
credits={r['file']:r for r in credits}
todo=[];unknown=[]
for r in rows:
 if not r['exists']:continue
 title=None
 if r['image'].startswith('img/') and r['name']in sources:title='File:'+sources[r['name']]
 elif r['image']in credits:title=urllib.parse.unquote(credits[r['image']]['url'].split('/wiki/')[-1])
 if title:todo.append((r,title))
 else:unknown.append(r)
(root/'docs/spot-images/legacy-without-source.json').write_text(json.dumps(unknown,ensure_ascii=False,indent=2)+'\n')
for start in range(0,len(todo),10):
 chunk=todo[start:start+10]
 if all((m.OUT/(r['city']+'·'+r['name']+'.json')).exists()for r,t in chunk):continue
 try:
  resp=m.request({'titles':'|'.join(dict.fromkeys(t for r,t in chunk)),'prop':'imageinfo','iiprop':'url|extmetadata|size|mime','iiurlwidth':640})
  pages=resp.get('query',{}).get('pages',{}).values(); candidates={p['title'].replace('_',' '):m.summarize(p)for p in pages if p.get('imageinfo')}
  for r,title in chunk:
   key=r['city']+'·'+r['name'];p=m.OUT/(key+'.json')
   if p.exists():continue
   c=candidates.get(title.replace('_',' '));out={'city':r['city'],'name':r['name'],'query':title,'review':'pending','existingFile':r['image'],'candidates':[c]if c else []}
   p.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(key,'OK'if c else 'no metadata',flush=True)
 except Exception as e:print('batch',start,str(e),flush=True)
 time.sleep(5)
