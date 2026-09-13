/* 一次性脚本：在 Commons 上检索「背影 / 剪影」的旅行者照片，作为预设身份头像候选。
   只打印候选（含许可、尺寸、缩略图 URL），不下载。
   用法：node tools/_avatar-mine.js "查询词" "查询词" ... */
const https = require('https');
const UA = 'Touris-avatar-mine/1.0 (local prototype; build-time asset fetch)';

function api(host, params, retry) {
  const qs = new URLSearchParams(Object.assign({ format: 'json', formatversion: 2 }, params)).toString();
  return new Promise((resolve, reject) => {
    const req = https.get(`https://${host}/w/api.php?${qs}`, { headers: { 'User-Agent': UA } }, res => {
      if (res.statusCode === 429 || res.statusCode === 403 || res.statusCode >= 500) {
        res.resume(); retry = (retry || 0) + 1;
        if (retry > 4) return reject(new Error('HTTP ' + res.statusCode));
        return setTimeout(() => resolve(api(host, params, retry)), 5000 * retry);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let buf = ''; res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('bad json')); } });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('超时')));
  });
}

/* 只接受可商用的自由许可：CC0 / 公有领域 / CC BY / CC BY-SA；排除 NC 与 ND */
function licenseOK(short) {
  const s = String(short || '').trim();
  if (/CC/i.test(s) && /(non-?commercial|\bNC\b)/i.test(s)) return false;
  if (/NoDeriv|\bND\b/i.test(s)) return false;
  return /^(CC0|CC[ -]BY(-SA)?|Public domain|PD)/i.test(s);
}

async function main(queries) {
  for (const q of queries) {
    const j = await api('commons.wikimedia.org', {
      action: 'query', list: 'search', srsearch: q, srnamespace: 6, srlimit: 25
    });
    const titles = ((j.query && j.query.search) || []).map(r => r.title);
    if (!titles.length) { console.log(`\n### ${q}\n  （无结果）`); continue; }
    console.log(`\n### ${q}  —  ${titles.length} 个原始命中`);
    for (let i = 0; i < titles.length; i += 20) {
      const chunk = titles.slice(i, i + 20);
      const d = await api('commons.wikimedia.org', {
        action: 'query', titles: chunk.join('|'),
        prop: 'imageinfo', iiprop: 'size|mime|extmetadata|url', iiurlwidth: 400
      });
      for (const p of (d.query && d.query.pages) || []) {
        const ii = p.imageinfo && p.imageinfo[0]; if (!ii) continue;
        const em = ii.extmetadata || {};
        const lic = em.LicenseShortName && em.LicenseShortName.value;
        if (!/^image\/(jpeg|png)$/.test(ii.mime || '')) continue;
        if ((ii.width || 0) < 800) continue;
        if (!licenseOK(lic)) continue;
        const artist = String((em.Artist && em.Artist.value) || '').replace(/<[^>]*>/g, '').trim().slice(0, 40);
        console.log(`  ✓ ${p.title.replace(/^File:/, '')}`);
        console.log(`      ${lic} · ${ii.width}x${ii.height} · ${artist}`);
        console.log(`      ${ii.thumburl}`);
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }
}
main(process.argv.slice(2)).catch(e => { console.error('失败：' + e.message); process.exit(1); });
