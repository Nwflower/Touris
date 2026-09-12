/* ==========================================================================
   Touris 知途 · 记忆档案

   ★ 两个命名空间，在模型层分开

     pm01…  档案记忆（persistent memory）——跨会话，登录后写进账号
     sm01…  会话记忆（session memory）  ——本次规划临时，刷新即散

   原型把两者放在同一个 S.learned 数组里，靠 scope 字段事后区分，结果连 id
   规则都撞上了（预置的 m19 本身就是 scope:'session'）。这里从 id 前缀就能
   看出寿命，不需要额外的字段去猜。

   ★ 约束从记忆推导，不手写

   constraints() 把一堆记忆聚合成一组去重后的约束。view 层只认这组约束，
   不认记忆本身——这样加一条记忆、改一条记忆，界面自动跟着变。
   ========================================================================== */

const Archive = (() => {

  /** 某条记忆挂了哪些 avoid / prefer 标签 */
  function tagsOf(m, kind){
    const v = m && m[kind];
    return Array.isArray(v) ? v : (v ? [v] : []);
  }

  /** 档案记忆：来自当前登录账号。游客 = 空数组（这就是 0 记忆模式）。 */
  function stored(){
    const s = (typeof SESSION !== 'undefined') ? SESSION : null;
    if(!s || s.mode !== 'user') return [];
    const acc = getAccount(s.id);
    return (acc && acc.memories) || [];
  }

  /** 本次会话新学的记忆。游客态只在内存里，刷新即散——这是刻意设计。 */
  let _session = [];
  function sessionMem(){ return _session; }

  /** 全部可见记忆：档案 + 本次会话 */
  function all(){ return stored().concat(_session); }

  /**
   * 聚合约束。返回去重后的语义标签集合。
   * 这是「记忆 → 界面」的唯一通道。
   */
  function constraints(){
    const out = { avoid:[], prefer:[], pace:null };
    const seen = { avoid:new Set(), prefer:new Set() };
    all().forEach(m => {
      tagsOf(m, 'avoid').forEach(t => { if(!seen.avoid.has(t)){ seen.avoid.add(t); out.avoid.push(t); } });
      tagsOf(m, 'prefer').forEach(t => { if(!seen.prefer.has(t)){ seen.prefer.add(t); out.prefer.push(t); } });
      // pace 取最慢的那条：一个「不要赶」就足以否决所有快节奏
      if(m.pace === 'slow') out.pace = 'slow';
      else if(m.pace === 'fast' && out.pace !== 'slow') out.pace = 'fast';
    });
    return out;
  }

  /** 哪些记忆贡献了某个标签——用来给对照条目标出处 */
  function whoContributes(kind, tag){
    return all().filter(m => tagsOf(m, kind).includes(tag)).map(m => m.id);
  }

  /**
   * 记一条新记忆（用户在详情页表态后调用）。
   * 同一句话只记一次，重复出现就累加 cited——「你反复这样选」本身就是信号。
   */
  function remember(rule, source){
    const t = (rule.text || '').trim();
    if(!t) return null;

    const exists = all().find(m => m.text === t);
    if(exists){ exists.cited = (exists.cited || 1) + 1; return exists; }

    // 会话记忆用 sm 前缀，且只进内存；登录用户退出时由 Archive.commit() 回写档案
    const id = 'sm' + String(_session.length + 1).padStart(2, '0');
    const m = { id, text:t, type:rule.type || '其它', cited:1, used:true };
    if(rule.pace) m.pace = rule.pace;
    if(rule.avoid) m.avoid = [].concat(rule.avoid);
    if(rule.prefer) m.prefer = [].concat(rule.prefer);
    if(source) m.source = source;
    _session.push(m);
    return m;
  }

  /** 把本次会话新学的记忆并进当前账号。退出登录 / 提交规划时调用。 */
  function commit(){
    const s = (typeof SESSION !== 'undefined') ? SESSION : null;
    if(!s || s.mode !== 'user' || !_session.length) return 0;
    saveLearned(s.id, _session);
    const n = _session.length;
    _session = [];
    return n;
  }

  /** 切换账号或城市时清掉会话记忆 */
  function resetSession(){ _session = []; }

  return { stored, sessionMem, all, constraints, whoContributes, remember, commit, resetSession, tagsOf };
})();
