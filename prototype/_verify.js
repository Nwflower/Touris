/* 回归校验：数据交叉引用 + 桩 DOM 实跑 render()。在 prototype 目录运行 node _verify.js。 */
const fs = require('fs'), vm = require('vm');

/* ---------- 桩 DOM ---------- */
function el(id){
  return {
    id, _html:'', hidden:true, style:{}, offsetHeight:200, offsetWidth:10, scrollTop:0,
    tagName:'DIV', dataset:{}, parentElement:null,
    classList:{ _s:new Set(),
      add(...a){a.forEach(x=>this._s.add(x))}, remove(...a){a.forEach(x=>this._s.delete(x))},
      toggle(x,f){ f===undefined ? (this._s.has(x)?this._s.delete(x):this._s.add(x)) : (f?this._s.add(x):this._s.delete(x)) },
      contains(x){return this._s.has(x)} },
    set innerHTML(v){ this._html = String(v); }, get innerHTML(){ return this._html; },
    set outerHTML(v){ this._html = String(v); },
    appendChild(){}, remove(){}, getBoundingClientRect(){return{left:0,top:0,bottom:0,right:0}},
    scrollIntoView(){}, closest(){return null}
  };
}
const nodes = {};
['topbar','shell','railLeft','work','railRight','demoDock','demoDockWrap','authOverlay','memPop','toastWrap']
  .forEach(id => nodes[id] = el(id));

const document = {
  body: el('body'),
  getElementById: id => nodes[id] || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => el('tmp'),
  addEventListener: () => {}
};
const window = { addEventListener:()=>{}, innerWidth:1600, innerHeight:900 };

const ctx = { document, window, console, setTimeout:()=>0, requestAnimationFrame:fn=>fn(),
  IntersectionObserver: class { observe(){} unobserve(){} disconnect(){} }, Math, JSON, Set, Map,
  Array, Object, String, Number, RegExp };
vm.createContext(ctx);
for(const f of ['images.js','data.js','city-data.js','city-expansion.js','city-hangzhou-guangzhou.js','account.js','app.js']){
  vm.runInContext(fs.readFileSync(f,'utf8'), ctx, { filename:f });
}
const g = n => vm.runInContext(n, ctx);

/* 注意：vm 里的 const 不会成为 context 的属性，只能通过 runInContext 求值取出 */
const SPOTS = g('SPOTS'), POI = g('POI'), DINING = g('DINING'),
      STAY_DEFAULT = g('STAY_DEFAULT'), STAY_MEMORY = g('STAY_MEMORY'),
      MEMORIES = g('MEMORIES'), DIFFS = g('DIFFS'),
      PLANS_DEFAULT = g('PLANS_DEFAULT'), PLANS_MEMORY = g('PLANS_MEMORY'),
      ITIN_DEFAULT = g('ITIN_DEFAULT'), ITIN_MEMORY = g('ITIN_MEMORY'),
      REASONS = g('REASONS'), REASON_TO_MEMORY = g('REASON_TO_MEMORY'),
      SPOT_IMG = g('SPOT_IMG'), REST_POI = g('REST_POI');
const CITY_DATA = g('CITY_DATA');

const bad = [];
const allMem = new Set(MEMORIES.map(m => m.id));

