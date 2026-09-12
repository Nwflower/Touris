#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 冒烟测试

   这个项目没有构建步骤、没有测试框架，全部代码是浏览器里的普通脚本。所以这里
   用 vm 起一个沙箱，桩掉 DOM，把 app/ 下所有脚本按 index.html 的顺序加载进来，
   然后断言核心行为。它抓的是「加载顺序错了」「某个视图函数抛错」「推导算错」
   这类问题——都是无构建项目最容易踩的。

   用法：node tools/smoke-test.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.resolve(__dirname, '..', 'app');

/* ---------------- DOM 桩 ---------------- */

function makeEl(tag){
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _html: '', hidden: false, value: '', textContent: '',
    style: {}, dataset: {}, children: [],
    offsetWidth: 10, offsetHeight: 100, scrollTop: 0,
    classList: {
      _s: new Set(),
      add(...a){ a.forEach(x => this._s.add(x)); },
      remove(...a){ a.forEach(x => this._s.delete(x)); },
      contains(x){ return this._s.has(x); },
      toggle(x, f){
        const on = f === undefined ? !this._s.has(x) : !!f;
        on ? this._s.add(x) : this._s.delete(x);
        return on;
      }
    },
    set innerHTML(v){ this._html = String(v); },
    get innerHTML(){ return this._html; },
    set className(v){ this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get className(){ return [...this.classList._s].join(' '); },
    appendChild(c){ this.children.push(c); return c; },
    remove(){},
    contains(){ return true; },
    closest(){ return null; },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    focus(){},
    setAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, removeEventListener(){},
    getBoundingClientRect(){ return { left:0, top:0, right:0, bottom:0, width:0, height:0 }; },
    scrollIntoView(){}
  };
  return el;
}

function makeSandbox(){
  const nodes = {};
  ['app','topbar','view','mempop','authOverlay','toasts',
   'f-date','f-days','f-people','au-user','au-pass','au-name','llm-in'].forEach(id => nodes[id] = makeEl());

  const doc = {
    body: makeEl('body'), documentElement: makeEl('html'),
    getElementById: id => nodes[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: tag => makeEl(tag),
    createTextNode: t => ({ textContent: t }),
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  doc.body.classList = makeEl().classList;

  const store = {};
  const sandbox = {
    document: doc,
    window: {
      addEventListener(){}, removeEventListener(){},
      innerWidth: 1440, innerHeight: 900,
      scrollTo(){}, scrollIntoView(){},
      location: { hash: '', search: '', replace(){}, assign(){} },
      matchMedia: () => ({ matches: false, addEventListener(){}, removeEventListener(){} })
    },
    /* 假的 IntersectionObserver：构造时立刻回调所有目标为「已进入视口」。
       真的浏览器里要等滚动，但那会让测试里 [data-reveal] 永远停在透明态，
       于是「揭示逻辑是否真的挂上了」这件事就测不到。 */
    IntersectionObserver: class {
      constructor(cb){ this.cb = cb; }
      observe(el){ this.cb([{ isIntersecting: true, target: el }]); }
      unobserve(){} disconnect(){}
    },
    location: { hash: '', search: '', replace(){}, assign(){} },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: fn => setTimeout(fn, 0),
    cancelAnimationFrame(){},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),

    /* 假的语义翻译后端。默认「健康 + 能翻出两条」，单项测试改
       sb.__llmStub.next 就能模拟「翻不出来」和后端挂掉两种降级。
       （沙箱里原本没有 fetch，所以这里必须有——llm.js 的探针靠它。） */
    __llmStub: {
      health: true,
      calls: [],
      next: { ok: true, memories: [
        { text:'人多的地方体验很差', type:'景点', avoid:['crowd'] },
        { text:'不吃生食',           type:'餐饮', avoid:['street-food'] }
      ], rejected: [] }
    },
    fetch: url => {
      const u = String(url);
      const stub = sandbox.__llmStub;
      stub.calls.push(u);
      if(u.indexOf('api/health') >= 0){
        return Promise.resolve({ ok: true, json: () => Promise.resolve(
          stub.health
            ? { ok:true, llm:true, model:'qwen3.8-flash', vocabVersion:'stub', tags:18 }
            : { ok:true, llm:false }) });
      }
      if(u.indexOf('api/interpret') >= 0){
        return Promise.resolve({ ok:true, json: () => Promise.resolve(stub.next) });
      }
      return Promise.reject(new Error('unexpected fetch: ' + u));
    },

    Math, JSON, Set, Map, Array, Object, String, Number, RegExp, Date, Promise, Error
  };

  /* ★ 这里有个坑，别改回去

     必须把 vm.createContext() 的**返回值**存下来，并且后续 runInContext 也传它。
     如果传原始对象，Node 会再包一层 context：脚本里拿到的 `document` 与外面读的
     sandbox.document 不是同一个对象，于是从外部断言永远看到空页面——
     而代码在沙箱里其实跑得好好的。断言会骗人，这里吃过一次亏。 */
  sandbox.__global = vm.createContext(sandbox);
  sandbox.__nodes = nodes;
  sandbox.__store = store;
  return sandbox;
}

/* ---------------- 按 index.html 的顺序加载 ---------------- */

const SCRIPTS = [
  'core/dom.js', 'core/store.js', 'core/router.js', 'core/state.js',
  'data/city-seed.js', 'data/memory.js', 'data/city.js', 'data/ui.js',
  'memory/archive.js', 'memory/derive.js',
  'llm.js',
  'account.js',
  'views/ui.js', 'views/auth.js', 'views/thumb.js', 'views/hero.js',
  'views/home.js', 'views/plan.js', 'views/memory.js',
  'validate.js', 'core/bootstrap.js'
];

const errors = [];
function load(sandbox){
  SCRIPTS.forEach(f => {
    const p = path.join(APP, f);
    if(!fs.existsSync(p)){ errors.push(`缺少脚本 ${f}`); return; }
    try{
      vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox.__global, { filename: f });
    }catch(e){
      errors.push(`加载 ${f} 抛错：${e.message}`);
    }
  });
}

