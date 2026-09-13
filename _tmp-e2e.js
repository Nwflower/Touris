/* 临时端到端验证：起一个**支持 Range** 的后端（就是打算贴进 server.js 的那段），
   让容器里的 Chromium 用真实页面跑一遍 real-maps.js，看它是否真的走矢量那条路。
   跑完即删。 */
const http = require('http'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const ROOT = path.join(REPO, 'prototype');
const PORT = 8399;
const IMAGE = 'zenika/alpine-chrome:with-puppeteer';
const MIME = { '.pmtiles': 'application/octet-stream', '.jpg': 'image/jpeg',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8' };

/* 与要贴进 server.js 的版本一致 */
const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  const fp = path.join(ROOT, rel);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  const type = MIME[path.extname(fp)] || 'application/octet-stream';
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('404'); }
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start, end;
      if (m && m[1] === '' && m[2] !== '') { start = Math.max(0, st.size - Number(m[2])); end = st.size - 1; }
      else { start = m && m[1] ? Number(m[1]) : 0; end = m && m[2] ? Number(m[2]) : st.size - 1; }
      if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(fp, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(fp).pipe(res);
  });
});

srv.listen(PORT, '127.0.0.1', () => {
  const driver = path.join(REPO, '_tmp-e2e-driver.js');
  console.log(`后端已起在 :${PORT}（支持 Range），开始跑容器里的 Chromium…\n`);
  try {
    execFileSync('docker', [
      'run', '--rm',
      '-v', `${driver.replace(/\\/g, '/')}:/app/driver.js:ro`,
      '-w', '/app',
      '-e', 'NODE_PATH=/usr/src/app/node_modules',
      '-e', `TARGET=http://host.docker.internal:${PORT}/_tmp-vector-test.html`,
      '--add-host=host.docker.internal:host-gateway',
      IMAGE, 'node', 'driver.js'
    ], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 300000 });
  } catch (e) {
    console.log('\n容器执行失败：' + e.message);
  } finally {
    srv.close();
  }
});
