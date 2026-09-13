/* 回归校验（v2）：数据交叉引用 + 规划器 + RAG + 身份 + 桩 DOM 实跑 render()。
   在 prototype 目录运行 node _verify.js。 */
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
    scrollIntoView(){}, closest(){return null}, focus(){}
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

const CITY_DATA = g('CITY_DATA');
const MEMORIES = g('MEMORIES'), MEMORIES_IRON = g('MEMORIES_IRON'), MEMORIES_EVE = g('MEMORIES_EVE');
const REASONS = g('REASONS'), REASON_TO_MEMORY = g('REASON_TO_MEMORY');
const SEMANTICS = g('SEMANTICS'), ALL_TAGS = g('ALL_TAGS'),
      SPOT_PREFER_MAP = g('SPOT_PREFER_MAP'), SPOT_AVOID_MAP = g('SPOT_AVOID_MAP');
const SPOT_IMG = g('SPOT_IMG');
const TOURIS_GUIDES = g('TOURIS_GUIDES');
const TourisPlanner = g('TourisPlanner'), TourisRAG = g('TourisRAG'), TourisLLM = g('TourisLLM');
const PRESET_IDENTITIES = g('PRESET_IDENTITIES');

const bad = [];
const allProfiles = [MEMORIES, MEMORIES_IRON, MEMORIES_EVE];

let fails = 0;
function assert(cond, msg){ console.log((cond?'  ok   ':'  FAIL ') + msg); if(!cond) fails++; }

/* ==================== 1. 候选池完整性 ==================== */
console.log('--- 候选池（每城 50+）---');
Object.entries(CITY_DATA).forEach(([name, c]) => {
  const ids = new Set(allProfiles.flatMap(ms => ms.map(m => m.id)));
  const cityBad = [];
  const pool = Object.keys(c.spots).filter(n => c.spots[n].cat !== 'station');
  if(pool.length < 50) cityBad.push(`可排线候选 ${pool.length} < 50`);
  Object.entries(c.spots).forEach(([n, s]) => {
    if(!s.cat) cityBad.push('缺 cat '+n);
    if(!s.intro) cityBad.push('缺 intro '+n);
    if((!s.tags || s.tags.length < 2) && s.cat !== 'station') cityBad.push('标签少于 2 个 '+n);
    if(!c.geo[n]) cityBad.push('缺坐标 '+n);
    if(!c.poi[n]) cityBad.push('缺画布坐标 '+n);
    if(s.cat === 'station') return;
    if(!s.visitMin) cityBad.push('缺 visitMin '+n);
    (s.tags||[]).forEach(t => {
      const known = SPOT_PREFER_MAP[t] || SPOT_AVOID_MAP[t];
      if(known && !ALL_TAGS.has(known)) cityBad.push(`标签「${t}」映射到未登记词表 ${known}`);
    });
  });
  (c.memoryIds||[]).forEach(id => { if(!ids.has(id)) cityBad.push('记忆引用缺失 '+id); });
  assert(!cityBad.length, `${name} 候选池 ${pool.length} 个 · 字段完整${cityBad.length?'：'+[...new Set(cityBad)].slice(0,6).join('；')+'…':''}`);
});

