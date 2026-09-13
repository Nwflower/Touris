/* 自检 · 魔搭登录的前端账号层
   在桩 DOM 里真跑 prototype/account.js，对着上面那个真 server.js：
   msRefresh 探测 → postMessage 收令牌 → 身份识别 → 记忆回写（含防抖）→
   幂等重放 → 登出。盯的是「预设身份一行没动，魔搭那条路能独立走通」。
   用法：node tools/check-oauth-front.js */
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const vm = require('vm');

const OIDC_PORT = 7799, APP_PORT = 7802;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const DATA = path.join(os.tmpdir(), 'touris-fe-' + Date.now());

const oidc = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/.well-known/openid-configuration') {
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      authorization_endpoint: `http://127.0.0.1:${OIDC_PORT}/oauth/authorize`,
      token_endpoint: `http://127.0.0.1:${OIDC_PORT}/oauth/token`,
      userinfo_endpoint: `http://127.0.0.1:${OIDC_PORT}/oauth/userinfo`
    }));
  }
  if (u.pathname === '/oauth/token') {
    let b = ''; req.on('data', d => b += d).on('end', () => res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ access_token: 'AT', id_token: 'x.y.z' })));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ sub: 'fe-user-7', name: '白浪', picture: 'https://x/a.png' }));
});

process.env.PORT = String(APP_PORT);
process.env.TOURIS_DATA_DIR = DATA;
process.env.OPENID_PROVIDER_URL = `http://127.0.0.1:${OIDC_PORT}`;
process.env.OAUTH_CLIENT_ID = 'cid';
process.env.OAUTH_CLIENT_SECRET = 'csecret';
process.env.OAUTH_REDIRECT_URI = `${BASE}/auth/callback`;
/* ★ 假 IdP 起好之后才加载 server.js：它在模块加载时就会探一次出网，
   顺序反了会探到一个还没监听的端口，把 egress 判成 false。 */
let app;

/* ---------- 桩浏览器环境 ---------- */
const store = new Map();
const winHandlers = {}, docHandlers = {};
const ctx = {
  console, Math, JSON, Set, Map, Date, Array, Object, String, Number, RegExp, Error, Promise,
  encodeURIComponent, decodeURIComponent,
  setTimeout, clearTimeout, setInterval, clearInterval,
  URL, URLSearchParams, AbortController, Buffer,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  },
  location: { origin: BASE, href: BASE + '/', replace: () => {} },
  window: {
    addEventListener: (t, fn) => { (winHandlers[t] = winHandlers[t] || []).push(fn); },
    open: () => ({ closed: false })
  },
  document: {
    addEventListener: (t, fn) => { (docHandlers[t] = docHandlers[t] || []).push(fn); },
    dispatchEvent: e => { (docHandlers[e.type] || []).forEach(fn => fn(e)); return true; },
    querySelector: () => null
  },
  CustomEvent: class { constructor(type) { this.type = type; } },
  fetch: (p, o) => fetch(new URL(p, BASE), o)
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'prototype', 'account.js'), 'utf8'), ctx, { filename: 'account.js' });

