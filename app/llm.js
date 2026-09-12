/* ==========================================================================
   Touris 知途 · 语义翻译入口（前端）

   ★ 它只做一件事

   把用户**自己写的一句话**交给后端翻译成现有语义标签，翻译结果照旧走
   Archive.remember() 落成记忆——和点原因标签那条路**完全同一个出口**。
   记忆一旦写成，derive.js / 记忆页 / 对照面板全都自动认它，因为那边只认
   Archive，不关心这条记忆是点出来的还是说出来的。

   ★ 三条产品纪律

   1. **不做对话框。**设计要求是「不像对话框」，所以入口就嵌在原因选择器里面，
      是「或者自己说」这一行，不是另一个页面、另一个 chat 面板。
   2. **翻不出来就如实说翻不出来。** 后端返回空数组是**正确结果**，不是失败。
      如果这里硬凑一条记忆，用户会发现「我说了它却记错了」，比没记住更糟。
   3. **不可用时不露痕迹。** 没有后端（纯静态部署、file:// 打开）时，
      available() 为 false，入口整个不渲染——原因是那些按钮本来就在上面，
      用户根本不会察觉到少了什么。

   ★ 关于直接改一个按钮的 DOM

   约定是「状态变了就 UI.refresh()」，但提交中不能 refresh——那会把用户刚打的字
   清空。所以只有「提交中」这一种瞬时态直接改按钮，其余一律走 refresh。
   按钮节点在下一次 refresh 时就被换掉，不会留下悬挂引用。
   ========================================================================== */

const LLM = (() => {
  const { $, esc } = DOM;

  let state = 'unknown';     // unknown | on | off
  let busy = false;          // 提交中
  let probed = false;        // 探针只打一次

  /** 后端可用且配了 key 吗。渲染时同步读，所以不能用 Promise。 */
  function available(){ return state === 'on'; }
  const pending = () => busy;
  const status  = () => state;

  /* ---------------- 探针 ----------------
     纯静态部署里 /api/health 是唯一会 404 的东西——拿不到就当没有后端。
     这是「同一份前端，静态和 Docker 两种部署都能跑」的开关。 */

  function probe(){
    if(probed) return Promise.resolve(state);
    probed = true;
    if(typeof fetch !== 'function'){ state = 'off'; return Promise.resolve(state); }

    return fetch('api/health', { headers: { 'Accept': 'application/json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        state = (j && j.ok && j.llm) ? 'on' : 'off';
        // 探针回来时用户可能已经把选择器打开了，补一次渲染让入口出现
        if(state === 'on' && App.openReason) UI.refresh();
        return state;
      })
      .catch(() => { state = 'off'; return state; });
  }

  /* ---------------- 调用 ---------------- */

  function interpret(text, ctx){
    // 沙箱与老浏览器没有 fetch：当成没后端，不要抛
    if(typeof fetch !== 'function'){
      return Promise.resolve({ ok: false, degraded: true, reason: 'no_fetch', memories: [], rejected: [] });
    }
    return fetch('api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, ctx: ctx || {} })
    })
      .then(r => r.json())
      .catch(e => ({ ok: false, degraded: true, reason: 'network: ' + e.message, memories: [], rejected: [] }));
  }

  /* ---------------- 渲染用的小片段 ---------------- */

  /** 原因选择器里那行「或者自己说」。不可用时返回空串，不留痕迹。 */
  function sayRow(spotName){
    if(!available()) return '';
    const st = App.stance[spotName] || {};
    return `
    <div class="rgroup llmsay">
      <span class="rlabel">或者自己说</span>
      <div class="llmwrap">
        <input id="llm-in" maxlength="120" autocomplete="off" data-k="${esc(spotName)}"
               placeholder="例：这家排队两小时，我不吃生的">
        <button class="rchip llmbtn" data-act="llmsay"
                data-k="${esc(spotName)}">记下来</button>
      </div>
      ${st.note ? `<div class="tiny muted llmsaid">你刚才说的是：「${esc(st.note)}」</div>` : ''}
    </div>`;
  }

  /* ---------------- 提交 ---------------- */

  function submit(spotName){
    if(busy) return;
    const input = $('llm-in');
    const text = input ? String(input.value || '').trim() : '';
    if(!text){ UI.toast('先写一句你的想法'); return; }

    busy = true;
    const btn = $('[data-act="llmsay"]');
    let btnText = '';
    if(btn){ btn.disabled = true; btnText = btn.textContent; btn.textContent = '在想…'; }

    const st = App.stance[spotName] || (App.stance[spotName] = {});
    const dir = st.v === 'up' ? 'up' : 'down';

    return interpret(text, { city: App.cityKey, spot: spotName, dir: dir })
      .then(res => {
        busy = false;

        /* --- 降级：模型没配上 / 超时 / 返回垃圾 ---
           不弹错误框。原因标签就在上面一行，指引用户走那条路即可——
           这就是 REASON_TO_MEMORY 那张手写表作为兜底路径的意义。 */
        if(!res || !res.ok){
          if(btn){ btn.disabled = false; btn.textContent = btnText; }
          UI.toast('语义翻译暂时不可用——<b>从上面的原因里选一个</b>，一样能记住', 'warn');
          return;
        }

        const mems = res.memories || [];

        /* --- 翻得出来，但一条都归不进现有偏好 ---
           如实说。这里是最容易作弊的地方：硬塞一条记忆，用户当时看不出，
           之后发现推荐没变、或者记错了，信任就没了。 */
        if(!mems.length){
          if(btn){ btn.disabled = false; btn.textContent = btnText; }
          UI.toast('读懂了，但这句话落不进现有的偏好项——<b>没有记下东西</b>', 'warn');
          return;
        }

        /* --- 落成记忆：和点原因标签走同一个出口 --- */
        st.note = text;
        const learned = mems.map(m => Archive.remember(m, {
          trip: `${App.trip.date ? App.trip.date.slice(0, 7) : '本次'} ${App.cityKey}`,
          date: App.trip.date || '',
          action: `你对「${spotName}」点了${dir === 'up' ? '喜欢' : '不喜欢'}`,
          quote: text                      // ★ 这里存的是用户的原话，不再是预设标签
        })).filter(Boolean);

        App.openReason = null;
        UI.refresh();
        UI.toast(`已记下 <b>${learned.length} 条</b>：`
          + learned.map(m => esc(m.text)).join('、'), 'mem');
      })
      .catch(e => {
        busy = false;
        if(btn){ btn.disabled = false; btn.textContent = btnText; }
        UI.toast('语义翻译出错——<b>从上面的原因里选一个</b>', 'warn');
        console.warn('[llm] 未预期异常：', e);
      });
  }

  /* ---------------- 事件（由 bootstrap 的委托派发过来） ---------------- */

  function onClick(e, t){
    if(t.dataset.act === 'llmsay'){ submit(t.dataset.k); return true; }
    return false;
  }

  /** 输入框里按回车 = 点「记下来」。挂在 document 上委托，节点换了也不用重绑。
      data-k 放在 input 上（不是只放在按钮上），否则这里拿不到是哪条安排。 */
  DOM.delegate(document, 'keydown', (e, t) => {
    if(e.key !== 'Enter') return;
    e.preventDefault();
    if(t.dataset.k) submit(t.dataset.k);
  }, '#llm-in');

  return { probe, available, pending, status, interpret, sayRow, onClick };
})();
