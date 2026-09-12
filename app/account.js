/* ==========================================================================
   Touris 知途 · 账号与会话层（app/ 新前端）

   ⚠️ 安全声明（务必读完再改）
   本前端是纯静态站点，没有后端。下面的账号体系完全跑在浏览器里，
   「密码哈希」只是一层障眼法：任何人打开 DevTools 都能读到 localStorage
   里的全部内容，也能直接在控制台调 login() 冒充任意账号。
   这不是真实鉴权，只是为了让「记忆归属于某个人」这件事能被演示出来。

   因此：**永远不要把任何真实凭据、API Key、用户数据放进这里。**
   活动 API Key 必须走创空间 Secrets，不能落到前端。

   设计要点
   - 游客 = 0 记忆模式的载体：不读、不写任何持久化数据，刷新即回到全新状态
   - 一个账号一份记忆档案；登录后本次会话新学的记忆在退出时回写档案
   - localStorage 可能被禁用（无痕模式 / 隐私设置），所有访问都 try/catch，
     失败时静默退化成游客态，页面照常可用
   ========================================================================== */

/* ★ 存储键必须和 prototype/ 分开，不能共用。

   prototype/account.js 用的是 'zt.v1'，而两边跑在同一个域名下（本地都是
   localhost:8000），localStorage 是按源共享的。共用键会导致：先跑过原型的人，
   键里已经有一份 demo 账号，里面那 20 条记忆是**原型版**——原型的内存没有
   avoid / prefer / pace 这些语义标签。

   于是 _seedDemo() 看到账号已存在就跳过，app 直接复用了那份没有语义的记忆，
   constraints() 推不出任何约束，整个「记忆驱动推荐」静默退化成通用方案，
   而且不报任何错。这个 bug 排查了很久，键名分开是根治办法。 */
const STORE_KEY = 'touris.app.v1';

/* 预置账号的播种版本。data/memory.js 的记忆结构一变（加语义标签、
   改 id 命名空间等）就 +1，老档案会自动重播种，不会留下过期数据。 */
const SEED_VERSION = 2;

/* 预置演示账号：登录后直接看到「用了一段时间、已经积累 20 条记忆」的档案。
   这 20 条就是 data/memory.js 里的 MEMORIES，原样引用，不复制、不删改。 */
const DEMO_ACCOUNT = { user: 'demo', pass: 'demo1234' };

let _mem = null;            // 内存镜像；localStorage 不可用时它就是唯一存储

/* ---------------- 底层读写 ---------------- */

/** 空档案。游客不进这里，只有真实账号才有。 */
function _blankStore(){
  return { accounts: {}, session: { mode: 'guest', id: null } };
}

function _readStore(){
  if(_mem) return _mem;
  try{
    const raw = localStorage.getItem(STORE_KEY);
    _mem = raw ? JSON.parse(raw) : _blankStore();
  }catch(e){
    // 无痕模式、存储被禁、JSON 损坏——一律退化，不让页面挂掉
    _mem = _blankStore();
  }
  if(!_mem.accounts) _mem.accounts = {};
  if(!_mem.session) _mem.session = { mode: 'guest', id: null };
  return _mem;
}

function _writeStore(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(_mem));
  }catch(e){
    // 写不进去也不报错：内存镜像仍在这一个会话里有效
  }
}

