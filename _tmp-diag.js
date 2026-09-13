/* 临时诊断：对比「全程概览地图」与「分日卡片」到底用的是不是同一份路线。
   复用 prototype/_verify.js 的桩 DOM。跑完即删。 */
const fs = require('fs'), vm = require('vm');
process.chdir('prototype');

function el(id){
  return { id, _html:'', hidden:true, style:{}, offsetHeight:200, offsetWidth:10, scrollTop:0,
    tagName:'DIV', dataset:{}, parentElement:null,
    classList:{ _s:new Set(), add(...a){a.forEach(x=>this._s.add(x))}, remove(...a){a.forEach(x=>this._s.delete(x))},
      toggle(x,f){ f===undefined?(this._s.has(x)?this._s.delete(x):this._s.add(x)):(f?this._s.add(x):this._s.delete(x)) },
      contains(x){return this._s.has(x)} },
    set innerHTML(v){ this._html = String(v); }, get innerHTML(){ return this._html; },
    set outerHTML(v){ this._html = String(v); },
    appendChild(){}, remove(){}, getBoundingClientRect(){return{left:0,top:0,bottom:0,right:0}},
    scrollIntoView(){}, closest(){return null}, focus(){} };
}
const nodes = {};
['topbar','shell','railLeft','work','railRight','demoDock','demoDockWrap','authOverlay','memPop','toastWrap']
  .forEach(id => nodes[id] = el(id));
const document = { body: el('body'), getElementById: id => nodes[id] || null,
  querySelector: () => null, querySelectorAll: () => [], createElement: () => el('tmp'), addEventListener: () => {} };
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
const routesOf = html => [...html.matchAll(/data-routes="([^"]*)"/g)].map(m => JSON.parse(unesc(m[1])));

const CITY = '成都';
S.req = { dest:CITY, date:'2026-10-02', days:4, people:2, interest:'mixed', intensity:'mid' };
S.session = { mode:'user', id:'demo' }; S.memoryOn = false; S.diffPlayed = true;
S.rag = null; S.gen = null; S.chosenPlan = null;

/* ---------- S2：详情页 ---------- */
S.screen = 's2'; g('invalidateRun')(); render();
const s2 = nodes.work.innerHTML;

const it = g('itin')();
console.log('=== S2 「分日卡片」的每日内容（it.days[].items）===');
it.days.forEach(d => console.log(`  D${d.day}  ${d.items.map(i => i.kind + ':' + i.name).join('  |  ')}`));

console.log('\n=== S2 页面里的地图（按出现顺序）===');
const m2 = routesOf(s2);
const labels = ['🗺 全程概览', '📍 当日动线'];
m2.forEach((d, i) => {
  console.log(`  [${labels[i] || '图' + (i + 1)}]`);
  d.forEach((day, j) => console.log(`      D${j + 1}: ${day.map(p => p.name).join(' → ') || '(空)'}`));
});

/* ---------- planner 直接产出 ---------- */
const plans = g('plans')();
const chosen = plans.find(p => p.id === it.planId) || plans[0];
console.log('\n=== planner 的 p.routeDays（算法产出的纯景点）===');
chosen.routeDays.forEach((d, i) => console.log(`  D${i + 1}: ${d.join(' → ') || '(空)'}`));

/* ---------- S1：方案卡 ---------- */
S.screen = 's1'; g('invalidateRun')(); render();
const m1 = routesOf(nodes.work.innerHTML);
console.log('\n=== S1 三张方案卡的地图 ===');
m1.forEach((d, i) => console.log(`  卡片${i + 1}: ` + d.map((day, j) => `D${j + 1}[${day.map(p => p.name).join(',')}]`).join('  ')));

/* ---------- 判定 ---------- */
console.log('\n=== 比对：S2 概览 vs 分日卡片 ===');
const s2overview = m2[0] || [];
let diff = 0;
it.days.forEach((d, i) => {
  const cardSpots = d.items.filter(x => x.kind === 'spot').map(x => x.name);
  const mapSpots = (s2overview[i] || []).map(p => p.name);
  const cardExtra = d.items.filter(x => x.kind !== 'spot').map(x => x.kind + ':' + x.name);
  const same = JSON.stringify(cardSpots) === JSON.stringify(mapSpots.filter(n => cardSpots.includes(n)));
  if (!same) diff++;
  console.log(`  D${d.day} 卡片景点: ${cardSpots.join(',')}`);
  console.log(`       概览点位: ${mapSpots.join(',')}   ← 多出: ${mapSpots.filter(n => !cardSpots.includes(n)).join(',') || '无'}`);
  if (cardExtra.length) console.log(`       （卡片另有非景点项: ${cardExtra.join(',')}）`);
});
console.log('\n' + (diff ? `有 ${diff} 天不一致` : '分日与概览一致'));
