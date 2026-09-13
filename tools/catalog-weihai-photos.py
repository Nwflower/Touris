#!/usr/bin/env python3
"""Index Wikimedia's Weihai category tree; metadata candidates only, never auto-approve."""
import importlib,json,time,pathlib
m=importlib.import_module('spot-photo-research');out=m.ROOT/'docs/spot-images/weihai-catalog';out.mkdir(exist_ok=True)
queue=[('Category:Weihai',0)];seen=set();files={}
while queue:
 title,depth=queue.pop(0)
 if title in seen:continue
 seen.add(title);cache=out/(title.replace('/','_')+'.json')
 if cache.exists():rows=json.loads(cache.read_text())
 else:
  params={'action':'query','list':'categorymembers','cmtitle':title,'cmlimit':'500'};rows=[]
  while True:
   r=m.request(params);rows+=r.get('query',{}).get('categorymembers',[])
   if 'continue' not in r:break
   params.update(r['continue']);time.sleep(2)
  cache.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');time.sleep(2)
 print(title,len(rows),flush=True)
 for r in rows:
  if r['ns']==6:files[r['title']]=r
  elif r['ns']==14 and depth<3 and not any(s in r['title'].lower() for s in ['maps','history','british','locator','shipyard','railway lines','number plates']):queue.append((r['title'],depth+1))
(out/'files.json').write_text(json.dumps(list(files.values()),ensure_ascii=False,indent=2)+'\n')
print('FILES',len(files),flush=True)
import hashlib
def metadata_path(title):return out/(hashlib.sha256(title.encode()).hexdigest()[:16]+'.json')
pending=[title for title in files if not metadata_path(title).exists()]
for offset in range(0,len(pending),20):
 batch=pending[offset:offset+20]
 r=m.request({'action':'query','titles':'|'.join(batch),'prop':'imageinfo','iiprop':'url|size|mime|extmetadata','iiurlwidth':640})
 for page in r.get('query',{}).get('pages',{}).values():
  if 'imageinfo' in page:metadata_path(page['title']).write_text(json.dumps(m.summarize(page),ensure_ascii=False,indent=2)+'\n')
 print('METADATA',offset+len(batch),'/',len(pending),flush=True)
 time.sleep(3)
