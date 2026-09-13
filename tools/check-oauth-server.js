/* 自检 · 魔搭登录的服务端链路
   假 OIDC 提供方 + 真的 server.js，把授权码流程整条跑一遍：
   discovery → 授权跳转 → state 校验 → 换令牌 → userinfo → 签名会话 →
   记忆读写 → 登出，外加 HTTP Range 的回归。

   为什么要留着它：这条链路**在线上验证不了**——免费 CPU 规格的创空间容器没有
   外网出口，换令牌那一步永远走不到（见 server.js 的「出网自检」）。所以本地这套
   假 IdP 就是唯一的复现手段。改到 server.js 的身份一节时，先跑这个。
   用法：node tools/check-oauth-server.js   （或 npm run check:oauth） */
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const OIDC_PORT = 7799, APP_PORT = 7801;
const DATA = path.join(os.tmpdir(), 'touris-e2e-' + Date.now());

/* ---- 假魔搭 OIDC ---- */
const oidc = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/.well-known/openid-configuration') {
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      issuer: `http://127.0.0.1:${OIDC_PORT}`,
      authorization_endpoint: `http://127.0.0.1:${OIDC_PORT}/oauth/authorize`,
      token_endpoint: `http://127.0.0.1:${OIDC_PORT}/oauth/token`,
      userinfo_endpoint: `http://127.0.0.1:${OIDC_PORT}/oauth/userinfo`
    }));
  }
  if (u.pathname === '/oauth/token') {
    let b = ''; req.on('data', d => b += d).on('end', () => {
      const f = new URLSearchParams(b);
      if (f.get('client_id') !== 'cid' || f.get('client_secret') !== 'csecret') {
        return res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"invalid_client"}');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ access_token: 'AT-SECRET', id_token: 'x.y.z', token_type: 'Bearer' }));
    });
    return;
  }
  if (u.pathname === '/oauth/userinfo') {
    if (req.headers.authorization !== 'Bearer AT-SECRET') return res.writeHead(401).end('{}');
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ sub: 'ms-user-42', name: '白浪', picture: 'https://x/a.png', email: 'leak@x' }));
  }
  res.writeHead(404).end('404');
});

/* ---- 被测应用 ---- */
process.env.PORT = String(APP_PORT);
process.env.TOURIS_DATA_DIR = DATA;
process.env.OPENID_PROVIDER_URL = `http://127.0.0.1:${OIDC_PORT}`;
process.env.OAUTH_CLIENT_ID = 'cid';
process.env.OAUTH_CLIENT_SECRET = 'csecret';
process.env.OAUTH_REDIRECT_URI = `http://127.0.0.1:${APP_PORT}/auth/callback`;
/* ★ 假 IdP 起好之后才加载 server.js：它在模块加载时就会探一次出网，
   顺序反了会探到一个还没监听的端口，把 egress 判成 false。 */
let app;

const get = (p, hdrs) => fetch(`http://127.0.0.1:${APP_PORT}${p}`, { headers: hdrs || {}, redirect: 'manual' });