/* ---------- 行程条目 ---------- */
[['ITIN_DEFAULT',ITIN_DEFAULT],['ITIN_MEMORY',ITIN_MEMORY]].forEach(([tag,it]) => {
  if(it.days.length !== 4) bad.push(tag + ' days != 4');
  (it.stay.memoryIds||[]).forEach(id => { if(!allMem.has(id)) bad.push(tag+' stay mem '+id); });
  if(!it.stay.picks || !it.stay.picks.length) bad.push(tag + ' stay has no picks');
  (it.stay.picks||[]).forEach((k,i) => {
    if(!k.room)  bad.push(tag+' stay pick#'+i+' 缺 room');
    if(!k.price) bad.push(tag+' stay pick#'+i+' 缺 price');
    if(!k.score || !k.count || !k.src) bad.push(tag+' stay pick#'+i+' 缺评分/来源');
  });
  it.days.forEach(d => {
    (d.memoryIds||[]).forEach(id => { if(!allMem.has(id)) bad.push(tag+' D'+d.day+' mem '+id); });
    d.items.forEach(i => {
      (i.memoryIds||[]).forEach(id => { if(!allMem.has(id)) bad.push(tag+' '+i.id+' mem '+id); });
      if(i.kind === 'food'){
        const grp = DINING[i.name];
        if(!grp){ bad.push(tag+' 缺 DINING '+i.name); return; }
        if(!grp.area || !grp.theme) bad.push(tag+' DINING '+i.name+' 缺 area/theme');
        if(!grp.picks || grp.picks.length < 2) bad.push(tag+' DINING '+i.name+' 候选不足');
        (grp.picks||[]).forEach((k,ki) => {
          if(!k.cuisine) bad.push(tag+' '+i.name+' pick#'+ki+' 缺 cuisine');
          if(!k.price)   bad.push(tag+' '+i.name+' pick#'+ki+' 缺 price');
          if(!k.score || !k.count || !k.src) bad.push(tag+' '+i.name+' pick#'+ki+' 缺评分/来源');
          if(/店|亭|屋号/.test(k.style) && /^[「『]/.test(k.style)) bad.push(tag+' 候选疑似具体店名 '+k.style);
        });
        const nm = REST_POI[i.name];
        if(!nm) bad.push(tag+' 缺 REST_POI '+i.name);
        else if(!POI[nm]) bad.push(tag+' REST_POI 指向无坐标点 '+nm);
      } else if(i.kind === 'spot'){
        if(!POI[i.name])   bad.push(tag+' 缺 POI '+i.name);
        const sp = SPOTS[i.name];
        if(!sp) bad.push(tag+' 缺 SPOTS '+i.name);
        else {
          if(!sp.intro) bad.push(tag+' SPOTS '+i.name+' 缺一句话介绍');
          if(!sp.score || !sp.count || !sp.src) bad.push(tag+' SPOTS '+i.name+' 缺分数/来源');
          if(!sp.tags || sp.tags.length < 3) bad.push(tag+' SPOTS '+i.name+' 标签少于 3 个');
          if(!sp.cat) bad.push(tag+' SPOTS '+i.name+' 缺 cat（缩略图类别）');
        }
      }
    });
  });
});

/* ---------- 方案 ---------- */
[['PLANS_DEFAULT',PLANS_DEFAULT],['PLANS_MEMORY',PLANS_MEMORY]].forEach(([tag,ps]) => {
  if(ps.length !== 3) bad.push(tag + ' 不是 3 套');
  ps.forEach(p => {
    if(p.walk.length !== 4) bad.push(tag+' '+p.id+' walk != 4');
    if(!p.routeDays || p.routeDays.length !== 4) bad.push(tag+' '+p.id+' routeDays != 4');
    (p.routeDays||[]).forEach((names,di) => {
      if(!names.length) bad.push(tag+' '+p.id+' D'+(di+1)+' 概览图无点位');
      names.forEach(n => { if(!POI[n]) bad.push(tag+' '+p.id+' 概览点无坐标 '+n); });
    });
    (p.memoryIds||[]).forEach(id => { if(!allMem.has(id)) bad.push(tag+' '+p.id+' mem '+id); });
    p.highlights.forEach(h => {
      if(!POI[h])   bad.push(tag+' '+p.id+' highlight 无坐标 '+h);
      if(!SPOTS[h]) bad.push(tag+' '+p.id+' highlight 无 SPOTS（分数/缩略图会缺）'+h);
    });
    if(p.highlights.length < 4) bad.push(tag+' '+p.id+' highlights 少于 4，缩略图条排不满');
    if(!/一带/.test(p.stay.area)) bad.push(tag+' '+p.id+' 住宿未用「一带」口径：'+p.stay.area);
  });
});
if(!PLANS_DEFAULT.some(p => p.id === ITIN_DEFAULT.planId)) bad.push('ITIN_DEFAULT.planId 无对应方案');
if(!PLANS_MEMORY.some(p => p.id === ITIN_MEMORY.planId)) bad.push('ITIN_MEMORY.planId 无对应方案');

