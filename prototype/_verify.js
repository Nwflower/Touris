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
for(const f of ['semantics.js','images.js','data.js','city-data.js','city-expansion.js','city-hangzhou-guangzhou.js','city-chengdu.js','account.js','app.js']){
  vm.runInContext(fs.readFileSync(f,'utf8'), ctx, { filename:f });
}
const g = n => vm.runInContext(n, ctx);

/* 注意：vm 里的 const 不会成为 context 的属性，只能通过 runInContext 求值取出 */
/* ★ 京都那批全局常量（SPOTS POI PLANS ITIN STAY DIFFS REST_POI）已随京都数据一起删除。
   下面用「取不到就给空值」的方式兜住，好让本文件里那些京都时代的检查变成空转而不报错。
   待办：把本文件里针对京都的那几段检查与渲染断言整段删掉，别让它们空占位置。 */
const OPT = (n, d) => { try { const v = g('typeof ' + n + "!=='undefined' ? " + n + " : null"); return v === null ? d : v; } catch(e){ return d; } };
const SPOTS = OPT('SPOTS', {}), POI = OPT('POI', {}), DINING = OPT('DINING', {}),
      STAY_DEFAULT = OPT('STAY_DEFAULT', {}), STAY_MEMORY = OPT('STAY_MEMORY', {}),
      DIFFS = OPT('DIFFS', []),
      PLANS_DEFAULT = OPT('PLANS_DEFAULT', []), PLANS_MEMORY = OPT('PLANS_MEMORY', []),
      ITIN_DEFAULT = OPT('ITIN_DEFAULT', {days:[],stay:{picks:[]}}),
      ITIN_MEMORY = OPT('ITIN_MEMORY', {days:[],stay:{picks:[]}});
const SPOT_IMG = OPT('SPOT_IMG', {});
const MEMORIES = g('MEMORIES'), REASONS = g('REASONS'), REASON_TO_MEMORY = g('REASON_TO_MEMORY');
const CITY_DATA = g('CITY_DATA');
/* 语义层：标签词表与景点映射表（semantics.js） */
const SEMANTICS = g('SEMANTICS'), ALL_TAGS = g('ALL_TAGS'),
      SPOT_PREFER_MAP = g('SPOT_PREFER_MAP'), SPOT_AVOID_MAP = g('SPOT_AVOID_MAP');

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

/* ---------- 语义标签 ----------
   标签是「记忆 → 推荐」的唯一判断依据（见 semantics.js）。贴错了或者忘了贴，
   在界面上完全看不出来：记忆照样显示、计数照样 +1，就是不产生任何约束。
   所以这里把三件事钉死。 */

/* 有意留空的记忆：它表达的东西落不进当前词表，硬贴一个标签等于伪造出处。
   写在这里是为了让它「被看见」，而不是悄悄混在数据里。 */
const INERT_MEMORIES = {
  m14: '关于「正式晚饭」的预算意愿——推不进行程过滤（餐饮不参与推导）',
  m19: '「以步行为主」是交通偏好，词表里的 walk-heavy 意思正好相反，贴上会反向生效'
};
MEMORIES.forEach(m => {
  const has = (m.avoid||[]).length || (m.prefer||[]).length || m.pace;
  if(!has && !INERT_MEMORIES[m.id]) bad.push('记忆 '+m.id+'「'+m.text+'」没有任何语义标签，且不在有意留空清单里');
});
MEMORIES.forEach(m => {
  ['avoid','prefer'].forEach(kind => (m[kind]||[]).forEach(t => {
    if(!ALL_TAGS.has(t)) bad.push('记忆 '+m.id+' 的 '+kind+' 标签 "'+t+'" 不在 SEMANTICS 里');
  }));
  if(m.pace && !SEMANTICS.pace.includes(m.pace)) bad.push('记忆 '+m.id+' 的 pace "'+m.pace+'" 不合法');
});

/* 表态规则同样要带标签，否则「表态 → 学到记忆 → 推荐改变」断在最后一步 */
Object.entries(REASON_TO_MEMORY).forEach(([r, rule]) => {
  ['avoid','prefer'].forEach(kind => (rule[kind] ? [].concat(rule[kind]) : []).forEach(t => {
    if(!ALL_TAGS.has(t)) bad.push('规则「'+r+'」的 '+kind+' 标签 "'+t+'" 不在 SEMANTICS 里');
  }));
  if(rule.pace && !SEMANTICS.pace.includes(rule.pace)) bad.push('规则「'+r+'」的 pace "'+rule.pace+'" 不合法');
});

/* 映射表只许指向登记过的标签，否则 semOf 会给出 derive 认不出的值 */
[[SPOT_PREFER_MAP,'SPOT_PREFER_MAP'],[SPOT_AVOID_MAP,'SPOT_AVOID_MAP']].forEach(([map,name]) => {
  Object.entries(map).forEach(([cn, sem]) => {
    if(!ALL_TAGS.has(sem)) bad.push(name+' 把「'+cn+'」映到了未登记的标签 "'+sem+'"');
  });
});

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

/* ---------- 只报告，不算失败 ----------
   「记住了但推不出约束」的东西。它们说的是餐饮、住宿或「这类景点」，
   而当前 derive 只过滤景点。硬贴一个标签等于伪造出处（界面会说「因为你
   记录了『太贵』所以避开某某」），所以留着，但必须看得见——
   要不它会混在 34 条规则里，谁也发现不了。 */
const inertRules = Object.entries(REASON_TO_MEMORY)
  .filter(([, r]) => !r.pace && !(r.avoid||[]).length && !(r.prefer||[]).length)
  .map(([k]) => k);
if(inertRules.length){
  console.log(`\n提示：${inertRules.length}/${Object.keys(REASON_TO_MEMORY).length} 条表态原因推不出约束` +
    `（点了会记住、会显示，但不改变推荐）：\n  ${inertRules.join('、')}`);
}
const inertMemIds = Object.keys(INERT_MEMORIES);
if(inertMemIds.length){
  console.log(`提示：${inertMemIds.length}/${MEMORIES.length} 条预置记忆有意留空语义标签：` +
    inertMemIds.map(id => id + '（' + INERT_MEMORIES[id] + '）').join('；'));
}

/* 覆盖度：20 条预置记忆里，有多少条真的改变了某个城市的推荐。
   数字低不一定是 bug——可能是这座城市的景点没打上对应的中文标签（映射表
   翻不出来），也可能是那些记忆本身落不进词表。但它是「记忆是不是真的在
   起作用」唯一看得见的信号，所以每次跑都打出来。 */
const covRows = [];
Object.entries(CITY_DATA).forEach(([name, c]) => {
  if(typeof c.resolve !== 'function'){
    covRows.push(`${name} 手工写对照`);     // 北京/上海/威海：还没有推导引擎，对照是手写的
    return;
  }
  try{
    const r = c.resolve({ date:'2026-10-02', days:4 }, null, MEMORIES);
    const hit = new Set();
    (r.diffs || []).forEach(d => (d.memoryIds || []).forEach(id => hit.add(id)));
    covRows.push(`${name} ${hit.size}/${MEMORIES.length}`);
  }catch(e){ covRows.push(`${name} 推导抛错(${e.message})`); }
});
console.log(`\n记忆覆盖度（能实际改变推荐条数 / 预置记忆总数）：\n  ${covRows.join('  ')}`);

console.log(bad.length ? '\n数据问题:\n - ' + bad.join('\n - ') : '\n数据交叉引用：全部通过');
process.exit(fails || bad.length ? 1 : 0);
