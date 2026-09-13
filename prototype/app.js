/* ==========================================================================
   Touris 知途 · 原型交互层
   单页状态机：S0 需求 → S1 三方案(含概览图) → S2 详情(元素级反馈) → S5 对照 diff
   ========================================================================== */



/* ---------------- 状态 ---------------- */
const S = {
  screen: 'home',
  hist: [],               // 屏幕历史栈（顶栏返回键 / 浏览器前进后退共用）
  session: { mode:'guest', id:null },   // 会话：游客（0 记忆）/ 预置身份档案
  memoryOn: true,
  req: { dest:'成都', date:'2026-10-02', days:4, people:2, interest:'mixed', intensity:'mid' },
  submitted: false,
  learned: [],            // 本次 Demo 现场积累的记忆
  planStance: {},         // planId -> 'chosen'|'skipped'|'disliked'
  chosenPlan: null,
  stance: {},             // 元素 key -> {v:'up'|'down', reason, note}
  openReason: null,
  openFree: {},
  s2day: 1,
  hoverItem: null,
  diffPlayed: false,
  memHit: [],
  demoStep: 1,
  gen: null,              // 生成流水线状态 { step:1|2|3, llmNote, candidates }
  rag: null               // RAG 检索结果（进 S1/S2 前算好）
};

/* ---------------- 工具 ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* 当前身份的记忆档案。
   游客 = 0 记忆模式，不读任何持久化数据（S.learned 仍在内存里积累，
   只是刷新即散，这正是游客模式该有的行为）。
   预置身份 = 该档案持久化的记忆（播种自 data.js 的三份 profile）。 */
function currentArchive(){
  if(S.session.mode !== 'user') return [];
  const acc = getAccount(S.session.id);
  return (acc && acc.memories) || [];
}
function allMemories(){
  return currentArchive().concat(S.learned);
}
function memCount(){ return allMemories().length; }
function memById(id){ return allMemories().find(m => m.id === id); }
function memActive(){ return S.memoryOn && memCount() > 0; }

function city(){
  const key = String(S.req.dest || '').trim();
  return (typeof CITY_DATA !== 'undefined' && CITY_DATA[key]) || null;
}
function poi(){ return (city() || {}).poi || {}; }
function spots(){ return (city() || {}).spots || {}; }
function dining(){ return (city() || {}).dining || {}; }
function restPoi(){ return (city() || {}).restPoi || {}; }
function spotImages(){
  const c = city();
  // 城市自带的图（杭州/广州走 assets/cities/）优先，其余从公共图库补
  return Object.assign({}, (typeof SPOT_IMG !== 'undefined') ? SPOT_IMG : {}, (c && c.images) || {});
}

/* ==========================================================================
   路线 = 算法排线（planner.js） + 可选的 LLM 候选提名（llm.js）。
   默认版（0 记忆）与记忆版各跑一次引擎；记忆开关切换时在两份结果间取用。
   diffs 由两次结果逐天对齐得出——不再有任何城市用手工对照。
   ========================================================================== */
const _RUN = { key: null, res: null };

function runKey(){
  return [S.req.dest, S.req.days, S.req.date, S.req.interest, S.req.intensity,
          S.memoryOn ? 'mem' : 'def', memCount(),
          JSON.stringify(allMemories().map(m => [m.id, m.pace, m.avoid, m.prefer])),
          (S.gen && S.gen.candidates ? 'L' + S.gen.candidates.length : '')].join('|');
}

function ensureRun(){
  const c = city();
  if(!c) return null;
  const key = runKey();
  if(_RUN.key === key) return _RUN.res;
  const memories = memActive() ? allMemories() : [];
  _RUN.res = TourisPlanner.compare(c, {
    days: S.req.days, date: S.req.date,
    interest: S.req.interest, intensity: S.req.intensity,
    memories,
    llmCandidates: (S.gen && S.gen.candidates) || null,
    planId: (S.chosenPlan && TourisPlanner ? S.chosenPlan : null)
  });
  _RUN.key = key;
  return _RUN.res;
}
function invalidateRun(){ _RUN.key = null; }

function plans(){
  const r = ensureRun();
  return r ? r.mem.plans : [];
}
function itin(){
  const r = ensureRun();
  if(!r) return null;
  const id = S.chosenPlan && r.mem.byId[S.chosenPlan] ? S.chosenPlan : r.mem.recommendedId;
  const p = r.mem.byId[id] || r.mem.plans[0];
  return p ? p.itinerary : null;
}
function itinPlanId(){
  const r = ensureRun();
  return r ? (S.chosenPlan && r.mem.byId[S.chosenPlan] ? S.chosenPlan : r.mem.recommendedId) : null;
}
function diffs(){
  const r = ensureRun();
  return r ? r.diffs : [];
}

function usedMemoryIds(){
  if(!memActive()) return [];
  const set = new Set();
  plans().forEach(p => (p.memoryIds||[]).forEach(id => set.add(id)));
  const it = itin();
  if(it){
    (it.stay.memoryIds||[]).forEach(id => set.add(id));
    it.days.forEach(d => {
      (d.memoryIds||[]).forEach(id => set.add(id));
      d.items.forEach(i => (i.memoryIds||[]).forEach(id => set.add(id)));
    });
  }
  diffs().forEach(x => (x.memoryIds||[]).forEach(id => set.add(id)));
  return [...set].filter(id => memById(id));
}

function toast(html, kind){
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = `<span class="ti">${kind === 'mem' ? '🧠' : '✓'}</span><div>${html}</div>`;
  $('toastWrap').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 240); }, 3400);
}

/* ---------------- 屏幕切换：历史栈 + 滚动重置 + 浏览器前进后退 ----------------
   以前页面跳转全靠「动线」（A 屏上放一个去 B 屏的按钮），没有返回键，
   浏览器后退也直接退出站点——典型的原型思维。现在：
   * goScreen() 是唯一的切屏入口：压历史栈 + pushState + 滚动归零
   * 顶栏给「← 返回」和面包屑，浏览器后退等价于屏内返回
   * 每次切屏 window 与 .work 两个滚动容器都归零
     （修复：首页下滑后点「规划」，新页面停在页面中部的问题） */
const SCREEN_TITLES = { home:'首页', s0:'出行需求', guide:'攻略参考', s1:'方案对比', s2:'攻略详情', s5:'记忆对照' };

function resetScroll(){
  try { window.scrollTo(0, 0); } catch(e) {}
  const w = $('work');
  if(w) w.scrollTop = 0;
}

function pushHistory(screen){
  try {
    if(history.state && history.state.screen === screen) return;
    history.pushState({ screen }, '', location.href.split('#')[0]);
  } catch(e) { /* file:// 或受限环境：历史栈只在内存里生效 */ }
}

function goScreen(screen, opts){
  opts = opts || {};
  if(screen === S.screen && !opts.force) { resetScroll(); return; }
  if(S.screen !== screen && !opts.noHist) {
    S.hist.push(S.screen);
    pushHistory(screen);
  }
  S.screen = screen;
  resetScroll();
  render();
}

function goBack(){
  const prev = S.hist.pop();
  try {
    if(history.state && history.state.screen !== undefined) history.back();
  } catch(e) {}
  S.screen = prev || 'home';
  resetScroll();
  render();
}

window.addEventListener('popstate', e => {
  const sc = e.state && e.state.screen;
  if(sc && SCREEN_TITLES[sc]) { S.screen = sc; resetScroll(); render(); }
});

/* ---------------- 生成流水线：检索攻略 → LLM 候选 → 算法排线 ---------------- */
let _pipelineRunning = false;

async function startPipeline(){
  if(_pipelineRunning) return;
  _pipelineRunning = true;
  resetRouteSelection();
  invalidateRun();
  S.gen = { step: 1, llmNote: '', candidates: null };
  S.rag = null;
  S.screen = 'generating';
  resetScroll();
  render();
  try {
    /* ① RAG：硬约束（目的地/出发时间→季节/天数）检索相似攻略 */
    S.gen.step = 1; render();
    S.rag = TourisRAG.retrieve({
      city: S.req.dest, date: S.req.date, days: S.req.days,
      interest: S.req.interest, intensity: S.req.intensity
    });
    await new Promise(r => setTimeout(r, 450));

    /* ② LLM 候选提名（没后端就降级为本地评分，planner 不受影响） */
    S.gen.step = 2; render();
    const c = city();
    const candRes = await TourisLLM.candidates({
      city: S.req.dest, days: S.req.days,
      interest: S.req.interest, intensity: S.req.intensity,
      memories: memActive() ? allMemories() : [],
      names: Object.keys(c.spots).filter(n => c.spots[n].cat !== 'station' && c.geo[n])
        .map(n => ({ name: n, tags: c.spots[n].tags, cat: c.spots[n].cat }))
    });
    S.gen.candidates = candRes.ok ? candRes.list : null;
    S.gen.llmNote = candRes.ok
      ? `大模型提名了 ${candRes.list.length} 个候选（已按词表闸门过滤）`
      : (candRes.degraded || '本地评分候选');
    render();
  } catch(e) {
    S.gen.llmNote = '生成管线出现异常，已降级为本地排线';
  } finally {
    /* ③ 算法排线（planner 是同步的，跑完直接进方案页） */
    S.gen.step = 3; render();
    invalidateRun();
    ensureRun();
    await new Promise(r => setTimeout(r, 500));
    _pipelineRunning = false;
    S.submitted = true;
    S.screen = 's1';
    S.hist = [];
    resetScroll();
    render();
    toast(`已生成 ${S.req.days} 天「${S.req.dest}」行程 · 候选池 ${city() ? Object.keys(city().spots).length : 0} 个景点`, 'mem');
  }
}

function stars(v){ const f = Math.round(v); return '★★★★★'.slice(0,f) + '☆☆☆☆☆'.slice(0,5-f); }

/* ---------------- 🧠 记忆标签 ---------------- */
function memTag(ids, label, opt){
  if(!memActive()) return '';
  const list = (ids||[]).map(memById).filter(Boolean);
  if(!list.length) return '';
  const txt = label || (list.length === 1
    ? '因为你' + shortSrc(list[0])
    : `依据 ${list.length} 条记忆`);
  return `<button class="mem-tag${opt && opt.block ? ' block' : ''}" data-act="pop" data-ids="${esc(list.map(m=>m.id).join(','))}">
    <span class="b">🧠</span><span>${esc(txt)}</span></button>`;
}
function shortSrc(m){
  const trip = m.source.trip.replace(/^(\d{4})-(\d{2})\s*/, (_,y,mo)=> `${+mo} 月在`);
  const act = m.source.action.replace(/^你/, '');
  return `${trip}${act}`.slice(0, 26);
}

/* ==========================================================================
   景点缩略图：按类别生成抽象插画，纯内联 SVG，无外部图片
   ========================================================================== */
