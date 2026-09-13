/* ==========================================================================
   Touris 知途 · 薄后端（零依赖，只用 Node 内置模块）

   职责：
   * 静态托管 prototype/（含 HTTP Range，矢量底图的前置条件）
   * POST /api/llm/candidates  — LLM 从候选池提名景点（只提名，不排路线）
   * POST /api/llm/guide       — LLM 按 RAG 检回的相似攻略改写一份新攻略
   * GET  /api/llm/health      — 前端探测：{ ok:true, llm:true|false }
   * 魔搭账号登录（OIDC）与云端记忆 —— 见下面「身份」一节

   设计红线（与 README「三重闸门」一致）：
   1. 模型输出**从不直接**进前端：服务端先过 gate() —— 逐字段查词汇表/查结构，
      越界整条丢掉，不静默剔除后放行
   2. 提示词里的候选名单只来自 prototype 的真实数据，模型不能发明景点
   3. 没配 key / 超时 / 返回垃圾 → 返回 {ok:false, degraded}（HTTP 200），
      前端降级到本地算法——路演当天服务挂了也不开天窗

   环境变量（只放服务端 / 创空间 Secrets）：
   * LLM_API_KEY     模型服务的 Key。接魔搭 API-Inference 时就是访问令牌
   * LLM_BASE_URL    https://api-inference.modelscope.cn/v1
   * LLM_MODEL        魔搭 Model-Id，如 Qwen/Qwen3-235B-A22B
                     ★ /v1/models 列出的模型不是都真在服务：有的返回
                       choices:null，有的报 no provider supported，配之前先打一发
   * （DASHSCOPE_API_KEY / _BASE_URL / _MODEL 仍兼容，但名字已不准确）
   * LLM_TIMEOUT_MS      可选，默认 8000
   * PORT                可选，默认 7860
   * OAUTH_* / STUDIO_*  由魔搭创空间注入，见「身份」一节
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, 'prototype');
const PORT = Number(process.env.PORT) || 7860;

/* LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 是主名字；DASHSCOPE_* 保留兼容。
   ★ 名字里不该再出现 DashScope：现在接的是**魔搭自己的 API-Inference**
   （https://api-inference.modelscope.cn/v1），不是百炼。继续叫这个名字,
   下一个人会拿百炼的 Key 和地域去配，然后对着 401 想不通。
   callLLM 走的是标准 OpenAI chat/completions 形状，两家都吃得下。 */
const API_KEY = process.env.LLM_API_KEY || process.env.DASHSCOPE_API_KEY || '';
const BASE_URL = process.env.LLM_BASE_URL || process.env.DASHSCOPE_BASE_URL || '';
/* 默认值换成 ModelScope 的 Model-Id 形式。注意：API-Inference 上
   /v1/models 列出的模型**不是都真在服务**——有的返回 choices:null，有的
   直接 no provider supported。这个实测可用。 */
const MODEL = process.env.LLM_MODEL || process.env.DASHSCOPE_MODEL || 'Qwen/Qwen3-235B-A22B';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 8000;

const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.pmtiles': 'application/octet-stream'
};

/* ---------------- 静态文件 ---------------- */
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const fp = path.join(ROOT, urlPath);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('404'); }
    const type = MIME[path.extname(fp)] || 'application/octet-stream';

    /* ★ HTTP Range —— 这不是可有可无的优化，是**矢量底图的前置条件**。

       PMTiles 是单文件归档（tiles/<城>.pmtiles，单城 9–21MB），浏览器靠 Range
       只读它需要的那几段。不支持 Range 时 pmtiles.js 会退化成整包 GET——打开
       详情页就是长时间白屏。所以 real-maps.js 启动时会先发一个 `bytes=0-1` 探测，
       **只有拿到 206 才走矢量**，否则回退到 tiles-raster/ 那套预烤栅格。

       这也正是当初从 Static 换成 Docker + 自建后端的原因：纯静态托管给不了 Range，
       而这里几行就能给。没有它，「矢量优先」只是注释里的一句愿望。
       （`Accept-Ranges: bytes` 在 200 响应上也要发，否则探测方不知道你支持。） */
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    let start = null, end = null;
    if (m) {
      if (m[1] === '' && m[2] === '') {
        m[0] = null;                                   // "bytes=-" 无效，当没有 Range 处理
      } else if (m[1] === '') {
        start = Math.max(0, st.size - Number(m[2]));   // 后缀范围 bytes=-N
        end = st.size - 1;
      } else {
        start = Number(m[1]);
        end = m[2] === '' ? st.size - 1 : Math.min(Number(m[2]), st.size - 1);
      }
    }

    if (start !== null) {
      if (start >= st.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': 'no-store'
      });
      return fs.createReadStream(fp, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Content-Length': st.size,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(fp).pipe(res);
  });
}