/* ---------- diff ---------- */
DIFFS.forEach(x => {
  x.memoryIds.forEach(id => { if(!allMem.has(id)) bad.push('DIFF '+x.id+' mem '+id); });
  const t = x.target;
  const known = SPOTS[t] || DINING[t] || ['stay','pace','free'].includes(t);
  if(!known) bad.push('DIFF '+x.id+' target 无法解析：'+t);
});

/* ---------- 反馈原因 → 记忆规则 ---------- */
Object.entries(REASONS).forEach(([dir,byKind]) => Object.entries(byKind).forEach(([k,arr]) =>
  arr.forEach(r => { if(!REASON_TO_MEMORY[r]) bad.push('原因无生成规则 '+dir+'/'+k+'/'+r); })));

/* ---------- 商业化口径：不应出现门牌地址 ---------- */
const blob = JSON.stringify({ DINING, STAY_DEFAULT, STAY_MEMORY });
[/\d+\s*丁目/, /\d+\s*番地/, /[东西南北]入/, /\d{3}-\d{4}/].forEach(re => {
  if(re.test(blob)) bad.push('餐饮/住宿数据里出现疑似详细地址：' + re);
});

/* ---------- 桩 DOM 实跑 ---------- */
console.log('--- 渲染 16 种组合 ---');
let fails = 0;
/* 直接调用同步渲染核心，避免页面切换动画的计时器干扰桩 DOM 断言。 */
const render = g('_doRender'), S = g('S'), usedMemoryIds = g('usedMemoryIds');
for(const p of ['blank','veteran']){
  for(const on of [true,false]){
    for(const sc of ['s0','s1','s2','s5']){
      S.session = p === 'veteran' ? {mode:'user',id:'demo'} : {mode:'guest',id:null}; S.memoryOn = on; S.screen = sc; S.diffPlayed = true;
      try{
        render();
        const h = nodes.work.innerHTML;
        if(!h.length) throw new Error('输出为空');
        if(h.includes('undefined')) throw new Error('输出里漏出 undefined');
        if(h.includes('[object Object]')) throw new Error('输出里漏出 [object Object]');
        console.log(`  ok ${p}/${on?'on ':'off'}/${sc}  ${String(h.length).padStart(6)}B  ` +
          `🧠${String((h.match(/mem-tag/g)||[]).length).padStart(3)}  ` +
          `图${String((h.match(/class="sthumb/g)||[]).length).padStart(3)}  ` +
          `地图${(h.match(/class="sim-map/g)||[]).length}  ` +
          `候选组${(h.match(/class="rec-group/g)||[]).length}`);
      }catch(err){ fails++; console.log(`  FAIL ${p}/${on}/${sc}: ${err.message}`); }
    }
  }
}

/* ---------- 关键断言 ---------- */
console.log('--- 关键断言 ---');
function assert(cond, msg){ console.log((cond?'  ok   ':'  FAIL ') + msg); if(!cond) fails++; }

