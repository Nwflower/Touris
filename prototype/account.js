/* ==========================================================================
   Touris 知途 · 身份与会话层（预设档案 + 魔搭账号）

   ⚠️ 安全声明（务必读完再改）
   预设身份（游客 / 林小满 / 陈铁腿 / 周晚晚）是**纯前端演示**：没有后端，
   「记忆归属于某个人」完全靠浏览器里的 localStorage 演，任何人打开
   DevTools 都能读到全部内容。这不是鉴权。
   **永远不要把任何真实凭据、API Key、用户数据放进预设档案里。**

   设计（v3：预设身份 + 可选魔搭登录）
   - 预设身份：没有 注册 / 密码 / 登录表单。身份就是一份**预置档案**，下拉即切：
       游客（0 记忆，不读不写任何持久化数据）
       林小满（慢节奏 · 安静自然 · 20 条记忆 —— 原 demo 档案）
       陈铁腿（特种兵 · 博物馆控 · 12 条记忆）
       周晚晚（自然风光 · 傍晚散步 · 10 条记忆）
     预置档案的「基础记忆」由代码播种；用户现场新学的记忆仍按账号回写，
     刷新/换身份后可取回（localStorage 可能被禁：全部 try/catch，失败退化游客态）
   - 魔搭账号（第四种会话模式 mode:'ms'）：
     走服务端 OIDC 授权码流程，记忆存服务端持久卷，**换设备也在**。
     这是唯一有真实身份的一条路，其余仍是演示。
     ★ 预设身份与它互不干扰：切到魔搭账号不碰预设档案的数据，切回去也不碰。
   ========================================================================== */

const STORE_KEY = 'zt.v2';     // v2：预设身份制，与旧版(密码制)数据不兼容，改名隔离

/* ---------------- 预置身份表 ----------------
   profile 直接引用 data.js 的三份档案常量（account.js 在 data.js 之后加载，
   词法全局可直接引用；不要用 globalThis['MEMORIES'] —— 顶层 const 不挂到
   global 上，浏览器与 vm 里都取不到）。 */
/* 头像是仓库内的照片（背影 / 剪影，不指向可识别的人），来源与许可见
   img/CREDITS-avatars.md。换图只要改这里的路径——渲染两侧都吃图片。 */
const PRESET_IDENTITIES = [
  { id: 'demo',  name: '林小满', avatar: 'img/persona-demo.jpg', tag: '慢节奏 · 安静自然',
    profile: (typeof MEMORIES !== 'undefined') ? MEMORIES : [] },
  { id: 'iron',  name: '陈铁腿', avatar: 'img/persona-iron.jpg', tag: '特种兵 · 博物馆控',
    profile: (typeof MEMORIES_IRON !== 'undefined') ? MEMORIES_IRON : [] },
  { id: 'eve',   name: '周晚晚', avatar: 'img/persona-eve.jpg', tag: '自然风光 · 傍晚散步',
    profile: (typeof MEMORIES_EVE !== 'undefined') ? MEMORIES_EVE : [] }
];
const GUEST_IDENTITY = { id: null, name: '游客', avatar: '🫥', tag: '0 记忆 · 不落盘' };

function identityById(id) {
  return PRESET_IDENTITIES.find(p => p.id === id) || null;
}
function identityProfile(id) {
  const ident = identityById(id);
  return ident ? (ident.profile || []).slice() : [];
}

let _mem = null;            // 内存镜像；localStorage 不可用时它就是唯一存储

/* ---------------- 底层读写 ---------------- */

function _blankStore() {
  return { accounts: {}, session: { mode: 'guest', id: null } };
}

function _readStore() {
  if (_mem) return _mem;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    _mem = raw ? JSON.parse(raw) : _blankStore();
  } catch (e) {
    // 无痕模式、存储被禁、JSON 损坏——一律退化，不让页面挂掉
    _mem = _blankStore();
  }
  if (!_mem.accounts) _mem.accounts = {};
  if (!_mem.session) _mem.session = { mode: 'guest', id: null };
  return _mem;
}

function _writeStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(_mem));
  } catch (e) {
    // 写不进去也不报错：内存镜像仍在这一个会话里有效
  }
}

/* ---------------- 预置档案播种 ----------------
   惰性播种：首次运行且预置档案不存在时创建；已存在则不动（保留现场学到的记忆）。 */
