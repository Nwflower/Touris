/* 一次性脚本：把指定 Commons 文件名的缩略图（默认 400px）下载到本地目录，
   并打印名称/许可/作者/文件页，便于挑选与后续署名。
   用法：node tools/_avatar-get.js <输出目录> <File:名字> [更多...] */
const https = require('https');
const fs = require('fs');
const path = require('path');
const UA = 'Touris-avatar-mine/1.0 (local prototype; build-time asset fetch)';

function get(url, retry) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(get(res.headers.location, retry));
      }
      if (res.statusCode === 429 || res.statusCode >= 500) {
        res.resume(); retry = (retry || 0) + 1;
        if (retry > 4) return reject(new Error('HTTP ' + res.statusCode));
        return setTimeout(() => resolve(get(url, retry)), 5000 * retry);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' @ ' + url)); }
      const chunks = []; res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), type: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('超时')));
  });
}

async function api(params) {
  const qs = new URLSearchParams(Object.assign({ format: 'json', formatversion: 2 }, params)).toString();
  const { buf } = await get(`https://commons.wikimedia.org/w/api.php?${qs}`);
  return JSON.parse(buf.toString('utf8'));
}

async function main(outDir, titles) {
  fs.mkdirSync(outDir, { recursive: true });
  const meta = [];
  for (const t of titles) {
    const d = await api({ action: 'query', titles: t, prop: 'imageinfo',
      iiprop: 'size|mime|extmetadata|url', iiurlwidth: 400 });
    const p = d.query && d.query.pages && d.query.pages[0];
    const ii = p && p.imageinfo && p.imageinfo[0];
    if (!ii) { console.log(`✗ ${t} 取不到 imageinfo`); continue; }
    const em = ii.extmetadata || {};
    const clean = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const title = p.title.replace(/^File:/, '');
    const safe = title.replace(/[^\w.\-]+/g, '_').slice(-60);
    const dest = path.join(outDir, safe);
    const { buf } = await get(ii.thumburl);
    fs.writeFileSync(dest, buf);
    const rec = { title, local: safe, bytes: buf.length,
      license: clean(em.LicenseShortName && em.LicenseShortName.value),
      artist: clean(em.Artist && em.Artist.value).slice(0, 60),
      licenseUrl: clean(em.LicenseUrl && em.LicenseUrl.value),
      page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(title).replace(/%20/g, '_'),
      width: ii.thumbwidth, height: ii.thumbheight };
    meta.push(rec);
    console.log(`✓ ${safe}  ${(buf.length / 1024).toFixed(0)}KB  ${rec.license}  ${rec.artist}`);
    await new Promise(r => setTimeout(r, 300));
  }
  fs.writeFileSync(path.join(outDir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}
main(process.argv[2], process.argv.slice(3)).catch(e => { console.error('失败：' + e.message); process.exit(1); });
