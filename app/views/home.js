/* ==========================================================================
   Touris 知途 · 首页

   骨架与文案沿用原型（prototype/app.js 的 viewHome），视觉走 styles/hero.css。
   一处产品化调整：原型的首页几乎没有正文——一屏 hero 滚下去就是演示动线，
   那是路演讲稿的排布。这里把记忆资产提到 hero 正下方，因为「你到底记住了我
   什么」是访客最先该看到的答案。
   ========================================================================== */

const ViewHome = (() => {
  const { esc } = DOM;

  /* 首屏轮播用哪几张图。挑的是横向构图、辨识度高的几个点。 */
  const HERO_SPOTS = ['岚山竹林', '伏见稻荷大社', '鸭川河畔', '金阁寺'];

  const QUICK = ['京都', '北京', '上海'];

  function heroSlidesHTML(){
    const list = HERO_SPOTS.map(n => ({ n, style: Thumb.heroImg(n) }));
    return list.map((s, i) => `
      <div class="hs ${i === 0 ? 'on' : ''}" style="${s.style}"
           role="img" aria-label="${esc(s.n)}"></div>`).join('');
  }

  function heroDotsHTML(){
    return HERO_SPOTS.map((n, i) => `
      <button class="hc-dot ${i === 0 ? 'on' : ''}" data-act="hero-dot" data-i="${i}"
              aria-label="第 ${i + 1} 张：${esc(n)}"></button>`).join('');
  }

  /* ---------------- 记忆资产：首页最该回答的问题 ---------------- */

  function memoryCard(){
    const cons = Archive.constraints();
    const all = Archive.all();
    const n = all.length;

    if(n === 0){
      return `<div class="empty">
        <span class="ic">🌱</span>
        <b>还没有任何记忆</b><br>
        现在推荐只看目的地和天数，和通用工具没有区别。<br>
        在行程里对几个安排表个态，记忆就开始积累了。
      </div>`;
    }

    return `
      <div class="cons">
        ${cons.avoid.length ? `<div class="cons-row"><span class="lbl">会避开</span>
          <span class="chips">${cons.avoid.slice(0, 6).map(t =>
            `<span class="chip-x">${esc(WHY_TEXT(t))}</span>`).join('')}</span></div>` : ''}
        ${cons.prefer.length ? `<div class="cons-row"><span class="lbl">会优先</span>
          <span class="chips">${cons.prefer.slice(0, 6).map(t =>
            `<span class="chip-x pref">${esc(LIKE_TEXT(t))}</span>`).join('')}</span></div>` : ''}
        ${cons.pace === 'slow' ? `<div class="cons-row"><span class="lbl">节奏</span>
          <span class="chips"><span class="chip-x">放慢，一天不超过 3 个点</span></span></div>` : ''}
      </div>
      <div class="tiny muted" style="margin-top:10px">
        共 ${n} 条记忆${Archive.sessionMem().length ? `，其中 ${Archive.sessionMem().length} 条是本次新学的` : ''}。
      </div>`;
  }

  /* ---------------- 城市卡片 ---------------- */

  function cityCards(){
    const keys = Object.keys(CITY_DATA);
    return keys.map((k, i) => {
      const c = CITY_DATA[k];
      const on = k === App.cityKey;
      const cover = Object.keys(c.spots).slice(0, 1)[0];
      const names = Object.keys(c.spots).slice(0, 7).join(' · ');
      return `<button class="dest-card ${on ? 'on' : ''}" data-act="city" data-k="${esc(k)}"
                      data-reveal data-d="${i}">
        <div class="dc-img">
          <div class="hs-img" style="${Thumb.heroImg(cover)}"></div>
          <div class="dc-overlay"></div>
          <span class="dc-tag">${Object.keys(c.spots).length} 个点位</span>
          ${on ? '<span class="dc-pick">当前</span>' : ''}
        </div>
        <div class="dc-body">
          <div class="dc-title"><h3>${esc(c.label)}</h3></div>
          <div class="dc-tags">${names.split(' · ').slice(0, 4).map(x =>
            `<span>${esc(x)}</span>`).join('')}</div>
        </div>
      </button>`;
    }).join('');
  }

  /* ---------------- 首页正文 ---------------- */

  return function ViewHome(){
    const c = city();
    const cons = Archive.constraints();
    const n = Archive.all().length;

    return `
    <section class="hero" id="hero">
      <div class="hero-slides" id="heroSlides">${heroSlidesHTML()}</div>
      <div class="hero-overlay"></div>

      <div class="hero-ctrl">
        <button class="hc-arrow" data-act="hero-prev" aria-label="上一张">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button class="hc-arrow" data-act="hero-next" aria-label="下一张">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <div class="hc-dots" id="heroDots">${heroDotsHTML()}</div>
        <button class="hc-play" id="heroPlayBtn" data-act="hero-toggle" aria-label="暂停或继续轮播">
          <svg class="hc-icon-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <svg class="hc-icon-pause" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
        </button>
        <div class="hc-label" id="heroLabel">
          <span class="hc-cur">1</span> / <span class="hc-total">${HERO_SPOTS.length}</span>
        </div>
      </div>

      <div class="hero-content">
        <div class="hero-badge">
          <span class="dot"></span>
          ${n ? `已记住你的 ${n} 条偏好` : '让 AI 记住你的每一次选择'}
        </div>
        <h1 class="hero-title">
          <span class="line1">旅行不该每次都</span>
          <span class="line2">从零开始<span class="cursor">_</span></span>
        </h1>
        <p class="hero-sub">
          每次喜欢与不喜欢都变成可溯源、可对比的旅行记忆资产
        </p>

        <div class="hero-search">
          <div class="hs-field">
            <span class="hs-ic">📍</span>
            <select id="h-city">
              ${Object.keys(CITY_DATA).map(k =>
                `<option ${k === App.cityKey ? 'selected' : ''}>${esc(k)}</option>`).join('')}
            </select>
          </div>
          <div class="hs-field">
            <span class="hs-ic">📅</span>
            <input id="h-date" type="date" value="${esc(App.trip.date || '')}">
          </div>
          <div class="hs-field">
            <span class="hs-ic">⏱</span>
            <select id="h-days">
              ${[2,3,4,5].map(d =>
                `<option ${d === App.trip.days ? 'selected' : ''}>${d} 天</option>`).join('')}
            </select>
          </div>
          <button class="hs-btn" data-act="generate">
            <span>${n ? '🧠 用记忆规划' : '开始规划'}</span>
          </button>
        </div>

        <div class="hero-quick">
          <span>热门：</span>
          ${QUICK.filter(k => CITY_DATA[k]).map(k =>
            `<button class="chip" data-act="city" data-k="${esc(k)}">${esc(k)}</button>`).join('')}
        </div>
      </div>

      <button class="hero-scroll" data-act="scroll" aria-label="向下探索">
        <div class="scroll-line"></div>
        <span>向下探索</span>
      </button>
    </section>

    <div class="wrap">
      <div class="stats" style="margin-top:28px" data-reveal>
        ${[
          [n ? n + '' : '0', '你的记忆条数'],
          [Object.keys(CITY_DATA).length + '', '可规划城市'],
          ['0', '问卷必填项'],
          ['100%', '推荐可溯源']
        ].map(([a, b]) => `<div class="st"><div class="n">${a}</div><div class="l">${b}</div></div>`).join('')}
      </div>
    </div>

    <div class="wrap section">
      <div class="sec-head" data-reveal>
        <span class="eyebrow">记忆资产</span>
        <h2>你到底记住了我什么</h2>
        <p>不是黑箱。每条记忆都能追到<b>哪一趟、哪一天、你当时说了什么</b>。</p>
      </div>
      <div class="split">
        <section class="panel">
          <p class="panel-title">当前偏好</p>
          ${memoryCard()}
        </section>
        <aside class="panel">
          <p class="panel-title">接下来</p>
          <div class="tiny dim" style="line-height:1.8">
            选定目的地后生成行程，对具体的安排表个态——
            态度会当场变成记忆，并且立刻改变后面的推荐。
          </div>
          <div class="row" style="margin-top:12px">
            <a class="btn btn-primary" href="#/plan">去看行程 →</a>
            <a class="btn btn-ghost" href="#/memory">全部记忆</a>
          </div>
        </aside>
      </div>
    </div>

    <div class="band">
      <div class="wrap section">
        <div class="sec-head" data-reveal>
          <span class="eyebrow">目的地</span>
          <h2>选一个城市</h2>
          <p>同一套记忆，换个城市依然适用——去过哪、喜欢什么，不该每换一个地方就重来。</p>
        </div>
        <div class="dest-grid">${cityCards()}</div>
      </div>
    </div>

    <div class="wrap section">
      <div class="sec-head" data-reveal>
        <span class="eyebrow">为什么不一样</span>
        <h2>三条它才做得到的事</h2>
      </div>
      <div class="feat-grid">
        ${[
          ['🧠', '记忆可见', '每次选择都变成可查、可改、可溯源的旅行记忆资产。', '01'],
          ['🔄', '一键对照', '开关记忆，同一套系统给你两套结果——差异一条条列出来。', '02'],
          ['📏', '不问偏好', '不填预算和口味问卷。偏好从你的行为里推断，说不出的才值钱。', '03']
        ].map(([ic, t, d, num], i) => `
          <div class="feat-card" data-reveal data-d="${i}">
            <div class="feat-ic">${ic}</div>
            <h3>${t}</h3>
            <p>${d}</p>
            <span class="feat-num">${num}</span>
          </div>`).join('')}
      </div>
    </div>

    <div class="wrap section">
      <div class="sec-head" data-reveal>
        <span class="eyebrow">${esc(c ? c.label : '')}</span>
        <h2>这里的点位</h2>
        <p>${n ? '带 🧠 的会参与排序。' : '还没有记忆参与，先看看有哪些地方。'}</p>
      </div>
      <div class="spotgrid">
        ${Object.keys(c ? c.spots : {}).slice(0, 8).map(name => {
          const s = c.spots[name];
          const liked = (s.prefer || []).find(t => cons.prefer.includes(t));
          return `<div class="panel spotcard">
            ${Thumb.html(name, 'sm')}
            <div class="sc-body">
              <div class="row wrap" style="gap:6px">
                <b>${esc(name)}</b>
                ${liked ? `<span class="badge badge-mem">🧠 ${esc(LIKE_TEXT(liked))}</span>` : ''}
              </div>
              <div class="tiny muted" style="margin-top:5px">${esc(s.intro || '')}</div>
              <div class="tiny muted" style="margin-top:4px">${esc(s.score)} 分 · ${esc(s.count)} 条点评 · ${esc(s.src || '')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="wrap cta">
      <div class="cta-inner" data-reveal>
        <h2>这些记忆，换个 App <b>带不走</b></h2>
        <p>用得越久，它越像为你一个人造的。</p>
        <div class="cta-btns">
          <button class="btn btn-lg btn-primary" data-act="generate">开始规划</button>
          ${SESSION.mode === 'user'
            ? `<a class="btn btn-lg btn-ghost" href="#/memory">看我的记忆</a>`
            : `<button class="btn btn-lg btn-ghost" data-act="account">登录保留记忆</button>`}
        </div>
      </div>
    </div>

    <div class="wrap">
      <footer class="footer">
        <div class="f-brand">
          <span class="logo-mark" aria-hidden="true"></span>
          <div>
            <div class="f-name">Touris 知途</div>
            <div class="f-sub">MEMORY-DRIVEN TRAVEL</div>
          </div>
        </div>
        <div class="f-links">
          <a href="#/">首页</a>
          <a href="#/plan">行程</a>
          <a href="#/memory">记忆</a>
        </div>
        <div class="f-copy">
          纯静态原型，无后端。账号与记忆都只存在你这台浏览器里，
          换设备或换浏览器就要重新开始。<br>
          景点图文来自 Wikimedia Commons（CC 授权）。
        </div>
      </footer>
    </div>`;
  };
})();

/* 约束标签 → 人话。首页、行程页、记忆页都要用，所以放在全局。 */
function WHY_TEXT(tag){
  return {
    museum:'博物馆类', crowd:'人多的地方', queue:'排队的店',
    'walk-heavy':'走路过多的路线', mall:'大型商场'
  }[tag] || tag;
}
function LIKE_TEXT(tag){
  return {
    market:'本地市场', garden:'庭园', bamboo:'竹林', river:'临水路线', temple:'寺庙神社',
    'local-food':'本地小馆', 'street-food':'小吃摊', dessert:'甜品与茶室', evening:'傍晚时段',
    quiet:'安静的地方', 'old-town':'老城区', view:'观景点', craft:'手作小店', free:'免费的地方'
  }[tag] || tag;
}