/* ---------------- LLM 调用 ---------------- */
async function callLLM(system, user) {
  if (!API_KEY || !BASE_URL) throw Object.assign(new Error('no-key'), { code: 'no-key' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE_URL.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw Object.assign(new Error('upstream ' + res.status + ' ' + body.slice(0, 200)), { code: 'upstream' });
    }
    const j = await res.json();
    return j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
  } finally {
    clearTimeout(timer);
  }
}

/** 从模型输出里抠 JSON（容忍 ```json 围栏与前后闲话） */
function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start < 0) throw new Error('no-json');
  const openCh = raw[start];
  const closeCh = openCh === '[' ? ']' : '}';
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === openCh) depth++;
    else if (raw[i] === closeCh) {
      depth--;
      if (!depth) return JSON.parse(raw.slice(start, i + 1));
    }
  }
  throw new Error('no-json');
}

/* ---------------- 闸门 ---------------- */
/** 候选提名闸门：名字必须逐个出现在候选池，越界整条丢；最多要 want 个 */
function gateCandidates(json, poolNames, want) {
  if (!json || !Array.isArray(json.candidates)) throw new Error('bad-shape');
  const pool = new Set(poolNames);
  const seen = new Set();
  const out = [];
  for (const c of json.candidates) {
    const name = typeof c === 'string' ? c : (c && c.name);
    if (typeof name !== 'string' || !pool.has(name) || seen.has(name)) continue;   // 越界：整条丢
    seen.add(name);
    out.push({ name, reason: typeof c === 'object' && c ? String(c.reason || '').slice(0, 60) : '' });
    if (out.length >= want) break;
  }
  if (!out.length) throw new Error('empty-gated');
  return out;
}

/** 攻略闸门：逐字段查类型与长度；不满足的字段给默认值，核心字段缺失整条降级 */
function gateGuide(json, days) {
  if (!json || typeof json !== 'object' || !json.guide) throw new Error('bad-shape');
  const g = json.guide;
  if (typeof g.title !== 'string' || !g.title.trim() ||
      typeof g.overview !== 'string' || !Array.isArray(g.daily) || !g.daily.length) throw new Error('bad-shape');
  return {
    guide: {
      title: g.title.slice(0, 60),
      overview: g.overview.slice(0, 400),
      daily: g.daily.slice(0, Math.max(1, days)).map(d => ({
        title: String((d && d.title) || '').slice(0, 40),
        morning: String((d && d.morning) || '').slice(0, 160),
        afternoon: String((d && d.afternoon) || '').slice(0, 160),
        evening: String((d && d.evening) || '').slice(0, 160)
      })),
      tips: (Array.isArray(g.tips) ? g.tips : []).slice(0, 8).map(t => String(t).slice(0, 120)),
      basedOn: (Array.isArray(g.basedOn) ? g.basedOn : []).map(x => String(x).slice(0, 80))
    }
  };
}

/* ---------------- 提示词 ---------------- */
const CAND_SYSTEM = `你是旅行规划助手。给你一座城市的候选景点表（名字全部来自真实数据，不允许发明）、
旅行天数和这位旅行者的历史记忆。你的任务：从中提名推荐去的景点并排序。
要求：
1. 数量按要求给定（宁少勿滥）。
2. 优先满足记忆里表达的偏好（喜欢什么就多提名什么；明确不喜欢的一律不提名）。
3. 兼顾类型多样（古建/自然/街区/展馆…），不要全是同一类。
4. 输出严格的 JSON：{"candidates":[{"name":"景点名","reason":"≤30字理由"}]}
   name 必须与候选表逐字一致。不要输出 JSON 以外的任何文字。`;

