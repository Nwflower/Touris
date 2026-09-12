/* ==========================================================================
   Touris 知途 · 行程页

   ★ 这一页是产品的胜负手

   记忆开关一拨，底下整套安排在变。「改变了几处」不是写死的数字，是
   derive.diffs() 拿记忆约束过滤默认路线现算出来的——所以改一条记忆，
   这一页立刻跟着变，不存在「数据对不上」的可能。

   ★ 厚度从哪来

   原型的行程页有：当天主题、节奏与步行量、逐条时间与停留时长、备注、
   住宿候选（房型/价格/评分/点评数）、餐饮候选（人均/菜系/评分/来源）、
   以及每条安排挂的记忆来源。这些内容数据层里本来就有（city.js 的
   spots / dine / stay），渲染时不能只把景点名摆出来。
   ========================================================================== */

const ViewPlan = (() => {
  const { esc } = DOM;

  /* ---------------- 记忆关联 ---------------- */

  /** 某个景点和当前记忆的关系：被某个偏好命中 / 记忆未涉及 */
  function relation(name){
    const c = city();
    const s = (c && c.spots && c.spots[name]) || {};
    const cons = Archive.constraints();
    const liked = (s.prefer || []).find(t => cons.prefer.includes(t));
    if(liked){
      return { tag: liked,
        ids: Archive.all().filter(m => Archive.tagsOf(m, 'prefer').includes(liked)).map(m => m.id) };
    }
    return null;
  }

  function memTag(ids, label){
    if(!ids || !ids.length) return '';
    return `<button class="mtag" data-act="pop" data-ids="${esc(ids.join(','))}">
      <span>🧠</span><span>${esc(label)}</span></button>`;
  }

  /** 把一天里的景点与它的时间/时长/备注绑在一起，避免过滤后错位 */
  function dayEntries(d, keptNames){
    return keptNames.map(name => {
      const i = d.spots.indexOf(name);
      return {
        name,
        // 被过滤掉的点会让时间轴出现空档，但不要把后面的时间往前挪——
        // 只如实显示原始时刻，别伪造一份没算过的行程。
        time: (d.times || [])[i] || '',
        dur: (d.durs || [])[i] || '',
        note: (d.notes || [])[i] || ''
      };
    });
  }

  /* ---------------- 一行安排 ---------------- */

  function spotRow(e, idx){
    const c = city();
    const s = (c.spots && c.spots[e.name]) || {};
    const rel = relation(e.name);
    const tag = App.stance[e.name] || {};
    const open = App.openReason === e.name;

    return `
    <li class="tl-item ${tag.v ? 'v-' + tag.v : ''}">
      <div class="tl-time">
        ${e.time ? `<b>${esc(e.time)}</b>` : ''}
        ${e.dur ? `<span class="tiny muted">${esc(e.dur)}</span>` : ''}
      </div>
      <div class="tl-body">
        <div class="tl-head">
          ${Thumb.html(e.name, 'sm')}
          <div class="tl-main">
            <div class="row wrap" style="gap:7px">
              <b>${esc(e.name)}</b>
              ${rel ? memTag(rel.ids, `因为你喜欢${LIKE_TEXT(rel.tag)}`)
                    : (Archive.all().length ? '<span class="badge badge-plain">记忆未涉及</span>' : '')}
              ${tag.v === 'up' ? '<span class="badge badge-ok">喜欢</span>' : ''}
              ${tag.v === 'down' ? '<span class="badge badge-warn">不喜欢</span>' : ''}
            </div>
            ${e.note ? `<div class="tiny dim" style="margin-top:3px">${esc(e.note)}</div>` : ''}
            ${s.intro ? `<div class="tiny muted" style="margin-top:4px">${esc(s.intro)}</div>` : ''}
            <div class="tiny muted" style="margin-top:3px">
              ${s.score ? `${esc(s.score)} 分 · ${esc(s.count)} 条点评 · ${esc(s.src || '')}` : ''}
              ${(s.tags || []).length ? '' : ''}
            </div>
          </div>
        </div>
        ${open ? reasonPicker(e.name) : ''}
      </div>
      <div class="tl-act">
        <button class="thumbbtn ${tag.v === 'up' ? 'on up' : ''}" data-act="thumb"
                data-k="${esc(e.name)}" data-v="up" title="喜欢这个安排">👍</button>
        <button class="thumbbtn ${tag.v === 'down' ? 'on down' : ''}" data-act="thumb"
                data-k="${esc(e.name)}" data-v="down" title="不喜欢这个安排">👎</button>
      </div>
    </li>`;
  }

  /** 表态后选原因——原因决定学到什么，这一步不能省 */
  function reasonPicker(name){
    const tag = App.stance[name] || {};
    const dir = tag.v === 'up' ? 'up' : 'down';
    return `
    <div class="reasonbox">
      <div class="tiny muted" style="margin-bottom:8px">
        选一个最接近的原因——<b>原因决定学到什么</b>，不选就学不到东西。
      </div>
      ${Object.keys(REASONS).map(g => {
        const labels = REASONS[g][dir] || [];
        if(!labels.length) return '';
        return `<div class="rgroup">
          <span class="rlabel">${esc(REASONS[g].label)}</span>
          <span class="rchips">${labels.map(l =>
            `<button class="rchip ${tag.reason === l ? 'on' : ''}"
                     data-act="reason" data-k="${esc(name)}" data-r="${esc(l)}">${esc(l)}</button>`).join('')}</span>
        </div>`;
      }).join('')}
      ${LLM.sayRow(name)}
      ${tag.reason ? `<div class="note note-info" style="margin-top:8px">
        已记下：<b>${esc(tag.reason)}</b> → ${esc((REASON_TO_MEMORY[tag.reason] || {}).text || '')}
      </div>` : ''}
    </div>`;
  }

  /* ---------------- 餐饮候选（嵌在当天行程里） ----------------
     餐饮是行程的一部分，不是页尾的附录——走到哪一带就在哪天出现。
     原型的商业口径：只给「某某一带」+ 3-4 个候选类型，不给具体店名与门牌地址。 */

  function dayDining(c, dayNum){
    const keys = (c.dineByDay || {})[dayNum] || [];
    if(!keys.length) return '';
    const groups = keys.map(k => c.dine[k]).filter(Boolean);
    if(!groups.length) return '';

    return `
    <div class="inday-dine">
      <div class="inday-head">
        <span class="inday-ic">🍜</span>
        <b>这天吃哪儿</b>
        <span class="tiny muted">只给「哪一带」和候选类型，不指定店家</span>
      </div>
      <div class="dinegrid">
        ${groups.map(g => `
          <div class="dinecard">
            <div class="dh">
              <b>${esc(g.area)}</b>
              <span class="tiny muted">${esc(g.walk || '')}</span>
            </div>
            <div class="tiny dim" style="margin-bottom:8px">${esc(g.theme || '')}</div>
            <ul class="picks">
              ${g.picks.map(p => `
                <li>
                  <div class="row wrap" style="gap:6px">
                    <span class="pk-style">${esc(p.style)}</span>
                    <span class="tiny muted">${esc(p.cuisine)}</span>
                  </div>
                  <div class="tiny muted" style="margin-top:3px">
                    ${esc(p.price)} · ${esc(p.score)} 分 · ${esc(p.count)} 条 · ${esc(p.src || '')}
                  </div>
                  ${p.note ? `<div class="tiny muted" style="margin-top:2px">${esc(p.note)}</div>` : ''}
                </li>`).join('')}
            </ul>
          </div>`).join('')}
      </div>
    </div>`;
  }

  /* ---------------- 住宿候选（插在两天之间） ----------------
     住宿是「今晚住哪儿」，放在 Day 1 与 Day 2 之间最自然——
     放在页尾会读成附录，放在 Day 1 里面又会读成当天的一个环节。 */

  function stayPanel(c, ids){
    const st = (c.stay || {})['慢逛本地型'] || Object.values(c.stay || {})[0];
    if(!st) return '';
    return `
    <section class="panel staypanel">
      <div class="inday-head">
        <span class="inday-ic">🛏</span>
        <b>住哪儿</b>
        <span class="tiny muted">接下来几晚都在这儿</span>
      </div>
      <div class="stayhead">
        <b>${esc(st.area)}</b>
        <span class="tiny muted">${esc(st.theme || '')}</span>
        ${memTag(ids, '这条住宿是记忆推出来的')}
      </div>
      <div class="tiny dim" style="margin-bottom:10px">${esc(st.note || '')}</div>
      <ul class="roomlist">
        ${(st.picks || []).map(r => `
          <li>
            <div class="row wrap" style="gap:6px">
              <span class="pk-style">${esc(r.style)}</span>
              <span class="tiny muted">${esc(r.room)}</span>
            </div>
            <div class="tiny muted" style="margin-top:3px">
              ${esc(r.price)} · ${esc(r.score)} 分 · ${esc(r.count)} 条 · ${esc(r.src || '')}
            </div>
            ${r.note ? `<div class="tiny muted" style="margin-top:2px">${esc(r.note)}</div>` : ''}
          </li>`).join('')}
      </ul>
    </section>`;
  }

  /* ---------------- 对照面板 ---------------- */

  function compare(diff, n){
    if(!n){
      return `<div class="empty">
        <span class="ic">🧠</span>
        <b>开关拨到「使用记忆」才会出现对照</b><br>
        现在这份和一条记忆都没用的通用方案完全一致。
      </div>`;
    }
    return `
      <div class="cmp-head">
        <span class="cmp-before">${diff.before.spots} 个点 / ${diff.before.days} 天</span>
        <span class="cmp-arrow">→</span>
        <span class="cmp-after">${diff.after.spots} 个点 / ${diff.after.days} 天</span>
      </div>
      <p class="cmp-sum">${esc(diff.summary)}</p>
      <ul class="difflist">
        ${diff.entries.map(e => `
          <li class="diffitem ${e.kind}">
            <span class="dkind">${e.kind === 'removed' ? '去掉' : e.kind === 'added' ? '新增' : '调整'}</span>
            <div>
              <div>${esc(e.text)}</div>
              ${e.from ? `<div class="tiny muted">${esc(e.from)} → ${esc(e.to)}</div>` : ''}
              ${memTag(e.memoryIds, `${e.memoryIds.length} 条记忆`)}
            </div>
          </li>`).join('')}
      </ul>`;
  }

  /* ---------------- 页面 ---------------- */

  return function ViewPlan(){
    const c = city();
    if(!c) return `<div class="wrap"><div class="panel">没有可用的城市数据。</div></div>`;

    const cons = Archive.constraints();
    const n = Archive.all().length;
    const empty = { avoid: [], prefer: [], pace: null };
    const diff = Derive.diffs(c, n && App.memoryOn ? cons : empty);
    const days = (c.routeDefault || []).slice(0, tripDays());

    /* 顶部汇总：这一趟大概什么强度 */
    const totalSpots = days.reduce((a, d) => a + d.spots.length, 0);
    const keptSpots = days.reduce((a, d) =>
      a + Derive.filterDay(d.spots, c.spots, App.memoryOn && n ? cons : empty).kept.length, 0);

    /* 住宿是被「安静」「老城区」这类偏好推出来的，把贡献这些偏好的记忆挂上去 */
    const stayIds = (n && App.memoryOn)
      ? Archive.all().filter(m => {
          const t = Archive.tagsOf(m, 'prefer');
          return t.includes('quiet') || t.includes('old-town');
        }).map(m => m.id)
      : [];

    return `
    <div class="wrap">
      <div class="planhead">
        <div>
          <h1>${esc(c.label)} · ${tripDays()} 天</h1>
          <p class="dim small">${n
            ? `按你的 ${n} 条记忆排序 · ${keptSpots} 个点位`
            : `还没有记忆，这是一套通用方案 · ${totalSpots} 个点位`}</p>
        </div>
        <button class="btn btn-ghost" data-act="regen">重新生成</button>
      </div>

      <div class="split" style="margin-top:14px">
        <main>
          ${days.map(d => {
            const f = Derive.filterDay(d.spots, c.spots, App.memoryOn && n ? cons : empty);
            const entries = dayEntries(d, f.kept);
            const panel = `<section class="panel day">
              <div class="dayhead">
                <div class="row wrap" style="gap:8px">
                  <span class="daynum">D${d.n}</span>
                  <b>${esc(d.theme || '')}</b>
                  ${f.dropped.length ? `<span class="badge badge-warn">记忆去掉了 ${f.dropped.length} 处</span>` : ''}
                </div>
                <div class="tiny muted" style="margin-top:4px">${esc(d.paceNote || '')}</div>
                ${d.memoryIds && d.memoryIds.length ? memTag(d.memoryIds, '这一天由记忆排的') : ''}
              </div>
              ${entries.length
                ? `<ul class="timeline">${entries.map((e, i) => spotRow(e, i)).join('')}</ul>`
                : `<div class="empty">这一天没有可用的安排了</div>`}
              ${f.dropped.length && App.memoryOn ? `<div class="dropped tiny">
                已按记忆去掉：${f.dropped.map(x => esc(x.name)).join('、')}
              </div>` : ''}
              ${dayDining(c, d.n)}
            </section>`;
            // 住宿插在 Day 1 与 Day 2 之间：读作「今晚住下了，后面几天都在这儿」
            return d.n === 1 ? panel + stayPanel(c, stayIds) : panel;
          }).join('')}
        </main>

        <aside>
          <section class="panel">
            <p class="panel-title">${App.memoryOn && n ? '记忆改变了什么' : '对照'}</p>
            ${App.memoryOn ? compare(diff, n) : `
              <div class="empty">
                <span class="ic">⭕</span>
                记忆开关已关。<br>打开顶栏的开关，看这份行程会怎么变。
              </div>
              <button class="btn btn-primary btn-block" style="margin-top:12px" data-act="memsw">
                打开记忆
              </button>`}
          </section>

          ${n && App.memoryOn ? `<section class="panel">
            <p class="panel-title">这次用到的记忆</p>
            <ul class="uselist">
              ${Archive.all().slice(0, 8).map(m => `<li>
                <span class="tiny muted">${esc(m.type)}</span>
                <div>${esc(m.text)}</div>
              </li>`).join('')}
            </ul>
            <a class="btn btn-quiet" href="#/memory">查看全部 ${n} 条 →</a>
          </section>` : ''}
        </aside>
      </div>
    </div>`;
  };
})();
