/* 检查每个城市的每个景点图片，验证页面实际使用的 wsrv.nl 代理地址。 */
const fs = require('fs');
const vm = require('vm');
const https = require('https');

const ctx = { console };
vm.createContext(ctx);
for (const file of ['images.js', 'data.js', 'city-data.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}
const cities = vm.runInContext(
  `({ 京都:{ spots:SPOTS, images:SPOT_IMG }, ...CITY_DATA })`, ctx
);

function proxyURL(raw) {
  return 'https://wsrv.nl/?url=' +
    encodeURIComponent(raw.replace(/^https?:\/\//, '')) +
    '&w=960&output=jpg';
}

function head(url, redirects = 3) {
  return new Promise(resolve => {
    const req = https.request(url, { method:'HEAD', timeout:20000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects) {
        res.resume();
        return resolve(head(new URL(res.headers.location, url).href, redirects - 1));
      }
      res.resume();
      resolve({ status:res.statusCode, type:res.headers['content-type'] || '' });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', error => resolve({ status:0, type:'', error:error.message }));
    req.end();
  });
}

async function mapLimit(items, limit, fn) {
  const result = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      result[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length:Math.min(limit, items.length) }, worker));
  return result;
}

(async () => {
  let failed = 0;
  for (const [city, data] of Object.entries(cities)) {
    const names = Object.keys(data.spots);
    const results = await mapLimit(names, 5, async name => {
      const raw = data.images[name];
      if (!raw) return { name, ok:false, detail:'没有配置 URL' };
      const response = await head(proxyURL(raw));
      const ok = response.status === 200 && /^image\//.test(response.type);
      return { name, ok, detail:response.error || `${response.status} ${response.type}` };
    });
    const bad = results.filter(item => !item.ok);
    failed += bad.length;
    console.log(`${city}: ${results.length - bad.length}/${results.length} 可用`);
    bad.forEach(item => console.log(`  FAIL ${item.name}: ${item.detail}`));
  }
  process.exitCode = failed ? 1 : 0;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
