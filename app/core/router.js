/* ==========================================================================
   Touris 知途 · 路由

   hash 路由（#/plan/abc）。选 hash 而不是 History API 有两个实际原因：
   1. 部署形态是魔搭创空间 Static，服务器不会为 /plan/abc 这类路径做 rewrite，
      直接用 path 会 404；hash 不存在这个问题
   2. 本地能用 file:// 直接打开，不必起服务

   S0–S5 那套屏次编号是 demo 提词用的，真实前端不该露，这里换成语义化路径。
   ========================================================================== */

const Router = (() => {
  const routes = [];        // { re, keys, name }
  let onChange = null;      // (name, params) => void

  /** parse('/plan/:id') → /^\/plan\/([^/]+)$/ */
  function compile(pattern){
    const keys = [];
    const src = pattern
      .replace(/\/$/, '')                       // 容忍结尾斜杠
      .replace(/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    return { re: new RegExp('^' + (src || '') + '$'), keys };
  }

  function def(pattern, name){ routes.push(Object.assign({ name }, compile(pattern))); }

  /** 取当前 hash 的路径部分，'#/plan/new' → '/plan/new' */
  function current(){
    const h = location.hash.replace(/^#/, '');
    return (h || '/').replace(/\/+$/, '') || '/';
  }

  function resolve(path){
    for(const r of routes){
      const m = path.match(r.re);
      if(!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { name: r.name, params };
    }
    return { name: 'notfound', params: {} };
  }

  /** 导航。相同路径不重复触发。 */
  function go(path, replace){
    const next = '#' + (path.startsWith('/') ? path : '/' + path);
    if(location.hash === next) { fire(); return; }
    if(replace) location.replace(next);
    else location.hash = next;
    // location.replace 在部分浏览器不派发 hashchange，这里补一刀
    if(replace) fire();
  }

  function fire(){
    if(!onChange) return;
    const { name, params } = resolve(current());
    onChange(name, params);
  }

  /** 注册路由表并开始监听。table: { '/plan/:id': 'plan' } */
  function start(table, cb){
    for(const pattern in table) def(pattern, table[pattern]);
    onChange = cb;
    window.addEventListener('hashchange', fire);
    fire();
  }

  return { start, go, current, resolve };
})();
