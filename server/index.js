/* ==========================================================================
   Touris 知途 · 服务端

   一个进程干两件事：把 app/ 当静态站点发出去，外加一个 LLM 接口。

   ★ 为什么要这一层

   app/account.js 开头的警告写得很清楚：**活动 API Key 必须走创空间 Secrets，
   不能落到前端**。纯静态站点做不到这件事，所以哪怕前端一个打包器都没有，
   也必须有个薄后端替它拿 key 去调模型。

   ★ 零依赖

   package.json 里 dependencies 是空的，这个文件也不打破它——只用 Node 内置的
   http / fs / path，fetch 用 Node 18+ 自带的。没有构建步骤，没有 node_modules，
   和前端的「无构建」是同一个取舍。

   ★ 端口

   创空间容器要求监听 0.0.0.0:7860（见部署计划）。本机跑默认也是 7860。
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { interpret, enabled, config, vocabVersion, tags } = require('./interpret');

const ROOT = path.resolve(__dirname, '..', 'app');
const PORT = parseInt(process.env.PORT, 10) || 7860;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon'
};

function send(res, code, body, type){
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8' });
  res.end(body);
}
const sendJSON = (res, code, obj) => send(res, code, JSON.stringify(obj));

/* ---------------- 请求体 ---------------- */

const BODY_MAX = 16 * 1024;      // 一条用户原话而已，给 16KB 足够

function readBody(req){
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if(size > BODY_MAX){ reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ---------------- 接口 ---------------- */

async function handleInterpret(req, res){
  let body;
  try{
    body = JSON.parse(await readBody(req) || '{}');
  }catch(e){
    return sendJSON(res, 400, { ok: false, reason: 'bad_request: ' + e.message });
  }

  const text = String(body.text == null ? '' : body.text);
  const ctx = {
    city: String((body.ctx && body.ctx.city) || '').slice(0, 40),
    spot: String((body.ctx && body.ctx.spot) || '').slice(0, 40),
    dir:  (body.ctx && body.ctx.dir) === 'up' ? 'up' : 'down'
  };
  if(!text.trim()) return sendJSON(res, 400, { ok: false, reason: 'empty_input' });

  try{
    const out = await interpret(text, ctx);
    // 降级也返回 200：这不是错误，是产品设计里的一条正常路径。
    // 前端拿到 ok:false 就去查 REASON_TO_MEMORY，不该弹错误框。
    return sendJSON(res, 200, out);
  }catch(e){
    console.error('[api] interpret 未预期的异常：', e);
    return sendJSON(res, 200, {
      ok: false, degraded: true, reason: 'server_error', memories: [], rejected: []
    });
  }
}

function handleHealth(res){
  sendJSON(res, 200, {
    ok: true,
    llm: enabled(),                 // 前端据此决定要不要露出「自己说」入口
    model: config.model,
    vocabVersion,
    tags: tags.length
  });
}

/* ---------------- 静态文件 ---------------- */

function serveStatic(req, res, pathname){
  let rel = decodeURIComponent(pathname);
  if(rel === '/' || rel === '') rel = '/index.html';

  // 路径穿越防护：拼完必须仍在 ROOT 之内
  const fp = path.resolve(ROOT, '.' + rel);
  if(fp !== ROOT && !fp.startsWith(ROOT + path.sep)){
    return send(res, 403, '403', 'text/plain; charset=utf-8');
  }

  fs.readFile(fp, (err, data) => {
    if(err){
      // 前端是 hash 路由，深链接不该 404，交回首页由前端自己解析
      if(!path.extname(fp)){
        return fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
          if(e2) return send(res, 404, '404', 'text/plain; charset=utf-8');
          send(res, 200, html, MIME['.html']);
        });
      }
      return send(res, 404, '404', 'text/plain; charset=utf-8');
    }
    const type = MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* ---------------- 服务器 ---------------- */

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  if(pathname === '/api/health' && req.method === 'GET'){
    return handleHealth(res);
  }
  if(pathname === '/api/interpret'){
    if(req.method !== 'POST') return sendJSON(res, 405, { ok: false, reason: 'method_not_allowed' });
    return handleInterpret(req, res);
  }
  if(pathname.startsWith('/api/')){
    return sendJSON(res, 404, { ok: false, reason: 'no_such_api' });
  }
  if(req.method !== 'GET' && req.method !== 'HEAD'){
    return send(res, 405, '405', 'text/plain; charset=utf-8');
  }
  serveStatic(req, res, pathname);
});

if(require.main === module){
  server.listen(PORT, HOST, () => {
    console.log(`Touris 知途 · http://localhost:${PORT}`);
    console.log(`  静态根目录 : ${ROOT}`);
    if(enabled()){
      console.log(`  LLM        : 已启用 · ${config.model} · 词汇表 ${vocabVersion}`);
    }else{
      console.log('  LLM        : 未配置（回落到 REASON_TO_MEMORY 查表）');
      console.log('               需要 DASHSCOPE_API_KEY 与 DASHSCOPE_BASE_URL');
    }
  });
}

module.exports = { server, ROOT, PORT };