/* ---------------- 口令处理 ---------------- */
/* FNV-1a + 每账号随机盐。再次强调：挡不住任何人，只是不让明文躺在存储里。 */
function _hash(str){
  let h = 0x811c9dc5;
  for(let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
function _salt(){
  return Math.random().toString(36).slice(2, 10);
}

/* ---------------- 预置演示账号 ---------------- */
/**
 * 惰性播种。
 *
 * 演示账号的档案在两种情况下重建：
 *   1. 还没有这个账号
 *   2. 有，但 seedVersion 对不上——说明 MEMORIES 的结构已经变了
 *      （比如这次从「无语义标签」升级到带 avoid/prefer/pace），
 *      旧的档案留在那儿只会让记忆推导静默失效
 *
 * 用户自己注册的账号不受影响，只有演示账号会被重播种——它本来就是
 * 用来演示「已经积累了一段时间」的样板档案。
 */
function _seedDemo(){
  const st = _readStore();
  const acc = st.accounts[DEMO_ACCOUNT.user];
  if(acc && acc.seedVersion === SEED_VERSION) return;

  const salt = _salt();
  st.accounts[DEMO_ACCOUNT.user] = {
    user: DEMO_ACCOUNT.user,
    name: '林小满',
    avatar: '🧳',
    salt,
    hash: _hash(DEMO_ACCOUNT.pass + salt),
    memories: (typeof MEMORIES !== 'undefined') ? MEMORIES.slice() : [],
    seedVersion: SEED_VERSION,
    seeded: true
  };
  _writeStore();
}
function isDemoAccount(user){ return user === DEMO_ACCOUNT.user; }

/* ---------------- 账号 ---------------- */

function getAccount(user){
  if(!user) return null;
  return _readStore().accounts[user] || null;
}

/** 新建账号。成功返回 {ok:true, user}，失败返回 {ok:false, err:'人话原因'} */
function register(user, pass, name){
  user = String(user || '').trim();
  name = String(name || '').trim() || user;
  if(!user) return { ok:false, err:'请填写账号' };
  if(user.length < 2) return { ok:false, err:'账号至少 2 个字符' };
  if(!pass || String(pass).length < 4) return { ok:false, err:'密码至少 4 位' };
  const st = _readStore();
  if(st.accounts[user]) return { ok:false, err:'这个账号已经存在了' };

  const salt = _salt();
  st.accounts[user] = {
    user,
    name,
    avatar: '🧳',
    salt,
    hash: _hash(String(pass) + salt),
    memories: [],           // 新账号从 0 条开始 —— 这正是「0 记忆模式」
    seeded: false
  };
  _writeStore();
  return { ok:true, user };
}

function login(user, pass){
  user = String(user || '').trim();
  const acc = getAccount(user);
  if(!acc) return { ok:false, err:'账号不存在' };
  if(acc.hash !== _hash(String(pass || '') + acc.salt)) return { ok:false, err:'密码不对' };
  return { ok:true, user };
}

/* ---------------- 会话 ---------------- */
/* 会话本身只放在内存里：刷新后由 app.js 启动时从存储里恢复，
   没登录过就回到游客——「游客不落盘」这条就靠它。 */

function getStoredSession(){
  const s = _readStore().session;
  if(s && s.mode === 'user' && getAccount(s.id)) return { mode:'user', id:s.id };
  return { mode:'guest', id:null };
}

function persistSession(session){
  const st = _readStore();
  st.session = session.mode === 'user' ? { mode:'user', id:session.id } : { mode:'guest', id:null };
  _writeStore();
}

/* ---------------- 记忆回写 ---------------- */

/** 把本次会话新学的记忆并入账号档案，按 text 去重并累加 cited。 */
function saveLearned(user, learned){
  if(!user || !learned || !learned.length) return;
  const acc = getAccount(user);
  if(!acc) return;
  acc.memories = acc.memories || [];
  learned.forEach(m => {
    const exist = acc.memories.find(x => x.text === m.text);
    if(exist) exist.cited = (exist.cited || 1) + 1;
    else acc.memories.push(m);
  });
  _writeStore();
}

/** 清空全部本地数据（含演示账号）。给「重置」按钮用。 */
function resetAll(){
  _mem = null;
  try{ localStorage.removeItem(STORE_KEY); }catch(e){}
  _seedDemo();          // 重置后演示账号仍然可用，否则评委点 Demo 会扑空
}

/* ---------------- 启动 ---------------- */
_seedDemo();
