/* 临时验证：1) 总览地图数据是否与分日一致（不再混入餐饮）
             2) mode/highlight 属性、D 按钮是否已去掉
             3) 模拟 mouseover，验证 hover 切天
   复用 prototype/_verify.js 的桩 DOM。跑完即删。 */
const fs = require('fs'), vm = require('vm');
process.chdir('prototype');

function el(id){
  return { id, _html:'', hidden:true, style:{}, offsetHeight:200, offsetWidth:10, scrollTop:0,
    tagName:'DIV', dataset:{}, parentElement:null,
    classList:{ _s:new Set(), add(){}, remove(){}, toggle(){}, contains(){return false} },
    set innerHTML(v){ this._html = String(v); }, get innerHTML(){ return this._html; },
    set outerHTML(v){ this._html = String(v); },
    appendChild(){}, remove(){}, getBoundingClientRect(){return{left:0,top:0,bottom:0,right:0}},
    scrollIntoView(){}, closest(){return null}, focus(){} };
}
const nodes = {};
['topbar','shell','railLeft','work','railRight','demoDock','demoDockWrap','authOverlay','memPop','toastWrap']
  .forEach(id => nodes[id] = el(id));

const HANDLERS = {};                       // 记下事件处理器，稍后手动触发
const document = { body: el('body'), getElementById: id => nodes[id] || null,
  querySelector: () => null, querySelectorAll: () => [], createElement: () => el('tmp'),
  addEventListener: (type, fn) => { (HANDLERS[type] = HANDLERS[type] || []).push(fn); } };
const window = { addEventListener:()=>{}, innerWidth:1600, innerHeight:900, scrollTo:()=>{} };
const history = { state:null, pushState:()=>{}, replaceState:()=>{}, back:()=>{} };
const ctx = { document, window, history, console, setTimeout:()=>0, clearTimeout:()=>{}, requestAnimationFrame:fn=>fn(),
  IntersectionObserver: class { observe(){} unobserve(){} disconnect(){} }, Math, JSON, Set, Map, Date,
  Array, Object, String, Number, RegExp, Error, Promise, AbortController: class { constructor(){this.signal={}} abort(){} },
  fetch: () => Promise.reject(new Error('no-backend')) };
ctx.globalThis = ctx;
vm.createContext(ctx);
for(const f of ['semantics.js','images.js','data.js','city-data.js','city-expansion.js','city-hangzhou-guangzhou.js','city-chengdu.js','spots-expansion.js','coords.js','planner.js','guides-data.js','rag.js','llm.js','account.js','app.js']){
  vm.runInContext(fs.readFileSync(f,'utf8'), ctx, { filename:f });
}
const g = n => vm.runInContext(n, ctx);
const render = g('_doRender'), S = g('S');
const unesc = s => s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');

S.req = { dest:'成都', date:'2026-10-02', days:4, people:2, interest:'mixed', intensity:'mid' };
S.session = { mode:'user', id:'demo' }; S.memoryOn = false; S.diffPlayed = true;
S.rag = null; S.gen = null; S.chosenPlan = null; S.screen = 's2';
g('invalidateRun')(); render();
const html = nodes.work.innerHTML;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if(!c) fails++; };

/* --- 1. 总览数据 vs 分日卡片 --- */
const maps = [...html.matchAll(/data-routes="([^"]*)"/g)].map(m => JSON.parse(unesc(m[1])));
const it = g('itin')();
ok(maps.length === 2, `S2 有两张地图（实得 ${maps.length}）`);
let mismatch = 0;
it.days.forEach((d, i) => {
  const card = d.items.filter(x => x.kind === 'spot').map(x => x.name);
  const over = maps[0][i].map(p => p.name);
  if (JSON.stringify(card) !== JSON.stringify(over)) {
    mismatch++;
    console.log(`        D${d.day} 不一致  卡片[${card}]  概览[${over}]`);
  }
});
ok(mismatch === 0, '总览地图与分日卡片逐天一致（不再混入餐饮）');
const foodNames = ['文殊院','杜甫草堂','玉林路','春熙路'];
ok(!maps[0].flat().some(p => foodNames.includes(p.name)), '总览里没有餐饮区域混入');

/* --- 2. mode / highlight 属性 --- */
ok(/data-map-mode="overview"/.test(html), '概览图 mode=overview');
ok(/data-map-mode="day"/.test(html), '动线图 mode=day');
ok(/data-map-mode="day"[^>]*data-highlight="1"/.test(html) || /data-highlight="1"/.test(html), '动线图初始 highlight=1');

/* --- 3. D 按钮已去掉、联动锚点就位 --- */
ok(!/data-act="s2day"/.test(html), 'D 切换按钮已从地图面板移除');
ok(/data-map-day-title/.test(html), '动线标题带联动锚点');
ok(/data-day="1"/.test(html) && /data-day="4"/.test(html), '时间轴条目带 data-day');

/* --- 4. 模拟 hover 切天 --- */
console.log('\n--- 模拟鼠标划过 D3 的景点 ---');
const fakeItem = { dataset:{ name:'人民公园', day:'3' }, classList:{ add(){}, remove(){} } };
const ev = { target:{ closest: () => fakeItem } };
HANDLERS.mouseover.forEach(fn => fn(ev));
ok(S.s2day === 3, `S.s2day 切到 3（实得 ${S.s2day}）`);

console.log('\n--- 同一天内换个景点，不应重复切 ---');
const before = S.s2day;
const fake2 = { dataset:{ name:'交子公园', day:'3' }, classList:{ add(){}, remove(){} } };
HANDLERS.mouseover.forEach(fn => fn({ target:{ closest: () => fake2 } }));
ok(S.s2day === before, `S.s2day 保持 ${before}`);

console.log('\n--- 划过 D1 ---');
const fake3 = { dataset:{ name:'大慈寺', day:'1' }, classList:{ add(){}, remove(){} } };
HANDLERS.mouseover.forEach(fn => fn({ target:{ closest: () => fake3 } }));
ok(S.s2day === 1, `S.s2day 切回 1（实得 ${S.s2day}）`);

/* --- 5. mock 出 TourisMaps，验证两个入口都调了 setDay --- */
console.log('\n--- 装上 TourisMaps 桩，验证 setDay 被调用 ---');
const calls = [];
ctx.TourisMaps = { setDay:n => calls.push(n), onSpotHover:null, dispose(){}, mount(){} };
// 事件处理器里用的是 globalThis.TourisMaps，所以重新触发即可
const fake4 = { dataset:{ name:'九眼桥', day:'4' }, classList:{ add(){}, remove(){} } };
HANDLERS.mouseover.forEach(fn => fn({ target:{ closest: () => fake4 } }));
ok(S.s2day === 4, `S.s2day 切到 4（实得 ${S.s2day}）`);
ok(calls.includes(4), 'TourisMaps.setDay(4) 被调用');

console.log('\n' + (fails ? `${fails} 项失败` : '全部通过'));
process.exit(fails ? 1 : 0);