/* ---------------- 断言 ---------------- */

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}

(async () => {
  const sb = makeSandbox();
  const g = expr => vm.runInContext(expr, sb.__global);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  /** 改 hash 要改沙箱全局里的那个 location，改外面的没用 */
  const go = h => { sb.__global.location.hash = h; return h; };

  console.log('\n[A] 全部脚本加载');
  load(sb);
  ok('无加载错误', errors.length === 0, errors.join(' | '));

  console.log('\n[B] 启动即游客态（0 记忆模式）');
  ok('SESSION 是游客', g('SESSION.mode') === 'guest');
  ok('档案为空', g('Archive.stored().length') === 0);
  ok('可见记忆为 0', g('Archive.all().length') === 0);
  ok('约束为空', g('Archive.constraints().avoid.length') === 0);
  ok('顶栏渲染出账号入口', /acct-btn/.test(sb.__nodes.topbar.innerHTML));
  ok('首页已渲染', sb.__nodes.view.innerHTML.length > 200);

  console.log('\n[C] 四条路由都能渲染');
  for(const [hash, label] of [['#/', '首页'], ['#/plan', '行程'], ['#/memory', '记忆']]){
    go(hash);
    try{ g('UI.refresh()'); ok(`  ${label} 渲染不抛错`, sb.__nodes.view.innerHTML.length > 100); }
    catch(e){ ok(`  ${label} 渲染不抛错`, false, e.message); }
  }
  ok('未知路由有兜底', (() => {
    go('#/nonsense');
    try{ g('UI.refresh()'); return true; } catch(e){ return false; }
  })());

  console.log('\n[D] 游客：0 记忆时不该有对照');
  go('#/plan');
  g('UI.refresh()');
  const planGuest = sb.__nodes.view.innerHTML;
  ok('行程页提到「通用方案」', /通用方案/.test(planGuest));
  ok('游客不出现 🧠 记忆标签', !/class="mtag"/.test(planGuest));

  console.log('\n[D1] 行程页的厚度（时间轴 / 餐饮 / 住宿）');
  ok('有当天主题', /东山打卡/.test(planGuest) || /锦市场开场/.test(planGuest));
  ok('有节奏与步行量', /步行 [\d.]+km/.test(planGuest));
  ok('有时间轴时刻', /class="tl-time"/.test(planGuest) && /\d{2}:\d{2}/.test(planGuest));
  ok('有停留时长', /min</.test(planGuest));
  ok('有景点简介（不只是名字）', /悬空木舞台|金箔阁楼|枯山水/.test(planGuest));
  ok('有评分与点评数', /\d\.\d 分 · \d+ 条点评/.test(planGuest));
  /* 认结构不认字面：这块的标题文案改过（「这一带吃什么」→「这天吃哪儿」），
     断具体的字会跟着文案一起过期，断容器 + 卡片 + 价格才测的是「有没有这块」。 */
  ok('有餐饮候选组', /class="inday-dine"/.test(planGuest)
     && /class="dinecard"/.test(planGuest) && /¥/.test(planGuest));
  ok('餐饮带来源', /大众点评/.test(planGuest));
  ok('有住宿候选', /住哪儿/.test(planGuest) && /\/晚/.test(planGuest));
  ok('有 D1–D4 天数标记', /daynum/.test(planGuest));

  /* 位置断言：餐饮要在当天行程「里面」，住宿要在两个 day 卡「之间」。
     只检查存在是不够的——之前就是把它们都堆到页尾才出的问题。 */
  ok('餐饮嵌在当天行程里（不是页尾附录）', (() => {
    const d1 = planGuest.indexOf('class="panel day"');
    const d2 = planGuest.indexOf('class="panel day"', d1 + 10);
    const dine = planGuest.indexOf('inday-dine');
    return d1 > -1 && dine > d1 && (d2 === -1 || dine < d2);
  })());
  ok('住宿插在两个 day 卡之间', (() => {
    const d1 = planGuest.indexOf('class="panel day"');
    const d2 = planGuest.indexOf('class="panel day"', d1 + 10);
    const stay = planGuest.indexOf('staypanel');
    return d1 > -1 && d2 > -1 && stay > d1 && stay < d2;
  })());
  ok('每天恰好一块餐饮，没有重复堆叠', (() => {
    // 页尾重复的旧写法会让块数多于天数。用「块数 === 有映射的天数」来断，
    // 而不是拿字符串位置去猜卡片的结束位置——那个位置在模板里拿不到。
    const blocks = (planGuest.match(/class="inday-dine"/g) || []).length;
    const daysWithDine = JSON.parse(g(
      `JSON.stringify(Object.keys(city().dineByDay || {}).map(Number).filter(n => n <= ${g('tripDays()')}))`));
    return blocks === daysWithDine.length;
  })());
  ok('三城都带了每天吃哪儿的映射', (() => {
    const keys = JSON.parse(g('JSON.stringify(Object.keys(CITY_DATA))'));
    return keys.every(k => {
      const m = JSON.parse(g(`JSON.stringify(CITY_DATA[${JSON.stringify(k)}].dineByDay || null)`));
      return m && Object.keys(m).length > 0;
    });
  })());
  ok('dineByDay 引用的组都真实存在', (() => {
    const keys = JSON.parse(g('JSON.stringify(Object.keys(CITY_DATA))'));
    return keys.every(k => {
      const bad = JSON.parse(g(`JSON.stringify(
        Object.values(CITY_DATA[${JSON.stringify(k)}].dineByDay || {}).flat()
          .filter(x => !CITY_DATA[${JSON.stringify(k)}].dine[x]))`));
      return bad.length === 0;
    });
  })());

  console.log('\n[D2] 首页视觉（从原型搬回的 hero 那套）');
  go('#/');
  g('UI.refresh()');
  const home = sb.__nodes.view.innerHTML;
  ok('有 hero 容器', /class="hero"/.test(home));
  ok('有轮播幻灯片', (home.match(/class="hs[ "]/g) || []).length >= 3,
     (home.match(/class="hs[ "]/g) || []).length + ' 张');
  ok('有轮播控件（箭头/圆点/播放）',
     /hero-prev/.test(home) && /hc-dot/.test(home) && /hero-toggle/.test(home));
  ok('有目的地卡片', /class="dest-card/.test(home));
  ok('有统计条', /class="stats"/.test(home));
  ok('有特性卡', /class="feat-card/.test(home));
  ok('有 CTA 与页脚', /cta-inner/.test(home) && /class="footer"/.test(home));
  ok('点位用了缩略图组件', /class="sthumb/.test(home));
  ok('滚动揭示元素已挂上', /data-reveal/.test(home));

  /* 揭示动画的正确姿势：内容默认可见，只有 JS 挂了 .reveal-ready 才启用隐藏。
     反过来写（默认 opacity:0 等 JS 点亮）一旦 JS 出问题就是整页空白，
     而且看起来像「内容没渲染」，极难排查——这坑踩过。 */
  const heroCss = fs.readFileSync(path.join(APP, 'styles/hero.css'), 'utf8');
  ok('★ 揭示动画默认不隐藏内容', /\.reveal-ready \[data-reveal\]\{/.test(heroCss) &&
     !/^\[data-reveal\]\{/m.test(heroCss));
  ok('CSS 里没有残留的裸 [data-reveal] 隐藏规则',
     !/^\s*\[data-reveal\]\s*\{\s*opacity:0/m.test(heroCss));

  /* 布局守卫：hero 高度必须带 var() 兜底，否则 --top-h 一旦解析不出来，
     整条 calc() 失效、height 退回 auto，hero 会塌成一条横杠。 */
  ok('hero 高度带 var() 兜底', /calc\(100vh - var\(--top-h, \d+px\)\)/.test(heroCss));
  ok('hero 有 min-height 兜底', /min-height:\s*[1-9]\d\dpx/.test(heroCss));

  /* 存储键隔离。prototype/ 与新前端跑在同一源下，共用键会让新前端
     读到原型那份「没有语义标签」的记忆，记忆推导静默失效。 */
  ok('★ 存储键与原型隔离', g('STORE_KEY') !== 'zt.v1', g('STORE_KEY'));
  ok('演示账号带播种版本号', /seedVersion/.test(
     fs.readFileSync(path.join(APP, 'account.js'), 'utf8')));

  ok('三张轮播图都有背景（含回落）',
     (home.match(/background-image/g) || []).length >= 3,
     (home.match(/background-image/g) || []).length + ' 处');

  console.log('\n[E] 登录演示账号后记忆生效');
  ok('一键登录成功', g('Auth.loginAsDemo()') === true);
  ok('SESSION 变成 user', g('SESSION.mode') === 'user');
  ok('档案有 20 条', g('Archive.stored().length') === 20, g('Archive.stored().length'));
  ok('约束里有避开项', g('Archive.constraints().avoid.length') > 0);
  ok('约束里有偏好项', g('Archive.constraints().prefer.length') > 0);

  const cons = g('JSON.stringify(Archive.constraints())');
  const diff = JSON.parse(g(`JSON.stringify(Derive.diffs(city(), ${cons}))`));
  ok('推导出对照条目', diff.entries.length > 0, diff.entries.length);
  ok('对照确实去掉了景点', diff.after.spots < diff.before.spots,
     `${diff.before.spots} → ${diff.after.spots}`);
  ok('每条对照都能反查到记忆',
     diff.entries.every(e => e.memoryIds.length > 0),
     JSON.stringify(diff.entries.filter(e => !e.memoryIds.length).map(e => e.id)));

  go('#/plan');
  g('UI.refresh()');
  const planMem = sb.__nodes.view.innerHTML;
  ok('行程页出现记忆标签', /class="mtag"/.test(planMem));
  // 判断「记忆版更丰富」要看对照面板，不能比页面 HTML 长度——
  // 游客版每天挂一个 mtag（8 个），记忆版反而更少。
  ok('对照面板被填上了', /class="diffitem/.test(planMem) &&
     /cmp-before/.test(planMem) && /cmp-after/.test(planMem));
  ok('对照面板列出差异条目', (planMem.match(/class="diffitem/g) || []).length >= 2,
     (planMem.match(/class="diffitem/g) || []).length + ' 条');
  ok('记忆版少了景点', (() => {
    const before = +(planMem.match(/cmp-before">(\d+) 个点/) || [])[1];
    const after = +(planMem.match(/cmp-after">(\d+) 个点/) || [])[1];
    return before > after;
  })());

  console.log('\n[F] 三城都满足协议且能推导');
  for(const k of JSON.parse(g('JSON.stringify(Object.keys(CITY_DATA))'))){
    const r = JSON.parse(g(`JSON.stringify(Derive.diffs(CITY_DATA[${JSON.stringify(k)}], ${cons}))`));
    ok(`  ${k}：推导不抛错且有结果`, r.entries.length > 0,
       `entries=${r.entries.length} before=${r.before.spots} after=${r.after.spots}`);
  }

  console.log('\n[G] 表态 → 学到记忆');
  const before = g('Archive.all().length');
  g(`App.stance['清水寺'] = {v:'down'};
     Archive.remember(REASON_TO_MEMORY['人太多了'], {trip:'2026-09 京都', date:'2026-09-12', action:'测试'})`);
  ok('记忆数 +1', g('Archive.all().length') === before + 1);
  ok('新记忆是 sm 前缀（会话级）', g('Archive.sessionMem()[0].id').startsWith('sm'));
  ok('新记忆带上了语义标签', g('JSON.stringify(Archive.sessionMem()[0].avoid)') === '["crowd"]');

  const cons2 = g('JSON.stringify(Archive.constraints())');
  const diff2 = JSON.parse(g(`JSON.stringify(Derive.diffs(city(), ${cons2}))`));
  ok('新记忆改变了推导结果', diff2.after.spots <= diff.after.spots,
     `${diff.after.spots} → ${diff2.after.spots}`);

  console.log('\n[H] 退出登录把会话记忆并入档案');
  const accBefore = g("getAccount('demo').memories.length");
  g('Auth.logout()');
  const accAfter = g("getAccount('demo').memories.length");
  ok('回游客态', g('SESSION.mode') === 'guest');
  ok('会话记忆已清空', g('Archive.sessionMem().length') === 0);
  ok('并入档案（20 → 21）', accAfter === accBefore + 1, `${accBefore} → ${accAfter}`);

  console.log('\n[I] 数据不变式校验');
  const v = JSON.parse(g('JSON.stringify(Validate.run())'));
  ok('校验全部通过', v.total === 0,
     v.total ? JSON.stringify(v.report.filter(r => r.issues.length)) : '');

  /* ======================================================================
     [J] 服务端闸门 —— 真调用 server/interpret.js

     这一节是重点：闸门是「LLM 不能污染记忆」的唯一保证，不能只有前端测。
     好消息是 gate() 是纯函数，不需要网络也不需要 API Key。
     ====================================================================== */
  console.log('\n[J] 服务端闸门（真调用 server/interpret.js）');
  const S = require(path.resolve(__dirname, '..', 'server', 'interpret.js'));

  ok('词汇表读的是前端 memory.js（18 个语义标签）', S.tags.length === 18, S.tags.length);
  ok('未配 key 时 enabled() 为 false', S.enabled() === false);

  const jOk = S.gate({ memories: [
    { text:'不排长队的店', type:'餐饮', pace:'', avoid:['queue'], prefer:[] }] });
  ok('合法输出放行', jOk.memories.length === 1 && jOk.rejected.length === 0);

  ok('★只有 text、没有任何语义 → 拦下（学不到东西等于没记）', (() => {
    const r = S.gate({ memories: [{ text:'这家店不错', type:'餐饮', pace:'', avoid:[], prefer:[] }] });
    return r.memories.length === 0 && r.rejected[0].reason === 'no_semantics';
  })());

  ok('★越界标签 → 拦下（不静默剔除后放行）', (() => {
    const r = S.gate({ memories: [{ text:'不想爬山', type:'景点', pace:'', avoid:['hiking'], prefer:[] }] });
    return r.memories.length === 0 && /tag_not_in_vocab:avoid:hiking/.test(r.rejected[0].reason);
  })());

  ok('类别不在词汇表 → 拦下', (() => {
    const r = S.gate({ memories: [{ text:'x', type:'美食', pace:'', avoid:['queue'], prefer:[] }] });
    return r.memories.length === 0 && /bad_type/.test(r.rejected[0].reason);
  })());

  ok('单次条数超上限 → 截断', (() => {
    const many = Array.from({ length: 6 },
      (_, i) => ({ text:'偏好' + i, type:'景点', pace:'', avoid:[], prefer:['quiet'] }));
    const r = S.gate({ memories: many });
    return r.memories.length === 4 && /over_limit/.test(r.rejected.map(x => x.reason).join());
  })());

  ok('空数组合法：翻不出来是正确答案，不是失败', (() => {
    const r = S.gate({ memories: [] });
    return r.memories.length === 0 && r.rejected.length === 0;
  })());

  ok('重复条只留一条', (() => {
    const one = { text:'不排长队的店', type:'餐饮', pace:'', avoid:['queue'], prefer:[] };
    const r = S.gate({ memories: [one, Object.assign({}, one)] });
    return r.memories.length === 1 && /duplicate/.test(r.rejected[0].reason);
  })());

  ok('闸门输出能直接喂给 Archive.remember（字段名对得上）', (() => {
    const m = jOk.memories[0];
    return typeof m.text === 'string' && typeof m.type === 'string'
        && Array.isArray(m.avoid) && m.pace === undefined;
  })());

  ok('缓存键同输入稳定、异安排区分',
     S.cacheKey('太赶', { spot:'a', dir:'down' }) === S.cacheKey('太赶', { spot:'a', dir:'down' })
  && S.cacheKey('太赶', { spot:'a', dir:'down' }) !== S.cacheKey('太赶', { spot:'b', dir:'down' }));

  ok('schema 的标签枚举 = 词汇表（模型侧的第一层约束）',
     JSON.stringify(S.SCHEMA.properties.memories.items.properties.avoid.items.enum)
       === JSON.stringify(S.tags));
  ok('schema 关闭额外字段且字段全必填（strict 的前提）', (() => {
    const it = S.SCHEMA.properties.memories.items;
    return it.additionalProperties === false && it.required.length === 5;
  })());
  ok('提示词里带上了词汇表与范例',
     /queue/.test(S.SYSTEM_PROMPT) && /不排长队的店/.test(S.SYSTEM_PROMPT));

  ok('★没配 key 时降级而不是报错', await (async () => {
    const r = await S.interpret('这家排队太久', { spot:'锦市场', dir:'down' });
    return r.ok === false && r.degraded === true && r.reason === 'not_configured'
        && r.memories.length === 0;
  })());

  /* ======================================================================
     [K] 前端接线 —— 「或者自己说」

     上面 [J] 测的是闸门，这里测的是接线：入口该出现时出现、
     说出来的话走 Archive 这个**同一个出口**、翻不出来时不假装。
     fetch 用沙箱里的桩，所以这一节不依赖真实后端。
     ====================================================================== */
  console.log('\n[K] 前端接线（「或者自己说」）');
  await wait(0);                                   // 让 probe 的 Promise 落地
  ok('探针拿到后端 → 入口可用', g('LLM.status()') === 'on', g('LLM.status()'));

  /* 挑一个确实在路线里的景点，否则选择器根本不会渲染 */
  const spot = JSON.parse(g(
    "JSON.stringify(CITY_DATA[App.cityKey].routeDefault[0].spots[0])"));
  g(`App.stance[${JSON.stringify(spot)}] = {v:'down'}; App.openReason = ${JSON.stringify(spot)};`);
  go('#/plan');
  g('UI.refresh()');
  const picker = sb.__nodes.view.innerHTML;

  ok('选择器里出现「或者自己说」', /或者自己说/.test(picker));
  ok('有输入框和提交按钮', /id="llm-in"/.test(picker) && /data-act="llmsay"/.test(picker));
  ok('入口排在原因 chips 之后（原来的路没被抢）',
     picker.indexOf('rchip') < picker.indexOf('llmsay'));
  ok('原来的原因 chips 一个没少', /data-act="reason"/.test(picker));

  sb.__nodes['llm-in'].value = '这家排队两小时，我不吃生的';
  const kBefore = g('Archive.all().length');
  g(`LLM.onClick({}, {dataset:{act:'llmsay', k:${JSON.stringify(spot)}}})`);
  await wait(0);

  ok('说出来的话落成了记忆',
     g('Archive.all().length') === kBefore + 2, `${kBefore} → ${g('Archive.all().length')}`);
  ok('落成的是会话记忆（sm 前缀）', g('Archive.sessionMem()[0].id').startsWith('sm'));
  ok('★source.quote 存的是用户原话（不再是预设标签）',
     g('Archive.sessionMem()[0].source.quote') === '这家排队两小时，我不吃生的');
  ok('落成的记忆带上了语义标签',
     g('JSON.stringify(Archive.sessionMem()[0].avoid)') === '["crowd"]');
  ok('提交后选择器关闭', g('App.openReason') === null);
  ok('原话留在 stance.note 上',
     g(`App.stance[${JSON.stringify(spot)}].note`) === '这家排队两小时，我不吃生的');

  /* ★ 关键：它和点原因标签那条路完全同源——derive 立刻认，而且能反查到它
     注意这里断言的是「真会砍掉东西」的标签（crowd）。若用京都景点里根本不存在的
     标签（如 queue），diff 为空才是正确行为——那不是失败，是「记忆和路线不冲突」。 */
  const cons3 = g('JSON.stringify(Archive.constraints())');
  const c3 = JSON.parse(cons3);
  ok('约束里出现 crowd 与 street-food',
     c3.avoid.includes('crowd') && c3.avoid.includes('street-food'));
  const diff3 = JSON.parse(g(`JSON.stringify(Derive.diffs(city(), ${cons3}))`));
  ok('★说出来的偏好立刻改变推导',
     diff3.entries.length > 0 && diff3.entries.every(e => e.memoryIds.length > 0),
     diff3.entries.length + ' 条差异');
  ok('★对照里引用的正是刚说出来的那条记忆', (() => {
    const smIds = JSON.parse(g('JSON.stringify(Archive.sessionMem().map(m => m.id))'));
    return diff3.entries.some(e => e.memoryIds.some(id => smIds.includes(id)));
  })());
  ok('说「人多的地方」真的砍掉了清水寺',
     /清水寺/.test(diff3.entries.map(e => e.target).join('')),
     diff3.entries.map(e => e.target).join(' / '));
  ok('记忆开关关掉后这份差异消失（对照仍然成立）', (() => {
    const d = JSON.parse(g(
      'JSON.stringify(Derive.diffs(city(), {avoid:[],prefer:[],pace:null}))'));
    return d.entries.length === 0;
  })());

  console.log('\n[K2] 翻不出来时不假装');
  sb.__llmStub.next = { ok:true, memories:[], rejected:[{ reason:'no_semantics' }] };
  g(`App.stance[${JSON.stringify(spot)}] = {v:'down'}; App.openReason = ${JSON.stringify(spot)}; UI.refresh()`);
  sb.__nodes['llm-in'].value = '今天天气不错';
  const k2Before = g('Archive.all().length');
  g(`LLM.onClick({}, {dataset:{act:'llmsay', k:${JSON.stringify(spot)}}})`);
  await wait(0);
  ok('★一条都没记下', g('Archive.all().length') === k2Before,
     `${k2Before} → ${g('Archive.all().length')}`);
  ok('没有伪造出一条记忆',
     g("Archive.all().filter(m => m.text === '今天天气不错').length") === 0);

  console.log('\n[K3] 后端挂掉 → 降级，不是报错');
  sb.__llmStub.next = { ok:false, degraded:true, reason:'timeout', memories:[], rejected:[] };
  g(`App.stance[${JSON.stringify(spot)}] = {v:'up'}; App.openReason = ${JSON.stringify(spot)}; UI.refresh()`);
  sb.__nodes['llm-in'].value = '这里待着舒服';
  const k3Before = g('Archive.all().length');
  let k3Threw = false;
  try{
    g(`LLM.onClick({}, {dataset:{act:'llmsay', k:${JSON.stringify(spot)}}})`);
    await wait(0);
  }catch(e){ k3Threw = true; }
  ok('降级路径不抛异常', k3Threw === false);
  ok('降级时不写记忆', g('Archive.all().length') === k3Before);
  ok('手工路径还在（原因 chips 一个没少）',
     /data-act="reason"/.test(sb.__nodes.view.innerHTML));

  console.log('\n[L] 没有后端时入口整个不渲染（纯静态部署）');
  const sb2 = makeSandbox();
  sb2.__llmStub.health = false;          // 后端说「我没配 key」
  const loadErrorsBefore = errors.length;
  load(sb2);
  await wait(0);
  const g2 = expr => vm.runInContext(expr, sb2.__global);
  ok('二次加载无错误（多一个 fetch 桩不影响启动）', errors.length === loadErrorsBefore,
     errors.slice(loadErrorsBefore).join(' | '));
  ok('探针判定为不可用', g2('LLM.status()') === 'off', g2('LLM.status()'));
  ok('入口返回空串，不留痕迹', g2(`LLM.sayRow('清水寺')`) === '');
  ok('app 仍然完整可用（首页照常渲染）', sb2.__nodes.view.innerHTML.length > 200);

  console.log('\n' + (fail ? `✗ ${fail} 项失败 / ${pass + fail}` : `✓ 全部 ${pass} 项通过`));
  process.exit(fail ? 1 : 0);
})();
