/* ==========================================================================
   Touris 知途 · RAG 攻略检索（浏览器侧）

   用法：
     TourisRAG.retrieve({city, date, days, interest, intensity})
       → { season, seasonInfo, matches:[{guide, score, reasons[]}], composed, llm:false }
     TourisRAG.withLLM(prev, memories)   ← 可选：调 TourisLLM.guide 改写

   检索策略（先硬后软）：
   * 硬约束（不满足直接出局）：
       1. 城市必须一致
       2. 出行月份 ∈ guide.months（出发时间 → 季节/天气）
       3. 天数 ∈ guide.days 区间
   * 软打分（排序用）：
       +2  偏好匹配（人文历史/自然风光）
       +2  强度匹配（特种兵/闲庭漫步）
       +1* 命中预置关键词
     相似度不足 3 篇时按「放宽月份 → 放宽天数」的次序降级补齐，并如实标注。

   本地合成（LLM 不可用时的兜底）：从 top 攻略拼接一份结构化攻略——
   分天骨架取自 top1 的 highlights 均分到每天，季节 tip 与原攻略 tips 合并。
   LLM 可用时由 TourisLLM.guide 按 RAG 提示词改写（约束：满足偏好与强度）。
   ========================================================================== */
(function () {
  'use strict';

  const { GUIDES, SEASONS, seasonOf } = globalThis.TOURIS_GUIDES || {};
  if (!GUIDES) { console.error('rag.js 需要先加载 guides-data.js'); return; }

  const INTEREST_LABEL = { culture: '人文历史', nature: '自然风光', mixed: '两者兼顾' };
  const INTENSITY_LABEL = { fast: '特种兵', mid: '适中', slow: '闲庭漫步' };

  function seasonInfo(city, month) {
    const s = seasonKeyOf(month);
    const map = SEASONS[city];
    return map ? Object.assign({ key: s }, map[s]) : { key: s, label: seasonLabel(s), weather: '', tip: '' };
  }
  function seasonKeyOf(m) { return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'; }
  function seasonLabel(k) { return { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[k]; }

  function scoreGuide(g, interest, intensity, month, days) {
    const reasons = [];
    let score = 0;
    if (interest !== 'mixed' && g.styles.includes(INTEREST_LABEL[interest])) { score += 2; reasons.push(INTEREST_LABEL[interest]); }
    if (interest === 'mixed' && g.styles.length) { score += 0.5; }
    if (intensity !== 'mid' && g.intensity === INTENSITY_LABEL[intensity]) { score += 2; reasons.push(INTENSITY_LABEL[intensity]); }
    if (intensity === 'mid' && g.intensity === '适中') { score += 1; reasons.push('适中节奏'); }
    if (g.months.includes(month)) { score += 1; reasons.push(seasonLabel(seasonKeyOf(month)) + '季适用'); }
    if (days >= g.days[0] && days <= g.days[1]) { score += 0.5; }
    return { score, reasons };
  }

  function hardPass(g, city, month, days, relax) {
    if (g.city !== city) return false;
    if (!relax.month && !g.months.includes(month)) return false;
    if (!relax.days && (days < g.days[0] || days > g.days[1])) return false;
    return true;
  }

  function retrieve(p) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : '2026-10-02';
    const { month, seasonKey } = seasonOf(date);
    const days = Math.max(2, Math.min(7, Number(p.days) || 4));
    const interest = p.interest || 'mixed';
    const intensity = p.intensity || 'mid';

    const season = seasonInfo(p.city, month);
    const relaxed = [];

    const pass1 = GUIDES.filter(g => hardPass(g, p.city, month, days, { month: false, days: false }));
    let pool = pass1;
    if (pool.length < 3) {
      relaxed.push('月份');
      pool = pool.concat(GUIDES.filter(g => hardPass(g, p.city, month, days, { month: true, days: false }) && !pass1.includes(g)));
    }
    if (pool.length < 3) {
      relaxed.push('天数');
      pool = pool.concat(GUIDES.filter(g => hardPass(g, p.city, month, days, { month: true, days: true }) && !pool.includes(g)));
    }

    const matches = pool
      .map(g => { const { score, reasons } = scoreGuide(g, interest, intensity, month, days); return { guide: g, score, reasons, relaxed: !pass1.includes(g) }; })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const composed = composeLocal({ city: p.city, days, month, season, interest, intensity, matches });

    return {
      city: p.city, date, days, month, seasonKey, season,
      interest, intensity,
      matches, relaxed: [...new Set(relaxed)],
      composed, llm: false
    };
  }

  /* ---------------- 本地模板合成（确定性，无网络） ---------------- */
  function composeLocal(p) {
    const top = p.matches[0] ? p.matches[0].guide : null;
    const spots = top ? top.highlights.slice() : [];
    const perDay = Math.max(2, Math.ceil(spots.length / Math.max(1, p.days)));
    const daily = [];
    for (let d = 0; d < p.days; d++) {
      const slice = spots.slice(d * perDay, (d + 1) * perDay);
      daily.push({
        title: slice.length ? `${slice[0]}一带` : `第 ${d + 1} 天 · 自由安排`,
        morning: slice[0] ? `${slice[0]}（建议上午前往，人少光线好）` : '睡到自然醒，附近街区散步',
        afternoon: slice[1] ? `${slice[1]}，午后留出茶歇` : '午后自由活动或补觉',
        evening: slice[2] ? `${slice[2]}，傍晚光线适合拍照` : '晚餐后回住处休息'
      });
    }
    const prefLabel = INTEREST_LABEL[p.interest] || '两者兼顾';
    const intLabel = INTENSITY_LABEL[p.intensity] || '适中';
    const tips = [];
    if (p.season && p.season.tip) tips.push(p.season.tip);
    if (p.season && p.season.weather) tips.push('当季气候：' + p.season.weather + '。');
    (p.matches || []).forEach(m => (m.guide.tips || []).forEach(t => { if (tips.length < 7 && !tips.includes(t)) tips.push(t); }));
    return {
      title: `${p.city} ${p.days} 天 · ${prefLabel} × ${intLabel}攻略`,
      overview: top
        ? `按「${prefLabel}」偏好与「${intLabel}」强度，从 ${p.matches.length} 篇相似攻略（${p.matches.map(m => '《' + m.guide.title + '》').join('、')}）改编：优先安排与你偏好一致的点位，节奏按 ${intLabel} 控制。${p.season && p.season.tip ? ' ' + p.season.tip : ''}`
        : `${p.city} ${p.days} 天行程，按 ${prefLabel} 偏好与 ${intLabel} 强度安排。`,
      daily, tips,
      basedOn: (p.matches || []).map(m => m.guide.title)
    };
  }

  /** 用 LLM 改写（可选步骤）。失败/未接入时保留本地合成并注明。 */
  async function withLLM(prev, memories) {
    if (!globalThis.TourisLLM) return prev;
    const r = await globalThis.TourisLLM.guide({
      city: prev.city, days: prev.days, month: prev.month,
      season: prev.season && prev.season.label, weather: prev.season && prev.season.weather,
      interest: prev.interest, intensity: prev.intensity,
      guides: prev.matches.map(m => m.guide),
      memories: memories || []
    });
    if (r.ok) {
      return Object.assign({}, prev, { composed: r.guide, llm: true });
    }
    return Object.assign({}, prev, { llmNote: r.degraded });
  }

  globalThis.TourisRAG = { retrieve, withLLM, seasonOf };
})();
