/* ==========================================================================
   Touris 知途 · 大模型客户端（浏览器侧）

   职责边界（与 README 的「三重闸门」一致）：
   * 候选接口：LLM 只**提名**景点（从候选池里选 + 排序），不决定路线。
     路线仍由 planner.js 的算法算。
   * 攻略接口：LLM 只**改写** RAG 检回的相似攻略，不编造事实。
   * 任何失败（没后端 / 超时 / 返回垃圾）→ 降级，前端照常工作。

   降级策略：
   * candidates 失败 → 返回 {ok:false}，planner 用本地评分，产品路径不断
   * guide 失败     → 返回 {ok:false}，rag.js 用本地模板拼装攻略
   * 结果闸门：LLM 返回的名字必须逐个出现在候选池里，越界整条丢掉
     （与服务端 gate() 同一哲学：宁可少，不可假）
   ========================================================================== */
(function () {
  'use strict';

  const TIMEOUT_MS = 7000;
  let _available = null;          // null=未知 true/false
  const _cache = new Map();       // key → 结果

  function baseUrl() {
    // 与静态页同源；file:// 下没有后端，fetch 会自然失败并降级
    return '';
  }

  async function _post(path, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(baseUrl() + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** 探测后端是否可用（幂等，失败即永久降级到本会话结束） */
  async function available() {
    if (_available !== null) return _available;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(baseUrl() + '/api/llm/health', { signal: ctrl.signal });
      clearTimeout(timer);
      const j = await res.json();
      _available = !!(j && j.ok && j.llm);
    } catch (e) {
      _available = false;
    }
    return _available;
  }

  /**
   * LLM 候选提名。
   * @param {Object} p { city, cityData:{names:[{name,tags,cat}]}, days, memories:[文本],
   *                     interest, intensity, want: 数量 }
   * @returns {ok:boolean, list:[名字], degraded?:string}
   */
  async function candidates(p) {
    const key = 'c:' + [p.city, p.days, p.interest, p.intensity, (p.memories || []).length, (p.names || []).length].join('|');
    if (_cache.has(key)) return _cache.get(key);
    let result;
    try {
      if (!await available()) throw new Error('no-backend');
      const j = await _post('/api/llm/candidates', {
        city: p.city,
        days: p.days,
        interest: p.interest,
        intensity: p.intensity,
        memories: (p.memories || []).slice(0, 30).map(m => m.text || m),
        candidates: (p.names || []).slice(0, 80).map(x =>
          typeof x === 'string' ? x : { name: x.name, tags: (x.tags || []).slice(0, 6), cat: x.cat })
      });
      if (!j || !j.ok || !Array.isArray(j.candidates)) throw new Error('bad-shape');
      // 闸门：只留候选池里真实存在的名字，越界整条丢掉
      const pool = new Set((p.names || []).map(x => typeof x === 'string' ? x : x.name));
      const list = j.candidates
        .map(c => typeof c === 'string' ? c : (c && c.name))
        .filter(n => typeof n === 'string' && pool.has(n));
      result = list.length ? { ok: true, list } : { ok: false, degraded: 'LLM 返回的提名没有一个在候选池里，已整体丢弃' };
    } catch (e) {
      result = { ok: false, degraded: e.message === 'no-backend' ? '未接入大模型服务（本地评分候选）' : '大模型不可用（' + e.message + '），已降级为本地评分候选' };
    }
    _cache.set(key, result);
    return result;
  }

  /**
   * LLM 改写攻略。
   * @param {Object} p { city, days, month, season, weather, interest, intensity,
   *                     guides:[{title,summary,source,url,days,months,styles,intensity}],
   *                     memories:[文本] }
   * @returns {ok, guide:{title,overview,daily:[{title,morning,afternoon,evening}],tips[],basedOn[]}, degraded?}
   */
  async function guide(p) {
    const key = 'g:' + [p.city, p.days, p.month, p.interest, p.intensity, (p.guides || []).map(g => g.title).join(',')].join('|');
    if (_cache.has(key)) return _cache.get(key);
    let result;
    try {
      if (!await available()) throw new Error('no-backend');
      const j = await _post('/api/llm/guide', {
        city: p.city, days: p.days, month: p.month, season: p.season, weather: p.weather,
        interest: p.interest, intensity: p.intensity,
        memories: (p.memories || []).slice(0, 30).map(m => m.text || m),
        guides: (p.guides || []).map(g => ({
          title: g.title, summary: g.summary, source: g.source,
          days: g.days, months: g.months, styles: g.styles, intensity: g.intensity, highlights: g.highlights
        }))
      });
      if (!j || !j.ok || !j.guide) throw new Error('bad-shape');
      const g = j.guide;
      // 闸门：结构逐字段校验，字段缺失/类型不对整体降级
      if (typeof g.title !== 'string' || typeof g.overview !== 'string' || !Array.isArray(g.daily)) throw new Error('bad-shape');
      const daily = g.daily.slice(0, Math.max(1, p.days)).map(d => ({
        title: String(d && d.title || '').slice(0, 40),
        morning: String(d && d.morning || '').slice(0, 160),
        afternoon: String(d && d.afternoon || '').slice(0, 160),
        evening: String(d && d.evening || '').slice(0, 160)
      }));
      if (!daily.length) throw new Error('bad-shape');
      result = {
        ok: true,
        guide: {
          title: g.title.slice(0, 60),
          overview: g.overview.slice(0, 400),
          daily,
          tips: (Array.isArray(g.tips) ? g.tips : []).slice(0, 8).map(t => String(t).slice(0, 120)),
          basedOn: (Array.isArray(g.basedOn) ? g.basedOn : []).map(String)
        }
      };
    } catch (e) {
      result = { ok: false, degraded: e.message === 'no-backend' ? '未接入大模型服务（本地模板攻略）' : '大模型不可用（' + e.message + '），已降级为本地模板攻略' };
    }
    _cache.set(key, result);
    return result;
  }

  function resetCache() { _cache.clear(); }

  globalThis.TourisLLM = { candidates, guide, available, resetCache };
})();
