/* ==========================================================================
   跨表一致性校验

   为什么需要这个：一个景点的信息现在散在**四张按键名索引的表**里——

     CITY_DATA[城市].spots[名称]      类别/简介/标签
     CITY_DATA[城市].poi[名称]        示意图坐标 {x,y}
     CITY_DATA[城市].images[名称]     本地配图路径
     CITY_EXPANSION[slug].geo[名称]   真实经纬度 {lat,lng}（部分城市）

   外加京都的 SPOTS / POI / SPOT_IMG 三张全局表。

   四张表之间**没有任何一致性检查**。少一处不会报错，只会静默降级：少个坐标就
   画不出路线、少张图就退回占位插画。这类问题排查起来极慢——本仓已经踩过一次
   （图片路径格式换了、目录没同步，整页一张图都没有，而不报任何错）。

   另外 CITY_DATA 用**中文名**做键、CITY_EXPANSION 用**英文 slug** 做键，中间靠
   城市的 slug 字段隐式对应，同样无人校验。

   用法：在 prototype 目录运行  node _verify-tables.js
   退出码 0 = 全部一致，1 = 有问题。
   ========================================================================== */

const fs = require('fs'), path = require('path'), vm = require('vm');
const HERE = __dirname;

/* ---------------- 从 index.html 读加载清单 ----------------
   刻意不硬编码文件列表：这个仓库的数据文件还在增加（semantics.js、
   city-expansion.js 都是后加的）。读 index.html 才能跟着一起走。 */
function scriptsFromHtml(){
  const html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)]
    .map(m => m[1])
    .filter(f => // 只要数据脚本；库和渲染层在这个校验里用不上
      !/^vendor\//.test(f) && !/real-maps\.js$/.test(f) && !/app\.js$/.test(f));
}

/* ---------------- 沙箱 ----------------
   照 _verify.js 的做法桩掉 DOM，好让数据脚本能正常求值。 */
function el(){
  return { style:{}, dataset:{}, hidden:true, _html:'', offsetHeight:200, offsetWidth:10, scrollTop:0,
    tagName:'DIV', parentElement:null,
    classList:{ _s:new Set(), add(){}, remove(){}, toggle(){}, contains(){return false} },
    set innerHTML(v){ this._html=String(v) }, get innerHTML(){ return this._html },
    set outerHTML(v){ this._html=String(v) },
    appendChild(){}, remove(){}, getBoundingClientRect(){return{left:0,top:0,bottom:0,right:0}},
    scrollIntoView(){}, closest(){return null} };
}
function makeCtx(){
  const document = {
    body: el(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => el(), addEventListener: () => {}
  };
  const ctx = { document, window:{ addEventListener(){}, innerWidth:1600, innerHeight:900 },
    console, setTimeout: () => 0, requestAnimationFrame: fn => fn(),
    IntersectionObserver: class { observe(){} unobserve(){} disconnect(){} },
    Math, JSON, Set, Map, Array, Object, String, Number, RegExp, Date, Promise, Error, Boolean, isNaN, parseInt, parseFloat };
  vm.createContext(ctx);
  return ctx;
}

/* ---------------- 收集问题 ----------------
   分两级。原因是这个数据模型里「POI」同时装了两类东西：
     · 真景点——有资料、有配图、会进路线
     · 区域锚点——像「西阵」「嵯峨野」，只作住宿/餐饮的区域名或地图标注，
       没有资料也没有配图，这是**有意设计**而不是漏写
   把后者也当错误报，校验器就会喊狼来了、然后被忽略。所以：
     错误 errors —— 会导致渲染出问题的
     提示 notes  —— 可疑但可能是故意的，供人判断 */
const errors = [];
const notes = [];
function bad(scope, msg){ errors.push(`[${scope}] ${msg}`); }
function hint(scope, msg){ notes.push(`[${scope}] ${msg}`); }

/* 用 let 而不是 const，因为加载失败时要在 targets 赋值前就报告 */
let targets = [];
let scripts = [];

function report(){
  console.log(`检查 ${targets.length} 个城市，加载 ${scripts.length} 个数据脚本`);
  console.log(`  数据脚本：${scripts.join(', ') || '(未加载)'}`);
  console.log('');
  if(!errors.length && !notes.length){
    console.log('✓ 跨表引用全部一致');
    return;
  }
  if(errors.length){
    console.log(`✗ ${errors.length} 处错误：`);
    errors.forEach(p => console.log('  ' + p));
  }
  if(notes.length){
    console.log(`${errors.length ? '' : ''}${notes.length} 处提示（可能是设计如此，供判断）：`);
    notes.forEach(p => console.log('  ' + p));
  }
}

function run(){
  scripts = scriptsFromHtml();
  const ctx = makeCtx();

  for(const f of scripts){
    const p = path.join(HERE, f);
    if(!fs.existsSync(p)){ bad('加载', `index.html 引用了不存在的脚本 ${f}`); continue; }
    try{ vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename:f }); }
    catch(e){ bad('加载', `${f} 求值抛错：${e.message}`); return ctx; }
  }
  return ctx;
}

const ctx = run();
const g = n => vm.runInContext(n, ctx);

/* 加载阶段就挂了的话，后面的表都取不到，直接报出来 */
if(errors.length){ report(); process.exit(1); }

const CITY_DATA = g('CITY_DATA');
const CITY_EXPANSION = g('CITY_EXPANSION') || {};
const SPOT_IMG = g('SPOT_IMG') || {};
const SPOTS = g('SPOTS') || {};
const POI = g('POI') || {};

