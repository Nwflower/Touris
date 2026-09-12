/* ==========================================================================
   Touris 知途 · 本地存储

   localStorage 在无痕模式、隐私设置、配额写满时都会抛错。任何一次抛错都不能
   让页面挂掉——所有读写都兜住，失败时退化成内存存储（本次会话仍可用，
   刷新即散）。这是「游客模式刷新不丢数据」这条承诺的兜底。

   account.js 有自己独立的账号存储（zt.v1 键），这里放的是其它应用状态。
   ========================================================================== */

const Store = (() => {
  const NS = 'touris.';

  let _mem = Object.create(null);   // 内存回退
  let _usable = null;               // null = 还没探测过
  let _timer = null;

  /** 探测 localStorage 是否真的能用（有些浏览器存在但一写就抛） */
  function usable(){
    if(_usable !== null) return _usable;
    try{
      const k = NS + '__probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      _usable = true;
    }catch(e){
      _usable = false;
    }
    return _usable;
  }

  function get(key, fallback){
    const k = NS + key;
    try{
      const raw = usable() ? localStorage.getItem(k) : _mem[k];
      if(raw == null) return fallback;
      return JSON.parse(raw);
    }catch(e){
      return fallback;    // JSON 损坏也当没有
    }
  }

  function set(key, val){
    const k = NS + key;
    const raw = JSON.stringify(val);
    try{
      if(usable()) localStorage.setItem(k, raw);
      else _mem[k] = raw;
    }catch(e){
      _mem[k] = raw;      // 配额写满 → 本会话仍有效
    }
  }

  function del(key){
    const k = NS + key;
    try{ if(usable()) localStorage.removeItem(k); }catch(e){}
    delete _mem[k];
  }

  /** 高频写入用这个，合并成一次落盘 */
  function setSoon(key, val, ms){
    if(_timer) clearTimeout(_timer);
    _timer = setTimeout(() => { _timer = null; set(key, val); }, ms || 300);
  }

  return { get, set, del, setSoon, usable };
})();
