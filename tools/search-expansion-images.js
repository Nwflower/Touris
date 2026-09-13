#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 扩充景点配图搜索

   给 spots-expansion.js 里新补的景点逐个找图。产物只有一个：
   把「景点名 → Commons 文件名」并进 tools/image-sources.json——
   下载、images.js 重新生成、img/CREDITS.md 署名，全部交给既有的
   node tools/fetch-images.js（不要在这里重复造那套轮子）。

   检索策略（每个景点按序尝试，取到即停）：
     1. OVERRIDES 里手工指定的词条（zh 词条名或搜索词）
     2. zh.wikipedia 精确标题的首图（pageimages，pilicense=free）
     3. zh.wikipedia 全文搜索的第一篇带首图的词条（query 默认「城市 + 景点名」）

   版权口径（务必读完）：
     · 候选文件必须满足 imagerepository === 'shared'，即文件托管在
       Wikimedia Commons —— Commons 只收录自由许可媒体，非自由文件
       一律存在本地仓库（imagerepository === 'local'），会被这里拒掉。
     · 额外排除文件名带 map / logo / flag / icon / seal / diagram 的
       定位图与徽章类图。
     · 本机网络存在 TLS 中间层且 commons.wikimedia.org 的 DNS 不通，
       所以 API 走 zh.wikipedia.org、下载走 upload.wikimedia.org，
       默认放宽证书校验（TOURIS_TLS_STRICT=1 可恢复严格校验）。
     · 搜不到就如实跳过，让页面保留 SVG 占位——宁可没图，不放错图。

   用法：
     node tools/search-expansion-images.js            # 搜索并合并进清单
     node tools/search-expansion-images.js --dry      # 只报告，不写清单
     node tools/search-expansion-images.js --only 龙井村 --only 泡桐树街
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const PROTO = path.join(ROOT, 'prototype');
const SOURCES = path.join(__dirname, 'image-sources.json');
const LOG = path.join(__dirname, 'expansion-image-log.json');

const DRY = process.argv.includes('--dry');
const onlyArg = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? process.argv.slice(i + 1) : null;
})();

const STRICT = process.env.TOURIS_TLS_STRICT === '1';
const UA = 'Touris-image-search/1.0 (local prototype; build-time asset fetch)';
const DELAY_MS = 2000;   // Wikimedia 对突发很敏感（实测 150ms 就触发 429/403），放慢是礼貌也是可靠

/* ---------------- 手工指定词条 ----------------
   常见名/别名/易撞名点位在这里给准确的 zh 词条或搜索词。 */
const OVERRIDES = {
  // 北京
  '白塔寺': '妙应寺',
  '北大校园': '北京大学',
  '清华校园': '清华大学',
  '奥林匹克公园': '北京奥林匹克公园',
  '奥林匹克森林公园': '奥林匹克森林公园',
  '国家植物园': '中国科学院植物研究所植物园',
  '三里河公园': '三里河 (北京)',
  '天桥演艺区': '天桥 (北京)',
  '湖广会馆': '湖广会馆 (北京)',
  '潘家园旧货市场': '潘家园',
  // 上海
  'M50创意园': 'M50创意园',
  '1933老场坊': '1933年老场坊',
  '张园': '张园 (上海)',
  '古城公园': '上海古城公园',
  '世博文化公园': '上海世博文化公园',
  '苏州河华政段': '华东政法大学长宁校区',
  '鲁迅公园': '鲁迅公园 (上海)',
  '多伦路': '多伦路 (上海)',
  // 广州
  '海珠国家湿地公园': '海珠湿地',
  '泮塘五约': '泮塘',
  '白鹅潭大湾区艺术中心': '白鹅潭大湾区艺术中心',
  '广州艺术博物院（新馆）': '广州艺术博物院',
  '海心沙': '海心沙 (广州)',
  '天河路商圈': '天河路 (广州)',
  '珠岛': '珠岛宾馆',
  '基督教东山堂': '东山堂',
  '越秀公园五羊': '五羊石像',
  '长隆野生动物世界': '长隆野生动物世界',
  // 杭州
  '断桥残雪': '断桥 (杭州)',
  '吴山城隍阁': '城隍阁',
  '法喜寺': '上天竺法喜讲寺',
  '孤山': '孤山 (杭州)',
  '湖滨步行街': '湖滨路 (杭州)',
  '中国茶叶博物馆（双峰馆区）': '中国茶叶博物馆',
  '京杭大运河': '京杭大运河',
  '运河天地': '拱宸桥',
  // 成都
  '成都自然博物馆': '成都理工大学博物馆',
  '天府熊猫塔': '四川广播电视塔',
  '麓湖': '麓湖 (成都)',
  '猛追湾': '猛追湾',
  '奎星楼街': '奎星楼街',
  '铁像寺水街': '铁像寺',
  // 威海
  '天鹅湖': '荣成天鹅湖',
  '赤山景区': '赤山法华院',
  '神雕山野生动物园': '神雕山野生动物自然保护区',
  '烟墩角': '烟墩角村',
  '环翠楼公园': '环翠楼',
  '刘公岛': '刘公岛',
  '那香海': '那香海',
  '威海站': '威海站',
  // 通用防撞（短名 + 城市）
  '人民广场': '威海人民广场'
};

