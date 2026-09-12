/* ==========================================================================
   Touris 知途 · DOM 工具

   全站统一用这一套，不要再各写各的。无构建、无依赖，普通 <script> 引入，
   所以这里挂在全局的 DOM 上。

   约定：视图函数返回 HTML 字符串，由 mount() 一次性写入；事件走事件委托。
   ========================================================================== */

const DOM = (() => {

  /** 取第一个匹配元素。
      ★ 注意：不传 root 时，纯 id（如 'view'）走 getElementById。
      用 querySelector('view') 是在找 <view> 标签，永远取不到——这个坑踩过。 */
  const $ = (sel, root) => {
    if(root) return root.querySelector(sel);
    return /^[A-Za-z][\w-]*$/.test(sel) ? document.getElementById(sel) : document.querySelector(sel);
  };
  /** 取全部匹配元素，返回真数组（不是 NodeList，方便直接 .map） */
  const $$ = (sel, root) => {
    const r = root || document;
    if(!root && /^[A-Za-z][\w-]*$/.test(sel)){
      const one = document.getElementById(sel);
      return one ? [one] : [];
    }
    return Array.from(r.querySelectorAll(sel));
  };

  /** HTML 转义。所有插进模板的变量都要过这一层。 */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  /** 建元素：el('div', {class:'card'}, [子元素或字符串]) */
  function el(tag, attrs, children){
    const n = document.createElement(tag);
    if(attrs) for(const k in attrs){
      const v = attrs[k];
      if(v == null || v === false) continue;
      if(k === 'class') n.className = v;
      else if(k === 'text') n.textContent = v;
      else if(k === 'html') n.innerHTML = v;
      else if(k === 'dataset') for(const d in v) n.dataset[d] = v[d];
      else if(k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    if(children) [].concat(children).forEach(c => {
      if(c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  /** 用 HTML 字符串填充容器（视图层的主要出口） */
  function mount(node, html){ if(node) node.innerHTML = html; return node; }

  /** 切换 class。on 省略时表示取反。 */
  function cls(node, name, on){
    if(!node) return;
    if(on === undefined) node.classList.toggle(name);
    else node.classList.toggle(name, !!on);
  }

  /**
   * 事件委托。在根节点上装一个监听，按 [data-act] 分派。
   * 返回卸载函数。
   */
  function delegate(root, type, handler, selector){
    const sel = selector || '[data-act]';
    const fn = e => {
      const t = e.target.closest(sel);
      if(t && root.contains(t)) handler(e, t);
    };
    root.addEventListener(type, fn);
    return () => root.removeEventListener(type, fn);
  }

  /** 让一块区域重新播放入场动画（先移除 class、强制回流、再加回） */
  function replay(node, name, ms){
    if(!node) return;
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
    if(ms) setTimeout(() => node.classList.remove(name), ms);
  }

  return { $, $$, esc, el, mount, cls, delegate, replay };
})();
