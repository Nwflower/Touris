#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 把离线矢量瓦片烤成栅格 JPEG

   ★ 为什么要有这一步

   上一步（fetch-pmtiles.js）产出的是 PMTiles——一个单文件归档，
   浏览器靠 **HTTP Range** 只读需要的那一段。

   但部署目标是魔搭创空间的 **Static** 类型，它支不支持 Range 没人测过，
   而且没法先部署一次试。赛题把「状态 Running、评委能打开」写成硬门槛，
   打开是灰的等于零分。

   烤成一个个独立的 JPEG 之后，这个依赖整个消失：
     · 不需要 Range（每个文件是独立资源）
     · 不需要任何后端
     · 也不需要那三个 vendor 库（Leaflet 原生 L.tileLayer 直接读）

   代价只有一处：**缩放层级固定在烤进去的范围内**。运行时用
   `minNativeZoom` / `maxNativeZoom` 让 Leaflet 缩放已有瓦片来补，
   所以任何级别都有图，只是超出范围会糊。

   ★ 前置

     node tools/fetch-pmtiles.js     # 先有 prototype/tiles/*.pmtiles
     Docker                          # 渲染器跑在带 Chromium 的容器里

   ★ 用法

     node tools/render-tiles.js              # z11–14，全部有归档的城市
     node tools/render-tiles.js --zoom 11-13
     node tools/render-tiles.js --city kyoto

   输出 prototype/tiles-raster/{z}/{x}/{y}.jpg

   ★ 实现要点

   渲染在无头 Chromium 里做，用的是 prototype/_tile-render.html 这个工作台。
   它加载和正式页面完全相同的依赖（同一个 flavor、同一个 lang），
   保证烤出来的和跑起来的是一种画法。

   protomaps-leaflet 的每块瓦片本来就是一个 <canvas>，而且它把 "x:y:z"
   写在元素上。所以不必截图再切图——直接遍历 DOM 里已加载的 canvas，
   逐个 toDataURL 即可。坐标是元素自己报的，不依赖视野对齐。

   ★ 两个已经踩过的坑，别再踩回去

   1. key 的顺序是 **x:y:z**，不是 z:x:y。按 z,x,y 解构会让坐标整个错位，
      写出一堆文件名对不上任何真实瓦片的图，而且不报任何错。
   2. 每次视野**必须比步进大一格**。fitBounds 会把请求的范围贴合到容器上，
      舍入误差切掉最外圈——视野等于步进时，每个区块的边界瓦片永远烤不到，
      z14 那种大范围层级会缺几百张。多渲染一圈当余量。
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PROTO = path.join(REPO, 'prototype');
const TILES = path.join(PROTO, 'tiles');
const OUT = path.join(PROTO, 'tiles-raster');
const IMAGE = 'zenika/alpine-chrome:with-puppeteer';
const HARNESS = '_tile-render.html';
const PORT = 8399;

/* 城市名 → 归档文件名 */
const SLUG = { '京都':'kyoto', '北京':'beijing', '上海':'shanghai',
               '杭州':'hangzhou', '广州':'guangzhou', '威海':'weihai', '成都':'chengdu' };

/* bbox 外扩，与 fetch-pmtiles.js 保持一致 */
const PAD = 0.03;

/* 每个视野前进几格，以及渲染几格（比步进大一格当余量） */
const BLOCK = 5;
const VIEW = BLOCK + 1;

const args = process.argv.slice(2);
const valOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const [ZMIN, ZMAX] = (valOf('--zoom') || '11-14').split('-').map(Number);
const ONLY = valOf('--city');   // 传 slug，如 kyoto

function loadCities(){
  const html = fs.readFileSync(path.join(PROTO, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)]
    .map(m => m[1]).filter(f => !/^vendor\//.test(f) && !/(app|real-maps|account)\.js$/.test(f));
  const ctx = { console, location:{ href:'http://x/' }, URL };
  vm.createContext(ctx);
  for(const f of files){
    const p = path.join(PROTO, f);
    if(!fs.existsSync(p)) continue;
    try{ vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename:f }); }catch(e){}
  }
  return vm.runInContext('CITY_DATA', ctx);
}

function main(){
  const cities = loadCities();
  const jobs = [];
  Object.keys(cities).forEach(name => {
    const slug = SLUG[name];
    if(!slug) return;
    if(ONLY && slug !== ONLY) return;
    if(!fs.existsSync(path.join(TILES, slug + '.pmtiles'))){
      console.log(`  ${name} 跳过：没有 tiles/${slug}.pmtiles（先跑 fetch-pmtiles.js）`);
      return;
    }
    const pts = Object.values(cities[name].geo || {});
    if(!pts.length){ console.log(`  ${name} 跳过：没有坐标`); return; }
    const la = pts.map(p => p.lat), lo = pts.map(p => p.lng);
    jobs.push({ slug, name, bbox: [
      Math.min(...lo) - PAD, Math.min(...la) - PAD,
      Math.max(...lo) + PAD, Math.max(...la) + PAD
    ]});
  });

  if(!jobs.length){ console.log('没有可渲染的城市。'); return; }
  console.log(`渲染 z${ZMIN}–${ZMAX}，${jobs.length} 个城市 → prototype/tiles-raster/\n`);
  jobs.forEach(j => console.log('  ' + j.name));

  /* 起一个静态服务：PMTiles 靠 Range 读，file:// 下不行 */
  const srv = require('http').createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const fp = path.join(PROTO, rel);
    if(!fp.startsWith(PROTO)){ res.writeHead(403).end(); return; }
    let st; try{ st = fs.statSync(fp); }catch(e){ res.writeHead(404).end(); return; }
    const range = req.headers.range;
    const type = path.extname(fp) === '.pmtiles' ? 'application/octet-stream'
               : path.extname(fp) === '.html' ? 'text/html; charset=utf-8'
               : path.extname(fp) === '.js' ? 'text/javascript; charset=utf-8'
               : path.extname(fp) === '.css' ? 'text/css; charset=utf-8' : 'application/octet-stream';
    if(range){
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges':'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(fp, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size });
      fs.createReadStream(fp).pipe(res);
    }
  });
  srv.listen(PORT, '127.0.0.1');

  const driver = path.join(__dirname, 'render-driver.js');
  try{
    execFileSync('docker', [
      'run', '--rm',
      '-v', `${OUT.replace(/\\/g,'/')}:/out`,
      '-v', `${driver.replace(/\\/g,'/')}:/app/render-driver.js:ro`,
      '-w', '/app',
      '-e', 'NODE_PATH=/usr/src/app/node_modules',
      '-e', `TARGET=http://host.docker.internal:${PORT}/${HARNESS}?fmt=jpeg&q=0.82`,
      '-e', 'OUT=/out', '-e', `ZMIN=${ZMIN}`, '-e', `ZMAX=${ZMAX}`,
      '-e', `ONLY=${ONLY || ''}`, '-e', `JOBS=${JSON.stringify(jobs)}`,
      '--add-host=host.docker.internal:host-gateway',
      IMAGE, 'node', 'render-driver.js'
    ], { stdio: ['ignore','inherit','inherit'], timeout: 3600000 });
  }catch(e){
    console.log('\n  渲染失败：' + e.message);
  }finally{
    srv.close();
  }
}

main();