S.session={mode:'guest',id:null}; S.memoryOn=true; S.screen='s1'; render();
assert((nodes.work.innerHTML.match(/mem-tag/g)||[]).length === 0, '空记忆 S1 无 🧠 标签');
assert((nodes.work.innerHTML.match(/class="sim-map/g)||[]).length === 3, 'S1 三张方案概览图');
assert((nodes.work.innerHTML.match(/class="plan-shots"/g)||[]).length === 3, 'S1 三条缩略图带');

S.session={mode:'user',id:'demo'}; S.memoryOn=true; S.screen='s2'; render();
const h2 = nodes.work.innerHTML;
assert((h2.match(/class="sim-map/g)||[]).length === 2, 'S2 两张模拟地图（概览 + 当日）');
assert((h2.match(/class="rec-group/g)||[]).length >= 3, 'S2 餐饮/住宿都是候选组形式');
assert(/人均/.test(h2), 'S2 餐饮候选有人均');
assert(/rg-note/.test(h2), 'S2 标注了「只给区域」口径');
assert(/sp-intro/.test(h2), 'S2 景点有一句话介绍');
assert(/sp-score/.test(h2), 'S2 景点有分数');

S.memoryOn=true; S.screen='s5'; render();
const nonGlobal = DIFFS.filter(x => x.day !== 0).length;
console.log(`  S5 网格高亮 ${(nodes.work.innerHTML.match(/data-diff="1"/g)||[]).length} 处 · ` +
  `清单 ${DIFFS.length} 处（全局 ${DIFFS.length-nonGlobal} 处只在清单）`);

const imgCount = Object.values(SPOT_IMG||{}).filter(Boolean).length;
console.log(`--- 配图 ${imgCount} / ${Object.keys(SPOTS).length} 个景点（缺图回退占位插画）---`);

/* ---------- 新增城市：全数据引用 + 各屏渲染 ---------- */
console.log('--- 扩展城市数据 ---');
Object.entries(CITY_DATA).forEach(([name,c]) => {
  const ids = new Set(MEMORIES.map(m=>m.id));
  const cityBad = [];
  [['默认',c.itinDefault],['记忆',c.itinMemory]].forEach(([mode,it]) => {
    if(it.days.length !== 4) cityBad.push(mode+'行程天数与城市配置不符');
    it.days.forEach(d => d.items.forEach(i => {
      if(i.kind === 'spot' && (!c.poi[i.name] || !c.spots[i.name])) cityBad.push('景点引用缺失 '+i.name);
      if(i.kind === 'food' && (!c.dining[i.name] || !c.restPoi[i.name] || !c.poi[c.restPoi[i.name]])) cityBad.push('餐饮引用缺失 '+i.name);
      (i.memoryIds||[]).forEach(id => { if(!ids.has(id)) cityBad.push('记忆引用缺失 '+id); });
    }));
  });
  [...c.plansDefault,...c.plansMemory].forEach(p => {
    if(p.routeDays.length !== 4 || p.highlights.length < (c.durationRange?1:4)) cityBad.push('方案结构不完整 '+p.id);
    p.routeDays.flat().forEach(n => { if(!c.poi[n]) cityBad.push('方案点位缺失 '+n); });
    p.highlights.forEach(n => { if(!c.spots[n]) cityBad.push('方案景点资料缺失 '+n); });
  });
  Object.entries(c.dining).forEach(([id,d]) => {
    if(d.picks.length < 2) cityBad.push('餐饮候选不足 '+id);
    if(!/一带/.test(d.area)) cityBad.push('餐饮区域口径错误 '+id);
  });
  if(['北京','上海','杭州','威海','广州'].includes(name)) Object.keys(c.spots).forEach(n => {
    // 图可能来自城市自带的 assets/，也可能来自公共图库 SPOT_IMG（img/）
    if(!(c.images && c.images[n]) && !SPOT_IMG[n]) cityBad.push(name+'景点缺少图片 '+n);
  });
  for(const persona of ['blank','veteran']) for(const on of [false,true]) for(const screen of ['s0','s1','s2','s5']){
    S.req.dest=name; S.session=persona === 'veteran' ? {mode:'user',id:'demo'} : {mode:'guest',id:null}; S.req.days=4; S.memoryOn=on; S.screen=screen; S.diffPlayed=true;
    try{
      render(); const html=nodes.work.innerHTML;
      if(!html || html.includes('undefined') || html.includes('[object Object]')) throw new Error('输出内容异常');
      if(screen==='s1' && !html.includes(name)) throw new Error('方案页未显示城市名');
    }catch(e){ cityBad.push(`${persona}/${on}/${screen}: ${e.message}`); }
  }
  assert(!cityBad.length, `${name} 数据与 16 种页面状态完整${cityBad.length?'：'+cityBad.join('；'):''}`);
});

require('./_verify-cities.js')({S,g,render,nodes,CITY_DATA,assert,fs});

console.log(bad.length ? '\n数据问题:\n - ' + bad.join('\n - ') : '\n数据交叉引用：全部通过');
process.exit(fails || bad.length ? 1 : 0);