const GUIDE_SYSTEM = `你是资深旅行攻略作者。你会收到：用户的硬约束（目的地/出行月份/季节/天数）、
旅游偏好（人文历史 或 自然风光）、旅游强度（特种兵 或 闲庭漫步）、若干篇检索到的相似攻略。
最终生成的旅游攻略要满足用户的旅游偏好（人文历史/自然风光）以及旅游强度（特种兵/闲庭漫步）：
- 偏好人文历史 → 每天以历史街区、博物馆、古建为主；偏好自然风光 → 以山水、公园、海岸为主
- 特种兵 → 每天排满 4-5 个点位、早出晚归；闲庭漫步 → 每天 2-3 个点位，留足休息与咖啡时间
- 内容必须基于检索到的攻略改编，不得编造景点名；天气与季节提示要写进 tips
- 严格输出 JSON：{"guide":{"title":"...","overview":"...","daily":[{"title":"...","morning":"...","afternoon":"...","evening":"..."}],"tips":["..."],"basedOn":["引用的攻略标题"]}}
  daily 的条数等于给定的天数。不要输出 JSON 以外的任何文字。`;

/* ==========================================================================
   身份 · 魔搭账号登录（OIDC 授权码流程）
   --------------------------------------------------------------------------
   为什么有这一节
   原型此前是纯静态页，「记忆归属于某个人」只靠 localStorage 演示——换台设备、
   换个浏览器就没了，而这恰好与产品话术「这些记忆换个 App 带不走」相反。
   接上魔搭账号后，记忆按 OIDC 的 sub 落盘到持久卷，换设备也在。

   ★ 只做登录，不做授权
   我们不要魔搭的任何 API 权限，只要一个稳定的用户标识。scope 默认
   `openid profile`，够拿到 sub 和昵称就够了。

   ★ 令牌不落地
   access_token / id_token 用完即弃，**不写 cookie、不写磁盘、不打日志**。
   cookie 里只有 { sub, name, avatar } 加签名。官方文档原话：「OAuth 客户端
   密钥只应在服务端使用」「不要把令牌写入签名 Cookie，因为签名 Cookie 可以
   防篡改，但不会加密内容」。

   ★ 签名密钥从 OAUTH_CLIENT_SECRET 派生
   不额外引入一个要配的变量。代价是：轮换 client secret 会让所有会话失效——
   对演示项目这是可接受的，用户重新登录一次即可。

   ★ 为什么要同时给 localStorage 一条路
   创空间页面通常跑在 modelscope.cn 的 iframe 里，此时对本站的请求是**跨站**的，
   SameSite=Lax 的 cookie 根本不会带上，而 SameSite=None 又要看浏览器给不给
   第三方 cookie。所以回调成功的那一页会把签名令牌 postMessage 给 opener
   （opener 与回调页同源），前端存 localStorage，之后用
   `X-Touris-Session` 头带上来。服务端两条路都认。

   ★ 预设身份不受影响
   林小满 / 陈铁腿 / 周晚晚 / 游客仍走 localStorage 那套，一行数据都不动。
   魔搭登录是**另一套存储**（服务端持久卷），两者互不干扰。
   ========================================================================== */

const OAUTH_ISSUER = process.env.OPENID_PROVIDER_URL || '';
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
const OAUTH_SCOPES = process.env.OAUTH_SCOPES || 'openid profile';
const STUDIO_HOST = process.env.STUDIO_HOST || '';
const OAUTH_ON = !!(OAUTH_ISSUER && OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET);

const SESSION_COOKIE = 'touris_sess';
const STATE_COOKIE = 'touris_state';
const SESSION_TTL_S = 30 * 24 * 3600;
const SESSION_SECRET = process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update('touris|' + (OAUTH_CLIENT_SECRET || 'dev-only')).digest();

/* 记忆落盘位置。创空间把 /mnt/workspace 挂成持久卷（重启不丢；**转移或改名会丢**）。
   本地开发没有这个目录，退到仓库下的 .data/users。 */
const DATA_DIR = (() => {
  if (process.env.TOURIS_DATA_DIR) return process.env.TOURIS_DATA_DIR;
  try { if (fs.statSync('/mnt/workspace').isDirectory()) return '/mnt/workspace/touris-users'; } catch (e) {}
  return path.join(__dirname, '.data', 'users');
})();

/* ---------------- 小工具 ---------------- */
const b64u = buf => Buffer.from(buf).toString('base64url');

function hmac(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest();
}

function signSession(obj) {
  const p = b64u(JSON.stringify(obj));
  return p + '.' + b64u(hmac(p));
}

