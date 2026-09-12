#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 图片本地化

   为什么要有这个脚本
   原型原先直接引用 upload.wikimedia.org 的直链，并因为「本机连不通 wikipedia.org」
   默认经 wsrv.nl 免费代理取图。结果是：演示效果取决于第三方代理活不活，而且
   所有图片请求都要过一个不受控的中转站。

   现在改为运行时不依赖任何外部服务：图片一次性下载进 prototype/img/，
   页面只读本地文件。

   ★ 构建期也尽量不依赖第三方

   路径由**文件名的 MD5** 推出（见下），直连 upload.wikimedia.org；
   wsrv.nl 只在原站取不到时兜底。原先所有图都走代理，理由是「本机连不通
   wikipedia.org」——现在实测直连是通的，而且快得多（3.5MB/2.2s）。

   ★ 为什么不直接存 URL
   仓库里原先那 63 条图片地址，有 19 条的路径段是错的——例如思南公馆写成
   /thumb/a/a8/Sinan_Mansions,_Shanghai.jpg/，而 Commons 的实际路径是 /thumb/8/83/。
   文件名对、哈希目录段是编的，所以这 19 张图从来没加载成功过，页面一直在显示
   SVG 占位图，而没人发现。所以这里只存** Commons 文件名 **，地址一律现算。

   两个必须保留的东西
   1) tools/image-sources.json —— 景点名到 Commons 文件名的唯一依据，
      也是署名依据。**不要删这个文件。**
   2) Wikimedia 的图多为 CC BY / CC BY-SA，本地化后署名义务跟着走。
      脚本会同步生成 prototype/img/CREDITS.md。

   用法：
     node tools/fetch-images.js            解析地址 + 下载缺失的图 + 重新生成 images.js
     node tools/fetch-images.js --check    只报告缺哪些，不下载
     node tools/fetch-images.js --force    重下已有的
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PROTO = path.join(ROOT, 'prototype');
const IMG_DIR = path.join(PROTO, 'img');
const SOURCES = path.join(__dirname, 'image-sources.json');
const OUT_JS = path.join(PROTO, 'images.js');

const CHECK = process.argv.includes('--check');
const FORCE = process.argv.includes('--force');
const RE_RESOLVE = process.argv.includes('--re-resolve');

/* 首页大图要更宽；其余 960（原设计口径） */
const WIDE = ['伏见稻荷大社', '岚山竹林', '锦市场'];
const W_DEFAULT = 960, W_WIDE = 1600;

/* ---------------- 1. 出处清单 ---------------- */

const log = (...a) => console.log(...a);

/** thumb URL / 直链 → Commons 文件名（去掉「960px-」前缀，还原百分号转义） */
function commonsNameFromURL(url){
  const base = url.split('/').pop() || '';
  return decodeURIComponent(base).replace(/^\d+px-/, '');
}