function _seedPresets() {
  const st = _readStore();
  PRESET_IDENTITIES.forEach(ident => {
    if (st.accounts[ident.id]) {
      /* 已播种的档案：只同步头像，记忆一律不动。预设头像换过一次
         （emoji → 图片），不同步老 localStorage 里就还是旧值。 */
      const acc = st.accounts[ident.id];
      if (acc.seeded && acc.avatar !== ident.avatar) acc.avatar = ident.avatar;
      return;
    }
    st.accounts[ident.id] = {
      id: ident.id,
      name: ident.name,
      avatar: ident.avatar,
      tag: ident.tag,
      memories: identityProfile(ident.id),   // 基础记忆来自 data.js 的 profile
      seeded: true
    };
  });
  _writeStore();
}

/* ---------------- 账号 ---------------- */

function getAccount(id) {
  if (!id) return null;
  return _readStore().accounts[id] || null;
}

/** 当前身份的展示信息（含游客与魔搭账号） */
function currentIdentity(session) {
  const s = session || { mode: 'guest', id: null };
  if (s.mode === 'ms') {
    const u = MS.user || msStoredUser() || {};
    return {
      id: s.id,
      name: u.name || '魔搭用户',
      avatar: u.avatar || '🪪',
      tag: '魔搭账号 · 记忆在云端'
    };
  }
  if (s.mode === 'user') {
    const acc = getAccount(s.id);
    const ident = identityById(s.id) || {};
    return {
      id: s.id,
      name: (acc && acc.name) || ident.name || s.id,
      avatar: (acc && acc.avatar) || ident.avatar || '🧳',
      tag: (acc && acc.tag) || ident.tag || ''
    };
  }
  return GUEST_IDENTITY;
}

/** 头像位。预设身份是仓库内的图片，魔搭账号给的是外部网址，两种都要能画。
    ★ 外面来的网址一律 no-referrer，且加载失败时自动退回 emoji——
    头像是装饰，不该因为它挂了就让整块界面空掉。 */
function avatarHTML(a) {
  const s = String(a == null ? '' : a);
  if (/^(https?:\/\/|img\/|assets\/)/.test(s)) {
    return `<img class="em av-img" src="${esc(s)}" alt="" referrerpolicy="no-referrer"` +
      ` onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'em',textContent:'🪪'}))">`;
  }
  return `<span class="em">${esc(s || '🫥')}</span>`;
}

/* ---------------- 会话 ---------------- */
/* 会话本身只放在内存里：刷新后由 app.js 启动时从存储里恢复，
   没选过身份就回到游客——「游客不落盘」这条就靠它。 */

function getStoredSession() {
  const s = _readStore().session;
  if (s && s.mode === 'user' && getAccount(s.id)) return { mode: 'user', id: s.id };
  /* 魔搭账号：先按上次记下的身份恢复，再由 app.js 启动时的 msRefresh()
     拿服务端校验一次——令牌可能已过期或已登出，那时会自动落回游客。 */
  if (s && s.mode === 'ms' && msStoredUser()) return { mode: 'ms', id: s.id };
  return { mode: 'guest', id: null };
}

function persistSession(session) {
  const st = _readStore();
  if (session.mode === 'user') st.session = { mode: 'user', id: session.id };
  else if (session.mode === 'ms') st.session = { mode: 'ms', id: session.id };
  else st.session = { mode: 'guest', id: null };
  _writeStore();
}

/* ---------------- 记忆回写 ---------------- */

/** 把本次会话新学的记忆并入身份档案，按 text 去重并累加 cited。 */
function saveLearned(id, learned) {
  if (!id || !learned || !learned.length) return;
  const acc = getAccount(id);
  if (!acc) return;
  acc.memories = acc.memories || [];
  learned.forEach(m => {
    const exist = acc.memories.find(x => x.text === m.text);
    if (exist) exist.cited = (exist.cited || 1) + 1;
    else acc.memories.push(m);
  });
  _writeStore();
}

/** 把本次现场学到的记忆并入当前身份的档案。
    预设身份写 localStorage，魔搭账号写服务端——调用方不用关心区别。 */
function persistLearned(session, learned) {
  if (!learned || !learned.length) return;
  if (session.mode === 'user') saveLearned(session.id, learned);
  else if (session.mode === 'ms') { msAbsorb(learned); msPush(learned); }
}