/* ==================== 2. 规划器：结构 + 回退 + 记忆 diff ==================== */
console.log('--- 规划器（6 城 × 2/4/7 天 × 三档强度 × 三档案）---');
let planChecks = 0;
Object.entries(CITY_DATA).forEach(([name, c]) => {
  for(const days of [2, 4, 7]) for(const intensity of ['fast','mid','slow']) for(const profile of [[], MEMORIES, MEMORIES_IRON, MEMORIES_EVE]) for(const interest of ['mixed','culture','nature']) {
    let r;
    try {
      r = TourisPlanner.compare(c, { days, date:'2026-10-02', interest, intensity, memories: profile });
    } catch(e){ bad.push(`${name} ${days}d/${intensity}/${profile.length}条 排线抛错：${e.message}`); continue; }
    const res = profile.length ? r.mem : r.def;
    res.plans.forEach(p => {
      if(p.routeDays.length !== days) bad.push(`${name} ${days}d ${p.id} routeDays != days`);
      const flat = p.routeDays.flat();
      const dup = flat.filter((n,i) => flat.indexOf(n) !== i);
      if(dup.length) bad.push(`${name} ${days}d ${p.id} 重复点位 ${dup}`);
      p.routeDays.forEach((day, di) => {
        day.forEach(n => { if(!c.spots[n] || !c.geo[n]) bad.push(`${name} ${days}d ${p.id} 非法点 ${n}`); });
        if(!day.length) bad.push(`${name} ${days}d ${p.id} D${di+1} 空白天`);
      });
      p.itinerary.days.forEach(d => {
        let last = -1;
        d.items.forEach(it => {
          const [h, m] = it.time.split(':').map(Number);
          const cur = h*60+m;
          if(cur < last) bad.push(`${name} ${days}d ${p.id} D${d.day} 时间倒流 ${it.time}`);
          last = cur;
          if(it.kind === 'food'){
            if(!c.dining[it.name]) bad.push(`未知餐饮组 ${it.name}`);
            else if(!c.restPoi[it.name]) bad.push(`餐饮组缺锚点 ${it.name}`);
          }
        });
      });
    });
    if(profile.length){
      r.diffs.forEach(x => {
        if(!(x.memoryIds||[]).length) bad.push(`${name} ${days}d diff 缺溯源 ${x.id}`);
        x.memoryIds.forEach(id => { if(!profile.find(m => m.id === id)) bad.push(`${name} diff 引用未知记忆 ${id}`); });
      });
    }
    planChecks++;
  }
});
assert(!bad.length, `规划器 ${planChecks} 种组合全部合法${bad.length ? '：' + [...new Set(bad)].slice(0,8).join('；') : ''}`);

/* 记忆必须真实改变推荐：三档案分别对 6 城跑，diff 总数应 > 0 */
const covRows = [];
Object.entries(CITY_DATA).forEach(([name, c]) => {
  [[MEMORIES,'林小满'],[MEMORIES_IRON,'陈铁腿'],[MEMORIES_EVE,'周晚晚']].forEach(([profile, label]) => {
    const r = TourisPlanner.compare(c, { days:4, date:'2026-10-02', interest:'mixed', intensity:'mid', memories:profile });
    const hit = new Set(r.diffs.flatMap(x => x.memoryIds));
    covRows.push(`${name}·${label} ${hit.size}条记忆起效/${profile.length}处diff`);
  });
});
console.log('  ' + covRows.join('\n  '));

/* ==================== 3. RAG：硬约束 + 语料引用 ==================== */
console.log('--- RAG 攻略检索 ---');
{
  const corpusBad = [];
  TOURIS_GUIDES.GUIDES.forEach(gt => {
    const c = CITY_DATA[gt.city];
    if(!c) corpusBad.push(gt.title + ': 城市不存在');
    (gt.highlights||[]).forEach(h => { if(c && !c.spots[h]) corpusBad.push(gt.title + ': 未知景点 ' + h); });
    if(!Array.isArray(gt.months) || !gt.months.length) corpusBad.push(gt.title + ': 缺 months');
    if(!Array.isArray(gt.days) || gt.days.length !== 2) corpusBad.push(gt.title + ': 缺 days 区间');
  });
  for(const city of Object.keys(CITY_DATA)){
    const n = TOURIS_GUIDES.GUIDES.filter(x => x.city === city).length;
    if(n < 5) corpusBad.push(city + ` 攻略 ${n} < 5`);
  }
  assert(!corpusBad.length, `语料 ${TOURIS_GUIDES.GUIDES.length} 篇 · 景点引用全部有效${corpusBad.length?'：'+corpusBad.slice(0,5).join('；'):''}`);

  // 硬约束：1 月的威海必须检回天鹅线
  const winter = TourisRAG.retrieve({ city:'威海', date:'2027-01-10', days:3, interest:'nature', intensity:'mid' });
  assert(winter.matches.some(m => m.guide.title.includes('天鹅')), '硬约束命中：冬季威海检回天鹅攻略');
  assert(winter.month === 1 && winter.season.label.includes('冬'), '出发时间 → 季节换算正确');
  // 放宽机制
  const relax = TourisRAG.retrieve({ city:'成都', date:'2026-07-20', days:6, interest:'culture', intensity:'fast' });
  assert(relax.matches.length === 3 && relax.relaxed.length > 0, '约束过严时放宽补齐并如实标注');
  // 合成攻略的天数跟随需求
  assert(relax.composed.daily.length === 6, '合成攻略天数 = 需求天数');
}

