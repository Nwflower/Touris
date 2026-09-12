/* 逐个 HEAD 检查配图 URL 是否真的可达。用完即删。 */
const fs = require('fs'), vm = require('vm'), https = require('https');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('images.js', 'utf8'), ctx, { filename:'images.js' });
const SPOT_IMG = vm.runInContext('SPOT_IMG', ctx);

function head(url){
  return new Promise(res => {
    const req = https.request(url, { method:'HEAD', timeout:12000,
      headers:{ 'User-Agent':'prototype-image-check/1.0 (local demo)' } }, r => {
      res({ code:r.statusCode, type:r.headers['content-type'] || '', len:+r.headers['content-length'] || 0 });
      r.resume();
    });
    req.on('timeout', () => { req.destroy(); res({ code:0, type:'TIMEOUT' }); });
    req.on('error', e => res({ code:0, type:'ERR ' + e.code }));
    req.end();
  });
}

(async () => {
  const names = Object.keys(SPOT_IMG);
  const okList = [], badList = [];
  // 串行 + 小间隔，避免触发 429
  for(const n of names){
    const r = await head(SPOT_IMG[n]);
    const good = r.code === 200 && /^image\//.test(r.type);
    (good ? okList : badList).push(n);
    const kb = r.len ? (r.len/1024).toFixed(0) + 'KB' : '';
    console.log(`${good ? 'ok  ' : 'BAD '} ${n.padEnd(9)} ${String(r.code).padStart(3)} ${r.type} ${kb}`);
    await new Promise(s => setTimeout(s, 220));
  }
  console.log(`\n可达 ${okList.length} / ${names.length}`);
  if(badList.length) console.log('不可达：' + badList.join('、'));
})();
