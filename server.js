/* ==========================================================================
   Touris 知途 · 薄后端（零依赖，只用 Node 内置模块）

   职责：
   * 静态托管 prototype/
   * POST /api/llm/candidates  — LLM 从候选池提名景点（只提名，不排路线）
   * POST /api/llm/guide       — LLM 按 RAG 检回的相似攻略改写一份新攻略
   * GET  /api/llm/health      — 前端探测：{ ok:true, llm:true|false }

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
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

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
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pmtiles': 'application/octet-stream'
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
  if ((req.url || '').startsWith('/api/')) return handleAPI(req, res).catch(e => json(res, { ok: false, degraded: e.message }));
  serveStatic(req, res);
});

if (require.main === module) {
  /* Studio 要求端口在 0.0.0.0 上暴露。省略 host 时 Node 也会监听所有网卡，
     但那是默认行为，写死更稳，也免得以后有人加了 host 参数把平台挡在外面。 */
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Touris 知途 · listening on 0.0.0.0:${PORT}`);
    console.log(`  LLM: ${(API_KEY && BASE_URL) ? '已接入（' + MODEL + '）' : '未配置 LLM_API_KEY / LLM_BASE_URL —— 前端自动降级为本地算法'}`);
  });
}

module.exports = { server, gateCandidates, gateGuide, extractJSON };