/* ==================== 4. 身份体系 ==================== */
console.log('--- 预置身份 ---');
{
  assert(PRESET_IDENTITIES.length === 3, '3 个预置档案');
  PRESET_IDENTITIES.forEach(p => {
    const acc = vm.runInContext(`getAccount('${p.id}')`, ctx);
    assert(acc && acc.memories && acc.memories.length >= 10, `档案「${p.name}」已播种 ${acc && acc.memories ? acc.memories.length : 0} 条记忆`);
  });
  const INERT_MEMORIES = { m14:1, m19:1, f08:1, f09:1, f10:1, f12:1 };   // 有意无标签清单
  PRESET_IDENTITIES.forEach(p => {
    const acc = vm.runInContext(`getAccount('${p.id}')`, ctx);
    acc.memories.forEach(m => {
      const has = (m.avoid||[]).length || (m.prefer||[]).length || m.pace;
      if(!has && !INERT_MEMORIES[m.id]) bad.push(`记忆 ${m.id}「${m.text}」无语义标签且不在有意留空清单`);
    });
  });
  // 每条记忆的标签必须在词表内
  allProfiles.flat().forEach(m => {
    ['avoid','prefer'].forEach(kind => (m[kind]||[]).forEach(t => {
      if(!ALL_TAGS.has(t)) bad.push(`记忆 ${m.id} 的 ${kind} 标签 "${t}" 不在 SEMANTICS 里`);
    }));
    if(m.pace && !SEMANTICS.pace.includes(m.pace)) bad.push(`记忆 ${m.id} 的 pace "${m.pace}" 不合法`);
  });
  Object.entries(REASONS).forEach(([dir, byKind]) => Object.entries(byKind).forEach(([k, arr]) =>
    arr.forEach(r => { if(!REASON_TO_MEMORY[r]) bad.push('原因无生成规则 '+dir+'/'+k+'/'+r); })));
  Object.entries(REASON_TO_MEMORY).forEach(([r, rule]) => {
    ['avoid','prefer'].forEach(kind => (rule[kind] ? [].concat(rule[kind]) : []).forEach(t => {
      if(!ALL_TAGS.has(t)) bad.push(`规则「${r}」的 ${kind} 标签 "${t}" 不在 SEMANTICS 里`);
    }));
    if(rule.pace && !SEMANTICS.pace.includes(rule.pace)) bad.push(`规则「${r}」的 pace 不合法`);
  });
  assert(true, '记忆 / 表态规则的语义标签全部合法');
}

/* ==================== 5. LLM 客户端降级 ====================
   fetch 桩永远 reject → available() 置 false → 两个接口都应降级并给原因。
   异步断言放进 async 主体，最后统一汇报退出。 */
console.log('--- LLM 降级路径 ---');

/* ==================== 6. 桩 DOM 实跑 16 种组合 ==================== */
console.log('--- 渲染组合 ---');
const render = g('_doRender'), S = g('S');
function runCombo(persona, on, sc){
  S.req = { dest:'成都', date:'2026-10-02', days:4, people:2, interest:'mixed', intensity:'mid' };
  S.session = persona === 'veteran' ? {mode:'user',id:'demo'} : {mode:'guest',id:null};
  S.memoryOn = on; S.screen = sc; S.diffPlayed = true; S.rag = null; S.gen = null; S.chosenPlan = null;
  g('invalidateRun')();
  try{
    render();
    const h = nodes.work.innerHTML;
    if(!h.length) throw new Error('输出为空');
    if(h.includes('undefined')) throw new Error('输出里漏出 undefined');
    if(h.includes('[object Object]')) throw new Error('输出里漏出 [object Object]');
    console.log(`  ok ${persona}/${on?'on ':'off'}/${sc.padEnd(4)}  ${String(h.length).padStart(6)}B  ` +
      `🧠${String((h.match(/mem-tag/g)||[]).length).padStart(3)}  ` +
      `图${String((h.match(/class="sthumb/g)||[]).length).padStart(3)}`);
  }catch(err){ fails++; console.log(`  FAIL ${persona}/${on}/${sc}: ${err.message}`); }
}
for(const p of ['blank','veteran']) for(const on of [true,false]) for(const sc of ['s0','guide','s1','s2','s5','generating','home']) runCombo(p, on, sc);