(async () => {
  await new Promise(r => oidc.listen(OIDC_PORT, '127.0.0.1', r));
  app = require('../server.js').server;
  await new Promise(r => app.listen(APP_PORT, '127.0.0.1', r));

  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  OK   ' + name); }
    else { fail++; console.log('  FAIL ' + name + '  ' + (extra === undefined ? '' : JSON.stringify(extra))); }
  };

  /* 1. 未登录 */
  let r = await get('/api/auth/me');
  let j = await r.json();
  ok('/api/auth/me 报告已开启 OAuth', j.oauth === true, j);
  ok('未登录时 user 为 null', j.user === null, j);
  r = await get('/api/memories');
  ok('未登录读记忆 -> not-logged-in', (await r.json()).reason === 'not-logged-in');

  /* 2. 登录：拿 state cookie 与授权地址 */
  r = await get('/auth/login');
  const loc = r.headers.get('location');
  const stateCookie = (r.headers.getSetCookie() || []).find(c => c.startsWith('touris_state='));
  const state = new URL(loc).searchParams.get('state');
  ok('/auth/login 302 到授权端点', r.status === 302 && loc.includes('/oauth/authorize'), r.status);
  ok('种下 state cookie（HttpOnly）', !!stateCookie && /HttpOnly/.test(stateCookie), stateCookie);
  ok('带上 redirect_uri / scope', new URL(loc).searchParams.get('redirect_uri').endsWith('/auth/callback')
    && new URL(loc).searchParams.get('scope') === 'openid profile');

  /* 3. state 不对 -> 拒绝 */
  r = await get('/auth/callback?code=abc&state=WRONG', { cookie: stateCookie.split(';')[0] });
  ok('state 不匹配被拒', r.status === 400);
  r = await get(`/auth/callback?code=abc&state=${state}`);
  ok('没有 state cookie 也被拒', r.status === 400);

  /* 4. 正常回调 */
  r = await get(`/auth/callback?code=GOODCODE&state=${state}`, { cookie: stateCookie.split(';')[0] });
  const body = await r.text();
  const setCookies = r.headers.getSetCookie() || [];
  const sessCookie = setCookies.find(c => c.startsWith('touris_sess='));
  ok('回调 200 且返回交接页', r.status === 200 && /postMessage/.test(body), r.status);
  ok('Set-Cookie 有 touris_sess', !!sessCookie);
  ok('会话 cookie 是 HttpOnly', /HttpOnly/.test(sessCookie), sessCookie);
  ok('交接页里带签名令牌', /touris: 'ms-session'/.test(body), body.slice(0, 120));
  ok('* access_token 没进页面', !/AT-SECRET/.test(body));
  ok('* email 没被带出来', !/leak@x/.test(body));

  const token = JSON.parse((body.match(/var TOKEN = (".*?");/) || [])[1] || '""');
  ok('能从页面里解析出令牌', typeof token === 'string' && token.split('.').length === 2, token);

  /* 5. 令牌可用（走 X-Touris-Session 头，即 iframe 那条路） */
  const auth = { 'x-touris-session': token };
  r = await get('/api/auth/me', auth); j = await r.json();
  ok('带头 -> 认出用户', j.user && j.user.sub === 'ms-user-42' && j.user.name === '白浪', j);
  ok('头像带过来了', j.user.avatar === 'https://x/a.png', j.user);

  /* 6. cookie 那条路也认 */
  r = await get('/api/auth/me', { cookie: sessCookie.split(';')[0] });
  j = await r.json();
  ok('带 cookie -> 同样认出', !!(j.user && j.user.sub === 'ms-user-42'), j);
  /* 伪造签名必须被拒 */
  const forged = token.split('.')[0] + '.' + Buffer.from('x'.repeat(43)).toString('base64url');
  r = await get('/api/auth/me', { 'x-touris-session': forged });
  ok('* 伪造令牌被拒', (await r.json()).user === null);

  /* 7. 写记忆 */
  r = await fetch(`http://127.0.0.1:${APP_PORT}/api/memories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({
      add: [
        { text: '不喜欢早起赶路', type: '节奏', scope: 'long', cited: 3, pace: 'slow', source: { trip: '2026-03 成都', date: '2026-03-14', action: 'x' } },
        { text: '喜欢逛本地菜市场', type: '餐饮', cited: 1, prefer: ['market'], evil: '<img onerror=alert(1)>' }
      ]
    })
  });
  j = await r.json();
  ok('写入返回 ok', j.ok === true, j);
  ok('两条都进去了', j.memories.length === 2, j.memories);
  ok('* 未知字段 evil 被丢掉', j.memories.length === 2 && !('evil' in j.memories[1]), j.memories[1]);

  /* 8. 幂等：重放同一批，cited 不翻倍 */
  await fetch(`http://127.0.0.1:${APP_PORT}/api/memories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ add: [{ text: '不喜欢早起赶路', cited: 3 }] })
  });
  r = await get('/api/memories', auth); j = await r.json();
  ok('* 重放不累加 cited', j.memories.length === 2 && j.memories[0].cited === 3, j.memories);

  /* 9. 落盘位置 */
  const files = fs.readdirSync(DATA);
  ok('落到了持久目录，且文件名是哈希', files.length === 1 && /^[0-9a-f]{32}\.json$/.test(files[0]), files);
  const saved = fs.readFileSync(path.join(DATA, files[0]), 'utf8');
  ok('* 磁盘上没有 access_token', !/AT-SECRET/.test(saved));
  ok('* 磁盘上没有明文 sub', !/ms-user-42/.test(saved));

  /* 10. 登出 */
  r = await get('/api/auth/logout', auth);
  ok('登出返回 ok', (await r.json()).ok === true);
  ok('登出清了 cookie', (r.headers.getSetCookie() || []).some(c => /touris_sess=;/.test(c)));

  /* 11. Range 回归 */
  r = await fetch(`http://127.0.0.1:${APP_PORT}/index.html`, { headers: { Range: 'bytes=0-9' } });
  ok('Range -> 206', r.status === 206 && String(r.headers.get('content-range')).startsWith('bytes 0-9/'), r.status);
  r = await fetch(`http://127.0.0.1:${APP_PORT}/index.html`);
  ok('无 Range -> 200 且带 Accept-Ranges', r.status === 200 && r.headers.get('accept-ranges') === 'bytes');
  r = await fetch(`http://127.0.0.1:${APP_PORT}/index.html`, { headers: { Range: 'bytes=99999999-' } });
  ok('越界 -> 416', r.status === 416, r.status);

  console.log('\n' + (fail ? 'FAIL ' : 'PASS ') + pass + ' 通过 / ' + fail + ' 失败');
  oidc.close(); app.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('崩了:', e); process.exit(1); });
