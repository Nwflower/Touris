/* ==========================================================================
   Touris 知途 · 记忆页

   这一页要回答一个问题：「你到底记住了我什么？」
   记忆类产品最怕变成黑箱，所以每条记忆都要**能追到出处**——哪一趟、哪一天、
   你当时说了什么。这是「可核验」那一条要求在界面上的落点。
   ========================================================================== */

const ViewMemory = (() => {
  const { esc } = DOM;

  const TYPE_COLOR = {
    '节奏':'#3A4C8F', '餐饮':'#9A6B1F', '景点':'#3E7A5E',
    '住宿':'#7A4E8F', '交通':'#2F6E7A', '购物':'#A0522D'
  };

  function typeBadge(t){
    return `<span class="typebadge" style="--c:${TYPE_COLOR[t] || '#6E655B'}">${esc(t)}</span>`;
  }

  function provenance(m){
    if(!m.source) return '<span class="tiny muted">（这条记忆还没有出处记录）</span>';
    const s = m.source;
    const trip = (s.trip || '').replace(/^(\d{4})-(\d{2})\s*/, (_, y, mo) => `${+mo} 月 · `);
    return `<div class="prov tiny muted">
      <span>${esc(trip)}</span>
      ${s.date ? `<span>${esc(s.date)}</span>` : ''}
      <span>${esc(s.action || '')}</span>
      ${s.quote ? `<span class="quote">「${esc(s.quote)}」</span>` : ''}
    </div>`;
  }

  function semantics(m){
    const bits = [];
    Archive.tagsOf(m, 'avoid').forEach(t => bits.push(`<span class="chip-x">避开${esc(WHY_TEXT(t))}</span>`));
    Archive.tagsOf(m, 'prefer').forEach(t => bits.push(`<span class="chip-x pref">偏好${esc(LIKE_TEXT(t))}</span>`));
    if(m.pace === 'slow') bits.push('<span class="chip-x">节奏放慢</span>');
    if(!bits.length) return '';
    return `<div class="sem">${bits.join('')}</div>`;
  }

  return function ViewMemory(){
    const long = Archive.stored();
    const sess = Archive.sessionMem();
    const all = Archive.all();
    const s = SESSION;

    if(!all.length){
      return `<div class="wrap">
        <h1>记忆</h1>
        <div class="panel" style="margin-top:14px">
          <div class="empty">
            <span class="ic">🌱</span>
            <b>还没有任何记忆</b><br>
            这是 0 记忆模式。推荐此时只看目的地和天数，和通用工具没有区别。<br><br>
            ${s.mode === 'user'
              ? '你已登录，但档案还是空的——去行程页对几个安排表个态，这里就会长东西出来。'
              : '登录后记忆会跨会话保留；游客模式下本次新学的记忆刷新即散。'}
          </div>
          <div class="row" style="margin-top:12px;justify-content:center">
            <a class="btn btn-primary" href="#/plan">从行程开始 →</a>
            ${s.mode === 'user' ? '' : '<button class="btn btn-ghost" data-act="account">登录</button>'}
          </div>
        </div>
      </div>`;
    }

    const cons = Archive.constraints();

    return `
    <div class="wrap">
      <div class="planhead">
        <div>
          <h1>记忆</h1>
          <p class="dim small">${s.mode === 'user'
            ? `账号 <b>${esc((getAccount(s.id) || {}).name || s.id)}</b> 的档案，共 ${all.length} 条`
            : `游客模式 · 本次新学 ${sess.length} 条，刷新即散`}</p>
        </div>
        ${s.mode === 'user' ? '' : '<button class="btn btn-ghost" data-act="account">登录后保留</button>'}
      </div>

      <div class="split" style="margin-top:14px">
        <main>
          ${sess.length ? `<section class="panel">
            <p class="panel-title">本次新学（${sess.length} 条）</p>
            <ul class="memlist">${sess.map(memRow).join('')}</ul>
            ${s.mode === 'user'
              ? `<div class="tiny muted" style="margin-top:10px">退出登录时会并入档案。`
              : `<div class="note note-warn" style="margin-top:10px">
                  游客模式下这些记忆只活在内存里，<b>刷新就没了</b>。登录即可保留。</div>`}
          </section>` : ''}

          ${long.length ? `<section class="panel">
            <p class="panel-title">档案记忆（${long.length} 条）</p>
            <ul class="memlist">${long.map(memRow).join('')}</ul>
          </section>` : ''}
        </main>

        <aside>
          <section class="panel">
            <p class="panel-title">这些记忆让推荐怎么变</p>
            ${cons.avoid.length || cons.prefer.length || cons.pace ? `
              <div class="cons">
                ${cons.avoid.length ? `<div class="cons-row"><span class="lbl">会避开</span>
                  <span class="chips">${cons.avoid.map(t => `<span class="chip-x">${esc(WHY_TEXT(t))}</span>`).join('')}</span></div>` : ''}
                ${cons.prefer.length ? `<div class="cons-row"><span class="lbl">会优先</span>
                  <span class="chips">${cons.prefer.map(t => `<span class="chip-x pref">${esc(LIKE_TEXT(t))}</span>`).join('')}</span></div>` : ''}
                ${cons.pace === 'slow' ? `<div class="cons-row"><span class="lbl">节奏</span>
                  <span class="chips"><span class="chip-x">放慢</span></span></div>` : ''}
              </div>`
              : '<div class="empty">这些记忆还没有形成可用的偏好约束。</div>'}
          </section>

          <section class="panel">
            <p class="panel-title">数据说明</p>
            <div class="tiny dim" style="line-height:1.7">
              记忆存在你这台浏览器的 localStorage 里，换设备或换浏览器不会跟过去。
              每条都能追到出处——这是「可核验」的落点。
              ${s.mode === 'user' ? '' : '<br><br>当前是游客模式，没有写任何持久化数据。'}
            </div>
            ${s.mode === 'user' ? `<button class="btn btn-quiet" data-act="reset" style="margin-top:8px">
              清空本机全部账号与记忆</button>` : ''}
          </section>
        </aside>
      </div>
    </div>`;
  };

  function memRow(m){
    return `<li class="memrow">
      <div class="mr-top">
        ${typeBadge(m.type)}
        <b>${esc(m.text)}</b>
        ${m.cited > 1 ? `<span class="badge badge-mem">出现过 ${m.cited} 次</span>` : ''}
      </div>
      ${semantics(m)}
      ${provenance(m)}
    </li>`;
  }
})();
