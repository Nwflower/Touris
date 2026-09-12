#!/usr/bin/env node
/* 临时：把 prototype/ 用静态服务起起来，给容器里的 Chromium 访问。
   必须**独立进程**跑——如果和 execFileSync 同进程，同步等待会占住事件循环，
   容器连得上却永远等不到响应（表现为 Navigation timeout）。

   用法：node tools/_serve.js [port]，默认 8401
*/
const fs = require('fs');
const path = require('path');
const http = require('http');

const PROTO = path.resolve(__dirname, '..', 'prototype');
const PORT = Number(process.argv[2] || 8401);

const TYPE = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif',
  '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.pmtiles': 'application/octet-stream'
};

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  const fp = path.join(PROTO, rel || 'index.html');
  if (!fp.startsWith(PROTO)) { res.writeHead(403).end(); return; }
  let st; try { st = fs.statSync(fp); } catch (e) { res.writeHead(404).end(); return; }
  const range = req.headers.range;
  const type = TYPE[path.extname(fp).toLowerCase()] || 'application/octet-stream';
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Number(m[2]) : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(fp, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size });
    fs.createReadStream(fp).pipe(res);
  }
}).listen(PORT, () => console.log('  [serve] http://127.0.0.1:' + PORT + '/  → ' + PROTO));
