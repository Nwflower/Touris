/* ==========================================================================
   Touris 知途 · 共享界面组件

   顶栏、toast、以及跨视图的刷新入口。视图函数只负责返回 HTML 字符串，
   真正把它们拼起来的是这里的 refresh()。
   ========================================================================== */

const UI = (() => {
  const { $, esc, mount, cls } = DOM;

  /* ---------------- toast ---------------- */

  /* toast 的图标。'warn' 是「这件事没做成」——用 ! 而不是 ✓，
     否则「没记下东西」看起来像成功了，那是在骗用户。 */
  const TOAST_ICON = { mem:'🧠', warn:'!', ok:'✓' };

  function toast(html, kind){
    const wrap = $('toasts');
    if(!wrap) return;
    const el = DOM.el('div', { class:'toast' + (kind ? ' ' + kind : ''),
      html:`<span>${TOAST_ICON[kind] || '✓'}</span><div>${html}</div>` });
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 240);
    }, 3400);
  }

  /* ---------------- 顶栏 ---------------- */

  function accountBtn(){
    if(SESSION.mode === 'user'){
      const acc = getAccount(SESSION.id) || { name: SESSION.id };
      return `<button class="acct-btn" data-act="account" title="切换账号 / 退出登录">
        <span class="em">🧳</span>
        <b>${esc(acc.name)}</b>
        <span class="cnt">${Archive.stored().length}</span>
      </button>`;
    }
    return `<button class="acct-btn guest" data-act="account" title="登录后可跨会话积累记忆">
      <span class="em">🫥</span><span>未登录</span>
      <span class="cnt">${Archive.sessionMem().length}</span>
    </button>`;
  }

  function renderTop(){
    const cur = Router.current();
    const n = Archive.all().length;
    const nav = [
      { p:'/',        t:'首页',   on: cur === '/' },
      { p:'/plan',    t:'行程',   on: cur.startsWith('/plan') },
      { p:'/memory',  t:'记忆',   on: cur === '/memory' }
    ];
    mount($('topbar'), `
      <a class="brand" href="#/" aria-label="Touris 知途 首页">
        <span class="mark" role="img" aria-label="知途"></span>
        <span class="name">Touris 知途<br><small>MEMORY-DRIVEN TRAVEL</small></span>
      </a>
      <nav class="nav">
        ${nav.map(x => `<a href="#${x.p}" class="${x.on ? 'on' : ''}">${x.t}</a>`).join('')}
      </nav>
      <div class="spacer"></div>
      <button class="memswitch ${App.memoryOn ? '' : 'off'} ${n === 0 ? 'disabled' : ''}"
              data-act="memsw"
              title="${n === 0 ? '还没有记忆可用' : '开关记忆，看推荐怎么变'}">
        <span class="knob"></span>
        <span class="txt">${App.memoryOn ? '使用记忆' : '默认推荐'}</span>
      </button>
      ${accountBtn()}
    `);
  }

  /* ---------------- 刷新 ---------------- */

  /* 路由 → 视图。视图函数在 views/ 里，返回 HTML 字符串。 */
  function viewFor(name, params){
    switch(name){
      case 'home':   return ViewHome();
      case 'plan':   return ViewPlan(params);
      case 'memory': return ViewMemory();
      case 'notfound': return ViewHome();
      default:       return ViewHome();
    }
  }

  /** 全量刷新：顶栏 + 当前视图。所有状态变更的最后一步都调它。 */
  function refresh(){
    renderTop();
    const { name, params } = Router.resolve(Router.current());
    mount($('view'), viewFor(name, params));
    // 轮播只在首页跑。离开就停掉，免得整站挂着一个 5 秒定时器。
    if(name === 'home') Hero.mount();
    else Hero.stop();
    window.scrollTo({ top:0 });
  }

  /** 只刷顶栏（记忆开关切换这类不需要重建整页的动作） */
  function refreshTop(){ renderTop(); }

  return { toast, renderTop, refresh, refreshTop };
})();