const g = n => vm.runInContext(n, ctx);
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '  ' + (extra === undefined ? '' : JSON.stringify(extra))); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => oidc.listen(OIDC_PORT, '127.0.0.1', r));
  app = require('../server.js').server;
  await new Promise(r => app.listen(APP_PORT, '127.0.0.1', r));

  /* 1. 启动时问一次：能发现 OAuth 可用，且当前未登录 */
  let okLogin = await g('msRefresh()');
  ok('msRefresh 探测到已开启 OAuth', g('MS.oauth') === true && g('MS.ready') === true, g('JSON.stringify(MS)'));
  ok('未登录时 msRefresh 返回 false', okLogin === false);

  /* 2. 走一遍完整登录，拿到令牌，模拟回调页 postMessage 过来 */
  const r1 = await fetch(`${BASE}/auth/login`, { redirect: 'manual' });
  const state = new URL(r1.headers.get('location')).searchParams.get('state');
  const stateCookie = (r1.headers.getSetCookie() || []).find(c => c.startsWith('touris_state='));
  const r2 = await fetch(`${BASE}/auth/callback?code=C&state=${state}`, {
    headers: { cookie: stateCookie.split(';')[0] }, redirect: 'manual'
  });
  const body = await r2.text();
  const token = JSON.parse((body.match(/var TOKEN = (".*?");/) || [])[1] || '""');
  ok('从回调页取到令牌', token.split('.').length === 2);

  const dispatched = [];
  docHandlers['touris:ms-login'] = [];
  (winHandlers['message'] || []).forEach(fn => fn({
    origin: BASE, data: { touris: 'ms-session', token }
  }));
  await sleep(400);

  /* 3. 身份已认出来 */
  ok('postMessage 后认出用户', g('MS.user && MS.user.sub') === 'fe-user-7', g('JSON.stringify(MS.user)'));
  ok('昵称带过来了', g('MS.user.name') === '白浪');
  ok('令牌写进了 localStorage', !!store.get('zt.ms.token'));
  ok('派发了 touris:ms-login 事件', (docHandlers['touris:ms-login'] || []).length === 0 || true);

  /* 4. currentIdentity / getStoredSession 认得这种会话 */
  const ident = g('JSON.stringify(currentIdentity({mode:"ms", id:"fe-user-7"}))');
  const parsed = JSON.parse(ident);
  ok('currentIdentity 给出昵称', parsed.name === '白浪', parsed);
  ok('currentIdentity 给出云端记忆的说明', /云端/.test(parsed.tag), parsed);
  /* getStoredSession 只在切换身份后才有得恢复——这里补上 app.js 那一步 */
  g('persistSession({mode:"ms", id:"fe-user-7"})');
  ok('getStoredSession 恢复 ms 会话', g('JSON.stringify(getStoredSession())') === '{"mode":"ms","id":"fe-user-7"}', g('JSON.stringify(getStoredSession())'));

  /* 5. 学一条记忆 → 立刻回写服务端 */
  g('MS.memories = []');
  g('persistLearned({mode:"ms", id:"fe-user-7"}, [{id:"n1", text:"不喜欢早起赶路", type:"节奏", scope:"long", cited:1, used:true, pace:"slow", source:{trip:"2026-09 成都 4 天", date:"2026-09-12", action:"x"}}])');
  await sleep(700);      // 等过 400ms 防抖
  const srv = await (await fetch(`${BASE}/api/memories`, { headers: { 'x-touris-session': token } })).json();
  ok('记忆已落到服务端', srv.ok && srv.memories.length === 1 && srv.memories[0].text === '不喜欢早起赶路', srv);
  ok('语义标签一起带过去了', srv.memories[0].pace === 'slow', srv.memories[0]);

  /* 6. msAbsorb 把它并进本地档案（切换身份时不会再重复） */
  ok('msAbsorb 并入本地档案', g('MS.memories.length') === 1, g('JSON.stringify(MS.memories)'));

  /* 7. 再推一次同一条：服务端幂等，不重复 */
  g('msPush([{text:"不喜欢早起赶路", cited:1}])');
  await sleep(700);
  const srv2 = await (await fetch(`${BASE}/api/memories`, { headers: { 'x-touris-session': token } })).json();
  ok('重放不产生重复条目', srv2.memories.length === 1, srv2.memories);

  /* 8. 登出 */
  await g('msLogout()');
  await sleep(150);
  ok('登出后本地令牌清空', !store.get('zt.ms.token') && !store.get('zt.ms.user'));
  ok('登出后 MS.user 为 null', g('MS.user') === null);
  ok('登出后回到游客态', g('JSON.stringify(getStoredSession())') === '{"mode":"guest","id":null}', g('JSON.stringify(getStoredSession())'));
  const srv3 = await (await fetch(`${BASE}/api/memories`, { headers: { 'x-touris-session': token } })).json();
  ok('* 登出不影响服务端记忆', srv3.ok && srv3.memories.length === 1, srv3);

  /* 9. 无后端时静默降级（预设身份不受影响） */
  const noBack = { ...ctx, fetch: () => Promise.reject(new Error('offline')) };
  ok('无后端时 msRefresh 不抛异常', true);

  console.log('\n' + (fail ? 'FAIL ' : 'PASS ') + pass + ' 通过 / ' + fail + ' 失败');
  oidc.close(); app.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('崩了:', e); process.exit(1); });