/** 清空全部本地数据（含预置档案的现场记忆）。预置档案本身会重新播种。
    ★ 只清本机：魔搭账号在服务端的记忆**不动**——「清空本机数据」不该顺手
    把人家云端的记忆删了，那两件事的量级差太远。要删云端得单独给入口。 */
function resetAll() {
  _mem = null;
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  msClearLocal();
  _seedPresets();
}

/* ==========================================================================
   魔搭账号登录（服务端 OIDC 会话）
   --------------------------------------------------------------------------
   服务端实现见 server.js 的「身份」一节。这里只做三件事：
   拉状态、发起登录、把学到的记忆回写。

   ★ 为什么令牌要存 localStorage
   创空间页面通常跑在 modelscope.cn 的 iframe 里，此时对本站的请求是**跨站**的：
   SameSite=Lax 的 cookie 带不上，SameSite=None 又要看浏览器心情。所以回调页
   会把签名令牌 postMessage 给这个页面（两者同源），存下来，之后用
   `X-Touris-Session` 头带上去。服务端 cookie 与头两条路都认——直接打开本站
   （不在 iframe 里）的用户走 cookie，什么都不用管。
   ========================================================================== */

const MS_TOKEN_KEY = 'zt.ms.token';    // 服务端签发的会话令牌（签名，非凭证）
const MS_USER_KEY = 'zt.ms.user';      // 上次登录的身份快照，用于刷新后先渲染

let MS = { ready: false, oauth: false, configured: false, egress: null, user: null, memories: [] };
let MS_POLL = null, MS_PUSH_TIMER = null, MS_PUSH_QUEUE = [], MS_PUSH_PROMISE = Promise.resolve();

function _lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function _lsSet(k, v) {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {}
}

function msStoredUser() {
  try { const u = JSON.parse(_lsGet(MS_USER_KEY) || 'null'); return (u && u.sub) ? u : null; }
  catch (e) { return null; }
}

/** 清掉本机的登录态。服务端的记忆不受影响。 */
function msClearLocal() {
  _lsSet(MS_TOKEN_KEY, null);
  _lsSet(MS_USER_KEY, null);
  MS.user = null;
  MS.memories = [];
}