/* 泛化名直接搜会撞别的城市，一律带城市前缀查 */
const GENERIC_RE = /(广场|公园|市场|大集|夜市|码头|步道|绿道|车站|浴场|沙滩|大桥|商圈|步行街|湿地|水库|湖$)/;

/* 排除定位图 / 徽章 / 图标 / 旗帜 / 平面图 */
const BAD_FILE_RE = /(map|locator|location|diagram|plan\b|logo|icon|flag|seal|coat_of_arms|blason|\.svg$|\.svg\))/i;

/* ---------------- 数据装载 ---------------- */
function loadPrototype() {
  const ctx = { console, window: { addEventListener() {} } };
  vm.createContext(ctx);
  for (const f of ['semantics.js', 'images.js', 'data.js', 'city-data.js', 'city-expansion.js',
    'city-hangzhou-guangzhou.js', 'city-chengdu.js', 'spots-expansion.js']) {
    vm.runInContext(fs.readFileSync(path.join(PROTO, f), 'utf8'), ctx, { filename: f });
  }
  return {
    SPOT_IMG: JSON.parse(vm.runInContext('JSON.stringify(SPOT_IMG)', ctx)),
    CITY_DATA: JSON.parse(vm.runInContext('JSON.stringify(globalThis.CITY_DATA)', ctx))
  };
}

const CITY_SLUG = { 北京: 'beijing', 上海: 'shanghai', 广州: 'guangzhou', 杭州: 'hangzhou', 成都: 'chengdu', 威海: 'weihai' };

function imagelessSpots({ SPOT_IMG, CITY_DATA }) {
  const out = [];
  Object.entries(CITY_DATA).forEach(([city, c]) => {
    Object.keys(c.spots || {}).forEach(name => {
      if (c.spots[name].cat === 'station') return;             // 车站不给配图
      const cur = (c.images && c.images[name]) || SPOT_IMG[name];
      if (!cur) out.push({ name, city, slug: CITY_SLUG[city] || city });
    });
  });
  return out;
}

/* ---------------- Wikimedia API ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function api(host, params, retry) {
  const qs = new URLSearchParams(Object.assign({ format: 'json', formatversion: 2 }, params)).toString();
  const url = `https://${host}${'/w/api.php?' + qs}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA },
      rejectUnauthorized: !STRICT ? false : undefined
    }, res => {
      if (res.statusCode === 429 || res.statusCode === 403 || res.statusCode >= 500) {
        res.resume();
        retry = (retry || 0) + 1;
        if (retry > 4) { const e = new Error('HTTP ' + res.statusCode + '（重试 4 次仍失败）'); e.noRetry = true; return reject(e); }
        // 429/403 是限流：退避要给足，1.5s 那种小睡只会火上浇油
        return setTimeout(() => resolve(api(host, params, retry)), 5000 * retry);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} @ ${host}`)); }
      let buf = '';
      res.on('data', d => { buf += d; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('bad json')); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('超时')));
  });
}

/** 一个文件是否可用：托管在 Commons（shared）、位图、宽够、非定位图 */
async function usableFile(fileName) {
  if (BAD_FILE_RE.test(fileName)) return null;
  const j = await api('zh.wikipedia.org', {
    action: 'query', titles: 'File:' + fileName,
    prop: 'imageinfo', iiprop: 'size|url|mime'
  });
  const page = j.query && j.query.pages && j.query.pages[0];
  const ii = page && page.imageinfo && page.imageinfo[0];
  if (!ii) return null;
  if (page.imagerepository !== 'shared') return null;          // 本地仓库 = 非自由许可
  if (!/^image\/(jpeg|png)$/.test(ii.mime || '')) return null;
  /* 缩略卡最大显示 120px 宽，400px 已足够（fetch-images 对窄图会退回原图）。
     早年 Commons 上不少景点只有 400-500px 的老照片，卡在 640 会白白丢图。 */
  if ((ii.width || 0) < 400) return null;
  return { file: fileName, width: ii.width, mime: ii.mime, url: ii.url };
}

/** 一个词条的首图（free），返回文件名或 null */
function pageImageOf(page) {
  return (page && page.pageimage) || null;
}

/** 精确标题查首图（一批最多 25 个） */
async function exactTitles(names) {
  const hits = {};
  for (let i = 0; i < names.length; i += 25) {
    const chunk = names.slice(i, i + 25);
    const j = await api('zh.wikipedia.org', {
      action: 'query', titles: chunk.join('|'), redirects: 1,
      prop: 'pageimages', piprop: 'name', pilicense: 'free'
    });
    (j.query && j.query.pages || []).forEach(p => {
      const img = pageImageOf(p);
      if (img) hits[p.title] = img;
    });
    // 重定向后的真实标题可能与请求名不同；拿 redirect 映射对齐
    const reds = {};
    ((j.query && j.query.redirects) || []).forEach(r => { reds[r.from] = r.to; });
    chunk.forEach((n, k) => {
      const t = reds[n] || n;
      if (!hits[n] && hits[t]) hits[n] = hits[t];
    });
    await sleep(DELAY_MS);
  }
  return hits;
}