/* ==================== 7. 全城市渲染 ==================== */
console.log('--- 全城市渲染 ---');
Object.keys(CITY_DATA).forEach(name => {
  for(const sc of ['s0','s1','s2','s5']){
    S.req = { dest:name, date:'2026-10-02', days:4, people:2, interest:'mixed', intensity:'mid' };
    S.session = {mode:'user',id:'demo'}; S.memoryOn = true; S.screen = sc; S.diffPlayed = true; S.rag = null; S.gen = null; S.chosenPlan = null;
    g('invalidateRun')();
    try{
      render();
      const html = nodes.work.innerHTML;
      if(!html || html.includes('undefined') || html.includes('[object Object]')) throw new Error('输出内容异常');
      if(sc==='s1' && !html.includes(name)) throw new Error('方案页未显示城市名');
    }catch(e){ bad.push(`${name}/${sc}: ${e.message}`); }
  }
});
assert(!bad.length, '6 城 × 4 屏（有记忆）渲染完整');

/* ==================== 8. 关键断言 ==================== */
console.log('--- 关键断言 ---');
S.req = { dest:'成都', date:'2026-10-02', days:4, people:2, interest:'mixed', intensity:'mid' };
S.session = {mode:'guest',id:null}; S.memoryOn = true; S.screen = 's1'; S.rag = null; S.gen = null; S.chosenPlan = null;
g('invalidateRun')(); render();
assert((nodes.work.innerHTML.match(/mem-tag/g)||[]).length === 0, '空记忆 S1 无 🧠 标签');
assert((nodes.work.innerHTML.match(/class="plan /g)||[]).length === 3, 'S1 三套方案卡');
assert(/算法排线|均衡探索型/.test(nodes.work.innerHTML), 'S1 展示算法排线方案');

S.session = {mode:'user',id:'demo'}; S.memoryOn = true; S.screen = 's2'; g('invalidateRun')(); render();
const h2 = nodes.work.innerHTML;
assert((h2.match(/class="rec-group/g)||[]).length >= 2, 'S2 餐饮/住宿是候选组形式');
assert(/距上一站|从住处出发/.test(h2), 'S2 时间轴带通勤信息（km + 分钟）');
assert(/:\d{2}/.test(h2), 'S2 时间轴为具体时刻');

S.screen = 's5'; S.memoryOn = true; S.diffPlayed = true; g('invalidateRun')(); render();
assert(/记忆改变了本次/.test(nodes.work.innerHTML), 'S5 记忆对照摘要存在');

S.screen = 'guide'; g('invalidateRun')(); render();
assert(/相似攻略/.test(nodes.work.innerHTML) && /匹配/.test(nodes.work.innerHTML), 'G 屏：相似攻略 + 匹配理由');

/* 有意无标签的记忆清单（只报告） */
const INERT = {
  m14:'预算意愿推不进行程过滤', m19:'「以步行为主」与 walk-heavy 反向',
  f08:'餐饮口味与节奏不参与推导', f09:'「太闲」落不进词表', f10:'「可以接受」是非约束', f12:'住宿词表暂无「交通枢纽」维度'
};
console.log('\n提示：有意无标签的记忆 ' + Object.keys(INERT).join('、'));

/* 异步收尾：LLM 降级断言 + 汇总退出 */
(async () => {
  try {
    const r = await TourisLLM.candidates({ city:'成都', days:4, interest:'mixed', intensity:'mid', names:['宽窄巷子','锦里'], memories:[] });
    assert(!r.ok && !!r.degraded, 'candidates 无后端 → 降级并说明（' + (r.degraded||'') + '）');
    const g2 = await TourisLLM.guide({ city:'成都', days:3, month:10, guides:[{title:'x'}] });
    assert(!g2.ok && !!g2.degraded, 'guide 无后端 → 降级并说明');
  } catch(e) {
    fails++; console.log('  FAIL LLM 降级检查抛错: ' + e.message);
  }
  console.log(bad.length ? '\n数据/结构问题:\n - ' + [...new Set(bad)].join('\n - ') : '\n数据交叉引用：全部通过');
  process.exit(fails || bad.length ? 1 : 0);
})();
