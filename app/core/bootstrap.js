/* ==========================================================================
   Touris 知途 · 启动与事件分派

   脚本按依赖顺序加载（普通 <script>，无构建），这里负责最后把它们接起来：
   恢复登录态 → 装事件委托 → 启动路由 → 首屏渲染。

   事件只有两处：一个是 click（按 [data-act] 分派），一个是 Escape。
   视图不自己绑事件，改动了视图就重建 DOM——避免监听器泄漏在老监听器上。
   ========================================================================== */

let SESSION = getStoredSession();   // 由 account.js 提供；Auth 会重新赋整个对象

(function boot(){
  const { $, delegate } = DOM;

  /* ---------------- 记忆溯源浮卡 ---------------- */

  function showPop(anchor, ids){
    const list = String(ids || '').split(',').map(id => Archive.all().find(m => m.id === id)).filter(Boolean);
    if(!list.length) return;
    const pop = $('mempop');
    pop.innerHTML = `<h4>这些记忆</h4>` + list.map(m => `
      <div class="pi">
        <b>${DOM.esc(m.text)}</b>
        <div class="src">
          ${m.source ? [
            (m.source.trip || '').replace(/^(\d{4})-(\d{2})\s*/, (_, y, mo) => `${+mo} 月 · `),
            m.source.date || '',
            m.source.action || ''
          ].filter(Boolean).join(' · ') : '还没有出处记录'}
          ${m.source && m.source.quote ? `<br>「${DOM.esc(m.source.quote)}」` : ''}
        </div>
      </div>`).join('');
    pop.hidden = false;

    const r = anchor.getBoundingClientRect();
    const w = 316, h = Math.min(pop.offsetHeight || 200, 320);
    let left = Math.min(r.left, window.innerWidth - w - 14);
    let top = r.bottom + 8;
    if(top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 8);
    pop.style.left = Math.max(10, left) + 'px';
    pop.style.top = top + 'px';
  }

  const hidePop = () => { const p = $('mempop'); if(p) p.hidden = true; };

  /* ---------------- click ---------------- */

  delegate(document, 'click', (e, t) => {
    const act = t.dataset.act;

    // 浮卡内部的点击不要把自己关掉
    if(t.closest && t.closest('#mempop')) return;
    if(act !== 'pop') hidePop();

    // 登录面板自己处理一批动作
    if(Auth.onClick(e, t)) return;
    // 首页的轮播控件
    if(Hero.onClick(t)) return;
    // 语义翻译入口（原因选择器里的「或者自己说」）
    if(LLM.onClick(e, t)) return;

    switch(act){
      case 'pop':
        e.stopPropagation();
        showPop(t, t.dataset.ids);
        return;

      case 'scroll': {
        const next = document.querySelector('.stats');
        if(next) next.scrollIntoView({ behavior:'smooth', block:'start' });
        return;
      }

      case 'city': {
        const k = t.dataset.k;
        if(!CITY_DATA[k]) return;
        App.cityKey = k;
        App.stance = {}; App.openReason = null;
        UI.refresh();
        return;
      }

      case 'generate': {
        // 首页搜索条里的三个字段（在 hero 里）。缺省时用当前状态，不要清空。
        const c = $('#h-city'), d = $('#h-date'), dy = $('#h-days');
        if(c && c.value && CITY_DATA[c.value]) App.cityKey = c.value;
        if(d && d.value) App.trip.date = d.value;
        if(dy) App.trip.days = parseInt(dy.value, 10) || App.trip.days;
        App.stance = {}; App.openReason = null;
        const n = Archive.all().length;
        UI.toast(n ? `已按 <b>${n} 条记忆</b>生成 ${tripDays()} 天行程`
                   : `已生成 ${tripDays()} 天通用行程`);
        Router.go('/plan');
        return;
      }

      case 'regen': {
        // 刻意不做随机：这份行程完全由记忆推导而来，重复生成结果应当一致。
        // 会变的只有记忆本身。装作会随机变化反而是欺骗。
        UI.toast(Archive.all().length
          ? '行程由记忆推导得出，没有随机成分——改记忆才会变'
          : '还没有记忆参与，这就是通用方案');
        return;
      }

      case 'memsw': {
        const n = Archive.all().length;
        if(!n){ UI.toast('还没有记忆可用——先去行程里表个态'); return; }
        App.memoryOn = !App.memoryOn;
        UI.refresh();
        UI.toast(App.memoryOn
          ? `已开启记忆 · <b>${n} 条</b>参与排序`
          : '已关闭记忆 · 这是一份通用方案', App.memoryOn ? 'mem' : '');
        return;
      }

      case 'thumb': {
        const k = t.dataset.k, v = t.dataset.v;
        const cur = App.stance[k] || {};
        if(cur.v === v){ delete App.stance[k]; App.openReason = null; }
        else { App.stance[k] = { v }; App.openReason = k; }
        UI.refresh();
        return;
      }

      case 'reason': {
        const k = t.dataset.k, r = t.dataset.r;
        const rule = REASON_TO_MEMORY[r];
        if(!rule){ UI.toast('这个原因还没有对应的生成规则（见 validate.js）'); return; }
        const st = App.stance[k] || (App.stance[k] = {});
        if(st.reason === r){ delete st.reason; }
        else {
          st.reason = r;
          const memo = Archive.remember(rule, {
            trip: `${App.trip.date ? App.trip.date.slice(0, 7) : '本次'} ${App.cityKey}`,
            date: App.trip.date || '',
            action: `你对「${k}」点了${st.v === 'up' ? '喜欢' : '不喜欢'}`,
            quote: r
          });
          App.openReason = null;
          UI.refresh();
          UI.toast(`已记下：<b>${DOM.esc(memo.text)}</b>`, 'mem');
          return;
        }
        UI.refresh();
        return;
      }

      case 'reset': {
        if(!confirm('清空本机全部账号与记忆？\n\n这会删除所有本地数据，且无法撤销。演示账号会保留。')){
          return;
        }
        resetAll();
        SESSION = { mode:'guest', id:null };
        Archive.resetSession();
        UI.refresh();
        UI.toast('本地数据已清空');
        return;
      }
    }
  });

  /* ---------------- 键盘 ---------------- */

  document.addEventListener('keydown', e => {
    if(/input|textarea|select/i.test(e.target.tagName)) return;
    if(e.key === 'Escape'){ hidePop(); if(Auth.isOpen()) Auth.close(); }
  });

  window.addEventListener('resize', hidePop);
  document.addEventListener('wheel', hidePop, { passive:true });

  /* ---------------- 路由 ---------------- */

  if(!App.trip.date){
    const d = new Date();
    App.trip.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  Router.start({
    '/':          'home',
    '/plan':      'plan',
    '/memory':    'memory'
  }, () => UI.refresh());

  /* 探一次语义翻译后端。纯静态部署下会静静地失败，入口整个不渲染——
     前端不因此少任何功能，只是少了「或者自己说」这一条路。 */
  LLM.probe();

  /* 开发期自检：带上 ?dev=1 才跑 */
  if(/[?&]dev=1/.test(location.search)) Validate.report();
})();
