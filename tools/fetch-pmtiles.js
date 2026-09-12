#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 离线矢量瓦片提取

   为什么要用这个源
   原先的离线方案是从 tile.openstreetmap.org 逐张抓栅格瓦片。结果是 OSM
   返回了「403 Access blocked」——而且是**用 HTTP 200 送来的 PNG**，所以
   状态码检查、文件头检查、体积检查全部通过，直到人眼看到那块图才发现。
   政策层面这个项目（黑客松、非商业、学习用途）也许说得过去，但 OSM 是在
   技术层执行的，认的是请求特征，不认用途声明。

   现在改用 Protomaps 每天发布的全球构建包（build.protomaps.com）。
   它是**明确供人提取自托管**的，数据 ODbL，不存在这个执行层的问题。
   构建包本身 ~138 GB，但支持 HTTP Range，所以用 pmtiles extract 只下
   bbox 范围内的那几十 MB。

   前置
     Docker（提取器跑在容器里，不用装 Go）

   用法
     node tools/fetch-pmtiles.js               # 提取全部有坐标的城市
     node tools/fetch-pmtiles.js --city 京都
     node tools/fetch-pmtiles.js --date 20260911   # 换一天的构建包
     node tools/fetch-pmtiles.js --dry          # 只列出会提取哪些城市

   输出
     prototype/tiles/<slug>.pmtiles，配一份 CREDITS.md
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PROTO = path.join(REPO, 'prototype');
const OUT = path.join(PROTO, 'tiles');
const IMAGE = 'ghcr.io/protomaps/go-pmtiles:latest';

/* 城市名 → 文件名。用 slug 而不是中文名，避免路径编码问题 */
const SLUG = { '京都':'kyoto', '北京':'beijing', '上海':'shanghai',
               '杭州':'hangzhou', '广州':'guangzhou', '威海':'weihai', '成都':'chengdu' };

/* bbox 外扩，免得边缘的点正好落在视野外 */
const PAD = 0.03;

/* ---------------- 参数 ---------------- */
const args = process.argv.slice(2);
const has = f => args.includes(f);
const valOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const ONLY = valOf('--city');
const DATE = valOf('--date') || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const DRY = has('--dry');
const SOURCE = `https://build.protomaps.com/${DATE}.pmtiles`;

/* ---------------- 读取城市坐标 ----------------
   沿用 index.html 的加载顺序，避免与真实运行环境脱节。 */
function loadCities(){
  const html = fs.readFileSync(path.join(PROTO, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)]
    .map(m => m[1])
    .filter(f => !/^vendor\//.test(f) && !/(app|real-maps|account)\.js$/.test(f));
  const ctx = { console, location: { href: 'http://x/' }, URL };
  vm.createContext(ctx);
  for(const f of files){
    const p = path.join(PROTO, f);
    if(!fs.existsSync(p)) continue;
    try{ vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }catch(e){}
  }
  return vm.runInContext('CITY_DATA', ctx);
}

function bboxOf(city){
  const pts = Object.values(city.geo || {});
  if(!pts.length) return null;
  const la = pts.map(p => p.lat), lo = pts.map(p => p.lng);
  return [
    Math.min(...lo) - PAD, Math.min(...la) - PAD,
    Math.max(...lo) + PAD, Math.max(...la) + PAD
  ].map(v => v.toFixed(4)).join(',');
}

/* ---------------- 提取 ---------------- */
function extract(slug, bbox, dest){
  /* Git Bash 会把 /data/... 当成本地路径改写，所以显式关掉路径转换 */
  const env = Object.assign({}, process.env, { MSYS_NO_PATHCONV: '1' });
  execFileSync('docker', [
    'run', '--rm',
    '-v', `${OUT.replace(/\\/g, '/')}:/data`,
    IMAGE, 'extract', SOURCE, `/data/${slug}.pmtiles`,
    `--bbox=${bbox}`
  ], { stdio: ['ignore', 'inherit', 'inherit'], env, timeout: 900000 });
}

function run(){
  const cities = loadCities();
  fs.mkdirSync(OUT, { recursive: true });

  const jobs = [];
  Object.keys(cities).forEach(name => {
    if(ONLY && name !== ONLY) return;
    const bbox = bboxOf(cities[name]);
    if(!bbox){ console.log(`  ${name.padEnd(4)} 跳过：没有坐标数据`); return; }
    jobs.push({ name, slug: SLUG[name] || name, bbox });
  });

  console.log(`构建包 ${DATE}　输出到 prototype/tiles/\n`);
  jobs.forEach(j => console.log(`  ${j.name.padEnd(4)} ${j.slug.padEnd(10)} bbox=${j.bbox}`));
  if(DRY){ console.log('\n（--dry：只列出计划，未提取）'); return; }

  console.log('');
  jobs.forEach(j => {
    const dest = path.join(OUT, j.slug + '.pmtiles');
    if(fs.existsSync(dest) && fs.statSync(dest).size > 100000){
      console.log(`  ${j.name} 已存在（${(fs.statSync(dest).size / 1048576).toFixed(1)} MB），跳过`);
      return;
    }
    console.log(`\n── ${j.name} ─────────────────────────────`);
    try{ extract(j.slug, j.bbox, dest); }
    catch(e){ console.log(`  ✗ 提取失败：${e.message}`); return; }
    const mb = (fs.statSync(dest).size / 1048576).toFixed(1);
    console.log(`  ✓ ${j.slug}.pmtiles  ${mb} MB`);
  });

  const got = fs.readdirSync(OUT).filter(f => f.endsWith('.pmtiles'));
  fs.writeFileSync(path.join(OUT, 'CREDITS.md'),
`# 离线矢量瓦片

来自 [Protomaps](https://protomaps.com/) 的每日全球构建包（\`build.protomaps.com/${DATE}.pmtiles\`），
按各城市 bbox 用 \`pmtiles extract\` 提取。

- 底图数据：© [OpenStreetMap](https://www.openstreetmap.org/) contributors，ODbL
- 瓦片构建：Protomaps，明确允许自托管与再分发
- 提取脚本：\`tools/fetch-pmtiles.js\`
- 提取日期：${DATE}

| 文件 | 城市 |
| --- | --- |
${got.map(f => `| \`${f}\` | ${Object.keys(SLUG).find(k => SLUG[k] === f.replace('.pmtiles','')) || ''} |`).join('\n')}

重新提取：\`node tools/fetch-pmtiles.js\`
`, 'utf8');

  console.log(`\n完成，共 ${got.length} 个归档。署名见 prototype/tiles/CREDITS.md`);
}

run();
