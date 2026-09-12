/* ==========================================================================
   Touris 知途 · 首页交互（轮播 + 滚动揭示）

   从 prototype/app.js 的 startHeroSlides / setupScrollReveal 搬来，改动两处：
     · 原型的箭头/圆点是用 addEventListener 逐个绑的；这里改走已有的 [data-act]
       事件委托，避免视图重建后留下野监听器
     · 加了 prefers-reduced-motion 判断——系统设了「减少动态效果」就不自动播放
   ========================================================================== */

const Hero = (() => {
  let idx = 0, paused = false, timer = null;

  const reduceMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 轮播 ---------------- */

  function slides(){ return DOM.$$('#heroSlides .hs'); }
  function dots(){ return DOM.$$('#heroDots .hc-dot'); }

  function go(i){
    const list = slides();
    if(!list.length) return;
    const total = list.length;
    const n = ((i % total) + total) % total;
    if(n === idx) return;
    idx = n;
    list.forEach((s, k) => {
      s.classList.toggle('on', k === n);
      s.style.zIndex = k === n ? 2 : 1;
    });
    dots().forEach((d, k) => d.classList.toggle('on', k === n));
    const cur = DOM.$('#heroLabel .hc-cur');
    if(cur) cur.textContent = n + 1;
  }

  function syncPlayBtn(){
    const b = DOM.$('#heroPlayBtn');
    if(b) b.classList.toggle('paused', paused);
  }

  const INTERVAL = 4500;

  function restart(){
    if(timer){ clearInterval(timer); timer = null; }
    if(reduceMotion()) return;
    timer = setInterval(() => { if(!paused) go(idx + 1); }, INTERVAL);
  }

  /**
   * 每次首页渲染后调用。
   *
   * ★ 这里刻意**没有**做「鼠标移到 hero 上就暂停」。
   *   原型有那段，但那边 hero 是 100vh —— 鼠标几乎永远在 hero 里，
   *   于是轮播永远处于暂停态，看起来就是「不会轮播」。改成只在页面
   *   不可见时暂停：切到别的标签页时停，回来继续，这才是想要的行为。
   */
  function start(){
    const list = slides();
    if(!list.length) return;
    if(timer){ clearInterval(timer); timer = null; }
    idx = 0; paused = false;
    list.forEach((s, k) => {
      s.classList.toggle('on', k === 0);
      s.style.zIndex = k === 0 ? 2 : 1;
    });
    syncPlayBtn();

    if(!start._wired){
      start._wired = true;
      document.addEventListener('visibilitychange', () => {
        // 页面切走时不必空转；切回来接着轮
        if(document.hidden){ paused = true; }
        else { paused = false; syncPlayBtn(); restart(); }
      });
    }
    restart();
  }

  function stop(){
    if(timer){ clearInterval(timer); timer = null; }
  }

  /* ---------------- 滚动揭示 ---------------- */

  /**
   * 元素进入视口后加上 .revealed。
   *
   * ★ 关键：默认不隐藏内容。只有这里确认观察器可用、并且立刻能接管，
   *   才给 <html> 挂上 .reveal-ready 去启用「初始隐藏」那套 CSS。
   *   顺序错了（先隐藏、等 JS 来点亮）就会在 JS 出问题时留下整片空白。
   */
  function reveal(){
    const els = DOM.$$('[data-reveal]');
    if(!els.length) return;
    if(!('IntersectionObserver' in window)) return;   // 不支持就干脆不做动画，内容照常可见

    document.documentElement.classList.add('reveal-ready');
    const show = el => el.classList.add('revealed');

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if(e.isIntersecting){ show(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });

    els.forEach(e => {
      // 已在视口内的立刻显示，不等回调——否则首屏内容会先藏一下
      const r = e.getBoundingClientRect();
      if(r.top < window.innerHeight && r.bottom > 0) show(e);
      else io.observe(e);
    });

    // 兜底：观察器在「元素比视口还高」等布局下可能一次都不触发。
    // 宁可动画早一点发生，也不要留空白。
    setTimeout(() => els.forEach(show), 2000);
  }

  /* ---------------- 首页渲染收尾 ---------------- */

  /** start 与 reveal 必须互不拖累：轮播出问题不能连带把内容藏起来 */
  function mount(){
    try{ start(); }catch(e){ console.error('[hero] 轮播启动失败：', e); }
    try{ reveal(); }catch(e){ console.error('[hero] 揭示失败：', e); }
  }

  /** 首页那几个轮播控件的点击。由 bootstrap 的委托派发过来。 */
  function onClick(t){
    switch(t.dataset.act){
      case 'hero-prev': go(idx - 1); restart(); return true;
      case 'hero-next': go(idx + 1); restart(); return true;
      case 'hero-toggle':
        paused = !paused; syncPlayBtn(); restart();
        return true;
      case 'hero-dot':
        go(+t.dataset.i); restart();
        return true;
    }
    return false;
  }

  return { start, stop, mount, reveal, onClick, go };
})();
