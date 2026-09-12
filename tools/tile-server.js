#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 离线瓦片静态服务

   为什么需要这个：PMTiles 是单文件归档，前端靠 HTTP Range 只读「需要的那一段」。
   浏览器的 file:// 协议下 module worker 起不来，而且没有 Range，所以离线地图
   必须走 HTTP 服务。

   这个服务同时是魔搭创空间那层薄后端的最小参考实现——PMTiles 能否离线加载，
   取决于静态服务支不支持 Range，这一点在魔搭上线前必须用同样的方式实测。

   用法：
     node tools/tile-server.js [端口] [根目录]
     node tools/tile-server.js 8080 tiles
     node tools/tile-server.js 8080      # 另：/tools/ 会映射到仓库的 tools/
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8080;
const REPO = path.resolve(__dirname, '..');
const ROOT = path.resolve(REPO, process.argv[3] || 'tiles');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pmtiles': 'application/octet-stream',
  '.pbf': 'application/x-protobuf',
  '.osm.pbf': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeOf(file) {
  if (file.endsWith('.osm.pbf')) return MIME['.osm.pbf'];
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/* 解析单段 Range。多段（a-b,c-d）极少见，这里只支持第一段。 */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  let start, end;
  if (rawStart === '') {
    // bytes=-N —— 末尾 N 字节
    const n = Number(rawEnd);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return { unsatisfiable: true };
  return { start, end: Math.min(end, size - 1) };
}

/* 离线测试页还需加载仓库中的 tools/style-patch.js，
   因此除地图目录外，额外把 /tools/ 映射到仓库的 tools/。 */
const TOOLS = path.join(REPO, 'tools');

function resolveTarget(pathname) {
  if (pathname.startsWith('/tools/')) {
    const target = path.join(TOOLS, pathname.slice('/tools/'.length));
    return target.startsWith(TOOLS + path.sep) ? target : null;
  }
  const target = path.join(ROOT, path.normalize(pathname));
  return target.startsWith(ROOT) ? target : null;
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const target = resolveTarget(pathname);
  // 防目录穿越
  if (!target) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) {
      console.log(`${req.method} ${pathname} -> 404`);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }

    const size = st.size;
    const base = {
      'Content-Type': mimeOf(target),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    };

    const range = req.headers.range ? parseRange(req.headers.range, size) : null;

    if (range && range.unsatisfiable) {
      console.log(`${req.method} ${pathname} -> 416`);
      res.writeHead(416, { ...base, 'Content-Range': `bytes */${size}` }).end();
      return;
    }

    if (range) {
      const { start, end } = range;
      console.log(`${req.method} ${pathname} -> 206 ${start}-${end}/${size}`);
      res.writeHead(206, {
        ...base,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': end - start + 1,
      });
      fs.createReadStream(target, { start, end }).pipe(res);
      return;
    }

    console.log(`${req.method} ${pathname} -> 200 ${size}`);
    res.writeHead(200, { ...base, 'Content-Length': size });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`离线瓦片服务已启动`);
  console.log(`  根目录: ${ROOT}`);
  console.log(`  地址:   http://127.0.0.1:${PORT}/offline-test.html`);
  console.log(`  支持:   HTTP Range (206 Partial Content)`);
});
