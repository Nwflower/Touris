/* ==========================================================================
   Touris 知途 · 原型交互层
   单页状态机：S0 需求 → S1 三方案(含概览图) → S2 详情(元素级反馈) → S5 对照 diff
   ========================================================================== */

/* ---------------- 餐饮区域 → 地图点位 ---------------- */
const REST_POI = {
  'r-nishiki':'锦市场', 'r-tsujiri':'祇园花见小路', 'r-pontocho':'先斗町',
  'r-yudofu':'嵯峨野', 'r-demachi':'出町柳桝形商店街', 'r-ichiran':'河原町',
  'r-kyotower':'京都塔', 'r-hotel':'京都站', 'r-kaiseki':'祇园花见小路'
};

/* ---------------- 状态 ---------------- */
const S = {
  screen: 's0',
  persona: 'blank',
  memoryOn: true,
  req: { dest:'京都', date:'2026-10-02', days:4, people:2 },
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
  demoStep: 1
};

/* ---------------- 工具 ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function persona(){ return PERSONAS.find(p => p.id === S.persona); }

function allMemories(){
  const base = persona().hasMemory ? MEMORIES : [];
  return base.concat(S.learned);
}
function memCount(){ return allMemories().length; }
function memById(id){ return allMemories().find(m => m.id === id); }
function memActive(){ return S.memoryOn && memCount() > 0; }

function plans(){ return memActive() ? PLANS_MEMORY : PLANS_DEFAULT; }
function itin(){ return memActive() ? ITIN_MEMORY : ITIN_DEFAULT; }

function usedMemoryIds(){
  if(!memActive()) return [];
  const set = new Set();
  plans().forEach(p => (p.memoryIds||[]).forEach(id => set.add(id)));
  const it = itin();
  (it.stay.memoryIds||[]).forEach(id => set.add(id));
  it.days.forEach(d => {
    (d.memoryIds||[]).forEach(id => set.add(id));
    d.items.forEach(i => (i.memoryIds||[]).forEach(id => set.add(id)));
  });
  DIFFS.forEach(x => x.memoryIds.forEach(id => set.add(id)));
  S.learned.forEach(m => set.add(m.id));
  return [...set].filter(id => memById(id));
}

function toast(html, kind){
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = `<span class="ti">${kind === 'mem' ? '🧠' : '✓'}</span><div>${html}</div>`;
  $('toastWrap').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 240); }, 3400);
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
/* 本机直连 upload.wikimedia.org 不通（整个 wikipedia.org 都不通），
   所以默认经 wsrv.nl 图片代理取图；直连可用的环境把 USE_PROXY 改 false 即可。 */
