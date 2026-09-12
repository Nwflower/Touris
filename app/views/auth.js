/* ==========================================================================
   Touris 知途 · 登录 / 注册面板

   沿用原型里那套已经过测试的 account.css 结构（.auth-overlay / .auth-card），
   但渲染与控制改走 core/dom.js。

   不阻断浏览：打开站点直接进首页，登录是可选入口。评委要在一分钟内看到东西，
   不该被一堵登录墙拦住。
   ========================================================================== */

const Auth = (() => {
  const { $, esc } = DOM;

  let mode = 'login';
  let err = '';

  const host = () => $('authOverlay');

  function body(){
    const isLogin = mode === 'login';
    return `
    <div class="auth-overlay" data-act="authback">
      <div class="auth-card" role="dialog" aria-modal="true" aria-label="登录或注册">
        <h3>${isLogin ? '登录' : '创建账号'}</h3>
        <p class="auth-sub">记忆归属于账号。登录后，你的每次表态都会跨会话积累下来。</p>

        <div class="auth-tabs">
          <button class="${isLogin ? 'on' : ''}" data-act="authtab" data-v="login">登录</button>
          <button class="${isLogin ? '' : 'on'}" data-act="authtab" data-v="register">注册</button>
        </div>

        ${err ? `<div class="auth-err">${esc(err)}</div>` : ''}

        <div class="field">
          <label>账号</label>
          <input id="au-user" autocomplete="username" placeholder="例如 demo">
        </div>
        <div class="field">
          <label>密码</label>
          <input id="au-pass" type="password"
                 autocomplete="${isLogin ? 'current-password' : 'new-password'}"
                 placeholder="${isLogin ? '' : '至少 4 位'}">
        </div>
        ${isLogin ? '' : `
        <div class="field">
          <label>怎么称呼你（可留空）</label>
          <input id="au-name" placeholder="不填就用账号名">
        </div>`}

        <div class="auth-actions">
          <button class="btn xl" data-act="${isLogin ? 'dologin' : 'doregister'}">
            ${isLogin ? '登录' : '创建并开始'}
          </button>
          <button class="btn ghost" data-act="guest">以游客身份继续（0 记忆）</button>
        </div>

        <div class="auth-demo">
          想看「用了一段时间、已经积累 20 条记忆」的档案？直接用演示账号
          <code>${esc(DEMO_ACCOUNT.user)}</code> / <code>${esc(DEMO_ACCOUNT.pass)}</code>，
          或 <b data-act="demologin" style="cursor:pointer;text-decoration:underline">一键登录演示账号</b>。
        </div>

        <div class="auth-note">
          演示声明：本站是纯静态原型，没有后端。账号与密码哈希都只存在你这台浏览器的
          localStorage 里，换设备或换浏览器就要重新开始，也请勿填入任何真实密码。
        </div>
      </div>
    </div>`;
  }

  /** 重画面板但保留已输入的内容，免得用户因一次报错重打 */
  function repaint(){
    const h = host(); if(!h) return;
    const keep = {
      u: ($('au-user') || {}).value,
      p: ($('au-pass') || {}).value,
      n: ($('au-name') || {}).value
    };
    h.innerHTML = body();
    if(keep.u) $('au-user').value = keep.u;
    if(keep.p) $('au-pass').value = keep.p;
    if(keep.n && $('au-name')) $('au-name').value = keep.n;
    const f = $('au-user'); if(f) f.focus();
  }

  function open(m){
    mode = m || 'login';
    err = '';
    const h = host(); if(!h) return;
    h.innerHTML = body();
    h.hidden = false;
    const f = $('au-user'); if(f) f.focus();
  }

  function close(){
    const h = host(); if(!h) return;
    h.hidden = true; h.innerHTML = '';
    err = '';
  }

  const isOpen = () => { const h = host(); return !!h && !h.hidden; };

  /** 登录成功后的共同收尾 */
  function settle(who){
    Archive.resetSession();
    close();
    UI.refresh();
    UI.toast(`已登录 <b>${esc(who)}</b> · ${Archive.stored().length} 条记忆已载入`, 'mem');
  }

  /** 一键登录预置演示账号。首页入口也用这个。 */
  function loginAsDemo(){
    const r = login(DEMO_ACCOUNT.user, DEMO_ACCOUNT.pass);
    if(!r.ok){ UI.toast('演示账号不可用：' + esc(r.err)); return false; }
    SESSION = { mode:'user', id:r.user };
    persistSession(SESSION);
    Archive.resetSession();
    close();
    UI.refresh();
    UI.toast(`已登录 <b>${esc(getAccount(r.user).name)}</b> · ${Archive.stored().length} 条记忆已载入`, 'mem');
    return true;
  }

  function logout(){
    // 先回写本次会话新学的记忆，再断开，否则现场积累的会白丢
    const n = Archive.commit();
    SESSION = { mode:'guest', id:null };
    persistSession(SESSION);
    close();
    UI.refresh();
    UI.toast(n ? `已退出 · ${n} 条本次新学的记忆已存入账号` : '已退出登录 · 现在是游客模式，0 条记忆');
  }

  /** 面板内的所有交互。由 bootstrap 装在 document 上。 */
  function onClick(e, t){
    switch(t.dataset.act){
      case 'authtab':
        mode = t.dataset.v === 'register' ? 'register' : 'login';
        err = ''; repaint();
        return true;

      case 'authback':
        // 只在点到遮罩本身时关闭；点卡片内部（含输入框）不关
        if(e.target === t) close();
        return true;

      case 'guest':
        close();
        UI.toast('已进入游客模式 · <b>0 条记忆</b>，刷新即重新开始');
        return true;

      case 'demologin':
        loginAsDemo();
        return true;

      case 'dologin': {
        const r = login(($('au-user') || {}).value, ($('au-pass') || {}).value);
        if(!r.ok){ err = r.err; repaint(); return true; }
        SESSION = { mode:'user', id:r.user };
        persistSession(SESSION);
        settle(getAccount(r.user).name);
        return true;
      }

      case 'doregister': {
        const r = register(($('au-user') || {}).value, ($('au-pass') || {}).value,
                           ($('au-name') || {}).value);
        if(!r.ok){ err = r.err; repaint(); return true; }
        SESSION = { mode:'user', id:r.user };
        persistSession(SESSION);
        Archive.resetSession();
        close();
        UI.refresh();
        UI.toast(`账号已创建 · <b>${esc(getAccount(r.user).name)}</b>，从 0 条记忆开始`);
        return true;
      }
    }
    return false;
  }

  return { open, close, isOpen, onClick, loginAsDemo, logout };
})();
