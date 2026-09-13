/* ==========================================================================
   Touris 知途 · 身份与会话层（预设档案版）

   ⚠️ 安全声明（务必读完再改）
   本项目是纯静态前端，没有后端。「记忆归属于某个人」完全靠浏览器里的
   localStorage 演示，任何人打开 DevTools 都能读到全部内容。
   这不是鉴权，只是让「记忆 → 推荐差异」能被演示出来。
   **永远不要把任何真实凭据、API Key、用户数据放进这里。**

   设计（v2：预设身份下拉）
   - 没有 注册 / 密码 / 登录表单。身份就是一份**预置档案**，下拉即切：
       游客（0 记忆，不读不写任何持久化数据）
       林小满（慢节奏 · 安静自然 · 20 条记忆 —— 原 demo 档案）
       陈铁腿（特种兵 · 博物馆控 · 12 条记忆）
       周晚晚（自然风光 · 傍晚散步 · 10 条记忆）
   - 预置档案的「基础记忆」由代码播种；用户现场新学的记忆仍按账号回写，
     刷新/换身份后可取回（localStorage 可能被禁：全部 try/catch，失败退化游客态）
   - 切换身份 = 保存当前档案的现场记忆 → 换档案 → 界面立即重算
   ========================================================================== */

const STORE_KEY = 'zt.v2';     // v2：预设身份制，与旧版(密码制)数据不兼容，改名隔离

/* ---------------- 预置身份表 ----------------
   profile 直接引用 data.js 的三份档案常量（account.js 在 data.js 之后加载，
   词法全局可直接引用；不要用 globalThis['MEMORIES'] —— 顶层 const 不挂到
   global 上，浏览器与 vm 里都取不到）。 */
const PRESET_IDENTITIES = [
  { id: 'demo',  name: '林小满', avatar: '🧳', tag: '慢节奏 · 安静自然',
    profile: (typeof MEMORIES !== 'undefined') ? MEMORIES : [] },
  { id: 'iron',  name: '陈铁腿', avatar: '⚡', tag: '特种兵 · 博物馆控',
    profile: (typeof MEMORIES_IRON !== 'undefined') ? MEMORIES_IRON : [] },
  { id: 'eve',   name: '周晚晚', avatar: '🌙', tag: '自然风光 · 傍晚散步',
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
    if (st.accounts[ident.id]) return;
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

/** 当前身份的展示信息（含游客） */
function currentIdentity(session) {
  const s = session || { mode: 'guest', id: null };
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

/* ---------------- 会话 ---------------- */
/* 会话本身只放在内存里：刷新后由 app.js 启动时从存储里恢复，
   没选过身份就回到游客——「游客不落盘」这条就靠它。 */

function getStoredSession() {
  const s = _readStore().session;
  if (s && s.mode === 'user' && getAccount(s.id)) return { mode: 'user', id: s.id };
  return { mode: 'guest', id: null };
}

function persistSession(session) {
  const st = _readStore();
  st.session = session.mode === 'user' ? { mode: 'user', id: session.id } : { mode: 'guest', id: null };
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

/** 清空全部本地数据（含预置档案的现场记忆）。预置档案本身会重新播种。 */
function resetAll() {
  _mem = null;
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  _seedPresets();
}

/* ---------------- 启动 ---------------- */
_seedPresets();