const THUMB = {
  temple: '<path class="sky" d="M0 0h80v60H0z"/><path class="hill" d="M0 46c14-10 24-6 34 1s24 6 46-5v18H0z"/>' +
    '<path class="s1" d="M22 30h36l-6-7H28z"/><rect class="s2" x="28" y="30" width="24" height="14"/>' +
    '<path class="s1" d="M26 22h28l-14-8z"/><rect class="s3" x="37" y="35" width="6" height="9"/>',
  garden: '<path class="sky" d="M0 0h80v60H0z"/><rect class="sand" x="6" y="14" width="68" height="34" rx="3"/>' +
    '<path class="rake" d="M10 22h60M10 28h60M10 34h60M10 40h60"/>' +
    '<ellipse class="s2" cx="26" cy="30" rx="8" ry="6"/><ellipse class="s3" cx="48" cy="37" rx="5" ry="4"/>' +
    '<ellipse class="s3" cx="56" cy="24" rx="4" ry="3"/>',
  bamboo: '<path class="sky" d="M0 0h80v60H0z"/><g class="stalk">' +
    '<rect x="10" y="0" width="5" height="60"/><rect x="22" y="0" width="4" height="60"/>' +
    '<rect x="33" y="0" width="6" height="60"/><rect x="46" y="0" width="4" height="60"/>' +
    '<rect x="56" y="0" width="5" height="60"/><rect x="68" y="0" width="4" height="60"/></g>' +
    '<path class="rake" d="M0 18h80M0 38h80"/>',
  river: '<path class="sky" d="M0 0h80v60H0z"/><path class="hill" d="M0 26c12-12 26-10 38-2s26 8 42-4v14H0z"/>' +
    '<path class="water" d="M0 38h80v22H0z"/><path class="bridge" d="M8 40h64"/>' +
    '<path class="bridge" d="M20 40v8M40 40v8M60 40v8"/><path class="rake" d="M6 52h26M44 56h30"/>',
  market: '<path class="sky" d="M0 0h80v60H0z"/><rect class="s2" x="4" y="18" width="72" height="30"/>' +
    '<g class="awn"><path d="M4 18h12v8H4zM28 18h12v8H28zM52 18h12v8H52z"/></g>' +
    '<g class="awn2"><path d="M16 18h12v8H16zM40 18h12v8H40zM64 18h12v8H64z"/></g>' +
    '<rect class="s3" x="10" y="32" width="18" height="12"/><rect class="s3" x="34" y="32" width="14" height="12"/>' +
    '<rect class="s3" x="54" y="32" width="16" height="12"/>',
  street: '<path class="sky" d="M0 0h80v60H0z"/><path class="road" d="M32 60l8-38h4l8 38z"/>' +
    '<g class="s2"><path d="M0 14h30v46H0z"/><path d="M50 14h30v46H50z"/></g>' +
    '<g class="win"><rect x="6" y="22" width="6" height="7"/><rect x="18" y="22" width="6" height="7"/>' +
    '<rect x="58" y="22" width="6" height="7"/><rect x="70" y="22" width="6" height="7"/></g>' +
    '<g class="lant"><circle cx="34" cy="26" r="2.4"/><circle cx="48" cy="26" r="2.4"/></g>',
  museum: '<path class="sky" d="M0 0h80v60H0z"/><path class="s1" d="M8 22h64L40 8z"/>' +
    '<rect class="s2" x="8" y="22" width="64" height="26"/>' +
    '<g class="col"><rect x="16" y="26" width="6" height="22"/><rect x="30" y="26" width="6" height="22"/>' +
    '<rect x="44" y="26" width="6" height="22"/><rect x="58" y="26" width="6" height="22"/></g>' +
    '<rect class="s3" x="4" y="48" width="72" height="5"/>',
  shrine: '<path class="sky" d="M0 0h80v60H0z"/><path class="hill" d="M0 48c16-8 26-4 36 2s22 4 44-6v16H0z"/>' +
    '<g class="torii"><path d="M14 16h52v5H14z"/><path d="M18 24h44v4H18z"/>' +
    '<rect x="22" y="16" width="6" height="34"/><rect x="52" y="16" width="6" height="34"/></g>',
  castle: '<path class="sky" d="M0 0h80v60H0z"/><path class="s1" d="M26 24h28l-7-8H33z"/>' +
    '<path class="s1" d="M18 36h44l-8-9H26z"/><rect class="s2" x="30" y="24" width="20" height="12"/>' +
    '<rect class="s2" x="24" y="36" width="32" height="12"/><rect class="s3" x="6" y="48" width="68" height="6"/>',
  path: '<path class="sky" d="M0 0h80v60H0z"/><path class="water" d="M18 60c6-18 2-30 10-44"/>' +
    '<path class="road" d="M30 60c6-18 2-30 10-44"/>' +
    '<g class="tree"><circle cx="54" cy="20" r="8"/><circle cx="66" cy="30" r="6"/><circle cx="50" cy="38" r="7"/></g>' +
    '<path class="rake" d="M0 52h80"/>',
  tower: '<path class="sky" d="M0 0h80v60H0z"/><path class="s2" d="M36 52l3-34h2l3 34z"/>' +
    '<ellipse class="s1" cx="40" cy="18" rx="9" ry="5"/><rect class="s3" x="30" y="52" width="20" height="6"/>' +
    '<path class="rake" d="M0 46h80"/>',
  shopping: '<path class="sky" d="M0 0h80v60H0z"/><rect class="s2" x="12" y="16" width="56" height="34" rx="2"/>' +
    '<path class="awn" d="M12 16h56v7H12z"/><rect class="s3" x="22" y="30" width="14" height="20"/>' +
    '<rect class="s3" x="44" y="30" width="14" height="12"/><path class="rake" d="M12 50h56"/>',
  station: '<path class="sky" d="M0 0h80v60H0z"/><path class="s1" d="M4 20h72v6H4z"/>' +
    '<rect class="s2" x="10" y="26" width="60" height="22"/><rect class="s3" x="20" y="32" width="40" height="10" rx="2"/>' +
    '<path class="rake" d="M0 52h80M0 56h80"/>'
};
/* 图片全部在本仓库内（img/ 与 assets/），运行时零外部请求。
   早先这里默认经 wsrv.nl 代理去取 upload.wikimedia.org——因为本机连不通
   wikipedia.org。代价是所有图片请求都要过一个不受控的第三方，代理挂了全站开天窗。
   图已经一次性下载进 img/（见 tools/fetch-images.js），这层代理不再需要。
   ★ 想加城市的图，走 tools/fetch-images.js，不要在这里恢复代理。 */

/** 缩略图：底层是 SVG 占位插画，本地图加载成功后盖在上面；
    加载失败（文件缺失）就自动露出占位，不会开天窗。 */