/** 验签并取出会话对象；任何异常一律当作未登录，不抛 */
function verifySession(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const p = raw.slice(0, dot), s = raw.slice(dot + 1);
  const want = b64u(hmac(p));
  const a = Buffer.from(s), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (!o || typeof o.sub !== 'string' || !o.sub) return null;
    if (o.iat && Date.now() / 1000 - o.iat > SESSION_TTL_S) return null;
    return o;
  } catch (e) { return null; }
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(kv => {
    const i = kv.indexOf('=');
    if (i < 0) return;
    out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

function isHttps(req) {
  const fwd = req.headers['x-forwarded-proto'];
  if (fwd) return String(fwd).split(',')[0].trim() === 'https';
  return !!(STUDIO_HOST && !/^http:\/\//.test(STUDIO_HOST));
}

function cookieAttrs(req, maxAge) {
  /* 跨站 iframe 里要能带上，就得 SameSite=None + Secure；本地 http 没有 https，
     只能退 Lax（此时也没有 iframe 问题）。可用 OAUTH_COOKIE_SAMESITE 覆盖。 */
  const https = isHttps(req);
  const same = process.env.OAUTH_COOKIE_SAMESITE || (https ? 'None' : 'Lax');
  const parts = ['Path=/', 'SameSite=' + same, 'Max-Age=' + maxAge];
  if (https) parts.push('Secure');
  return parts.join('; ');
}

function setCookie(res, name, value, req, maxAge, httpOnly) {
  const c = `${name}=${encodeURIComponent(value)}; ${cookieAttrs(req, maxAge)}` + (httpOnly ? '; HttpOnly' : '');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : [c]);
}

/** 当前请求的登录用户（先看头，再看 cookie）。两条路都认，理由见上面那段注释。 */
function currentUser(req) {
  const h = String(req.headers['x-touris-session'] || '').trim();
  if (h) { const u = verifySession(h); if (u) return u; }
  return verifySession(parseCookies(req)[SESSION_COOKIE]);
}

/* ---------------- OIDC discovery ---------------- */
let _oidc = null, _oidcAt = 0;

/** discovery 的候选地址，按试的顺序排。
 *
 *  ★ 为什么 http 的 issuer 要先试 https
 *  实测：魔搭创空间注入的 OPENID_PROVIDER_URL 是 `http://www.modelscope.cn`，
 *  但它的 discovery 文档里 issuer 写的是 `https://www.modelscope.cn`，
 *  而且容器里 **http 出网是不通的**——按原样先试 http 会直接卡死在这条上，
 *  登录整个用不了（线上就是这么挂的，run 日志里那句
 *  「OIDC discovery 失败：既拿不到 http://... 也解析不了该地址本身」即此）。
 *  同一个域名一旦能走 https 就没必要走 http，所以 http 的地址一律先试 https 版，
 *  再退回原样——万一哪天平台给的是个只能内网 http 访问的 IdP，也还接得住。 */
function discoveryCandidates() {
  const raw = OAUTH_ISSUER.replace(/\/+$/, '');
  const bases = /^http:\/\//.test(raw) ? [raw.replace(/^http:\/\//, 'https://'), raw] : [raw];
  const out = [];
  bases.forEach(b => { out.push(b + '/.well-known/openid-configuration'); out.push(b); });
  return [...new Set(out)];
}

async function oidcConfig() {
  if (_oidc && Date.now() - _oidcAt < 3600e3) return _oidc;
  const errs = [];
  for (const u of discoveryCandidates()) {
    try {
      const r = await fetch(u, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(4000) });
      if (!r.ok) { errs.push(`${u} → HTTP ${r.status}`); continue; }
      const j = await r.json();
      if (j && j.authorization_endpoint && j.token_endpoint) {
        const https = String(j.authorization_endpoint).startsWith('https://');
        console.log(`[auth] OIDC discovery 用的是 ${u}${https ? '' : '（注意：授权端点是 http）'}`);
        _oidc = j; _oidcAt = Date.now();
        return j;
      }
      errs.push(`${u} → 不是 discovery 文档（缺 authorization_endpoint / token_endpoint）`);
    } catch (e) {
      errs.push(`${u} → ${(e && e.message) || e}`);   /* 超时 / DNS / 证书 / 连不通都记下来 */
    }
  }
  throw new Error('OIDC discovery 失败。OPENID_PROVIDER_URL=' + OAUTH_ISSUER + '；逐个候选的结果：\n  ' + errs.join('\n  '));
}

/** 回调地址。创空间是 https://{STUDIO_HOST}/auth/callback；本地开发从 Host 头推。
    ★ 这个值必须和创空间 OAuth 设置里登记的完全一致，所以允许用
      OAUTH_REDIRECT_URI 直接写死。 */
function redirectURI(req) {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;
  let origin = process.env.OAUTH_REDIRECT_ORIGIN || '';
  if (!origin && STUDIO_HOST) origin = /^https?:\/\//.test(STUDIO_HOST) ? STUDIO_HOST : 'https://' + STUDIO_HOST;
  if (!origin) origin = (isHttps(req) ? 'https://' : 'http://') + (req.headers.host || ('localhost:' + PORT));
  return origin.replace(/\/+$/, '') + '/auth/callback';
}

/** id_token 的载荷段。只在 userinfo 拿不到时才用，且**不验签**——这里读的是我们自己
    刚用 client_secret 换回来的那份，走的是服务端到服务端的 TLS 直连，不是从浏览器收来的。 */
function decodeJwtPayload(t) {
  const seg = String(t || '').split('.')[1];
  if (!seg) return null;
  try { return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8')); } catch (e) { return null; }
}

function htmlPage(res, status, title, body) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const doc = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<body style="font:14px/1.8 system-ui,-apple-system,'Segoe UI',sans-serif;padding:40px;color:#241f1b;max-width:560px;margin:0 auto">
<h2 style="font-size:16px;margin:0 0 10px">${esc(title)}</h2><p style="color:#6b6259">${esc(body)}</p>
<p style="margin-top:22px"><a href="/" style="color:#b96843">返回知途</a></p></body>`;
  res.writeHead(status, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(doc);
}

/* ---------------- 登录 / 回调 / 登出 ---------------- */
async function authLogin(req, res) {
  if (!OAUTH_ON) return htmlPage(res, 503, '未开启魔搭登录', '这个部署没有配置 OAuth 环境变量。');
  const cfg = await oidcConfig();
  const state = crypto.randomBytes(16).toString('hex');
  const u = new URL(cfg.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', OAUTH_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectURI(req));
  u.searchParams.set('scope', OAUTH_SCOPES);
  u.searchParams.set('state', state);
  setCookie(res, STATE_COOKIE, state, req, 600, true);
  res.writeHead(302, { 'Location': u.toString(), 'Cache-Control': 'no-store' });
  res.end();
}

async function authCallback(req, res, q) {
  if (!OAUTH_ON) return htmlPage(res, 503, '未开启魔搭登录', '这个部署没有配置 OAuth 环境变量。');

  const back = (msg, detail) => htmlPage(res, 400, msg, detail || '');

  if (q.get('error')) return back('魔搭返回了错误', String(q.get('error_description') || q.get('error')).slice(0, 200));
  const code = q.get('code') || '';
  const state = q.get('state') || '';
  const expect = parseCookies(req)[STATE_COOKIE] || '';
  /* state 是防 CSRF 的：回调必须对上我们自己种下的那个随机串 */
  if (!code) return back('回调缺少 code', '请重新发起登录。');
  if (!state || !expect || state !== expect) return back('state 校验失败', '可能是登录窗口开太久过期了，请重新发起登录。');

  const cfg = await oidcConfig();
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectURI(req),
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET
  });
  const tr = await fetch(cfg.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: form,
    signal: AbortSignal.timeout(10000)
  });
  if (!tr.ok) {
    const t = await tr.text().catch(() => '');
    console.error('[auth] token 交换失败', tr.status, t.slice(0, 200));
    return back('换取令牌失败', '魔搭返回了 ' + tr.status + '。请稍后重试，或确认 OAuth 的 Client ID / Secret 配置正确。');
  }
  const tok = await tr.json().catch(() => ({}));

  let info = null;
  if (cfg.userinfo_endpoint && tok.access_token) {
    try {
      const ur = await fetch(cfg.userinfo_endpoint, {
        headers: { 'Authorization': 'Bearer ' + tok.access_token, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (ur.ok) info = await ur.json();
    } catch (e) { /* 退到 id_token */ }
  }
  if (!info && tok.id_token) info = decodeJwtPayload(tok.id_token);

  const sub = String((info && (info.sub || info.id || info.user_id)) || '').slice(0, 128);
  if (!sub) {
    console.error('[auth] 拿不到 sub：userinfo 与 id_token 里都没有可用标识');
    return back('拿不到用户标识', '魔搭的 userinfo 与 id_token 里都没有 sub。');
  }

  const name = String((info && (info.name || info.nickname || info.preferred_username || info.username)) || '').slice(0, 40);
  const pic = String((info && (info.picture || info.avatar)) || '').slice(0, 300);

  /* ★ 只留 sub / name / avatar。access_token 到此为止，绝不写进 cookie 或磁盘。
     iat 用于过期判断。 */
  const sess = { sub, name: name || '', avatar: /^https?:\/\//.test(pic) ? pic : '', iat: Math.floor(Date.now() / 1000) };
  const token = signSession(sess);
  setCookie(res, SESSION_COOKIE, token, req, SESSION_TTL_S, true);
  setCookie(res, STATE_COOKIE, '', req, 0, true);

  /* 回调页：把令牌 postMessage 给 opener（同源），让跨站 iframe 里的主页面也能
     存下来；没有 opener（用户直接开的登录页）就回首页。 */
  const doc = `<!doctype html><meta charset="utf-8"><title>登录成功</title>
<body style="font:14px/1.8 system-ui,-apple-system,'Segoe UI',sans-serif;padding:40px;color:#241f1b">
<p id="m">已用魔搭账号登录，正在返回知途…</p>
<script>
(function(){
  var TOKEN = ${JSON.stringify(token)};
  var p = document.getElementById('m');
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ touris: 'ms-session', token: TOKEN }, location.origin);
      p.textContent = '登录成功，这个窗口可以关掉了。';
      setTimeout(function(){ window.close(); }, 300);
      return;
    }
  } catch (e) {}
  location.replace('/');
})();
<\/script></body>`;
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(doc);
}

function authLogout(req, res, asJson) {
  setCookie(res, SESSION_COOKIE, '', req, 0, true);
  setCookie(res, STATE_COOKIE, '', req, 0, true);
  if (asJson) return json(res, { ok: true });
  res.writeHead(302, { 'Location': '/', 'Cache-Control': 'no-store' });
  res.end();
}

/* ---------------- 云端记忆 ----------------
   按 OIDC 的 sub 隔离落盘。文件名用 sub 的哈希，免得用户标识直接出现在路径里。

   ★ 合并是**幂等**的：同一条 text 再写一次只是取 cited 的较大值，不会重复累加。
   前端因此可以放心地在每次学到新记忆时就回写一次，不用担心重放把计数刷上去。 */

const MAX_MEMORIES = 300;
const MAX_TEXT = 200;
const TAG_FIELDS = ['type', 'scope', 'pace'];
const LIST_FIELDS = ['avoid', 'prefer'];
const TAG_RE = /^[a-z][a-z-]{0,23}$/;

function cleanTagList(v) {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter(x => typeof x === 'string' && TAG_RE.test(x)))].slice(0, 12);
  return out.length ? out : undefined;
}

/** 落盘前的清洗。这是**信任边界**：这些 JSON 会被原样读回浏览器，
    所以只保留已知字段、只保留已知形状，其余一律丢掉。 */
function cleanMemory(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const text = String(m.text == null ? '' : m.text).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  if (!text) return null;
  const out = { text };
  if (m.id != null) out.id = String(m.id).slice(0, 24);
  TAG_FIELDS.forEach(k => { if (typeof m[k] === 'string' && m[k]) out[k] = m[k].slice(0, 24); });
  LIST_FIELDS.forEach(k => { const v = cleanTagList(m[k]); if (v) out[k] = v; });
  if (m.cited != null) out.cited = Math.max(0, Math.min(9999, Number(m.cited) || 0));
  if (typeof m.used === 'boolean') out.used = m.used;
  const s = m.source;
  if (s && typeof s === 'object' && !Array.isArray(s)) {
    const src = {};
    ['trip', 'date', 'action', 'quote'].forEach(k => {
      if (typeof s[k] === 'string' && s[k]) src[k] = s[k].slice(0, 120);
    });
    if (Object.keys(src).length) out.source = src;
  }
  return out;
}

function userFile(sub) {
  const h = crypto.createHash('sha256').update(String(sub)).digest('hex').slice(0, 32);
  return path.join(DATA_DIR, h + '.json');
}

function readUser(sub) {
  try {
    const j = JSON.parse(fs.readFileSync(userFile(sub), 'utf8'));
    return { sub, name: j.name || '', avatar: j.avatar || '', memories: Array.isArray(j.memories) ? j.memories : [] };
  } catch (e) {
    return { sub, name: '', avatar: '', memories: [] };
  }
}

function writeUser(rec) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fp = userFile(rec.sub);
  const tmp = fp + '.' + process.pid + '.tmp';
  /* ★ 落盘时不写 sub：文件名已经是它的哈希，正文里再存一份没有用处，
     只会让「捞到数据目录」的人顺手拿到一批平台用户标识。 */
  const body = { name: rec.name || '', avatar: rec.avatar || '', memories: rec.memories || [], updated: new Date().toISOString() };
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf8');
  fs.renameSync(tmp, fp);       // 先写临时文件再 rename：中途挂掉不会留下半个 JSON
}

/** 合并：按 text 归并，cited 取较大值（幂等），新条追加在后 */
function mergeMemories(existing, incoming) {
  const byText = new Map();
  (Array.isArray(existing) ? existing : []).forEach(m => { const c = cleanMemory(m); if (c) byText.set(c.text, c); });
  const added = [];
  (Array.isArray(incoming) ? incoming : []).forEach(raw => {
    const m = cleanMemory(raw);
    if (!m) return;
    const old = byText.get(m.text);
    if (old) {
      byText.set(m.text, {
        ...m,
        id: old.id || m.id,
        cited: Math.max(old.cited || 0, m.cited || 0),
        source: old.source || m.source        // 保留最早的出处，别被后来的覆盖
      });
    } else {
      byText.set(m.text, m);
      added.push(m.text);
    }
  });
  return { memories: [...byText.values()].slice(-MAX_MEMORIES), added };
}

/* ---------------- API 路由 ---------------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', d => { buf += d; if (buf.length > 1e6) reject(new Error('too-large')); });
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(new Error('bad-json')); }
    });
    req.on('error', reject);
  });
}

function json(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function handleAPI(req, res) {
  const urlPath = (req.url || '').split('?')[0];

  if (urlPath === '/api/llm/health') {
    return json(res, { ok: true, llm: !!(API_KEY && BASE_URL), model: MODEL });
  }

  /* 前端启动时问一次：这个部署开没开魔搭登录 / 我是谁 */
  if (urlPath === '/api/auth/me') {
    const u = currentUser(req);
    return json(res, {
      ok: true,
      oauth: OAUTH_ON,
      user: u ? { sub: u.sub, name: u.name || '', avatar: u.avatar || '' } : null
    });
  }

  if (urlPath === '/api/auth/logout') {
    return authLogout(req, res, true);
  }

  if (urlPath === '/api/memories') {
    const u = currentUser(req);
    if (!u) return json(res, { ok: false, reason: 'not-logged-in' });

    if (req.method === 'GET') {
      const rec = readUser(u.sub);
      return json(res, { ok: true, memories: rec.memories, user: { sub: u.sub, name: rec.name || u.name || '', avatar: rec.avatar || u.avatar || '' } });
    }

    if (req.method === 'POST') {
      try {
        const p = await readBody(req);
        const rec = readUser(u.sub);
        /* 昵称 / 头像以本次登录拿到的 OIDC 信息为准，用户改不了 */
        rec.name = u.name || rec.name;
        rec.avatar = u.avatar || rec.avatar;

        if (Array.isArray(p.replace)) {
          rec.memories = p.replace.map(cleanMemory).filter(Boolean).slice(-MAX_MEMORIES);
          writeUser(rec);
          return json(res, { ok: true, memories: rec.memories, added: [] });
        }
        const incoming = Array.isArray(p.add) ? p.add : [];
        if (!incoming.length) return json(res, { ok: true, memories: rec.memories, added: [] });
        const { memories, added } = mergeMemories(rec.memories, incoming);
        rec.memories = memories;
        writeUser(rec);
        return json(res, { ok: true, memories: rec.memories, added });
      } catch (e) {
        return json(res, { ok: false, reason: e.message });
      }
    }
    res.writeHead(405); return res.end('405');
  }

  if (urlPath === '/api/llm/candidates' && req.method === 'POST') {
    try {
      const p = await readBody(req);
      const names = (p.candidates || []).map(c => typeof c === 'string' ? c : (c && c.name)).filter(Boolean);
      if (!names.length || !p.city) return json(res, { ok: false, degraded: '参数不完整' });
      const want = Math.max(5, Math.min(40, (Number(p.days) || 4) * 5));
      const user = [
        `城市：${p.city}`, `天数：${p.days} 天`,
        `偏好：${p.interest === 'culture' ? '人文历史' : p.interest === 'nature' ? '自然风光' : '不限'}`,
        `强度：${p.intensity === 'fast' ? '特种兵' : p.intensity === 'slow' ? '闲庭漫步' : '适中'}`,
        p.memories && p.memories.length ? `这位旅行者的历史记忆：\n${p.memories.map(m => '- ' + m).join('\n')}` : '没有历史记忆，按通用口碑提名。',
        `候选景点表（只允许从中提名）：\n${(p.candidates || []).map(c => typeof c === 'string' ? c : `${c.name}（${(c.tags || []).join('/')}）`).join('\n')}`,
        `请提名约 ${want} 个。`
      ].join('\n\n');
      const text = await callLLM(CAND_SYSTEM, user);
      const gated = gateCandidates(extractJSON(text), names, want);
      return json(res, { ok: true, candidates: gated.map(x => x.name), reasons: gated });
    } catch (e) {
      return json(res, { ok: false, degraded: 'LLM 调用失败：' + e.message });
    }
  }

  if (urlPath === '/api/llm/guide' && req.method === 'POST') {
    try {
      const p = await readBody(req);
      if (!p.city || !p.guides || !p.guides.length) return json(res, { ok: false, degraded: '参数不完整（缺检索结果）' });
      const user = [
        `硬约束：目的地 ${p.city}｜出行月份 ${p.month} 月（${p.season}）｜天数 ${p.days} 天｜天气提示：${p.weather || '无'}`,
        `旅游偏好：${p.interest === 'culture' ? '人文历史' : p.interest === 'nature' ? '自然风光' : '两者兼顾'}`,
        `旅游强度：${p.intensity === 'fast' ? '特种兵' : p.intensity === 'slow' ? '闲庭漫步' : '适中'}`,
        p.memories && p.memories.length ? `旅行者历史记忆：\n${p.memories.map(m => '- ' + m).join('\n')}` : '无历史记忆。',
        `检索到的相似攻略（改编素材，不得发明景点）：\n${p.guides.map((g, i) =>
          `${i + 1}.《${g.title}》[${g.source || '来源'}] 天数:${g.days} 月份:${(g.months || []).join(',')} 风格:${(g.styles || []).join('/')}/${g.intensity}\n   摘要：${g.summary}\n   看点：${(g.highlights || []).join('、')}`).join('\n')}`,
        `请生成 ${p.days} 天的攻略。`
      ].join('\n\n');
      const text = await callLLM(GUIDE_SYSTEM, user);
      const gated = gateGuide(extractJSON(text), Number(p.days) || 4);
      return json(res, { ok: true, guide: gated.guide });
    } catch (e) {
      return json(res, { ok: false, degraded: 'LLM 调用失败：' + e.message });
    }
  }

  res.writeHead(404); res.end('404');
}

/* ---------------- 服务器 ---------------- */
const server = http.createServer((req, res) => {
  const urlPath = (req.url || '').split('?')[0];

  if (urlPath === '/auth/login' || urlPath === '/auth/callback' || urlPath === '/auth/logout') {
    const q = new URL(req.url, 'http://placeholder').searchParams;
    /* 登录是唯一会跟外部服务说话的路径，出错要给人话，不能甩 500 堆栈 */
    const fail = e => {
      console.error('[auth]', (e && e.message) || e);
      if (res.headersSent) return;
      htmlPage(res, 502, '登录失败', '服务端在跟魔搭换取身份时出错了，请稍后重试。');
    };
    if (urlPath === '/auth/login') return authLogin(req, res).catch(fail);
    if (urlPath === '/auth/callback') return authCallback(req, res, q).catch(fail);
    return authLogout(req, res, false);
  }

  if (urlPath.startsWith('/api/')) {
    return handleAPI(req, res).catch(e => json(res, { ok: false, degraded: e.message }));
  }
  serveStatic(req, res);
});

if (require.main === module) {
  /* Studio 要求端口在 0.0.0.0 上暴露。省略 host 时 Node 也会监听所有网卡，
     但那是默认行为，写死更稳，也免得以后有人加了 host 参数把平台挡在外面。 */
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Touris 知途 · listening on 0.0.0.0:${PORT}`);
    console.log(`  LLM: ${(API_KEY && BASE_URL) ? '已接入（' + MODEL + '）' : '未配置 LLM_API_KEY / LLM_BASE_URL —— 前端自动降级为本地算法'}`);
    console.log(`  登录: ${OAUTH_ON ? '魔搭 OAuth 已开启' : '未配置 OAUTH_* —— 前端只显示预设身份'}`);
    console.log(`  记忆: ${DATA_DIR}`);
  });
}

module.exports = { server, gateCandidates, gateGuide, extractJSON, cleanMemory, mergeMemories, signSession, verifySession, currentUser, discoveryCandidates };
