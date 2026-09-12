#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 给原型页面拍照

   为什么要有这个：这个项目最贵的一次事故，是 OSM 用 **HTTP 200** 送来一张
   写着「403 Access blocked」的 PNG——状态码、文件头、体积三种自动检查全部
   通过，直到人眼看图才发现。从那以后，改完视觉就拍照看一眼，别只跑断言。

   用法
     node tools/_shot.js                       # 首页首屏 + 整页
     node tools/_shot.js --out 我的目录名
     node tools/_shot.js --shots '[{"name":"x","scroll":1200,"wait":800}]'

   输出 tools/_shots/*.png，同时把关键元素的实测几何打到控制台
   （右下角距离、圆点数量……比肉眼更早发现「元素没了」这类问题）。

   ★ 一个坑：静态服务必须**独立进程**。
     如果服务和应用 execFileSync 在同一个 Node 进程里，同步等待会占住事件
     循环，容器连得上 TCP 却永远等不到响应——报错是 Navigation timeout，
     看起来像网络问题，其实是自己把自己堵死了。所以走 tools/_serve.js。
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PORT = 8401;
const OUT = path.join(__dirname, '_shots');

const args = process.argv.slice(2);
const valOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const DRIVER = path.join(__dirname, '_shot-driver.js');
const SHOTS = valOf('--shots') || JSON.stringify([
  { name: '01-首屏' },
  { name: '02-下滚一屏', scroll: 1200, wait: 900 },
  { name: '03-整页', full: true }
]);

fs.mkdirSync(OUT, { recursive: true });

/* 独立进程起服务，跑完杀掉 */
const serve = spawn(process.execPath, [path.join(__dirname, '_serve.js'), String(PORT)], {
  stdio: ['ignore', 'inherit', 'inherit']
});

function run() {
  try {
    execFileSync('docker', [
      'run', '--rm',
      '-v', `${OUT.replace(/\\/g, '/')}:/out`,
      '-v', `${DRIVER.replace(/\\/g, '/')}:/app/_shot-driver.js:ro`,
      '-w', '/app',
      '-e', 'NODE_PATH=/usr/src/app/node_modules',
      '-e', `TARGET=http://host.docker.internal:${PORT}/index.html`,
      '-e', 'OUT=/out',
      '-e', `SHOTS=${SHOTS}`,
      '-e', `PROBE_MAP=${process.env.PROBE_MAP === '1' ? '1' : '0'}`,
      '--add-host=host.docker.internal:host-gateway',
      'zenika/alpine-chrome:with-puppeteer', 'node', '_shot-driver.js'
    ], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 600000 });
  } catch (e) {
    console.log('\n  拍照失败：' + e.message);
  } finally {
    serve.kill();
  }
  console.log('\n  输出：' + path.relative(REPO, OUT).replace(/\\/g, '/') + '/');
}

/* 给静态服务一点启动时间，再让容器去连 */
setTimeout(run, 700);