function spotThumb(name, cls, extra){
  const s = spots()[name];
  const cat = (s && s.cat) || 'temple';
  const url = spotImages()[name] || null;
  return `<div class="sthumb ${cls||''} c-${cat}">
    <svg viewBox="0 0 80 60" preserveAspectRatio="none">${THUMB[cat]||THUMB.temple}</svg>
    ${url ? `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy">` : ''}
    <span class="ph-mark">示意</span>
    ${extra || ''}
  </div>`;
}

/** S1 方案卡顶部的必看点位缩略图条 */
function planShots(p){
  const names = p.highlights.slice(0, 4);
  return `<div class="plan-shots">${names.map(n =>
    spotThumb(n, '', `<span class="sn">${esc(n)}</span>`)).join('')}</div>`;
}

/* ==========================================================================
   模拟地图（两张：全程概览 + 当日动线）
   ========================================================================== */
const DAY_C = ['#b96843','#527b65','#586a99','#b59043','#946197','#367d8a','#a45564'];

function mapBase(labels){
  const cityLabels = city() && city().mapLabels;
  return `
    <g class="m-block">
      <rect x="30" y="42" width="26" height="20" rx="2"/><rect x="60" y="46" width="18" height="14" rx="2"/>
      <rect x="36" y="26" width="18" height="12" rx="2"/><rect x="18" y="60" width="22" height="16" rx="2"/>
      <rect x="60" y="24" width="16" height="12" rx="2"/>
    </g>
    <g class="m-grid">
      ${[16,32,48,64,80].map(v=>`<line x1="${v}" y1="0" x2="${v}" y2="100"/><line x1="0" y1="${v}" x2="100" y2="${v}"/>`).join('')}
    </g>
    <g class="m-road">
      <path d="M0 51H100"/><path d="M57 0V100"/><path d="M0 76H100"/><path d="M34 0V100"/>
      <path d="M8 44 L30 48 L52 50"/>
    </g>
    <path class="m-river" d="M64 6 C61 28, 58 46, 57 68 S56 88, 54 100"/>
    <g class="m-green"><circle cx="11" cy="47" r="8"/><circle cx="76" cy="33" r="6"/><circle cx="24" cy="23" r="6"/></g>
    ${labels ? `<g class="m-lab">${cityLabels
      ? cityLabels.map(x=>`<text x="${x[0]}" y="${x[1]}">${esc(x[2])}</text>`).join('')
      : '<text x="4" y="62">岚山</text><text x="18" y="15">金阁寺周边</text><text x="40" y="45">市中心</text><text x="80" y="56">东山</text><text x="56" y="97">伏见</text>'}
    </g>` : ''}`;
}

/** 概览图：整趟 4 天全部点位，按天配色
 *  opt.highlightDay: 1-based，高亮指定天的路线，淡化其他
 */
function realMapHTML(routeDays,opt={}){
  const c=city();
  const data=routeDays.map((names,i)=>names.filter(n=>c.geo[n]).map(n=>({name:n,lat:c.geo[n].lat,lng:c.geo[n].lng,day:(opt.startDay||1)+i})));
  const p=data.flat()[0]||{lat:c.center[0],lng:c.center[1]};
  return `<div class="real-map ${opt.small?'small':''}" data-city="${esc(c.name)}" data-routes="${esc(JSON.stringify(data))}" data-center="${esc(JSON.stringify(c.center))}">
    <div class="real-map-canvas" role="region" aria-label="${esc(c.name)}真实地图"></div>
    <div class="real-map-status" role="status">正在加载真实底图…</div>
    <div class="real-map-foot"><span>虚线：游览顺序</span><button type="button" data-map-retry>重试</button><a href="https://www.openstreetmap.org/#map=12/${p.lat}/${p.lng}" target="_blank" rel="noopener noreferrer">打开地图 ↗</a></div>
  </div>`;
}
function overviewMap(routeDays, opt){
  if(city()?.geo) return realMapHTML(routeDays,opt);
  const small = opt && opt.small;
  const hl = opt && opt.highlightDay;
  const paths = routeDays.map((names, di) => {
    const pts = names.map(n => poi()[n]).filter(Boolean);
    if(pts.length < 2) return '';
    const dayNum = di + 1;
    const cls = hl && hl !== dayNum ? 'm-route dim' : 'm-route';
    return `<path class="${cls}" style="stroke:${DAY_C[di]}" d="${pts.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')}"/>`;
  }).join('');
  const dots = routeDays.map((names, di) => {
    const dayNum = di + 1;
    const dimCls = hl && hl !== dayNum ? ' dim' : '';
    return names.map(n => {
      const p = poi()[n]; if(!p) return '';
      return `<circle class="m-dot${dimCls}" cx="${p.x}" cy="${p.y}" r="${small?2.4:2.8}" style="fill:${DAY_C[di]}"/>`;
    }).join('');
  }).join('');
  return `<div class="sim-map ${small?'small':''}">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">${mapBase(!small)}${paths}${dots}</svg>
    ${small ? '' : `<div class="map-scale"><i></i><span>${city()?.durationRange ? '行程示意' : '约 2km'}</span></div>`}
  </div>`;
}

/** 当日动线图：编号点位 + 悬停放大 */
function dayMap(day){
  if(city()?.geo) return realMapHTML([day.items.filter(i=>i.kind==='spot').map(i=>i.name)],{startDay:day.day});
  const pts = [];
  day.items.forEach(i => {
    const nm = i.kind === 'food' ? restPoi()[i.name] : (i.kind === 'free' ? null : i.name);
    const p = nm && poi()[nm];
    if(p) pts.push({ nm, x:p.x, y:p.y, kind:i.kind, mem:!!(i.memoryIds&&i.memoryIds.length&&memActive()) });
  });
  const path = pts.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');
  return `<div class="sim-map">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      ${mapBase(true)}
      <path class="m-route day" d="${path}"/>
    </svg>
    ${pts.map((p,i)=>`
      <div class="map-pt ${p.kind} ${p.mem?'mem':''} ${S.hoverItem===p.nm?'big':''}" style="left:${p.x}%;top:${p.y}%">
        <div class="dot">${i+1}</div>
        ${S.hoverItem===p.nm ? `<span class="lbl">${esc(p.nm)}</span>` : ''}
      </div>`).join('')}
    <div class="map-scale"><i></i><span>${city()?.durationRange ? '行程示意' : '约 2km'}</span></div>
  </div>`;
}

/* ============================ 首页数据 ============================ */

/* ★ 这里曾经接的是 Trae IDE 的私有生图接口（trae-api-cn.mchost.guru），
   用 AI 生成「实景照片」。两个问题都致命：
     1) 那是 IDE 的内部端点，无文档、无 SLA、随时可下线，而它撑的是首页第一屏；
     2) 产品的卖点是「可溯源、可核验」，拿生成的假照片当实景，等于自己拆自己的台。
   现在换成从 img/ 里取真实照片——同样是 Commons 的 CC 授权图，
   与景点卡片同源，署名统一记在 img/CREDITS.md。 */
/* 首屏轮播。用高分辨率原图（本地存档，见 assets/hero/），
   后续加图直接往这个数组里追加即可。 */
const HOME_HERO_IMAGES = [
  'assets/hero/beijing.png',
  'assets/hero/shanghai.jpg'
];

/* ★ 卡片必须对上真实存在的城市
   CITY_DATA 里只有 京都/北京/上海/杭州/威海/广州。早先这里有奈良、箱根、大阪、
   东京、富士山五张卡，点进去 city() 返回 null，八处访问器全部静默退回京都数据——
   挂着「奈良」的标题显示京都的景点，且没人发现。
   下面这个列表要和 CITY_DATA 的键保持一致；加城市时同步加卡。 */
const DEST_CARDS = [
  { name:'杭州', en:'Hangzhou', tagline:'西湖古寺 · 湿地与老城', days:'2—7 天', price:'多日游攻略',
    img:'assets/cities/hangzhou/west-lake-panorama.jpg', tags:['湖景','古寺','文博'] },
  { name:'广州', en:'Guangzhou', tagline:'西关人文 · 珠江天际线', days:'2—7 天', price:'多日游攻略',
    img:'assets/cities/guangzhou/canton-tower.jpg', tags:['老城','展馆','夜景'] },
  { name:'成都', en:'Chengdu', tagline:'公园茶馆 · 古蜀与熊猫', days:'4 天', price:'3 套方案',
    img:'img/Narrow_Lane_of_Chengdu.jpg', tags:['老城','茶馆','熊猫'] },
  { name:'北京', en:'Beijing', tagline:'中轴线 · 古建与胡同', days:'4 天', price:'3 套方案',
    img:'img/Sunset_of_the_Forbidden_City_2006.jpg', tags:['古建','胡同','市集'] },
  { name:'上海', en:'Shanghai', tagline:'梧桐街区 · 滨水天际线', days:'4 天', price:'3 套方案',
    img:'img/Pudong_Shanghai_November_2017_panorama.jpg', tags:['街区','滨水','展馆'] },
  { name:'威海', en:'Weihai', tagline:'海湾海岛 · 甲午故地', days:'4 天', price:'3 套方案',
    img:'img/Weihai.port_de_Liugong_dao.jpg', tags:['海湾','海岛','渔村'] }
];

const FEATURES = [
  { icon:'🧠', title:'记忆可见', desc:'每次选择都变成可查、可改、可溯源的旅行记忆资产。' },
  { icon:'🧮', title:'算法排线', desc:'分天聚类 + 2-opt 优化，按游玩与通勤时间排出时刻表，放不下自动回退。' },
  { icon:'📖', title:'RAG 攻略', desc:'按目的地、季节、天数硬约束检索相似攻略，再按你的偏好改写。' }
];

const STATS = [
  { n:'50+', l:'候选景点 / 城' },
  { n:String(Object.keys(CITY_DATA).length), l:'核心城市' },
  { n:'3 步', l:'生成流水线' },
  { n:'0', l:'密码与表单' }
];

/* ============================ 首页渲染 ============================ */
function setupScrollReveal(){
  const els = document.querySelectorAll('[data-reveal]');
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if(e.isIntersecting){
        e.target.classList.add('revealed');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
}

function viewHome(){
  return `
  <div class="home">

    <!-- ========== HERO ========== -->
    <section class="hero" id="hero">
      <div class="hero-bg" id="heroBg"></div>
      <div class="hero-overlay"></div>
      <div class="hero-slides" id="heroSlides">
        ${HOME_HERO_IMAGES.map((u,i)=>`<div class="hs ${i===0?'on':''}" style="background-image:url('${u}')"></div>`).join('')}
      </div>

      <!-- 轮播控制台只有进度条，整块贴图片右下角（定位见 home.css 的 .hero-ctrl）。
           上一张/下一张/播放键/计数器都去掉了，切换仍然可用：点圆点、
           键盘 ← →、移动端左右滑动。 -->
      <div class="hero-ctrl">
        <div class="hc-dots" id="heroDots">
          ${HOME_HERO_IMAGES.map((_,i)=>`<button class="hc-dot ${i===0?'on':''}" data-i="${i}" aria-label="切换到第${i+1}张"></button>`).join('')}
        </div>
      </div>

      <!-- Hero 文案改左对齐（v2）：原先整块居中，标题正好压在轮播图的视觉
           主体上，切到哪张图都挡哪张。左对齐后文字落在左侧安全区，
           轮播图主体（右侧 60%）完整露出，排版也更像正式产品。 -->
      <div class="hero-content">
        <div class="hero-badge">
          <span class="dot"></span>
          让 AI 记住你的每一次选择
        </div>
        <h1 class="hero-title">
          <span class="line1">旅行不该每次都</span>
          <span class="line2">从零开始<span class="cursor">_</span></span>
        </h1>
        <p class="hero-sub">
          以「记忆」为护城河的旅行规划：相似攻略检索 → 大模型提名 → 算法排线，<br>
          每次喜欢与不喜欢都变成可溯源、可对比的资产
        </p>

        <!-- 搜索框(模拟 Trip.com 搜索条) -->
        <div class="hero-search">
          <div class="hs-field hs-dest">
            <span class="hs-ic">📍</span>
            <select id="home-dest" aria-label="目的地">
              ${Object.keys(CITY_DATA).map(c=>`<option ${c===S.req.dest?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="hs-field hs-date">
            <span class="hs-ic">📅</span>
            <input id="home-date" type="date" value="${esc(S.req.date || '2026-10-02')}" aria-label="出发日期">
          </div>
          <div class="hs-field hs-days">
            <span class="hs-ic">⏱</span>
            <select id="home-days" aria-label="游玩天数">
              ${[2,3,4,5,6,7].map(d=>`<option ${d===S.req.days?'selected':''}>${d} 天</option>`).join('')}
            </select>
          </div>
          <button class="hs-btn" data-act="start">
            <span>🧠 用记忆规划</span>
          </button>
        </div>

        <div class="hero-quick">
          <span>🔥 热门:</span>
          ${Object.keys(CITY_DATA).map(d=>`<button class="chip" data-act="quick" data-d="${d}">${d}</button>`).join('')}
        </div>
      </div>

      <div class="hero-scroll" data-act="scroll">
        <div class="scroll-line"></div>
        <span>向下探索</span>
      </div>

      <!-- 首屏栏：左只放商标，右放账号入口。
           原先左边还有「Touris 知途」文字、右边是四个跳转按钮，
           现在文字和跳转都去掉了——跳转交给下面的 hero 搜索框和 CTA。 -->
      <div class="hero-top">
        <div class="h-logo">
          <span class="logo" role="img" aria-label="知途"></span>
        </div>
        <div class="h-nav">
          ${accountBtnHTML(memCount())}
        </div>
      </div>
    </section>

    <!-- ========== 统计条 ========== -->
    <section class="section stats-bar">
      ${STATS.map(s=>`
        <div class="stat-item" data-reveal>
          <div class="n">${s.n}</div>
          <div class="l">${s.l}</div>
        </div>`).join('')}
    </section>

    <!-- ========== 核心价值 ========== -->
    <section class="section features">
      <div class="sec-head" data-reveal>
        <span class="eyebrow">为什么选择我们</span>
        <h2>记忆看得见,推荐才靠谱</h2>
        <p>通用工具给你答案,<b>我们给你差异</b>——开关记忆,同一套系统喂进去不同的人,产出完全不同。</p>
      </div>
      <div class="feat-grid">
        ${FEATURES.map((f,i)=>`
          <div class="feat-card" data-reveal data-d="${i}">
            <div class="feat-ic">${f.icon}</div>
            <h3>${f.title}</h3>
            <p>${f.desc}</p>
            <div class="feat-num">0${i+1}</div>
          </div>`).join('')}
      </div>
    </section>

    <!-- ========== 热门目的地 ========== -->
    <section class="section destinations">
      <div class="sec-head" data-reveal>
        <span class="eyebrow">热门目的地</span>
        <h2>选个地方,开始你的下一次</h2>
        <p>快速进入 Demo · 一键加载预设行程</p>
      </div>
      <div class="dest-grid">
        ${DEST_CARDS.map((d,i)=>`
          <div class="dest-card" data-reveal data-d="${i}" data-act="dest" data-dest="${d.name}">
            <div class="dc-img" style="background-image:url('${d.img}')">
              <div class="dc-overlay"></div>
              <span class="dc-tag">${d.days}</span>
              <span class="dc-price">${d.price}</span>
            </div>
            <div class="dc-body">
              <div class="dc-title">
                <h3>${d.name}</h3>
                <span class="dc-en">${d.en}</span>
              </div>
              <p>${d.tagline}</p>
              <div class="dc-tags">
                ${d.tags.map(t=>`<span>${t}</span>`).join('')}
              </div>
            </div>
          </div>`).join('')}
      </div>
    </section>

    <!-- ========== 生成流水线 ========== -->
    <section class="section demo">
      <div class="demo-wrap">
        <div class="demo-text" data-reveal>
          <span class="eyebrow">生成流水线</span>
          <h2>三步算出一条路线</h2>
          <p>相似攻略检索（RAG）→ 大模型提名候选 → 算法排线。LLM 只提名不拍板，
          路线由「游玩时间 + 通勤时间」的优化算法决定，全程可降级、可溯源。</p>
          <button class="btn-lg" data-act="go" data-screen="s1">
            立即体验完整 Demo →
          </button>
        </div>
        <div class="demo-visual" data-reveal>
          <div class="demo-steps">
            ${[
              { t:'RAG 检索', d:'目的地/季节/天数硬约束' },
              { t:'LLM 提名', d:'按记忆偏好挑候选，闸门把关' },
              { t:'算法排线', d:'聚类分天 + 2-opt 优化通勤' }
            ].map((s,i)=>`
              <div class="d-step">
                <div class="d-num">${i+1}</div>
                <div class="d-t">${s.t}</div>
                <div class="d-d">${s.d}</div>
              </div>`).join('')}
            <div class="d-arrow">→</div>
          </div>
          <div class="demo-mem-vis">
            <div class="mem-cloud">
              ${['不喜欢早起','喜欢逛早市','我晕博物馆','偏好本地小馆','喜欢安静庭园'].map((t,i)=>
                `<span class="mc mc-${i}">🧠 ${t}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== CTA ========== -->
    <section class="section cta">
      <div class="cta-inner" data-reveal>
        <h2>你的旅行记忆<br>换个 App <b>带不走</b>。</h2>
        <p>这就是它抄不走、你离不开的原因。</p>
        <div class="cta-btns">
          <button class="btn-lg" data-act="go" data-screen="s0">免费开始规划 →</button>
          <button class="btn-lg ghost" data-act="go" data-screen="s1">直接看三套方案</button>
        </div>
      </div>
    </section>

    <!-- ========== Footer ========== -->
    <footer class="footer">
      <div class="f-brand">
        <span class="logo" role="img" aria-label="知途 Touris"></span>
      </div>
      <div class="f-links">
        <a data-act="home">首页</a>
        <a data-act="go" data-screen="s0">规划</a>
        <a data-act="go" data-screen="guide">攻略参考</a>
        <a data-act="demo">演示档案</a>
      </div>
      <div class="f-copy">© 2026 · 原型演示</div>
    </footer>

  </div>`;
}

/* ====================================================================
   事件扩展:home 专属 data-act
   ==================================================================== */
function bindHomeAct(t){
  const act = t.dataset.act;
  if(act === 'home'){ goScreen('home'); return true; }
  if(act === 'start' || act === 'quick'){
    // 从搜索框/快捷 chip 进入：走完整的生成流水线
    const dest = (t.dataset.d || ($('home-dest')?.value || '成都')).trim();
    const date = $('home-date')?.value || '2026-10-02';
    let days = +(($('home-days')?.value || '4 天').match(/\d+/)?.[0] || 4);

    S.req = { dest: Object.keys(CITY_DATA).includes(dest) ? dest : '成都',
              date, days, people: 2, interest: S.req.interest || 'mixed', intensity: S.req.intensity || 'mid' };
    startPipeline();
    return true;
  }
  if(act === 'dest'){
    // 目的地卡片点击：预设好需求直接走流水线。
    // 注意不要在这里偷换档案——游客就该以 0 记忆跑完，否则对照演示不成立。
    const dest = t.dataset.dest;
    S.req = { dest, date:'2026-10-02', days:4, people:2,
              interest: S.req.interest || 'mixed', intensity: S.req.intensity || 'mid' };
    S.memoryOn = true;
    const n = memCount();
    startPipeline();
    return true;
  }
  if(act === 'demo'){
    // 一键进对照演示：切到预置的「林小满」档案，让评委直接看到 20 条记忆的效果
    switchAccount('demo');
    if(S.rag && S.submitted) goScreen('s1');
    else { S.req.days = S.req.days || 4; startPipeline(); }
    return true;
  }
  if(act === 'scroll'){
    // 滚动到下一个 section
    const next = document.querySelector('.stats-bar');
    if(next) next.scrollIntoView({ behavior:'smooth' });
    return true;
  }
  return false;
}

/* ---------------- 身份切换（预设档案下拉） ----------------
   以前这里是一整套「登录 / 注册 / 密码」面板——对一个纯静态演示来说太重了。
   现在身份就是几份**预置档案**：点顶栏头像弹一个下拉，点谁换谁，
   没有注册、没有密码、没有表单校验。 */

let ACCT_OPEN = false;      // 下拉开合状态

/** 顶栏身份入口：游客显示「游客 · 0 记忆」；档案身份显示名字 + 记忆数 */
function accountBtnHTML(n){
  const ident = currentIdentity(S.session);
  return `<span class="acct-wrap">
    <button class="acct-btn ${S.session.mode==='user'?'':'guest'}" data-act="acctmenu" title="切换身份 / 记忆档案" aria-expanded="${ACCT_OPEN}">
      <span class="em">${ident.avatar}</span>
      ${S.session.mode==='user' ? `<b>${esc(ident.name)}</b>` : '<span>游客</span>'}
      <span class="cnt">${n}</span>
    </button>${ACCT_OPEN ? acctMenuHTML() : ''}
  </span>`;
}

function acctMenuHTML(){
  const cur = S.session.mode === 'user' ? S.session.id : null;
  const rows = PRESET_IDENTITIES.map(p => {
    const acc = getAccount(p.id) || { memories: [] };
    const n = ((acc.memories) || []).length;
    const on = cur === p.id;
    return `<button class="am-item ${on?'on':''}" data-act="acctpick" data-id="${p.id}">
      <span class="em">${p.avatar}</span>
      <span class="tt"><b>${esc(p.name)}</b><small>${esc(p.tag)}</small></span>
      <span class="cnt">${n} 条记忆</span>
    </button>`;
  }).join('');
  return `<span class="acct-menu" role="menu" aria-label="切换身份">
    <div class="am-head">选择身份 · 记忆跟着档案走</div>
    <button class="am-item ${cur===null?'on':''}" data-act="acctpick" data-id="">
      <span class="em">🫥</span>
      <span class="tt"><b>游客</b><small>0 记忆 · 不落盘，刷新即散</small></span>
      <span class="cnt">0 条记忆</span>
    </button>
    ${rows}
    <div class="am-foot">
      <span>记忆只存在本机 localStorage</span>
      <button class="am-reset" data-act="reset">清空数据</button>
    </div>
  </span>`;
}

function toggleAcctMenu(force){
  ACCT_OPEN = force === undefined ? !ACCT_OPEN : !!force;
  renderTop();
  if(S.screen === 'home') {
    // 首页顶栏与 hero 各有一份入口，同步刷新 hero 上的那份
    const heroAcct = document.querySelector('.hero-top .acct-wrap');
    if(heroAcct) heroAcct.outerHTML = accountBtnHTML(memCount());
  }
}

/** 切换身份：先回写当前身份的现场记忆，再换档案重渲染 */
function switchAccount(id){
  if(S.session.mode === 'user' && S.learned.length) saveLearned(S.session.id, S.learned);
  if(id && identityById(id)){
    S.session = { mode:'user', id };
    persistSession(S.session);
    S.learned = [];
    S.diffPlayed = false; S.memHit = [];
    ACCT_OPEN = false;
    invalidateRun();
    renderTop(); renderLeft(); render();
    const acc = getAccount(id);
    toast(`已切换到 <b>${esc(acc ? acc.name : id)}</b> · ${(acc.memories||[]).length} 条记忆参与推荐`, 'mem');
  } else {
    S.session = { mode:'guest', id:null };
    persistSession(S.session);
    S.learned = [];
    S.diffPlayed = false; S.memHit = [];
    ACCT_OPEN = false;
    invalidateRun();
    render();
    toast('已切换到游客模式 · 0 条记忆');
  }
}

/* ---------------- 顶栏 ----------------
   非 home 屏给「← 返回 + 面包屑」——替代过去「只能顺着动线走」的原型交互。
   返回 = goBack()（内存历史栈优先，浏览器后退键行为一致）。 */
function renderTop(){
  const n = memCount();
  const swDisabled = n === 0;
  const crumbs = S.screen === 'home' ? '' : (() => {
    const chain = [];
    if(['s1','s2','s5','guide'].includes(S.screen)) chain.push(['s0', '需求']);
    if(['s2','s5'].includes(S.screen)) chain.push(['guide', '攻略']);
    if(['s2','s5','guide'].includes(S.screen)) chain.push(['s1', '方案']);
    if(S.screen === 's5') chain.push(['s2', '详情']);
    const crumbHTML = chain.map(([sc, label]) =>
      `<button class="crumb" data-act="go" data-screen="${sc}">${label}</button>`).join('<i>›</i>');
    return `<div class="crumbs">
      <button class="back-btn" data-act="back" title="返回上一屏">←</button>
      <button class="crumb" data-act="home">首页</button><i>›</i>
      ${crumbHTML ? crumbHTML + '<i>›</i>' : ''}
      <b>${SCREEN_TITLES[S.screen] || ''}</b>
    </div>`;
  })();
  $('topbar').innerHTML = `
    <div class="brand" data-act="home" title="返回首页" style="cursor:pointer">
      <span class="logo" role="img" aria-label="知途 Touris"></span>
    </div>
    ${crumbs}
    <div class="top-right">
      ${accountBtnHTML(n)}
      <div class="top-sep"></div>
      <button class="mem-switch ${S.memoryOn?'':'off'} ${swDisabled?'disabled':''}" data-act="memsw"
        title="${swDisabled?'当前档案没有记忆可用':'开关记忆，观察推荐变化'}">
        <span class="knob"></span>
        <span class="txt">${S.memoryOn ? '使用记忆' : '默认推荐'}</span>
      </button>
    </div>`;
}

/* ---------------- 左栏 ---------------- */
/* ---------------- 左栏：需求 + 记忆资产 + 本次用到的记忆 ---------------- */
function renderLeft(){
  const n = memCount();
  const navs = [
    { id:'s0', label:'S0', t:'出行需求' },
    { id:'guide', label:'G', t:'攻略参考（RAG）' },
    { id:'s1', label:'S1', t:'三方案对比' },
    { id:'s2', label:'S2', t:'攻略详情' },
    { id:'s5', label:'S5', t:'再次推荐对照' }
  ];
  const curIdx = navs.findIndex(v => v.id === S.screen);
  const cur = curIdx === -1 ? navs.length : curIdx;   // generating / home 等未列出的屏不标记进度
  const r = S.req;
  const list = usedMemoryIds().map(memById).filter(Boolean);

  /* 本次推荐实际用到的记忆 */
  let memBody;
  if(!list.length){
    memBody = `<div class="rr-empty">
        <span class="big">🫥</span>
        ${memCount()===0
          ? '第一次使用，没有历史。<br>去详情页对景点、餐饮、节奏点几个 👍👎，<br>记忆会当场长出来。'
          : (S.memoryOn ? '记忆已开启。<br>当前记录尚未触发路线调整，<br>匹配的偏好会显示在这里。' : '开关已关闭。<br>开启「使用记忆」后，<br>这里会列出起作用的记忆。')}
      </div>`;
  }else{
    memBody = list.map(m => {
      const fresh = S.learned.some(x => x.id === m.id);
      const hit = S.memHit.includes(m.id);
      return `<div class="mcard ${hit?'hit':''} ${fresh?'fresh':''}" id="mc-${m.id}">
        <div class="mtxt">${esc(m.text)}</div>
        <div class="msrc">来源：<b>${esc(m.source.trip)}</b> · ${esc(m.source.action)}${
          m.source.quote ? `（“${esc(m.source.quote)}”）` : ''}</div>
        <div class="mfoot">
          <span class="chip-xs">${esc(m.type)}</span>
          <span class="chip-xs scope ${m.scope==='session'?'session':''}">${m.scope==='session'?'仅本次':'长期'}</span>
          <span class="chip-xs cited">被引用 ${m.cited} 次</span>
        </div>
      </div>`;
    }).join('');
  }


  $('railLeft').innerHTML = `
    <div class="rail-block">
      <p class="rail-title">本次出行需求</p>
      <div class="rail-card">
        <div class="req-row"><span>目的地</span><b>${esc(r.dest)}</b></div>
        <div class="req-row"><span>出发</span><b>${esc(r.date)}</b></div>
        <div class="req-row"><span>天数</span><b>${r.days} 天</b></div>
        <div class="req-row"><span>人数</span><b>${r.people} 人</b></div>
        <div class="hr"></div>
        <div class="req-row"><span>不问预算</span><b class="muted">不问偏好</b></div>
      </div>
    </div>

    <div class="rail-block">
      <p class="rail-title">记忆资产</p>
      <div class="mem-count ${n===0?'empty':''}">
        <div class="n">${n}<small>条记忆</small></div>
        <div class="sub">${n===0 ? '从零开始，边选边学' : '本次推荐' + (memActive()?'正在使用':'未使用（开关已关）')}</div>
        ${S.learned.length ? `<div class="growing">本次现场新增 ${S.learned.length} 条</div>` : ''}
      </div>
    </div>

    <div class="rail-block">
      <div class="rail-head">
        <p class="rail-title" style="margin:0">🧠 本次用到的记忆</p>
        ${list.length ? `<span class="rail-cnt">${list.length} 条</span>` : ''}
      </div>
      <p class="rail-sub">${memActive()
        ? '每条都可点回它的来源'
        : (memCount()===0 ? '还没有任何记忆' : '记忆开关已关闭')}</p>
      <div class="rail-mems">${memBody}</div>
    </div>

    <div class="rail-block">
      <p class="rail-title">流程</p>
      <div class="nav-list">
        ${navs.map((v,i) => `
          <button class="nav-item ${S.screen===v.id?'on':''} ${i<cur?'done':''}" data-act="go" data-screen="${v.id}">
            <span class="tail">${v.label}</span>
            <span>${esc(v.t)}</span>
            ${i<cur?'<span class="tick">✓</span>':''}
          </button>`).join('')}
      </div>
    </div>`;
}

function viewS0(){
  const n = memCount();
  const interests = [['mixed','都要兼顾'],['culture','人文历史'],['nature','自然风光']];
  const intensities = [['fast','特种兵'],['mid','适中'],['slow','闲庭漫步']];
  return `
  <div class="s0-wrap">
    <div class="s0-hero">
      <span class="kicker"><span class="kicker-logo" role="img" aria-label="知途 Touris"></span>老马识途，越走越懂你</span>
      <h1>这次去哪儿？</h1>
      <p class="say">预算和具体路线<b>不用你操心</b>——只需回答两个意愿问题，其余交给记忆和算法。</p>
    </div>

    <div class="card s0-form">
      <div class="f-grid">
        <div class="field"><label>目的地</label><input id="f-dest" list="city-list" value="${esc(S.req.dest)}">
          <datalist id="city-list">${Object.keys(CITY_DATA).map(c=>`<option value="${c}">`).join('')}</datalist></div>
        <div class="field"><label>出发日期</label><input id="f-date" type="date" value="${esc(S.req.date)}"></div>
        <div class="field"><label>游玩天数</label>
          <select id="f-days">${[2,3,4,5,6,7].map(d=>`<option ${d===S.req.days?'selected':''}>${d}</option>`).join('')}</select>
        </div>
        <div class="field"><label>人数</label>
          <select id="f-people">${[1,2,3,4].map(d=>`<option ${d===S.req.people?'selected':''}>${d}</option>`).join('')}</select>
        </div>
        <div class="field"><label>旅游偏好</label>
          <select id="f-interest">${interests.map(([v,t])=>`<option value="${v}" ${S.req.interest===v?'selected':''}>${t}</option>`).join('')}</select>
        </div>
        <div class="field"><label>旅游强度</label>
          <select id="f-intensity">${intensities.map(([v,t])=>`<option value="${v}" ${S.req.intensity===v?'selected':''}>${t}</option>`).join('')}</select>
        </div>
      </div>

      <p class="muted">候选池每城 50+ 景点 · 生成时按「检索相似攻略 → 大模型提名 → 算法排线」三步走，出发季节会自动换算成天气与时段建议。</p>
      <div class="s0-badge ${n===0?'empty':''}">
        <span class="ic">${n===0?'🌱':'🧠'}</span>
        <div>
          <div class="t">${n===0 ? '从零开始，边选边学' : `已积累 ${n} 条记忆 · 本次推荐将使用`}</div>
          <div class="d">${n===0
            ? '你在详情页的每次 👍👎 都会变成可查、可改的记忆'
            : '含节奏 / 餐饮 / 住宿 / 景点四类偏好，全部来自你过去的选择'}</div>
        </div>
      </div>

      <div class="s0-actions">
        <button class="btn lg" data-act="submit">生成行程方案 →</button>
        <span class="muted" style="font-size:12.5px">3 套风格 + 相似攻略，供你对比</span>
      </div>

      <div class="s0-alt">
        <button class="alt-card" data-act="submit">
          <div class="at">直接开始 <span class="pill">推荐</span></div>
          <div class="ad">跳过初始化，从我的选择中积累记忆。第一次也能用。</div>
        </button>
        <button class="alt-card" data-act="initwiz">
          <div class="at">想换个记忆档案？点右上角身份下拉 →</div>
          <div class="ad">游客 / 林小满（慢节奏）/ 陈铁腿（特种兵）/ 周晚晚（自然派）随时切换。</div>
        </button>
      </div>
    </div>
  </div>`;
}

/* ============================ S1 ============================ */
function paceDots(v, hi){
  return `<div class="pace-scale"><span class="ends">松</span>
    <div class="dots">${[1,2,3,4,5].map(i=>`<i class="${i<=v?'on':''} ${hi&&i<=v?'hi':''}"></i>`).join('')}</div>
    <span class="ends">紧</span></div>`;
}
function walkBars(arr){
  const max = Math.max(...arr);
  return `<div class="walk">${arr.map((w,i)=>
    `<i style="height:${Math.round(w/max*100)}%"><b>D${i+1}</b></i>`).join('')}</div>`;
}
function planCard(p){
  const st = S.planStance[p.id];
  const on = memActive();
  const tags = (p.memoryIds||[]).map(memById).filter(Boolean);
  const spotCount = p.routeDays.reduce((a,d)=>a+d.length,0);
  return `
  <div class="plan ${p.recommended&&on?'rec':''} ${st==='chosen'?'chosen':''} ${st==='disliked'?'disliked':''} ${st==='skipped'?'skipped':''}">
    ${on && p.recommended ? '<div class="plan-ribbon">🧠 最贴合你</div>' : ''}
    ${on && p.conflict ? '<div class="plan-ribbon warn">与记忆冲突</div>' : ''}
    <div class="plan-head">
      <span class="style-tag">${esc(p.style)}</span>
      <div class="tagline">${esc(p.tagline)}</div>
    </div>

    <div class="plan-map">
      ${planShots(p)}
      ${overviewMap(p.routeDays, { small:true })}
      <div class="pm-foot">
        <div class="pm-days">${p.routeDays.map((d,i)=>
          `<span class="pm-d"><i style="background:${DAY_C[i]}"></i>D${i+1}·${d.length}</span>`).join('')}</div>
        <span class="pm-sum">全程 ${spotCount} 个点位</span>
      </div>
    </div>

    <div class="ruler">
      <div class="rrow"><span class="rlab">行程节奏</span><div class="rval">${paceDots(p.pace, p.pace>=4)}</div></div>
      <div class="rrow"><span class="rlab">景点密度</span><div class="rval">
        <div class="density"><b>${p.density}</b><span>个/天</span>
          <span class="bar"><i style="width:${Math.round(p.density/4*100)}%"></i></span></div></div></div>
      <div class="rrow"><span class="rlab">${p.walkNote ? '交通耗时' : '每日步数'}</span><div class="rval">${p.walkNote ? esc(p.walkNote) : walkBars(p.walk)}</div></div>
      <div class="rrow" style="margin-top:6px"><span class="rlab">住宿范围</span><div class="rval stay-val">
        <div class="a">${esc(p.stay.area)}</div><div class="d">${esc(p.stay.dist)}</div></div></div>
      <div class="rrow"><span class="rlab">餐饮策略</span><div class="rval">
        <div class="tags">${p.food.map(f=>`<span class="tag ${/本地|市集|抹茶|精进/.test(f)?'good':''}">${esc(f)}</span>`).join('')}</div></div></div>
    </div>

    <div class="plan-hl">${p.highlights.map(h=>{
      const s = spots()[h];
      return `<span class="hl">${esc(h)}${s && Number.isFinite(s.score)?`<b>${s.score}</b>`:''}</span>`;
    }).join('')}</div>

    ${on && tags.length ? `
      <div class="plan-mem ${p.conflict?'warn':''}">
        <div class="note">${p.conflict?'⚠ ':'🧠 '}${esc(p.memoryNote||'')}</div>
        <div class="tags-mem">${tags.map(m=>memTag([m.id], m.text.slice(0,14))).join('')}</div>
      </div>` : ''}
    ${!on ? '<div class="plan-nomem">— 没有记忆参与这套方案 —</div>' : ''}

    ${st ? `<div class="state-line ${st}">${
        st==='chosen' ? '✓ 已选择这套方案'
      : st==='skipped' ? '○ 已跳过（不记为不喜欢）'
      : '✕ 已标记不喜欢（记入记忆）'}</div>` : ''}

    <div class="plan-foot">
      <button class="btn ${st==='chosen'?'':'sec'}" data-act="pick" data-id="${p.id}">
        ${st==='chosen'?'查看详情 →':'选这套'}</button>
      <button class="mini skip ${st==='skipped'?'on':''}" data-act="skip" data-id="${p.id}" title="跳过：中性，不记为负反馈">跳过</button>
      <button class="mini down ${st==='disliked'?'on':''}" data-act="pdown" data-id="${p.id}" title="不喜欢：记入记忆">👎</button>
    </div>
  </div>`;
}
function resetRouteSelection(){
  S.chosenPlan=null; S.planStance={}; S.stance={}; S.openReason=null;
  S.openFree={}; S.s2day=1; S.hoverItem=null; S.diffPlayed=false;
}
function cityGuide(){
  const c=city();
  if(!c?.sources) return '';
  return `<aside class="card city-guide">
    <strong>${esc(c.name)} · ${S.req.days} 日游攻略 · ${Object.keys(c.spots).length} 个候选景点</strong>
    <p>按片区安排游览；地图显示真实位置，虚线仅表示游览顺序。出行前请核对开放、预约和实际交通。</p>
    <details><summary>查看攻略参考 · 官方资料与小红书</summary>
      <p>小红书为个人经验参考，可能需要登录。日期沿用原帖显示，未推断年份。</p>
      <ul>${c.sources.map(x=>`<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ↗</a>
        ${x.author?`<small>${esc(x.author)} · ${esc(x.date)}</small>`:''}<p>${esc(x.note)}</p></li>`).join('')}</ul>
    </details>
    <details><summary>图片来源与许可</summary><ul>${Object.entries(c.spots).filter(([,s])=>s.imageCredit).map(([name,s])=>`<li>${esc(name)}：<a href="${esc(s.imageCredit.url)}" target="_blank" rel="noopener noreferrer">${esc(s.imageCredit.author)} · ${esc(s.imageCredit.license)}</a></li>`).join('')}</ul></details>
  </aside>`;
}
function viewS1(){
  const on = memActive();
  const r = ensureRun();
  const genBits = [];
  if(S.rag && S.rag.matches.length) genBits.push(`检索到 ${S.rag.matches.length} 篇相似攻略`);
  if(S.gen && S.gen.candidates) genBits.push(`大模型提名 ${S.gen.candidates.length} 个候选`);
  else if(S.gen && S.gen.llmNote) genBits.push('候选走本地评分');
  return `
  <div class="screen">
    <div class="screen-head">
      <span class="eyebrow">S1 · 路线推荐（算法排线）</span>
      <h2>${esc(S.req.dest)} ${S.req.days} 天 · 三套风格方案</h2>
      <p>${on
        ? `已读取你的 <b>${memCount()}</b> 条记忆，选点与排序都按偏好计算。带 🧠 的安排可查看记忆来源。`
        : '目前没有记忆参与——<b>这三套和任何通用工具给的没有区别</b>。去详情页表个态，第二次就不一样了。'}
      ${genBits.length ? `<span class="gen-bits">${genBits.map(x=>`<i>${esc(x)}</i>`).join('')}</span>` : ''}
      <span class="head-actions">
        <button class="mini-link" data-act="go" data-screen="s0">← 修改需求</button>
        <button class="mini-link" data-act="go" data-screen="guide">📖 看相似攻略</button>
      </span>
    </div>
    ${cityGuide()}
    <div class="plan-grid">${plans().map(planCard).join('')}</div>
    <div class="semantic-note">
      <span><b>✓ 已选择</b> 记为正反馈</span>
      <span><b>○ 跳过</b> 中性，未选择 ≠ 不喜欢</span>
      <span><b>✕ 不喜欢</b> 只有显式点踩才记为负反馈</span>
    </div>
  </div>`;
}

/* ============================ S2 ============================ */
function stanceCtl(key, kind){
  const st = S.stance[key] || {};
  const open = S.openReason === key;
  const dir = st.v;
  let html = `<div class="stance">
    <button class="thumb up ${dir==='up'?'on':''}" data-act="thumb" data-key="${key}" data-kind="${kind}" data-v="up">👍 喜欢</button>
    <button class="thumb down ${dir==='down'?'on':''}" data-act="thumb" data-key="${key}" data-kind="${kind}" data-v="down">👎 不喜欢</button>
    ${st.reason ? `<span class="hintx">原因：${esc(st.reason)}</span>` : ''}
  </div>`;

  if(open && dir){
    const pool = (REASONS[dir]||{})[kind] || [];
    html += `<div class="reasons">
      <div class="rq">${dir==='down'?'哪里不合适？（点一个，立刻变成记忆）':'哪里对了？（点一个，立刻变成记忆）'}</div>
      <div class="reason-chips">
        ${pool.map(r=>`<button class="rchip ${st.reason===r?'on':''}" data-act="reason" data-key="${key}" data-kind="${kind}" data-r="${esc(r)}">${esc(r)}</button>`).join('')}
      </div>
      <button class="free-toggle" data-act="freetoggle" data-key="${key}">${S.openFree[key]?'收起':'＋ 补充一句（可选）'}</button>
      ${S.openFree[key] ? `<textarea class="free-text" placeholder="比如：这类馆子我一进去就头晕，下次别排了" data-act="freetext" data-key="${key}">${esc(st.note||'')}</textarea>` : ''}
    </div>`;
  }
  if(st.reason){
    const mm = REASON_TO_MEMORY[st.reason];
    if(mm) html += `<div class="learned-hint">🧠 已记入记忆：${esc(mm.text)} · 作用域「长期」（可在记忆中心改）</div>`;
  }
  return html;
}

/** 商业化推荐组：只给区域 + 3-4 个候选类型，不给店名地址 */
function recGroup(g, ic, kindLbl){
  return `<div class="rec-group">
    <div class="rg-head">
      <span class="rg-ic">${ic}</span>
      <div class="rg-t">
        <div class="rg-area">${esc(g.area)} · ${esc(g.theme)}</div>
        <div class="rg-sub">${esc(g.note || g.walk || '')}</div>
      </div>
      <span class="rg-note" title="只推荐区域与类型，不指定具体门店">只给${kindLbl} · ${g.picks.length} 个候选</span>
    </div>
    <div class="rg-picks">
      ${g.picks.map(k=>`
        <div class="pick">
          <div class="p1">
            <span class="pstyle">${esc(k.style)}</span>
            ${Number.isFinite(k.score) ? `<span class="pscore">${k.score}<i>${stars(k.score)}</i></span>` : '<span class="muted">类型建议</span>'}
          </div>
          <div class="p2">
            <span class="tag">${esc(k.cuisine || k.room)}</span>
            <span class="price">${k.room ? '' : '人均 '}${esc(k.price)}</span>
          </div>
          <div class="p3">${esc(k.note)}</div>
          <div class="p4">${esc(k.src)}${Number.isFinite(k.count) ? ` · ${k.count} 条评价` : ''}</div>
        </div>`).join('')}
    </div>
    <div class="rg-tip">具体选哪家由你定 · 需要时可按候选类型再筛一轮</div>
  </div>`;
}

function itemView(it, day){
  const key = `d${day}-${it.id}`;
  const isFood = it.kind === 'food';
  const isFree = it.kind === 'free';
  const g = isFood ? dining()[it.name] : null;
  const sp = (!isFood && !isFree) ? spots()[it.name] : null;
  const nm = isFood ? g.area : it.name;
  const kindLbl = isFood ? '餐饮' : isFree ? '空档' : '景点';
  const hoverName = isFood ? (restPoi()[it.name]||'') : (isFree ? '' : it.name);

  return `
  <div class="tl-item ${it.kind} ${(it.memoryIds&&it.memoryIds.length&&memActive())?'mem':''}"
       data-act="hoverit" data-name="${esc(hoverName)}">
    <div class="tl-time">${esc(it.time)}</div>
    <div class="tl-body">
      <span class="tl-dot"></span>
      <div class="it-main">
        ${sp ? spotThumb(it.name, 'sm') : ''}
        <div class="it-txt">
          <div class="it-title">
            <span class="nm">${esc(nm)}</span>
            <span class="kind ${it.kind}">${kindLbl}</span>
            ${it.dur ? `<span class="dur">${esc(it.dur)}</span>` : ''}
          </div>
          ${sp ? `
            <div class="sp-meta">
              ${Number.isFinite(sp.score) ? `<span class="sp-score">${sp.score}</span><span class="sp-stars">${stars(sp.score)}</span>` : ''}
              <span class="sp-src">${esc(sp.src)}${Number.isFinite(sp.count) ? ` · ${sp.count} 条评价` : ''}</span>
            </div>
            <div class="sp-intro">${esc(sp.intro)}</div>
            ${sp.sourceUrl?`<a class="spot-source" href="${esc(sp.sourceUrl)}" target="_blank" rel="noopener noreferrer">景点资料 ↗</a>`:''}
            ${sp.imageCredit?`<div class="image-credit">图片：<a href="${esc(sp.imageCredit.url)}" target="_blank" rel="noopener noreferrer">${esc(sp.imageCredit.author)} · ${esc(sp.imageCredit.license)}</a></div>`:''}
            <div class="sp-tags">${sp.tags.map(t=>{
              const good = /安静|庭园|竹林|人少|免费|傍晚好|清晨好|雨天可|可久坐|自然|苔庭|世界遗产|国宝|本地/.test(t);
              const warn = /人多|费体力|体力活|游客向|动线长|闭园早|坡道|爬山/.test(t);
              return `<span class="tag ${good?'good':''}${warn?' warn':''}">${esc(t)}</span>`;
            }).join('')}</div>` : ''}
          ${it.note ? `<div class="it-note">${esc(it.note)}</div>` : ''}
          ${memTag(it.memoryIds, null, { block:true })}
        </div>
      </div>
      ${g ? recGroup(g, '🍜', '餐饮区域') : ''}
      ${stanceCtl(key, isFood ? 'food' : isFree ? 'free' : 'spot')}
    </div>
  </div>`;
}

function mapPanel(){
  const it = itin();
  const day = it.days.find(d => d.day === S.s2day) || it.days[0];
  const routeDays = it.days.map(d => d.items
    .map(i => i.kind === 'food' ? restPoi()[i.name] : (i.kind === 'free' ? null : i.name))
    .filter(n => n && poi()[n]));
  return `
  <div class="map-col">
    <div class="card map-panel">
      <h4>🗺 全程概览<span class="mini-lbl">${it.days.length} 天 · 按天配色 · 点击切换</span></h4>
      ${overviewMap(routeDays, { highlightDay: S.s2day })}
      <div class="day-switch">
        ${routeDays.map((d,i)=>`<button class="${S.s2day===i+1?'on':''}" data-act="s2day" data-d="${i+1}"><i style="background:${DAY_C[i]}"></i>D${i+1}</button>`).join('')}
      </div>
    </div>

    <div class="card map-panel">
      <h4>📍 第 ${day.day} 天动线<span class="mini-lbl">${esc(day.theme)}</span></h4>
      ${dayMap(day)}
      <div class="map-legend">
        <span><i style="background:var(--clay)"></i>景点</span>
        <span><i style="background:var(--green)"></i>餐饮区域</span>
        ${memActive()?'<span><i style="background:var(--indigo)"></i>记忆影响</span>':''}
      </div>
      <div class="day-switch">
        ${it.days.map(d=>`<button class="${d.day===S.s2day?'on':''}" data-act="s2day" data-d="${d.day}">D${d.day}</button>`).join('')}
      </div>
    </div>
    <p class="map-disclaim">${city()?.geo ? '底图 © OpenStreetMap；点位为景点参考位置，非入口导航。虚线连接游览顺序，不代表实际道路。' : '示意图，非真实比例；点位为区域中心，不代表具体门店位置。'}</p>
  </div>`;
}

function viewS2(){
  const it = itin();
  const on = memActive();
  const plan = plans().find(p => p.id === it.planId) || plans()[0];
  return `
  <div class="screen">
    <div class="screen-head">
      <span class="eyebrow">S2 · 攻略详情</span>
      <h2>${esc(plan.style)} · ${esc(S.req.dest)} ${it.days.length} 天</h2>
      <p>${on
        ? '每个带 🧠 的安排都能点开看它是哪条记忆推出来的。餐饮住宿只给区域和候选类型，具体挑哪家你决定。'
        : '对下面任意<b>景点 / 某天节奏 / 餐饮</b>点 👍👎 并选个原因，右栏会当场长出记忆。'}</p>
    </div>
    ${cityGuide()}
    <div class="s2-grid">
      <div>
        <div class="card stay-card">
          <div class="sc-head">
            <span class="ic">🏨</span>
            <div style="flex:1">
              <div class="t">${esc(it.stay.area)} · ${esc(it.stay.theme)}</div>
              <div class="s">${esc(it.stay.note)}</div>
              ${memTag(it.stay.memoryIds, null, { block:true })}
            </div>
          </div>
          ${recGroup(it.stay, '🛏', '住宿区域')}
          ${stanceCtl('stay', 'stay')}
        </div>

        ${it.days.map(d => `
          <div class="card day">
            <div class="day-head">
              <div class="day-badge"><b>D${d.day}</b><small>${esc(d.date)}</small></div>
              <div>
                <div class="dt">${esc(d.theme)}</div>
                <div class="dm">
                  <span>${esc(d.paceNote)}</span>
                  <span>· ${d.items.filter(i=>i.kind==='spot').length} 个景点</span>
                </div>
              </div>
              <div class="right">
                <span class="pace-mini">${[1,2,3,4,5].map(i=>`<i class="${i<=d.pace?'on':''} ${d.pace>=4&&i<=d.pace?'hi':''}"></i>`).join('')}</span>
              </div>
            </div>
            <div style="padding:10px 15px 0">
              ${memTag(d.memoryIds, null, { block:true })}
              <div style="font-size:11.5px;color:var(--ink-3);margin-top:6px">这一天的节奏：</div>
              ${stanceCtl(`day${d.day}`, 'pace')}
            </div>
            <div class="tl">${d.items.map(i => itemView(i, d.day)).join('')}</div>
          </div>`).join('')}

        <div style="display:flex;gap:10px;margin-top:4px">
          <button class="btn" data-act="go" data-screen="s5">看看记忆改了哪些 →</button>
          <button class="btn sec" data-act="go" data-screen="s1">← 回方案对比</button>
          <button class="btn sec" data-act="back">← 返回上一屏</button>
        </div>
      </div>
      ${mapPanel()}
    </div>
  </div>`;
}

/* ============================ 生成中（流水线可视） ============================
   「检索攻略 → LLM 候选 → 算法排线」三步原来全是瞬间完成、用户无感知。
   这屏把三步摊开讲清楚，也顺便撑住 LLM 网络等待的时间。 */
function viewGenerating(){
  const steps = [
    ['1', '检索相似攻略（RAG）', '目的地 + 出发季节 + 天数 做硬约束过滤，偏好与强度做软排序'],
    ['2', '大模型提名候选', '从 50+ 候选池里按你的记忆偏好提名，越界提名会被闸门丢弃'],
    ['3', '算法排线', '分天聚类 + 2-opt 优化通勤 + 按游玩/通勤时间排时刻表，放不下自动回退']
  ];
  return `
  <div class="screen gen-screen">
    <div class="gen-card">
      <div class="gen-title"><span class="spin"></span> 正在为「${esc(S.req.dest)} · ${S.req.days} 天」计算路线</div>
      <div class="gen-steps">
        ${steps.map(([n, t, d]) => `
          <div class="gen-step ${S.gen && S.gen.step >= +n ? 'on' : ''} ${S.gen && S.gen.step > +n ? 'done' : ''}">
            <div class="gs-num">${S.gen && S.gen.step > +n ? '✓' : n}</div>
            <div class="gs-t">${esc(t)}</div>
            <div class="gs-d">${esc(d)}</div>
          </div>`).join('')}
      </div>
      ${S.gen && S.gen.llmNote ? `<div class="gen-note">${esc(S.gen.llmNote)}</div>` : ''}
    </div>
  </div>`;
}

/* ============================ 攻略参考（RAG） ============================
   硬约束：目的地 / 出发时间→季节与天气 / 天数。
   软排序：偏好（人文历史/自然风光）+ 强度（特种兵/闲庭漫步）。
   LLM 可用时按 RAG 提示词改写；不可用时本地模板合成——两者都标注来源。 */
function ragConstraintChips(){
  const rag = S.rag;
  if(!rag) return '';
  const chips = [
    `📍 ${esc(rag.city)}`,
    `📅 ${esc(rag.date)} · ${esc(rag.season.label || '')}`,
    `🌤 ${esc(rag.season.weather || '天气以出行前预报为准')}`,
    `⏱ ${rag.days} 天`,
    `🎯 ${rag.interest === 'culture' ? '人文历史' : rag.interest === 'nature' ? '自然风光' : '两者兼顾'}`,
    `⚡ ${rag.intensity === 'fast' ? '特种兵' : rag.intensity === 'slow' ? '闲庭漫步' : '适中'}`
  ];
  return `<div class="rag-chips">${chips.map(c => `<span>${c}</span>`).join('')}</div>`;
}

function viewGuide(){
  let rag = S.rag;
  if(!rag){
    // 首次进入或需求已变更：按当前需求现检索（纯本地、同步、无网络）
    rag = S.rag = TourisRAG.retrieve({
      city: S.req.dest, date: S.req.date, days: S.req.days,
      interest: S.req.interest, intensity: S.req.intensity
    });
  }
  const matches = rag.matches;
  return `
  <div class="screen">
    <div class="screen-head">
      <span class="eyebrow">G · 攻略参考（RAG）</span>
      <h2>和这次出行最像的 ${matches.length} 篇攻略</h2>
      <p>先按<b>目的地、季节、天数</b>三道硬约束过滤语料，再按你的<b>偏好与强度</b>排序。${rag.relaxed.length ? `<span class="warn-chip">「${esc(rag.relaxed.join('、'))}」约束已放宽补齐</span>` : ''}</p>
      ${ragConstraintChips()}
      <span class="head-actions">
        <button class="mini-link" data-act="go" data-screen="s0">← 修改需求</button>
        <button class="mini-link" data-act="go" data-screen="s1">下一步：看方案 →</button>
      </span>
    </div>

    <div class="rag-grid">
      ${matches.map((m, i) => `
        <div class="rag-card" data-reveal>
          <div class="rg-rank">#${i + 1}</div>
          <div class="rg-body">
            <div class="rg-title">${esc(m.guide.title)}</div>
            <div class="rg-meta">
              <span class="tag">${esc(m.guide.source)}</span>
              <span class="tag">${(m.guide.styles || []).join(' / ')}</span>
              <span class="tag">${esc(m.guide.intensity)}</span>
              <span class="tag">${m.guide.days[0]}${m.guide.days[0] !== m.guide.days[1] ? '—' + m.guide.days[1] : ''} 天</span>
            </div>
            <p class="rg-sum">${esc(m.guide.summary)}</p>
            <div class="rg-why">匹配：${(m.reasons || []).map(x => `<i>${esc(x)}</i>`).join('') || '硬约束命中'}${m.relaxed ? '<i class="dim">放宽月份/天数补齐</i>' : ''}</div>
            <a class="rg-link" href="${esc(m.guide.url)}" target="_blank" rel="noopener noreferrer">查看原文 ↗</a>
          </div>
        </div>`).join('')}
    </div>

    <div class="card rag-composed">
      <div class="rc-head">
        <h3>📖 为你合成的 ${rag.days} 天攻略</h3>
        <span class="rc-badge ${rag.llm ? 'llm' : 'local'}">${rag.llm ? '🤖 大模型改编 · 基于 RAG 检索结果' : '📋 本地模板合成 · 基于 RAG 检索结果'}</span>
      </div>
      <div class="rc-title">${esc(rag.composed.title)}</div>
      <p class="rc-overview">${esc(rag.composed.overview)}</p>
      <div class="rc-daily">
        ${rag.composed.daily.map((d, i) => `
          <div class="rc-day">
            <div class="rc-dayhead"><b>D${i + 1}</b> ${esc(d.title)}</div>
            <div class="rc-slot"><i>上午</i>${esc(d.morning)}</div>
            <div class="rc-slot"><i>下午</i>${esc(d.afternoon)}</div>
            <div class="rc-slot"><i>傍晚</i>${esc(d.evening)}</div>
          </div>`).join('')}
      </div>
      ${rag.composed.tips.length ? `<div class="rc-tips"><b>出行提示</b><ul>${rag.composed.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      <div class="rc-based">来源：${rag.composed.basedOn.map(t => `《${esc(t)}》`).join('、') || '语料库'}${rag.llmNote ? ` · ${esc(rag.llmNote)}` : ''}</div>
    </div>

    <div class="guide-foot">
      <button class="btn" data-act="go" data-screen="s1">按这些偏好看算法方案 →</button>
      <button class="btn sec" data-act="go" data-screen="s0">← 调整需求重检索</button>
    </div>
  </div>`;
}

/* ============================ S5 ============================ */
function itemKey(i){ return i.kind === 'free' ? 'free' : i.name; }
function itemLabel(i){ return i.kind === 'food' ? dining()[i.name].area : i.name; }

/** 逐日 diff 按天对齐默认版与记忆版的逐日安排；day:0 的两处是全局，走下面的清单 */
function dayDiffMap(day){
  const m = {};
  diffs().forEach(x => { if(x.day !== 0 && (!day || x.day === day)) m[x.target] = x; });
  return m;
}

function cmpDay(idx){
  const on = memActive();
  const r = ensureRun();
  if(!r) return '';
  const planId = itinPlanId();
  const dp = r.def.byId[planId], mp = r.mem.byId[planId];
  const baseDef = dp ? dp.itinerary : null, baseMem = mp ? mp.itinerary : null;
  if(!baseDef || !baseMem || !baseDef.days[idx] || !baseMem.days[idx]) return '';
  const src = on ? baseMem.days[idx] : baseDef.days[idx];
  const def = baseDef.days[idx];
  const tg = dayDiffMap(idx+1);

  const rows = src.items.map(i => {
    const x = on ? tg[itemKey(i)] : null;
    const flag = (x && x.kind !== 'removed') ? x.kind : '';
    return `<div class="cmp-it ${i.kind} ${flag ? 'd-' + flag : ''}" ${flag ? 'data-diff="1"' : ''}>
      ${flag ? `<span class="dflag">${flag === 'added' ? '新增' : '调整'}</span>` : ''}
      <div class="t">${esc(i.time)}</div>
      <div class="n">${esc(itemLabel(i))}</div>
      ${i.dur ? `<div class="k">${esc(i.dur)}</div>` : ''}
      ${on ? memTag(i.memoryIds, null, {}) : ''}
    </div>`;
  }).join('');

  const ghosts = on ? def.items.filter(i => {
    const x = tg[itemKey(i)];
    return x && x.kind === 'removed';
  }).map(i => `<div class="cmp-it d-ghost" data-diff="1">
      <span class="dflag">砍掉</span>
      <div class="t">${esc(i.time)}</div><div class="n">${esc(itemLabel(i))}</div></div>`).join('') : '';

  return `<div class="cmp-day">
    <h5>D${src.day} ${esc(src.theme)}<span class="d">${esc(src.date)}</span></h5>
    <div class="cmp-list">${rows}${ghosts}</div>
  </div>`;
}

function viewS5(){
  const on = memActive();
  const n = memCount();
  return `
  <div class="screen">
    <div class="s5-top">
      <div class="big-switch">
        <button class="${!on?'on':''}" data-act="s5mode" data-v="off">🗒 默认推荐</button>
        <button class="mem ${on?'on':''}" data-act="s5mode" data-v="on" ${n===0?'disabled':''}>🧠 使用记忆</button>
      </div>
      <div class="s5-hint">${n===0
        ? '当前档案 0 条记忆——切到「林小满」再看这一屏'
        : '同一套系统、同一份需求，只是喂进去的人不同'}</div>
    </div>

    ${on ? `
      <div class="stats-bar s5-stats">
        <span class="n">${diffs().length}</span>
        <div class="tx">记忆改变了本次 <b>${diffs().length} 处</b>安排：${esc((ensureRun() || {}).diffSummary || '见下方逐条变化。')}</div>
        <button class="replay" data-act="replay">重播动画</button>
      </div>` : `
      <div class="stats-bar plain s5-stats">
        <span class="n">0</span>
        <div class="tx">没有任何记忆参与。这是<b>通用默认版</b>——把开关拨到「使用记忆」，看 ${diffs().length} 处变化逐个亮起。</div>
      </div>`}

    <div class="cmp-grid">${itin().days.map((_,i)=>cmpDay(i)).join('')}</div>

    ${on ? `<div class="diff-list">
      ${diffs().map(x => `
        <div class="diff-row ${x.kind}" data-diffrow="1">
          <span class="kk">${x.kind==='removed'?'砍掉':x.kind==='added'?'新增':'调整'}</span>
          <div style="flex:1;min-width:0">
            <div class="dt">${esc(x.text)}</div>
            ${x.from?`<div class="fromto"><s>${esc(x.from)}</s> → <b>${esc(x.to)}</b></div>`:''}
            <div class="tags-mem">${x.memoryIds.map(id=>{
              const m = memById(id); return m ? memTag([id], m.text.slice(0,16)) : ''; }).join('')}</div>
          </div>
          <span class="dayk">${x.day===0?'全局':'D'+x.day}</span>
        </div>`).join('')}
    </div>` : ''}

    <div class="closing">
      <div class="q">“这些记忆换个 App 带不走。”</div>
      <div class="s">这就是它抄不走、你离不开的原因。</div>
      <div class="row">
        <button class="btn" data-act="present">进入全屏演示 F</button>
        <button class="btn sec" data-act="go" data-screen="s2">← 回攻略详情</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- 渲染总入口 ---------------- */
let heroSlideTimer = null;
let _currentScreen = null;   // 上次的 screen,用来检测 screen 是否真的变了
let _rendering = false;      // 防重入:过渡中不再次触发

function render(){
  if(_rendering){ _deferredRender = true; return; }

  const newScreen = S.screen;
  const screenChanged = _currentScreen !== null && _currentScreen !== newScreen;

  if(screenChanged){
    _transitionRender();
  }else{
    _doRender();
  }
}

let _deferredRender = false;
async function _transitionRender(){
  _rendering = true;
  _deferredRender = false;

  const work = $('work');
  const top = $('topbar');
  const shell = $('shell');

  // 1) 淡出
  if(work){ work.classList.add('page-fade-out'); }
  if(top && !top.classList.contains('home-top')){ top.classList.add('top-fade'); }

  await new Promise(r => setTimeout(r, 170));

  // 2) 真正渲染
  _doRender();

  // 3) 淡入
  requestAnimationFrame(() => {
    if(work){
      work.classList.remove('page-fade-out');
      work.classList.add('page-fade-in');
      // 让浏览器应用 .page-fade-in,再清掉
      requestAnimationFrame(() => {
        work.classList.remove('page-fade-in');
      });
    }
    if(top){ top.classList.remove('top-fade'); }
  });

  await new Promise(r => setTimeout(r, 280));
  _rendering = false;

  if(_deferredRender){ _deferredRender = false; _transitionRender(); }
}

function _doRender(){
  if(globalThis.TourisMaps) TourisMaps.dispose();
  // 停止旧的 hero 轮播
  if(heroSlideTimer){ clearInterval(heroSlideTimer); heroSlideTimer = null; }

  if(S.screen === 'home'){
    document.body.classList.add('home-mode');
    renderTop();
    $('topbar').classList.add('home-top');
    $('railLeft').innerHTML = '';
    $('work').innerHTML = viewHome();
    // 滚动揭示 + Hero 轮播
    requestAnimationFrame(() => {
      setupScrollReveal();
      startHeroSlides();
      bindHomeScrollNav();
    });
    _currentScreen = 'home';
    return;
  }
  document.body.classList.remove('home-mode');
  $('topbar').classList.remove('home-top');
  renderTop(); renderLeft();
  const map = { s0:viewS0, s1:viewS1, s2:viewS2, s5:viewS5, guide:viewGuide, generating:viewGenerating };
  $('work').innerHTML = (map[S.screen] || viewS0)();
  if(globalThis.TourisMaps) TourisMaps.mount();
  if(S.screen !== 'home') setupScrollReveal();
  if(S.screen === 's5' && memActive() && !S.diffPlayed) playDiff();
  _currentScreen = S.screen;
}

/* ---------------- Hero 滑动控制器 ---------------- */
let _heroState = { idx: 0, paused: false, timer: null };

function startHeroSlides(){
  const slides = document.querySelectorAll('#heroSlides .hs');
  const dots = document.querySelectorAll('#heroDots .hc-dot');
  if(!slides.length) return;
  const total = slides.length;
  _heroState = { idx: 0, paused: false, timer: null };

  const go = (i) => {
    const n = ((i % total) + total) % total;
    if(n === _heroState.idx) return;
    _heroState.idx = n;
    slides.forEach((s,k) => {
      s.classList.toggle('on', k === n);
      s.style.zIndex = k === n ? 2 : 1;
    });
    dots.forEach((d,k) => d.classList.toggle('on', k === n));
  };

  const next = () => go(_heroState.idx + 1);
  const prev = () => go(_heroState.idx - 1);

  // 自动播放
  const autoPlay = () => {
    if(_heroState.timer) clearInterval(_heroState.timer);
    _heroState.timer = setInterval(() => {
      if(!_heroState.paused) next();
    }, 5000);
  };
  autoPlay();

  const hero = document.querySelector('#hero');

  /* 切到后台标签页时暂停，回来接着放。
     原先是「鼠标悬停在 hero 上就暂停」——可 hero 是整屏（100vh），
     鼠标随便动一下就永远落在它上面，自动播放等于直接失效。
     以前还有个播放键能看出来、能点回来，现在控制台只剩进度条了，
     再留着这个会变成「轮播莫名其妙不动」。 */
  document.addEventListener('visibilitychange', () => { _heroState.paused = document.hidden; });

  // 圆点点击
  dots.forEach(d => d.addEventListener('click', e => {
    e.stopPropagation();
    go(+d.dataset.i);
    _restartAuto();
  }));

  // 键盘:← → 切换
  window.addEventListener('keydown', (e) => {
    if(S.screen !== 'home') return;
    if(e.key === 'ArrowRight'){ next(); _restartAuto(); }
    else if(e.key === 'ArrowLeft'){ prev(); _restartAuto(); }
  });

  // 触摸滑动
  let touchStartX = 0;
  hero?.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  hero?.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if(Math.abs(dx) > 50){
      dx < 0 ? next() : prev();
      _restartAuto();
    }
  });

  _heroGo = go;
}

function _restartAuto(){
  if(_heroState.timer) clearInterval(_heroState.timer);
  _heroState.timer = setInterval(() => {
    if(!_heroState.paused) _heroGo(_heroState.idx + 1);
  }, 5000);
}
let _heroGo = null;
function bindHomeScrollNav(){
  // 首页滚动时顶栏变不透明
  const top = $('topbar');
  const onScroll = () => {
    if(S.screen !== 'home'){ window.removeEventListener('scroll', onScroll, true); return; }
    if(window.scrollY > 60) top.classList.add('scrolled');
    else top.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive:true });
}

/* ---------------- diff 高亮动画 ---------------- */
function playDiff(){
  S.diffPlayed = true;
  const cells = [...document.querySelectorAll('[data-diff="1"]')];
  cells.forEach((el, i) => setTimeout(() => {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    el.scrollIntoView({ block:'nearest', behavior:'smooth' });
  }, 160 + i * 130));
  const rows = [...document.querySelectorAll('[data-diffrow="1"]')];
  rows.forEach((el, i) => setTimeout(() => el.classList.add('in'), 420 + i * 150));
}

/* ---------------- 记忆溯源悬浮卡 ---------------- */
function showPop(btn, ids){
  const list = ids.split(',').map(memById).filter(Boolean);
  if(!list.length) return;
  const pop = $('memPop');
  pop.innerHTML = `<h4>🧠 这条安排来自你的记忆</h4>
    ${list.map(m => `
      <div class="pop-item">
        <div class="pm">${esc(m.text)}</div>
        <div class="ps">${esc(m.source.trip)} · ${esc(m.source.date)}<br>${esc(m.source.action)}${
          m.source.quote?` <span class="q">“${esc(m.source.quote)}”</span>`:''}</div>
        <div class="pf">
          <span class="chip-xs scope ${m.scope==='session'?'session':''}">${m.scope==='session'?'仅本次':'长期'}</span>
          <span class="chip-xs">被引用 ${m.cited} 次</span>
          <span class="goto">右栏已高亮 →</span>
        </div>
      </div>`).join('')}`;
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = 308, h = pop.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - w - 14);
  let top = r.bottom + 8;
  if(top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 8);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  S.memHit = list.map(m => m.id);
  renderLeft();
  const first = document.getElementById('mc-' + S.memHit[0]);
  if(first) first.scrollIntoView({ block:'center', behavior:'smooth' });
}
function hidePop(){
  $('memPop').hidden = true;
  if(S.memHit.length){ S.memHit = []; renderLeft(); }
}

/* ---------------- 把反馈变成记忆 ---------------- */
function learn(reason, kind){
  const rule = REASON_TO_MEMORY[reason];
  if(!rule) return null;
  const exist = S.learned.find(m => m.text === rule.text);
  if(exist){ exist.cited++; return exist; }
  const m = {
    id: 'n' + (S.learned.length + 1),
    text: rule.text, type: rule.type, scope: 'long', cited: 1, used: true,
    source: {
      trip: `${S.req.date.slice(0,7)} ${S.req.dest} ${S.req.days} 天`,
      date: S.req.date,
      action: `你在本次攻略里对${kind === 'food' ? '一处餐饮区域' : kind === 'pace' ? '某天节奏' : kind === 'stay' ? '住宿区域' : '一个安排'}表了态`,
      quote: reason
    }
  };
  /* ★ 规则里的语义标签必须一起带上。

     判断依据是标签不是措辞（见 semantics.js）。新学的记忆要是不带标签，它
     就是死的：照样显示在记忆页、照样让计数 +1、照样进「已积累 N 条记忆」，
     却推不出任何约束——「表态 → 学到记忆 → 推荐改变」这条闭环会断在最后
     一步，而且界面上完全看不出来。
     _verify-cities.js 的「反馈减点不减天」就是盯这一条的。 */
  if(rule.pace)   m.pace   = rule.pace;
  if(rule.avoid)  m.avoid  = [].concat(rule.avoid);
  if(rule.prefer) m.prefer = [].concat(rule.prefer);
  S.learned.push(m);
  return m;
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', e => {
  if(e.target.closest('#memPop')) return;
  const t = e.target.closest('[data-act]');
  if(!t){ hidePop(); if(ACCT_OPEN) toggleAcctMenu(false); return; }
  const act = t.dataset.act;
  if(act !== 'pop') hidePop();
  // 点在下拉以外 → 收起下拉（下拉内部按钮不受影响）
  if(ACCT_OPEN && act !== 'acctmenu' && !e.target.closest('.acct-menu')) toggleAcctMenu(false);

  // Home 专属事件优先拦截
  if(S.screen === 'home' || ['home','start','quick','dest','demo','scroll'].includes(act)){
    if(bindHomeAct(t)) return;
  }

  switch(act){
    case 'acctmenu':
      toggleAcctMenu();
      break;
    case 'acctpick':
      switchAccount(t.dataset.id || null);
      break;
    case 'back':
      goBack();
      break;
    case 'reset': {
      if(confirm('清空本机全部记忆数据？\n\n这会删除所有本地数据，且无法撤销。预置档案会重新播种。')){
        resetAll();
        S.session = { mode:'guest', id:null };
        S.learned = [];
        ACCT_OPEN = false;
        invalidateRun();
        render();
        toast('本地数据已清空');
      }
      break;
    }
    case 'memsw':
      S.memoryOn = !S.memoryOn;
      S.diffPlayed = false;
      render();
      toast(S.memoryOn ? '记忆已开启，推荐重新生成' : '记忆已关闭，回到通用默认推荐', S.memoryOn ? 'mem' : '');
      break;
    case 's5mode': {
      const want = t.dataset.v === 'on';
      if(want === S.memoryOn) break;
      S.memoryOn = want; S.diffPlayed = false; render();
      break;
    }
    case 'replay': S.diffPlayed = false; render(); break;
    case 'go': {
      const target = t.dataset.screen;
      if(target === 's5') S.diffPlayed = false;
      if(target === 'guide' && S.rag && (S.req.interest !== S.rag.interest || S.req.days !== S.rag.days)) {
        // 需求变了就重检索，别拿旧结果忽悠人
        S.rag = null;
      }
      goScreen(target);
      break;
    }
    case 'submit': {
      const d = $('f-dest'), dt = $('f-date'), dy = $('f-days'), pp = $('f-people');
      const fi = $('f-interest'), fx = $('f-intensity');
      if(d){
        const dest = d.value.trim() || '成都';
        S.req.dest = Object.keys(CITY_DATA).includes(dest) ? dest : '成都';
        if(dest !== S.req.dest) toast(`当前演示已支持 ${Object.keys(CITY_DATA).join('、')}，先为你显示成都。`);
      }
      if(dt) S.req.date = dt.value || S.req.date;
      if(dy) S.req.days = +dy.value;
      if(pp) S.req.people = +pp.value;
      if(fi) S.req.interest = fi.value;
      if(fx) S.req.intensity = fx.value;

      S.demoStep = 2;
      startPipeline();
      break;
    }
    case 'initwiz':
      toast('想看更完整的档案？点右上角身份下拉，切换到「林小满 / 陈铁腿 / 周晚晚」。');
      break;
    case 'present':
      document.body.classList.toggle('present');
      break;

    /* S1 表态 */
    case 'pick': {
      const id = t.dataset.id;
      if(S.planStance[id] === 'chosen'){ S.demoStep = 3; goScreen('s2'); break; }
      Object.keys(S.planStance).forEach(k => { if(S.planStance[k] === 'chosen') delete S.planStance[k]; });
      S.planStance[id] = 'chosen';
      S.chosenPlan = id;
      render();
      toast('已选择这套方案 · 记为正反馈');
      break;
    }
    case 'skip':
      S.planStance[t.dataset.id] = S.planStance[t.dataset.id] === 'skipped' ? undefined : 'skipped';
      render();
      toast('已跳过。<b>未选择 ≠ 不喜欢</b>，不会记为负反馈。');
      break;
    case 'pdown': {
      const id = t.dataset.id;
      S.planStance[id] = S.planStance[id] === 'disliked' ? undefined : 'disliked';
      render();
      if(S.planStance[id] === 'disliked') toast('已标记不喜欢 · 这一条会记入记忆', 'mem');
      break;
    }

    /* S2 元素级表态 */
    case 'thumb': {
      const key = t.dataset.key, v = t.dataset.v;
      const cur = S.stance[key];
      if(cur && cur.v === v){ delete S.stance[key]; S.openReason = null; }
      else { S.stance[key] = { v, reason:null, note:cur?cur.note:'' }; S.openReason = key; }
      render();
      break;
    }
    case 'reason': {
      const key = t.dataset.key, kind = t.dataset.kind, r = t.dataset.r;
      const st = S.stance[key] || (S.stance[key] = { v:'down' });
      st.reason = st.reason === r ? null : r;
      let m = null;
      if(st.reason) m = learn(r, kind);
      S.openReason = null;
      render();
      if(m) toast(`这次表态已记入你的旅行偏好：<b>${esc(m.text)}</b>（可在记忆中心改）`, 'mem');
      break;
    }
    case 'freetoggle':
      S.openFree[t.dataset.key] = !S.openFree[t.dataset.key];
      render();
      break;
    case 's2day':
      S.s2day = +t.dataset.d; render(); break;

    case 'pop':
      e.stopPropagation();
      showPop(t, t.dataset.ids);
      break;

    case 'demo': {
      const st = DEMO_STEPS.find(x => x.n === +t.dataset.n);
      S.demoStep = st.n;
      // 演示动线自己决定档案：前 3 步是「空记忆开场」，后 3 步要看到 20 条记忆的档案。
      // 不沿用用户当前会话，否则从任意状态点进来都会跑偏。
      switchAccount(st.seeded ? 'demo' : null);
      S.memoryOn = st.n >= 5 ? true : S.memoryOn;
      if(st.screen === 's5') S.diffPlayed = false;
      if(st.n === 6) document.body.classList.add('present');
      else document.body.classList.remove('present');
      S.screen = st.screen;
      resetScroll();
      render();
      break;
    }
  }
});

/* 自由文本 */
document.addEventListener('input', e => {
  const t = e.target.closest('[data-act="freetext"]');
  if(t){ const st = S.stance[t.dataset.key]; if(st) st.note = t.value; }
});

/* 时间轴 ↔ 当日地图联动 */
document.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-act="hoverit"]');
  const nm = t ? t.dataset.name : null;
  if(nm !== S.hoverItem && S.screen === 's2'){
    S.hoverItem = nm;
    const col = document.querySelector('.map-col');
    if(col && !city()?.geo) col.outerHTML = mapPanel();
    document.querySelectorAll('.tl-item.hovered').forEach(el => el.classList.remove('hovered'));
    if(t) t.classList.add('hovered');
  }
});

/* 快捷键 */
document.addEventListener('keydown', e => {
  if(/input|textarea|select/i.test(e.target.tagName)) return;
  if(e.key === 'f' || e.key === 'F') document.body.classList.toggle('present');
  if(e.key === 'Escape'){ document.body.classList.remove('present'); hidePop(); if(ACCT_OPEN) toggleAcctMenu(false); }
  if(e.key === 'm' || e.key === 'M'){
    if(memCount()){ S.memoryOn = !S.memoryOn; S.diffPlayed = false; render(); }
  }
  if(/^[1-6]$/.test(e.key)){
    const st = DEMO_STEPS.find(x => x.n === +e.key);
    S.demoStep = st.n;
    switchAccount(st.seeded ? 'demo' : null);
    S.memoryOn = st.n >= 5 ? true : S.memoryOn;
    if(st.screen === 's5') S.diffPlayed = false;
    document.body.classList.toggle('present', st.n === 6);
    S.screen = st.screen; resetScroll(); render();
  }
});
/* 缩略图照片：加载成功淡入并盖住占位；失败就摘掉 img，露出 SVG 占位插画。
   load/error 不冒泡，用捕获阶段代理，这样任何时候插入的 img 都能被接住。 */
document.addEventListener('load', e => {
  const img = e.target;
  if(img.tagName === 'IMG' && img.parentElement && img.parentElement.classList.contains('sthumb')){
    img.classList.add('ok');
    img.parentElement.classList.add('has-photo');
  }
}, true);
document.addEventListener('error', e => {
  const img = e.target;
  if(img.tagName === 'IMG' && img.parentElement && img.parentElement.classList.contains('sthumb')){
    img.remove();
  }
}, true);

window.addEventListener('resize', hidePop);
document.addEventListener('wheel', hidePop, { passive:true });

/* 启动：从 localStorage 恢复上次的身份。
   没选过 / 存储不可用 → 保持在游客态（0 记忆），这正是默认行为。 */
S.session = getStoredSession();
try { history.replaceState({ screen: 'home' }, '', location.href); } catch(e) {}

render();