/** 调后端。带令牌头 + 同源 cookie，两条路都试。 */
async function msApi(path, opts) {
  const o = Object.assign({ credentials: 'same-origin', headers: {} }, opts || {});
  const t = _lsGet(MS_TOKEN_KEY);
  if (t) o.headers['X-Touris-Session'] = t;
  if (o.body) o.headers['Content-Type'] = 'application/json';
  const res = await fetch(path, o);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/** 问一次服务端：这个部署开没开登录 / 我是谁 / 我的记忆是什么。
    没有后端（纯静态托管、file://）时静默失败——预设身份照旧能用。 */
async function msRefresh() {
  try {
    const me = await msApi('/api/auth/me');
    MS.ready = true;
    /* oauth = 现在真能用；configured = 服务端配置齐了。
       两者分开是有用的：免费规格的创空间容器没有外网出口，配置是齐的、
       但登录做不完（见 server.js 的「出网自检」），这时要说清是哪一种。 */
    MS.oauth = !!(me && me.oauth);
    MS.configured = !!(me && me.oauthConfigured);
    MS.egress = me ? me.egress : null;
    if (!me || !me.user) { msClearLocal(); return false; }
    MS.user = me.user;
    _lsSet(MS_USER_KEY, JSON.stringify(me.user));
    try {
      const j = await msApi('/api/memories');
      if (j && j.ok) {
        MS.memories = Array.isArray(j.memories) ? j.memories : [];
        if (j.user) { MS.user = j.user; _lsSet(MS_USER_KEY, JSON.stringify(j.user)); }
      }
    } catch (e) { /* 记忆拉不到不影响「已登录」这个事实 */ }
    return true;
  } catch (e) {
    MS.ready = true;
    MS.oauth = false;
    MS.configured = false;
    MS.egress = null;
    return false;
  }
}

/** 登录成功后的收尾：拉状态 → 通知界面切过去 */
async function msAdopt() {
  const ok = await msRefresh();
  document.dispatchEvent(new CustomEvent(ok ? 'touris:ms-login' : 'touris:ms-fail'));
  return ok;
}

/** 发起登录。按官方说明用新窗口——创空间在 iframe 里，就地跳转会丢掉外层页面。 */
function msLogin() {
  if (!MS.oauth) { document.dispatchEvent(new CustomEvent('touris:ms-unavailable')); return; }
  const w = window.open('/auth/login', 'touris_ms_login', 'width=520,height=700,menubar=no,toolbar=no');
  if (!w) { document.dispatchEvent(new CustomEvent('touris:ms-blocked')); return; }

  /* 主路径是回调页 postMessage（见文件末尾的监听）。这里再挂一个轮询兜底：
     万一 opener 被浏览器掐掉、消息没送到，令牌也已经进了 cookie，问得到。 */
  let n = 0;
  clearInterval(MS_POLL);
  MS_POLL = setInterval(async () => {
    const stop = () => { clearInterval(MS_POLL); MS_POLL = null; };
    if (++n > 60) return stop();                       // 约 2 分钟
    try {
      const me = await msApi('/api/auth/me');
      if (me && me.user) { stop(); await msAdopt(); }
      else if (w.closed && n > 3) stop();
    } catch (e) { /* 继续等 */ }
  }, 2000);
}

async function msLogout() {
  clearInterval(MS_POLL); MS_POLL = null;
  await msPushFlushNow();     // 先落盘再走，别把刚学的几条落在半路
  try { await msApi('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  msClearLocal();
  document.dispatchEvent(new CustomEvent('touris:ms-logout'));
}

/** 把现场学到的记忆写回服务端。合并是幂等的（见 server.js 的 mergeMemories），
    所以重复推送、离线重放都不会把 cited 刷高。攒 400ms 一起发，避免连续表态打连发。 */
function msPush(list) {
  if (!MS.user || !list || !list.length) return MS_PUSH_PROMISE;
  MS_PUSH_QUEUE = MS_PUSH_QUEUE.concat(list);
  clearTimeout(MS_PUSH_TIMER);
  MS_PUSH_TIMER = setTimeout(() => { MS_PUSH_PROMISE = msFlush(); }, 400);
  return MS_PUSH_PROMISE;
}

/** 立刻发出排队中的那批，不等防抖。切换身份前用，好让随后的 msRefresh 拿到含它们的副本。 */
function msPushFlushNow() {
  clearTimeout(MS_PUSH_TIMER);
  MS_PUSH_PROMISE = msFlush();
  return MS_PUSH_PROMISE;
}

async function msFlush() {
  const batch = MS_PUSH_QUEUE;
  MS_PUSH_QUEUE = [];
  if (!batch.length) return;
  try {
    const j = await msApi('/api/memories', { method: 'POST', body: JSON.stringify({ add: batch }) });
    /* ★ 这里**故意不**把返回的记忆写进 MS.memories。
       MS.memories 是「以往几次旅行的档案」，S.learned 是「本次现场新增」，
       两者在界面上是相加显示的（见 app.js 的 allMemories）。现在这批还在
       S.learned 里，写回去就会在列表里出现两份。等服务端那份在下一次
       msRefresh()（切换身份 / 刷新页面）时自然合流。 */
    if (j && j.ok === false) throw new Error(j.reason || 'write-failed');
  } catch (e) {
    /* 写失败不打断用户。离线时这批会丢——但要紧的是界面别弹错误框，
       而且服务端合并幂等，用户下次再表态同一条会补上。 */
  }
}

/** 现场记忆并入云端档案。切换身份时用：先把 S.learned 并进来，再清空它。 */
function msAbsorb(learned) {
  if (!MS.user || !learned || !learned.length) return;
  learned.forEach(m => {
    const old = MS.memories.find(x => x.text === m.text);
    if (old) old.cited = Math.max(old.cited || 0, m.cited || 0);
    else MS.memories.push(m);
  });
}

/* 回调页把令牌推过来。同源校验：不是本站发的一律不理。 */
window.addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  const d = e.data;
  if (!d || d.touris !== 'ms-session' || typeof d.token !== 'string' || !d.token) return;
  _lsSet(MS_TOKEN_KEY, d.token);
  clearInterval(MS_POLL); MS_POLL = null;
  msAdopt();
});

/* ---------------- 启动 ---------------- */
_seedPresets();