/** 从当前原型数据里读出「景点名 → Commons 文件名」。只在清单不存在时跑一次。 */
function bootstrapSources(){
  const ctx = { console };
  vm.createContext(ctx);
  for(const f of ['images.js', 'data.js', 'city-data.js']){
    const p = path.join(PROTO, f);
    if(fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  const out = {};
  const add = (name, url) => {
    if(!/^https?:/.test(url)) return;              // 已经是本地路径，跳过
    const file = commonsNameFromURL(url);
    // 同名不同图会静默覆盖，必须炸出来
    if(out[name] && out[name] !== file) throw new Error('景点重名且图不同: ' + name);
    out[name] = file;
  };
  try{
    Object.entries(JSON.parse(vm.runInContext('JSON.stringify(SPOT_IMG)', ctx))).forEach(([n, u]) => add(n, u));
  }catch(e){ /* 京都的已本地化，忽略 */ }
  const cities = JSON.parse(vm.runInContext('JSON.stringify(globalThis.CITY_DATA || {})', ctx));
  Object.values(cities).forEach(c => Object.entries(c.images || {}).forEach(([n, u]) => add(n, u)));
  return out;
}

function loadSources(){
  if(!fs.existsSync(SOURCES)) return null;
  const raw = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
  // 旧格式是 { name: url }，迁移成 { name: commonsFileName }
  const out = {};
  Object.entries(raw.sources || raw).forEach(([name, v]) => {
    if(name.startsWith('_')) return;
    out[name] = /^https?:/.test(v) ? commonsNameFromURL(v) : v;
  });
  return { sources: out, urlCache: raw.urlCache || {} };
}

/** 扫描 prototype/ 下所有 js，把新出现的 Commons 图片收进清单。
 *
 *  加城市的人只会在城市数据里写一行 `'西湖':'https://upload.wikimedia.org/...'`，
 *  不会记得来改本脚本的清单。所以每次运行都扫一遍，只补新名字、绝不覆盖已有条目
 *  （否则手工修正过的条目会被脏数据顶掉，北京南站就吃过这个亏）。 */
function discover(sources){
  const added = [];
  fs.readdirSync(PROTO).filter(f => f.endsWith('.js')).forEach(f => {
    const src = fs.readFileSync(path.join(PROTO, f), 'utf8');
    for(const m of src.matchAll(/'([^']+)'\s*:\s*'(https:\/\/upload\.wikimedia\.org[^']+)'/g)){
      const [, name, url] = m;
      if(sources[name]) continue;
      sources[name] = commonsNameFromURL(url);
      added.push(name);
    }
  });
  return added;
}

/* ---------------- 2. 文件名 → 真实地址 ----------------
   ★ 不再问 Commons API

   Wikimedia 的路径就是**文件名的 MD5**：取 MD5 的十六进制前两位里，
   第 1 位做一级目录、前 2 位做二级目录。
     锦里古街 2011.jpg → md5 前两位 "3c" → /thumb/3/3c/...
   实测 6 个已知样本 6/6 命中，其中包括带逗号、带撇号、带中文的文件名。

   为什么值得这么改：
     · commons.wikimedia.org 本身会挂 DNS（今天就挂了一整轮），而图片实际托管在
       upload.wikimedia.org 上是通的——绕开它，取图链路就少一个单点
     · 没有速率限制，不用分批 + sleep，63 张图从两轮请求变成纯本地计算
     · 结果确定：同一个文件名永远算出同一个地址，不用缓存

   文件名本身仍然要**存**（tools/image-sources.json），因为 MD5 推不出名字。
   名字在 Wikidata 是 P18、在维基百科是 pageimages，都是可核验的来源。 */

function commonsPath(fileName){
  const h = crypto.createHash('md5').update(fileName).digest('hex');
  return h[0] + '/' + h.slice(0, 2);
}

function resolveURLs(fileNames){
  const out = {};
  [...new Set(fileNames)].forEach(f => {
    const dir = commonsPath(f.replace(/ /g, '_'));
    out[f] = 'https://upload.wikimedia.org/wikipedia/commons/' + dir + '/' +
             encodeURIComponent(f.replace(/ /g, '_'));
  });
  return Promise.resolve(out);
}

/* ---------------- 3. 文件名与并发 ---------------- */

/** Commons 文件名 → 本地文件名。压成 URL 安全字符。 */
function localName(file){
  const m = file.match(/\.(jpe?g|png|webp)$/i);
  const ext = m ? m[0].toLowerCase() : '.jpg';
  let stem = file.replace(/\.(jpe?g|png|webp)$/i, '')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')      // 非 ASCII（含日文、带音标字母）统一压成下划线
    .replace(/_+/g, '_')
    .replace(/^[_.\-]+|[_.\-]+$/g, '');
  // 文件名全是非 ASCII（如「京都タワー夜景」）时上面会压成空串。
  // 用文件名的短哈希兜底：稳定、唯一，且能靠 img/CREDITS.md 反查是哪张。
  if(!stem) stem = 'commons-' + crypto.createHash('sha1').update(file).digest('hex').slice(0, 8);
  return stem + ext;
}

/* ★ 这里不能用 encodeURIComponent
   Commons 的文件名常带逗号、带音标的拉丁字母，URL 里本来就是 %2C / %C5%8D 这种
   转义形式。encodeURIComponent 会把其中的 % 再编一次（%2C → %252C），wsrv.nl 于是
   去取一个字面叫「%2C」的文件，404。
   （而且 wsrv 会把 404 也缓存下来，所以一旦错一次就一直错——先前那版就栽在这。）
   encodeURI 保留已有的 %XX 不动，只转义真正不安全的部分；再把会截断 query 的三个
   字符补上，就既能取到图，也不会把 &url= 的取值截断。 */
/* 一张图的候选取法，按顺序试，取到第一个能用的为止。

   ★ 直连优先，wsrv 只兜底
   原先所有图片都经 wsrv.nl 中转，理由是「本机连不通 wikipedia.org」。
   现在实测 upload.wikimedia.org 直连是通的，而且快得多（3.5MB/2.2s ≈ 1.6MB/s，
   经代理时 220KB 要 3 秒）。所以直连放首选，代理降级为「原站不通时」的兜底——
   构建期也就不再依赖那个第三方了。

   为什么先取缩略图而不是原图：
     · 原图动辄 3–16MB，一个城市就能上百 MB；缩略图只有 130–260KB
     · 但文件本身窄于请求宽度时 Commons 不生成缩略图（不放大），所以要退回原图
   路径只靠文件名推：hash 目录 + `/thumb/<h>/<hh>/<file>/<w>px-<file>` */
function candidateSources(raw, w){
  const m = raw.match(/^(https?:\/\/[^/]+)\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/(.+)$/i);
  if(!m) return [raw];
  const [, host, h1, h2, file] = m;
  const orig  = `${host}/wikipedia/commons/${h1}/${h2}/${file}`;
  const thumb = `${host}/wikipedia/commons/thumb/${h1}/${h2}/${file}/${w}px-${file}`;
  return [thumb, orig, proxyURL(thumb, w), proxyURL(orig, w)];
}

function proxyURL(raw, w){
  const v = encodeURI(raw.replace(/^https?:\/\//, ''))
    .replace(/&/g, '%26').replace(/\?/g, '%3F').replace(/#/g, '%23');
  return 'https://wsrv.nl/?url=' + v + '&w=' + w + '&output=jpg';
}

function fetchTo(url, dest, depth, retry){
  depth = depth || 0;
  retry = retry || 0;
  return new Promise((resolve, reject) => {
    if(depth > 4) return reject(new Error('重定向过多'));
    const req = https.get(url, { headers: { 'User-Agent': 'Touris-image-fetcher/1.0' } }, res => {
      if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        res.resume();
        return resolve(fetchTo(res.headers.location, dest, depth + 1, retry));
      }
      /* 429/5xx 是**暂时**失败：这一批图要几十个请求，原作者站会限流。
         不能当成硬失败——否则一张图会连着试完 4 个候选、全军覆没，
         而其实等两秒再来一次就好（先前那 10 张就是这么丢的）。 */
      if((res.statusCode === 429 || res.statusCode >= 500) && retry < 3){
        res.resume();
        return setTimeout(() => resolve(fetchTo(url, dest, depth, retry + 1)), 2500 * (retry + 1));
      }
      if(res.statusCode !== 200){ res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const tmp = dest + '.part';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => {
        const size = fs.statSync(tmp).size;
        if(size < 1024){ fs.unlinkSync(tmp); return reject(new Error('文件过小 ' + size + 'B')); }
        fs.renameSync(tmp, dest);
        resolve(size);
      }));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(45000, () => req.destroy(new Error('超时')));
  });
}

/** 限并发跑任务，避免把代理打挂 */
async function pool(items, limit, worker){
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while(i < items.length){
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }));
  return results;
}

/* ---------------- 4. 主流程 ---------------- */

(async () => {
  fs.mkdirSync(IMG_DIR, { recursive: true });

  let sources, urlCache;
  const loaded = loadSources();
  if(loaded){ ({ sources, urlCache } = loaded); }
  else {
    sources = bootstrapSources();
    urlCache = {};
    log(`已建立出处清单 tools/image-sources.json（${Object.keys(sources).length} 条）`);
  }

  /* ---- 收编城市数据里新出现的 Commons 图 ---- */
  const fresh = discover(sources);
  if(fresh.length) log(`发现 ${fresh.length} 个新景点的配图：${fresh.join('、')}`);

  /* ---- 解析真实地址 ---- */
  /* 地址现在是纯本地算出来的（文件名 MD5），没有网络成本，所以每次都重算，
     不留缓存——缓存里存的还是老版本问 API 拿到的缩略图地址，留着只会两套混用。 */
  const need = [...new Set(Object.values(sources))];
  const got = await resolveURLs(need);
  Object.assign(urlCache, got);

  const unresolved = [...new Set(Object.values(sources))].filter(f => !urlCache[f]);

  /* ---- 组装下载清单：同一张图被多个景点共用时只下一次 ---- */
  const byFile = new Map();
  Object.entries(sources).forEach(([name, file]) => {
    if(!byFile.has(file)) byFile.set(file, { file, local: localName(file), names: [], url: urlCache[file] });
    byFile.get(file).names.push(name);
  });
  /* 不同文件名压完可能撞成同一个本地名 —— 撞了就加序号，否则后下的会覆盖先下的 */
  (function dedupe(){
    const taken = new Map();
    [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file)).forEach(e => {
      if(!taken.has(e.local)){ taken.set(e.local, e.file); return; }
      const dot = e.local.lastIndexOf('.');
      let n = 2;
      while(taken.has(e.local.slice(0, dot) + '-' + n + e.local.slice(dot))) n++;
      e.local = e.local.slice(0, dot) + '-' + n + e.local.slice(dot);
      taken.set(e.local, e.file);
    });
  })();

  const all = [...byFile.values()];
  const todo = all.filter(e => e.url && (FORCE || !fs.existsSync(path.join(IMG_DIR, e.local))));

  log(`清单 ${Object.keys(sources).length} 条 → ${all.length} 张图；已落地 ${all.length - todo.length} 张，待下载 ${todo.length} 张。`);

  if(CHECK){
    let bad = 0;
    if(todo.length){ todo.forEach(e => log('  缺  ' + e.local + '  ← ' + e.names.join('、'))); bad++; }
    if(unresolved.length){ unresolved.forEach(f => log('  查不到  ' + f)); bad++; }
    if(bad){ log(`\n✗ 有未完成项，去掉 --check 重新运行。`); process.exit(1); }
    log('✓ 图片已全部落地');
    return;
  }

  /* ---- 下载 ---- */
  let failed = [];
  if(todo.length){
    await pool(todo, 3, async (e, idx) => {
      const w = e.names.some(n => WIDE.includes(n)) ? W_WIDE : W_DEFAULT;
      const dest = path.join(IMG_DIR, e.local);
      try{
        let size = null, lastErr = null;
        for(const src of candidateSources(e.url, w)){
          /* 候选里已经排好了「直连 → 代理」，这里**不能再套一层 proxyURL**，
             否则直连也被包进 wsrv，直连优先就白设计了。 */
          try{ size = await fetchTo(src, dest); break; }
          catch(err){ lastErr = err; }
        }
        if(size == null) throw lastErr || new Error('没有可用的取法');
        process.stdout.write(`  [${idx + 1}/${todo.length}] ${e.local} ${(size / 1024).toFixed(0)}KB\n`);
      }catch(err){
        failed.push({ local: e.local, err: err.message, names: e.names });
        process.stdout.write(`  [${idx + 1}/${todo.length}] ✗ ${e.local} — ${err.message}\n`);
      }
    });
  }

  /* ---- 生成 images.js ---- */
  const have = e => fs.existsSync(path.join(IMG_DIR, e.local));
  const lines = [];
  lines.push('/* ==========================================================================');
  lines.push('   Touris 知途 · 景点配图（由 tools/fetch-images.js 生成，请勿手改）');
  lines.push('');
  lines.push('   全部图片已下载到 img/，运行时只读本地文件，不依赖任何外部服务。');
  lines.push('   原始文件名与署名见 tools/image-sources.json 与 img/CREDITS.md。');
  lines.push('   要重新下载：node tools/fetch-images.js');
  lines.push('   ========================================================================== */');
  lines.push('');
  lines.push('const SPOT_IMG = {');
  const missing = [];
  Object.keys(sources).sort((a, b) => a.localeCompare(b, 'zh')).forEach(name => {
    const e = byFile.get(sources[name]);
    if(!e || !have(e)){ missing.push(name); return; }
    const pad = ' '.repeat(Math.max(1, 14 - name.length * 2));
    lines.push(`  ${JSON.stringify(name)}:${pad}'img/${e.local}',`);
  });
  lines.push('};');
  lines.push('');
  fs.writeFileSync(OUT_JS, lines.join('\n'), 'utf8');

  /* ---- 存回地址缓存，下次不必再问 API ---- */
  fs.writeFileSync(SOURCES, JSON.stringify({ _note: '景点名 → Commons 文件名；urlCache 由脚本解析回填，可删（删了会重新问 API）', sources, urlCache }, null, 2) + '\n', 'utf8');

  /* ---- 署名 ---- */
  const credits = [
    '# 图片署名', '',
    '本项目景点配图来自 Wikimedia Commons，多为 CC BY / CC BY-SA 授权。',
    '署名信息以各文件在 Commons 的页面为准，下表给出对应关系。', '',
    '文件名清单见 `tools/image-sources.json`。', '',
    '| 本地文件 | 用于 | Commons 页面 |', '| --- | --- | --- |'
  ];
  all.filter(have).sort((a, b) => a.local.localeCompare(b.local)).forEach(e => {
    credits.push(`| \`${e.local}\` | ${e.names.join('、')} | ` +
      `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(e.file).replace(/%20/g, '_')} |`);
  });
  credits.push('');
  fs.writeFileSync(path.join(IMG_DIR, 'CREDITS.md'), credits.join('\n'), 'utf8');

  /* ---- 汇总 ---- */
  if(unresolved.length){
    log(`\n⚠ ${unresolved.length} 个文件名在 Commons 查不到：`);
    unresolved.forEach(f => log('   ' + f + '  ← ' + byFile.get(f).names.join('、')));
  }
  if(failed.length){
    log(`\n✗ ${failed.length} 张下载失败：`);
    failed.forEach(f => log(`   ${f.local}  (${f.names.join('、')})  ${f.err}`));
  }
  if(missing.length){
    log(`\n⚠ ${missing.length} 个景点没有可用图片，images.js 里已略过（页面会落到 SVG 占位）：`);
    log('   ' + missing.join('、'));
  }
  log(`\n已写入 ${path.relative(ROOT, OUT_JS)}（${all.filter(have).length} 张图）`);
  log(`图片目录 ${path.relative(ROOT, IMG_DIR)}/ ，署名 img/CREDITS.md`);

  if(failed.length || unresolved.length) process.exit(1);
})();