/** 全文搜索：query → 第一篇带 free 首图的词条 */
async function searchImage(query) {
  const j = await api('zh.wikipedia.org', {
    action: 'query', generator: 'search',
    gsrsearch: query, gsrnamespace: 0, gsrlimit: 6, redirects: 1,
    prop: 'pageimages', piprop: 'name', pilicense: 'free'
  });
  const pages = (j.query && j.query.pages) || [];
  pages.sort((a, b) => (a.index || 99) - (b.index || 99));     // index = 相关度顺序
  for (const p of pages) {
    const img = pageImageOf(p);
    if (img) return img;
  }
  return null;
}

/* ---------------- 主流程 ---------------- */
(async () => {
  const data = loadPrototype();
  let spots = imagelessSpots(data);
  if (onlyArg) spots = spots.filter(s => onlyArg.includes(s.name));

  const store = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
  const sources = store.sources;
  const logRows = [];
  let found = 0, skipped = 0, dupes = 0;

  console.log(`待配图景点 ${spots.length} 个（--dry 只报告不写清单）\n`);

  /* 先整批跑精确标题 */
  const wantExact = spots.filter(s => !OVERRIDES[s.name] || !/\s/.test(OVERRIDES[s.name]));
  const exactHits = await exactTitles(wantExact.map(s => (OVERRIDES[s.name] || s.name)));

  for (const s of spots) {
    if (sources[s.name]) { dupes++; continue; }        // 断点续跑：已并入的直接跳过
    const ov = OVERRIDES[s.name];
    const q = ov || (GENERIC_RE.test(s.name) ? `${s.city} ${s.name}` : s.name);
    let rawFile = null, via = '';
    try {
      // 1) 精确标题（override 是词条名时同样适用）
      if (exactHits[ov || s.name]) { rawFile = exactHits[ov || s.name]; via = '词条首图'; }
      // 2) 全文搜索
      if (!rawFile) {
        const hit = await searchImage(q);
        if (hit) { rawFile = hit; via = '搜索「' + q + '」'; }
        await sleep(DELAY_MS);
      }
      if (!rawFile) {
        skipped++;
        logRows.push({ name: s.name, city: s.city, ok: false, reason: '检索不到合适词条' });
        process.stdout.write(`  ✗ ${s.city}·${s.name} — 无结果\n`);
        continue;
      }
      const ok = await usableFile(rawFile);
      if (!ok) {
        // 精确命中的文件可能被排除（地图/太小/本地仓库）——再试一次搜索
        const hit = await searchImage(q);
        await sleep(DELAY_MS);
        const ok2 = hit ? await usableFile(hit) : null;
        if (!ok2) {
          skipped++;
          logRows.push({ name: s.name, city: s.city, ok: false, reason: '候选被排除（' + rawFile + '）' });
          process.stdout.write(`  ✗ ${s.city}·${s.name} — 候选被排除（${rawFile}）\n`);
          continue;
        }
        rawFile = hit; via += '→搜索兜底';
        Object.assign(ok, ok2);
      }
      if (sources[s.name] === ok.file) { dupes++; continue; }
      if (sources[s.name] && sources[s.name] !== ok.file) {
        // 已有条目不覆盖（手工校准优先）
        skipped++;
        logRows.push({ name: s.name, city: s.city, ok: false, reason: '已有条目，不覆盖' });
        continue;
      }
      if (!DRY) {
        sources[s.name] = ok.file;
        // 增量落盘：中断后重跑不重复搜（十几分钟的活，丢一次就烦一次）
        fs.writeFileSync(SOURCES, JSON.stringify(store, null, 2) + '\n', 'utf8');
      }
      found++;
      logRows.push({ name: s.name, city: s.city, ok: true, via, file: ok.file, width: ok.width,
        commons: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(ok.file).replace(/%20/g, '_') });
      process.stdout.write(`  ✓ ${s.city}·${s.name} ← ${ok.file}（${ok.width}px，${via}）\n`);
    } catch (e) {
      skipped++;
      logRows.push({ name: s.name, city: s.city, ok: false, reason: '异常：' + e.message });
      process.stdout.write(`  ✗ ${s.city}·${s.name} — ${e.message}\n`);
    }
  }

  console.log(`\n找到 ${found} · 跳过 ${skipped}${dupes ? ' · 与既有条目相同 ' + dupes : ''}`);
  if (!DRY) {
    fs.writeFileSync(SOURCES, JSON.stringify(store, null, 2) + '\n', 'utf8');
    console.log(`已并入 ${path.relative(ROOT, SOURCES)} —— 接下来运行：\n  TOURIS_ALLOW_INSECURE_TLS=1 node tools/fetch-images.js`);
  } else {
    console.log('（--dry：未写清单）');
  }
  fs.writeFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), strictTls: STRICT, rows: logRows }, null, 2), 'utf8');
})();
