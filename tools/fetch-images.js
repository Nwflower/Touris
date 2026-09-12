#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 图片本地化

   为什么要有这个脚本
   原型原先直接引用 upload.wikimedia.org 的直链，并因为「本机连不通 wikipedia.org」
   默认经 wsrv.nl 免费代理取图。结果是：演示效果取决于第三方代理活不活，而且
   所有图片请求都要过一个不受控的中转站。

   现在改为运行时不依赖任何外部服务：图片一次性下载进 prototype/img/，
   页面只读本地文件。wsrv.nl 只在这里用（构建期）。

   ★ 为什么不直接存 URL
   仓库里原先那 63 条图片地址，有 19 条的路径段是错的——例如思南公馆写成
   /thumb/a/a8/Sinan_Mansions,_Shanghai.jpg/，而 Commons 的实际路径是 /thumb/8/83/。
   文件名对、哈希目录段是编的，所以这 19 张图从来没加载成功过，页面一直在显示
   SVG 占位图，而没人发现。
   所以这里只存** Commons 文件名 **，每次由 API 解析出真实地址。宁可多一次网络
   往返，也不要再相信一个手写的 URL。

   两个必须保留的东西
   1) tools/image-sources.json —— 景点名到 Commons 文件名的唯一依据，
      也是署名依据。**不要删这个文件。**
   2) Wikimedia 的图多为 CC BY / CC BY-SA，本地化后署名义务跟着走。
      脚本会同步生成 prototype/img/CREDITS.md。

   用法：
     node tools/fetch-images.js            解析地址 + 下载缺失的图 + 重新生成 images.js
     node tools/fetch-images.js --check    只报告缺哪些，不下载
     node tools/fetch-images.js --force    重下已有的
     node tools/fetch-images.js --re-resolve   忽略缓存的地址，重新问一遍 API
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

/* ---------------- 2. 用 Commons API 解析真实地址 ---------------- */

/** 文件名去重后按 50 个一批问 API，拿可下载的地址。
 *
 *  ★ 为什么要 thumburl 而不是原图直链
 *  有几张原图特别大（上海北外滩 16.5MB、龙华寺 9.3MB），wsrv.nl 取原图会直接 404；
 *  换成 Commons 自己生成的缩略图（thumb.wikimedia.org 上的小图）就都能取到。
 *  所以这里要 1600px 缩略图，优先用它，取不到才退回原图。 */
function resolveURLs(fileNames){
  const uniq = [...new Set(fileNames)];
  const out = {};
  return new Promise(resolve => {
    let i = 0, failed = [];
    const next = () => {
      if(i >= uniq.length){
        if(failed.length) log(`  ⚠ ${failed.length} 个文件名 API 里查不到（可能已被改名或删除）：\n    ` + failed.join('\n    '));
        return resolve(out);
      }
      const batch = uniq.slice(i, i + 50);
      i += 50;
      const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
                '&prop=imageinfo&iiprop=url&iiurlwidth=1600&titles=' +
                batch.map(f => encodeURIComponent('File:' + f)).join('%7C');
      const req = https.get(u, { headers: { 'User-Agent': 'Touris-image-fetcher/1.0' } }, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try{
            const pages = JSON.parse(d).query.pages;
            /* MediaWiki 会把标题里的下划线规范化成空格、首字母转大写再返回
               （File:Foo_bar.jpg → File:Foo bar.jpg），直接拿 title 对不上号。
               两边都压成「小写 + 下划线」再比。 */
            const key = t => t.replace(/^File:/, '').replace(/ /g, '_').toLowerCase();
            const got = new Map();
            Object.values(pages).forEach(p => {
              if(p.missing !== undefined) return;
              const ii = (p.imageinfo || [])[0] || {};
              const src = ii.thumburl || ii.url;
              if(src) got.set(key(p.title), src.split('?')[0]);
            });
            batch.forEach(f => {
              const hit = got.get(key(f));
              if(hit) out[f] = hit; else failed.push(f);
            });
          }catch(e){
            failed.push(...batch.map(f => f + '（解析响应失败: ' + e.message + '）'));
          }
          setTimeout(next, 200);   // 别把 API 打太急
        });
      });
      req.on('error', e => { failed.push(...batch.map(f => f + '（网络: ' + e.message + '）')); next(); });
      req.setTimeout(30000, () => req.destroy(new Error('超时')));
    };
    next();
  });
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
function proxyURL(raw, w){
  const v = encodeURI(raw.replace(/^https?:\/\//, ''))
    .replace(/&/g, '%26').replace(/\?/g, '%3F').replace(/#/g, '%23');
  return 'https://wsrv.nl/?url=' + v + '&w=' + w + '&output=jpg';
}

function fetchTo(url, dest, depth){
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    if(depth > 4) return reject(new Error('重定向过多'));
    const req = https.get(url, { headers: { 'User-Agent': 'Touris-image-fetcher/1.0' } }, res => {
      if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        res.resume();
        return resolve(fetchTo(res.headers.location, dest, depth + 1));
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
  const need = [...new Set(Object.values(sources))].filter(f => RE_RESOLVE || !urlCache[f]);
  if(need.length){
    log(`向 Commons 解析 ${need.length} 个文件的真实地址…`);
    const got = await resolveURLs(need);
    Object.assign(urlCache, got);
  }

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
    await pool(todo, 5, async (e, idx) => {
      const w = e.names.some(n => WIDE.includes(n)) ? W_WIDE : W_DEFAULT;
      const dest = path.join(IMG_DIR, e.local);
      try{
        const size = await fetchTo(proxyURL(e.url, w), dest);
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