/* ---------------- 逐城检查 ----------------
   京都比较特殊：它以全局常量形式存在（SPOTS/POI/SPOT_IMG），不在 CITY_DATA 里。
   所以先把它拼成一个同形状的检查目标，再和五座城市一起走同一套规则。 */
targets = Object.entries(CITY_DATA).map(([name, c]) => ({
  name, slug: c.slug || null, spots: c.spots || {}, poi: c.poi || {},
  images: c.images || {}, geo: (c.slug && CITY_EXPANSION[c.slug] && CITY_EXPANSION[c.slug].geo) || null,
  routes: (c.plansDefault || []).map(p => ({ label: p.id, days: p.routeDays || [] }))
}));
targets.push({
  /* 京都刻意不给 slug：它不在 CITY_EXPANSION 里（没有真实经纬度表），
     给个编造的 slug 只会让「slug 必须在 CITY_EXPANSION 里有条目」这条误报。 */
  name:'京都（全局常量，不在 CITY_DATA）', slug:null, spots: SPOTS, poi: POI,
  images: SPOT_IMG, geo: null,
  routes: (g('PLANS_DEFAULT') || []).map(p => ({ label: p.id, days: p.routeDays || [] }))
});

for(const t of targets){
  const spotNames = Object.keys(t.spots);
  const poiNames = Object.keys(t.poi);
  const scope = t.name;

  /* 路线里实际被引用到的点。用来区分「区域锚点」与「真漏写」 */
  const usedInRoutes = new Set();
  t.routes.forEach(r => (r.days || []).forEach(day => (day || []).forEach(n => usedInRoutes.add(n))));

  /* 1. spots 与 poi 的键集关系 */
  spotNames.filter(n => !t.poi[n]).forEach(n => bad(scope, `景点「${n}」缺少示意图坐标（poi 里没有），路线画不出来`));
  poiNames.filter(n => !t.spots[n]).forEach(n =>
    usedInRoutes.has(n)
      ? bad(scope, `poi 里的「${n}」被方案路线引用，但 spots 里没有资料——那一段渲染不出内容`)
      : hint(scope, `poi 里的「${n}」没有景点资料，也不在任何路线里（区域锚点？若已无引用可删）`));

  /* 2. 配图必须能落到一个真实文件 */
  spotNames.forEach(n => {
    const img = t.images[n] || SPOT_IMG[n];
    if(!img){ bad(scope, `景点「${n}」没有配图（city.images 与 SPOT_IMG 都没有）`); return; }
    if(/^https?:\/\//i.test(img)) return;                    // 外链不检查存在性
    const p = path.join(HERE, img);
    if(!fs.existsSync(p)) bad(scope, `景点「${n}」的配图文件不存在：${img}`);
  });

  /* 3. 路线里用到的点必须查得到资料和坐标 */
  t.routes.forEach(r => {
    (r.days || []).forEach((day, di) => {
      (day || []).forEach(n => {
        if(!t.spots[n]) bad(scope, `方案「${r.label}」第 ${di + 1} 天引用了不存在的景点「${n}」`);
        else if(!t.poi[n]) bad(scope, `方案「${r.label}」第 ${di + 1} 天的「${n}」没有坐标，画不出路线`);
      });
    });
  });

  /* 4. 真实经纬度表与景点名必须对齐 —— 这是新加的一层，尚无任何校验 */
  if(t.geo){
    const geoNames = Object.keys(t.geo);
    geoNames.filter(n => !t.spots[n]).forEach(n =>
      bad(scope, `CITY_EXPANSION.${t.slug}.geo 里的「${n}」在这座城市的 spots 里不存在`));
    spotNames.filter(n => !t.geo[n]).forEach(n =>
      bad(scope, `景点「${n}」没有真实经纬度（CITY_EXPANSION.${t.slug}.geo 里缺）`));
    // 坐标字段本身
    geoNames.forEach(n => {
      const p = t.geo[n] || {};
      if(typeof p.lat !== 'number' || typeof p.lng !== 'number')
        bad(scope, `geo.${n} 的经纬度不是数字：lat=${p.lat} lng=${p.lng}`);
    });
  }

  /* 5. 有 slug 的城市应该在 CITY_EXPANSION 里有条目（反之亦然） */
  if(t.slug && !CITY_EXPANSION[t.slug])
    bad(scope, `城市声明了 slug="${t.slug}"，但 CITY_EXPANSION 里没有这个键`);
}

/* 6. CITY_EXPANSION 里不该有孤儿 slug */
const knownSlugs = new Set(targets.map(t => t.slug).filter(Boolean));
Object.keys(CITY_EXPANSION).filter(s => !knownSlugs.has(s)).forEach(s =>
  bad('CITY_EXPANSION', `slug「${s}」不对应任何城市（可能是改名后残留）`));

/* ---------------- 收尾 ----------------
   report() 定义在文件上方（靠近 errors/notes 那里），这里只调用。
   曾经这里也定义了一份，把上面那份盖掉了，于是报告仍在读已改名的 problems——
   两份同名函数声明而后者静默胜出，是很容易看漏的一类错。 */

report();
/* 只有「错误」影响退出码。提示不阻断——它们多半是设计如此，
   拿来当失败信号会让这个校验器被绕过。 */
process.exit(errors.length ? 1 : 0);