const USE_PROXY = true;
function photoURL(name){
  const raw = (typeof SPOT_IMG !== 'undefined') ? SPOT_IMG[name] : null;
  if(!raw) return null;
  if(!USE_PROXY) return raw;
  return 'https://wsrv.nl/?url=' + encodeURIComponent(raw.replace(/^https?:\/\//, '')) +
         '&w=960&output=jpg';
}

/** 缩略图：底层始终是 SVG 占位插画，有联网图就盖在上面；加载失败自动露出占位 */
function spotThumb(name, cls, extra){
  const s = SPOTS[name];
  const cat = (s && s.cat) || 'temple';
  const url = photoURL(name);
  return `<div class="sthumb ${cls||''} c-${cat}">
    <svg viewBox="0 0 80 60" preserveAspectRatio="none">${THUMB[cat]||THUMB.temple}</svg>
    ${url ? `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
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
const DAY_C = ['var(--d1)','var(--d2)','var(--d3)','var(--d4)'];

function mapBase(labels){
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
    ${labels ? `<g class="m-lab">
      <text x="4" y="62">岚山</text><text x="18" y="15">金阁寺周边</text>
      <text x="40" y="45">市中心</text><text x="80" y="56">东山</text><text x="56" y="97">伏见</text>
    </g>` : ''}`;
}

/** 概览图：整趟 4 天全部点位，按天配色 */
function overviewMap(routeDays, opt){
  const small = opt && opt.small;
  const paths = routeDays.map((names, di) => {
    const pts = names.map(n => POI[n]).filter(Boolean);
    if(pts.length < 2) return '';
    return `<path class="m-route" style="stroke:${DAY_C[di]}" d="${pts.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')}"/>`;
  }).join('');
  const dots = routeDays.map((names, di) => names.map(n => {
    const p = POI[n]; if(!p) return '';
    return `<circle class="m-dot" cx="${p.x}" cy="${p.y}" r="${small?2.4:2.8}" style="fill:${DAY_C[di]}"/>`;
  }).join('')).join('');
  return `<div class="sim-map ${small?'small':''}">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">${mapBase(!small)}${paths}${dots}</svg>
    ${small ? '' : '<div class="map-scale"><i></i><span>约 2km</span></div>'}
  </div>`;
}

/** 当日动线图：编号点位 + 悬停放大 */
function dayMap(day){
  const pts = [];
  day.items.forEach(i => {
    const nm = i.kind === 'food' ? REST_POI[i.name] : (i.kind === 'free' ? null : i.name);
    const p = nm && POI[nm];
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
    <div class="map-scale"><i></i><span>约 2km</span></div>
  </div>`;
}

/* ---------------- 顶栏 ---------------- */
function renderTop(){
  const n = memCount();
  const swDisabled = n === 0;
  $('topbar').innerHTML = `
    <div class="brand">
      <span class="logo">🧠</span>
      <span>Touris<br><small>MEMORY-DRIVEN TRAVEL</small></span>
    </div>
    <div class="top-sep"></div>
    <div class="persona-sw">
      <span class="lbl">记忆档案</span>
      <div class="seg">
        ${PERSONAS.map(p => `
          <button class="${p.id===S.persona?'on':''}" data-act="persona" data-id="${p.id}" title="${esc(p.desc)}">
            <span class="em">${p.avatar}</span><span>${esc(p.name)}</span>
            ${p.hasMemory ? `<span class="cnt">${MEMORIES.length + (p.id===S.persona?S.learned.length:0)}</span>`
                          : `<span class="cnt">${p.id===S.persona?S.learned.length:0}</span>`}
          </button>`).join('')}
      </div>
    </div>
    <div class="top-right">
      <button class="mem-switch ${S.memoryOn?'':'off'} ${swDisabled?'disabled':''}" data-act="memsw"
        title="${swDisabled?'当前档案没有记忆可用':'开关记忆，观察推荐变化'}">
        <span class="knob"></span>
        <span class="txt">${S.memoryOn ? '使用记忆' : '默认推荐'}</span>
      </button>
      <div class="top-sep"></div>
      <button class="ghost-btn" data-act="saved">已保存行程 2</button>
      <button class="ghost-btn" data-act="present">全屏演示 <span class="kbd">F</span></button>
    </div>`;
}

/* ---------------- 左栏 ---------------- */
function renderLeft(){
  const n = memCount();
  const navs = [
    { id:'s0', step:1, t:'出行需求', tail:'S0' },
    { id:'s1', step:2, t:'三方案对比', tail:'S1' },
    { id:'s2', step:3, t:'攻略详情', tail:'S2' },
    { id:'s5', step:4, t:'再次推荐对照', tail:'S5' }
  ];
  const order = ['s0','s1','s2','s5'];
  const cur = order.indexOf(S.screen);
  const r = S.req;
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
      <p class="rail-title">Demo 动线</p>
      <div class="nav-list">
        ${navs.map((v,i) => `
          <button class="nav-item ${S.screen===v.id?'on':''} ${i<cur?'done':''}" data-act="go" data-screen="${v.id}">
            <span class="step">${i<cur?'✓':v.step}</span>
            <span>${esc(v.t)}</span>
            <span class="tail">${v.tail}</span>
          </button>`).join('')}
      </div>
    </div>`;
}

/* ---------------- 右栏：记忆侧栏 ---------------- */
function renderRight(){
  const list = usedMemoryIds().map(memById).filter(Boolean);
  const head = `
    <div class="rr-head">
      <h3><span class="brain">🧠</span> 本次推荐用到的记忆</h3>
      <p>${memActive()
        ? `共 ${list.length} 条参与了这次推荐 · 每条都可点回它的来源`
        : (memCount()===0 ? '还没有任何记忆。现在的推荐和通用工具没有区别。'
                          : '记忆开关已关闭，这次按默认逻辑推荐。')}</p>
    </div>`;

  let body;
  if(!list.length){
    body = `<div class="rr-body">
      <div class="rr-empty">
        <span class="big">🫥</span>
        ${memCount()===0
          ? '第一次使用，没有历史。<br>去详情页对景点、餐饮、节奏点几个 👍👎，<br>记忆会当场长出来。'
          : '开关已关闭。<br>把顶栏「默认推荐」拨回「使用记忆」，<br>右栏会列出每条起作用的记忆。'}
      </div>
    </div>`;
  }else{
    body = `<div class="rr-body">
      ${list.map(m => {
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
      }).join('')}
    </div>`;
  }
  $('railRight').innerHTML = head + body;
}

/* ---------------- Demo 提词器 ---------------- */
function renderDock(){
  $('demoDock').innerHTML = `
    <span class="dk-lbl">DEMO 动线</span>
    ${DEMO_STEPS.map(s => `
      <button class="dstep ${S.demoStep===s.n?'on':''}" data-act="demo" data-n="${s.n}">
        <span class="n">${s.n}</span><span class="tt">${esc(s.title)}</span>
        <span class="hh">${esc(s.hint)}</span>
      </button>`).join('')}
    <div class="dock-right">
      <span class="kbd">F</span><span class="hh muted" style="font-size:11px">全屏</span>
    </div>`;
}

/* ============================ S0 ============================ */
function viewS0(){
  const n = memCount();
  return `
  <div class="s0-wrap">
    <div class="s0-hero">
      <span class="kicker">🧠 知途 · 老马识途，越走越懂你</span>
      <h1>这次去哪儿？</h1>
      <p class="say">我们<b>不问预算和偏好</b>——你的选择历史会告诉我们。</p>
    </div>

    <div class="card s0-form">
      <div class="f-grid">
        <div class="field"><label>目的地</label><input id="f-dest" value="${esc(S.req.dest)}"></div>
        <div class="field"><label>出发日期</label><input id="f-date" type="date" value="${esc(S.req.date)}"></div>
        <div class="field"><label>游玩天数</label>
          <select id="f-days">${[3,4,5,6].map(d=>`<option ${d===S.req.days?'selected':''}>${d}</option>`).join('')}</select>
        </div>
        <div class="field"><label>人数</label>
          <select id="f-people">${[1,2,3,4].map(d=>`<option ${d===S.req.people?'selected':''}>${d}</option>`).join('')}</select>
        </div>
      </div>

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
        <button class="btn lg" data-act="submit">生成 ${S.req.days} 天行程方案 →</button>
        <span class="muted" style="font-size:12.5px">生成 3 套不同风格，供你对比</span>
      </div>

      <div class="s0-alt">
        <button class="alt-card" data-act="submit">
          <div class="at">直接开始 <span class="pill">推荐</span></div>
          <div class="ad">跳过初始化，从我的选择中积累记忆。第一次也能用。</div>
        </button>
        <button class="alt-card" data-act="initwiz">
          <div class="at">也可以先告诉我你的过往旅行 →</div>
          <div class="ad">旅行记忆初始化：填 2-3 段历史行程，冷启动更准。</div>
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
      <div class="rrow"><span class="rlab">每日步数</span><div class="rval">${walkBars(p.walk)}</div></div>
      <div class="rrow" style="margin-top:6px"><span class="rlab">住宿范围</span><div class="rval stay-val">
        <div class="a">${esc(p.stay.area)}</div><div class="d">${esc(p.stay.dist)}</div></div></div>
      <div class="rrow"><span class="rlab">餐饮策略</span><div class="rval">
        <div class="tags">${p.food.map(f=>`<span class="tag ${/本地|市集|抹茶|精进/.test(f)?'good':''}">${esc(f)}</span>`).join('')}</div></div></div>
    </div>

    <div class="plan-hl">${p.highlights.map(h=>{
      const s = SPOTS[h];
      return `<span class="hl">${esc(h)}${s?`<b>${s.score}</b>`:''}</span>`;
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
function viewS1(){
  const on = memActive();
  return `
  <div class="screen">
    <div class="screen-head">
      <span class="eyebrow">S1 · 首次路线推荐</span>
      <h2>${esc(S.req.dest)} ${S.req.days} 天 · 三套风格方案</h2>
      <p>${on
        ? '同一份需求，因为读了你的 <b>' + memCount() + ' 条记忆</b>，方案排序和内容都变了。带 🧠 的地方都能点开看来源。'
        : '目前没有记忆参与——<b>这三套和任何通用工具给的没有区别</b>。去详情页表个态，第二次就不一样了。'}</p>
    </div>
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
            <span class="pscore">${k.score}<i>${stars(k.score)}</i></span>
          </div>
          <div class="p2">
            <span class="tag">${esc(k.cuisine || k.room)}</span>
            <span class="price">${k.room ? '' : '人均 '}${esc(k.price)}</span>
          </div>
          <div class="p3">${esc(k.note)}</div>
          <div class="p4">${esc(k.src)} · ${k.count} 条评价</div>
        </div>`).join('')}
    </div>
    <div class="rg-tip">具体选哪家由你定 · 需要时可按候选类型再筛一轮</div>
  </div>`;
}

function itemView(it, day){
  const key = `d${day}-${it.id}`;
  const isFood = it.kind === 'food';
  const isFree = it.kind === 'free';
  const g = isFood ? DINING[it.name] : null;
  const sp = (!isFood && !isFree) ? SPOTS[it.name] : null;
  const nm = isFood ? g.area : it.name;
  const kindLbl = isFood ? '餐饮' : isFree ? '空档' : '景点';
  const hoverName = isFood ? (REST_POI[it.name]||'') : (isFree ? '' : it.name);

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
              <span class="sp-score">${sp.score}</span>
              <span class="sp-stars">${stars(sp.score)}</span>
              <span class="sp-src">${esc(sp.src)} · ${sp.count} 条评价</span>
            </div>
            <div class="sp-intro">${esc(sp.intro)}</div>
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
    .map(i => i.kind === 'food' ? REST_POI[i.name] : (i.kind === 'free' ? null : i.name))
    .filter(n => n && POI[n]));
  return `
  <div class="map-col">
    <div class="card map-panel">
      <h4>🗺 全程概览<span class="mini-lbl">${it.days.length} 天 · 按天配色</span></h4>
      ${overviewMap(routeDays)}
      <div class="map-legend">
        ${routeDays.map((d,i)=>`<span><i style="background:${DAY_C[i]}"></i>D${i+1}</span>`).join('')}
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
    <p class="map-disclaim">示意图，非真实比例；点位为区域中心，不代表具体门店位置。</p>
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
        </div>
      </div>
      ${mapPanel()}
    </div>
  </div>`;
}

/* ============================ S5 ============================ */
function itemKey(i){ return i.kind === 'free' ? 'free' : i.name; }
function itemLabel(i){ return i.kind === 'food' ? DINING[i.name].area : i.name; }

/** 逐日 diff 只认 DIFFS 里那几处；day:0 的两处是全局，走下面的清单 */
function dayDiffMap(){
  const m = {};
  DIFFS.forEach(x => { if(x.day !== 0) m[x.target] = x; });
  return m;
}

function cmpDay(idx){
  const on = memActive();
  const src = on ? ITIN_MEMORY.days[idx] : ITIN_DEFAULT.days[idx];
  const def = ITIN_DEFAULT.days[idx];
  const tg = dayDiffMap();

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
      <div class="stats-bar">
        <span class="n">${DIFFS.length}</span>
        <div class="tx">记忆改变了本次 <b>${DIFFS.length} 处</b>安排：砍掉 1 个大型博物馆、午餐从排队连锁换到市集一带、住宿从京都站前换到西阵町屋、新增 1 个早市、每天补 1 段午后休息、清水寺挪到傍晚、日均步行 14.8→8.4km。</div>
        <button class="replay" data-act="replay">重播动画</button>
      </div>` : `
      <div class="stats-bar plain">
        <span class="n">0</span>
        <div class="tx">没有任何记忆参与。这是<b>通用默认版</b>——把开关拨到「使用记忆」，看 ${DIFFS.length} 处变化逐个亮起。</div>
      </div>`}

    <div class="cmp-grid">${[0,1,2,3].map(cmpDay).join('')}</div>

    ${on ? `<div class="diff-list">
      ${DIFFS.map(x => `
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
function render(){
  renderTop(); renderLeft(); renderRight(); renderDock();
  const map = { s0:viewS0, s1:viewS1, s2:viewS2, s5:viewS5 };
  $('work').innerHTML = (map[S.screen] || viewS0)();
  if(S.screen === 's5' && memActive() && !S.diffPlayed) playDiff();
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
  renderRight();
  const first = document.getElementById('mc-' + S.memHit[0]);
  if(first) first.scrollIntoView({ block:'center', behavior:'smooth' });
}
function hidePop(){
  $('memPop').hidden = true;
  if(S.memHit.length){ S.memHit = []; renderRight(); }
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
  S.learned.push(m);
  return m;
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', e => {
  if(e.target.closest('#memPop')) return;
  const t = e.target.closest('[data-act]');
  if(!t){ hidePop(); return; }
  const act = t.dataset.act;
  if(act !== 'pop') hidePop();

  switch(act){
    case 'persona': {
      S.persona = t.dataset.id;
      S.diffPlayed = false;
      S.memHit = [];
      render();
      const p = persona();
      toast(p.hasMemory
        ? `已切到 <b>${esc(p.name)}</b> · ${MEMORIES.length} 条记忆已载入`
        : `已切到 <b>${esc(p.name)}</b> · 0 条记忆，从零开始`, p.hasMemory ? 'mem' : '');
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
    case 'go':
      S.screen = t.dataset.screen;
      if(S.screen === 's5') S.diffPlayed = false;
      render();
      $('work').scrollTop = 0;
      break;
    case 'submit': {
      const d = $('f-dest'), dt = $('f-date'), dy = $('f-days'), pp = $('f-people');
      if(d) S.req.dest = d.value.trim() || '京都';
      if(dt) S.req.date = dt.value || S.req.date;
      if(dy) S.req.days = +dy.value;
      if(pp) S.req.people = +pp.value;
      S.submitted = true; S.screen = 's1'; S.demoStep = 2; render();
      toast(memActive()
        ? `已生成 3 套方案 · <b>${memCount()} 条记忆</b>参与了排序`
        : '已生成 3 套通用方案 · 没有记忆参与', memActive() ? 'mem' : '');
      break;
    }
    case 'initwiz':
      toast('记忆初始化向导是 P2 范围，本原型走「跳过、从选择中积累」这条主路径。');
      break;
    case 'saved':
      toast('已保存行程列表是 P2 范围（S6），本原型未实现。');
      break;
    case 'present':
      document.body.classList.toggle('present');
      break;

    /* S1 表态 */
    case 'pick': {
      const id = t.dataset.id;
      if(S.planStance[id] === 'chosen'){ S.screen = 's2'; S.demoStep = 3; render(); break; }
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
      S.persona = st.persona;
      if(st.n >= 5) S.memoryOn = true;
      if(st.screen === 's5') S.diffPlayed = false;
      if(st.n === 6) document.body.classList.add('present');
      else document.body.classList.remove('present');
      S.screen = st.screen;
      render();
      $('work').scrollTop = 0;
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
    if(col) col.outerHTML = mapPanel();
    document.querySelectorAll('.tl-item.hovered').forEach(el => el.classList.remove('hovered'));
    if(t) t.classList.add('hovered');
  }
});

/* 快捷键 */
document.addEventListener('keydown', e => {
  if(/input|textarea|select/i.test(e.target.tagName)) return;
  if(e.key === 'f' || e.key === 'F') document.body.classList.toggle('present');
  if(e.key === 'Escape'){ document.body.classList.remove('present'); hidePop(); }
  if(e.key === 'm' || e.key === 'M'){
    if(memCount()){ S.memoryOn = !S.memoryOn; S.diffPlayed = false; render(); }
  }
  if(/^[1-6]$/.test(e.key)){
    const st = DEMO_STEPS.find(x => x.n === +e.key);
    S.demoStep = st.n; S.persona = st.persona;
    if(st.n >= 5) S.memoryOn = true;
    if(st.screen === 's5') S.diffPlayed = false;
    document.body.classList.toggle('present', st.n === 6);
    S.screen = st.screen; render(); $('work').scrollTop = 0;
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

render();
