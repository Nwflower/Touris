/* ==========================================================================
   Touris 知途 · 算法路线规划器

   流水线（对应产品叙事「LLM 出候选 → 算法排线」）：

     TourisPlanner.compare(city, opts)
       │
       ├─ 1. 候选池过滤      ：排除车站；命中记忆 avoid 的点整体出局
       ├─ 2. 评分排序        ：兴趣匹配 + 记忆 prefer + LLM 提名加分（确定性）
       ├─ 3. 选点            ：按风格配额（特种兵/适中/闲庭漫步）取 top-K
       ├─ 4. 分天聚类        ：确定性 k-means（k=天数，最远点初始化）+ 配额再平衡
       ├─ 5. 日内排序        ：最近邻 + 2-opt（目标=最小化通勤时间）
       ├─ 6. 时间表          ：出发时间/就近午餐/慢节奏午后休息/宵禁前回退
       │                       当天放不下的点按顺序丢掉 —— 这就是「行为回退」
       └─ 7. 记忆溯源        ：每处取舍反查到具体记忆 id（whoContributes）

   三套风格 = 同一引擎跑三次配额：p-packed(快) / p-local(中) / p-resort(慢)。
   「默认版 vs 记忆版」= 引擎跑两次（memories=[] vs memories=all），
   diff 由两次结果逐天对齐算出。全部城市走同一套推导，不再手写对照。
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 参数 ---------------- */
  const WALK_KMH = 4.2;          // 景区周边步行
  const TRANSIT_KMH = 20;        // 市内公交/打车（含停站）
  const TRANSIT_FIXED_MIN = 10;  // 打车/等车固定开销
  const NEAR_WALK_KM = 1.5;      // 1.5km 内按步行算
  const TRANSIT_CAP_MIN = 85;    // 单段通勤上限（更远的点位会被宵禁挤掉）
  const LUNCH_MIN = 75;
  const LUNCH_EARLIEST = 11.4 * 60;
  const DINNER_MIN = 60;
  const CURFEW = { fast: 21.2 * 60, mid: 20.3 * 60, slow: 19.4 * 60 };
  const START_HOUR = { fast: 8.0, mid: 8.75, slow: 9.5 };
  const PER_DAY = { fast: [4, 5], mid: [3, 4], slow: [2, 3] };
  const VISIT_SCALE = { fast: 0.92, mid: 1.0, slow: 1.15 };
  const REST_MIN = 100;
  const ONSITE_WALK_FACTOR = 0.45;   // 园内步行折算：每游览 1h ≈ 0.45km

  const CAT_VISIT = { museum: 150, temple: 100, garden: 120, street: 100, river: 80, tower: 70, shopping: 100, market: 80, castle: 150, bamboo: 100, path: 60, indoor: 90 };
  const CULTURE_CATS = ['museum', 'temple', 'street', 'market', 'castle'];
  const NATURE_CATS = ['garden', 'bamboo', 'river', 'path'];

  /* ---------------- 基础工具 ---------------- */
  function rad(d) { return d * Math.PI / 180; }
  function distKm(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  function transitMin(km) {
    let m = km <= NEAR_WALK_KM ? km / WALK_KMH * 60 : TRANSIT_FIXED_MIN + km / TRANSIT_KMH * 60;
    return Math.min(TRANSIT_CAP_MIN, Math.ceil(m / 5) * 5);
  }
  function fmtClock(min) {
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function visitOf(spot, paceKey) {
    return Math.round((spot.visitMin || CAT_VISIT[spot.cat] || 90) * VISIT_SCALE[paceKey]);
  }

  /* 兴趣加分：中文标签匹配，命中越多分越高 */
  const CULTURE_WORDS = ['古建筑', '历史建筑', '文博', '展馆', '博物馆', '寺院', '遗址', '老街', '胡同', '石库门', '古镇', '书院', '近代史', '古塔', '戏楼', '教堂', '传统村落', '工艺', '步行街', '老字号', '西关', '骑楼', '岭南', '客家', '古港', '渔村', '会馆'];
  const NATURE_WORDS = ['自然', '湖景', '湿地', '公园', '海景', '海湾', '沙滩', '山海', '溪谷', '竹林', '植物', '登山', '爬山', '绿道', '日落', '日出', '观鸟', '海岛', '河川', '滨江', '水乡', '大天鹅', '荷花园', '兰花园'];
  function interestBonus(spot, interest) {
    if (interest === 'mixed') return 0;
    const words = interest === 'culture' ? CULTURE_WORDS : NATURE_WORDS;
    const cats = interest === 'culture' ? CULTURE_CATS : NATURE_CATS;
    let hit = cats.includes(spot.cat) ? 1 : 0;
    (spot.tags || []).forEach(t => { if (words.includes(t)) hit++; });
    return Math.min(hit, 3) * 0.5;
  }

  /* ---------------- 候选池 + 评分 ---------------- */

  /* 预算偏好加分。**不是闸门**——贵的点不会被踢出去，只是同等条件下排在后面。
     量级刻意压到一条 prefer 标签（0.5）的水平：mixed 兴趣下绝大多数点同分 3.0，
     加分一旦超过这个量级就会**主导**排序，把兴趣和记忆全压过去——
     实测 +1.2 时北京连故宫都进不了前十，那不是「偏好」，那是指令。 */
  const BUDGET_BONUS = { free: 0.25, low: 0.12, mid: 0, high: -0.12 };
  function budgetBonus(cityName, name, budget){
    if (!budget || typeof TOURIS_BUDGET === 'undefined') return 0;
    /* 预算档位越紧，价差越要拉开；high（不设限）时不加不减 */
    const k = budget === 'low' ? 1 : budget === 'mid' ? 0.6 : 0;
    return (BUDGET_BONUS[TOURIS_BUDGET.tierOf(cityName, name)] || 0) * k;
  }

  /* ★ 排序起点是数据里的口碑分（spot.score，各城 4.3–4.8），不是一刀切的 3.0。

     早先这里写死 3.0，于是「0 记忆 + mixed 兴趣 + 无预算」这条默认路上，
     全部候选同分，排序实际退化成了 sort 的兜底项——按景点名的 UTF-16 码点。
     实测北京：故宫博物院排第 29 位，而每轮只取 top 16（4 天 × mid 每日上限 4），
     三套默认方案里一次都没出现，天坛 / 颐和园 / 雍和宫 / 慕田峪长城同样落选，
     选出来的是军事博物馆、卢沟桥、世贸天阶——纯属名字码点靠前。
     而界面在 S2 是把这个 score 当口碑分展示的（★★★★☆ 4.8），两边对不上。

     没有 score 的（杭州 / 广州 / 成都三城目前整城没有，其余城的扩充点也没有）
     给 UNRATED：整体排在有点评分的那批之后，但仍能靠兴趣 / 记忆 / LLM 加分爬上来。 */
  const UNRATED = 4.0;

  function buildPool(city, opts) {
    const memories = opts.memories || [];
    const cons = typeof constraintsOf === 'function' ? constraintsOf(memories) : { avoid: [], prefer: [], pace: null };
    const llm = opts.llmCandidates || null;
    const llmRank = new Map((llm || []).map((n, i) => [n, i]));
    const semOfSafe = name => typeof semOf === 'function' ? semOf(name, city.spots) : { prefer: [], avoid: [] };
    const pool = [];
    Object.entries(city.spots).forEach(([name, s]) => {
      if (s.cat === 'station') return;                    // 车站不排线
      if (!city.geo[name]) return;                        // 没坐标不能排线
      const avoid = semOfSafe(name).avoid.filter(t => cons.avoid.includes(t));
      if (avoid.length) return;                           // 记忆回避：整体出局
      /* 「去过了」不是语义偏好，是针对这一处的记忆，所以单独一层闸：
         它不该让「所有博物馆」出局，只该让这一处出局。 */
      if ((cons.avoidSpots || []).includes(name)) return;
      const prefer = semOfSafe(name).prefer.filter(t => cons.prefer.includes(t));
      let score = Number.isFinite(s.score) ? s.score : UNRATED;
      score += interestBonus(s, opts.interest || 'mixed');
      score += prefer.length * 0.5;
      if (llmRank.has(name)) score += 1.2 - llmRank.get(name) * 0.02;   // LLM 提名加分
      score += budgetBonus(city.name, name, cons.budget);                // 预算偏好加分
      pool.push({ name, spot: s, geo: city.geo[name], score: Math.round(score * 100) / 100, prefer });
    });
    pool.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return { pool, cons };
  }

  /* ---------------- 分天聚类：确定性 k-means ---------------- */
  function clusterDays(items, k, centerGeo) {
    const geoOf = it => ({ lat: it.geo.lat, lng: it.geo.lng });
    if (k <= 1) return [items.slice()];
    if (items.length <= k) {
      const gs = items.map(it => [it]);
      while (gs.length < k) gs.push([]);
      return gs;
    }
    const seeds = [];
    let first = items[0], fd = -1;
    items.forEach(it => { const d = distKm(geoOf(it), centerGeo); if (d > fd) { fd = d; first = it; } });
    seeds.push(geoOf(first));
    while (seeds.length < k) {
      let best = null, bd = -1;
      items.forEach(it => {
        const d = Math.min(...seeds.map(s => distKm(geoOf(it), s)));
        if (d > bd) { bd = d; best = it; }
      });
      seeds.push(geoOf(best));
    }
    let groups = [];
    for (let iter = 0; iter < 30; iter++) {
      groups = seeds.map(() => []);
      items.forEach(it => {
        let bi = 0, bd = Infinity;
        seeds.forEach((s, i) => { const d = distKm(geoOf(it), s); if (d < bd) { bd = d; bi = i; } });
        groups[bi].push(it);
      });
      let moved = false;
      groups.forEach((g, i) => {
        if (!g.length) return;
        const c = { lat: g.reduce((a, x) => a + x.geo.lat, 0) / g.length, lng: g.reduce((a, x) => a + x.geo.lng, 0) / g.length };
        if (distKm(c, seeds[i]) > 0.05) moved = true;
        seeds[i] = c;
      });
      if (!moved) break;
    }
    return groups;
  }

  /* ---------------- 日内排序：最近邻 + 2-opt ---------------- */
  function orderDay(group, startGeo) {
    if (group.length <= 2) return group.slice();
    const pts = group.map(g => ({ lat: g.geo.lat, lng: g.geo.lng }));
    const used = new Array(group.length).fill(false);
    const order = [];
    let cur = startGeo;
    for (let n = 0; n < group.length; n++) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < group.length; i++) {
        if (used[i]) continue;
        const d = distKm(cur, pts[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      used[bi] = true; order.push(bi); cur = pts[bi];
    }
    const leg = seq => {
      let t = 0, c = startGeo;
      for (const i of seq) { t += distKm(c, pts[i]); c = pts[i]; }
      return t;
    };
    let best = order.slice(), bestLen = leg(order), improved = true, guard = 0;
    while (improved && guard++ < 40) {
      improved = false;
      for (let i = 0; i < best.length - 1; i++) {
        for (let j = i + 1; j < best.length; j++) {
          const cand = best.slice();
          for (let x = i, y = j; x < y; x++, y--) { const t = cand[x]; cand[x] = cand[y]; cand[y] = t; }
          const len = leg(cand);
          if (len < bestLen - 0.001) { best = cand; bestLen = len; improved = true; }
        }
      }
    }
    return best.map(i => group[i]);
  }

  /* ---------------- 就近餐饮锚点 ---------------- */
  function nearestDining(city, geo) {
    let best = null, bd = Infinity;
    Object.entries(city.restPoi || {}).forEach(([id, anchor]) => {
      const g = city.geo[anchor];
      if (!g) return;
      const d = distKm(geo, g);
      if (d < bd) { bd = d; best = id; }
    });
    return best;
  }
  function diningGeo(city, id) {
    const anchor = id && city.restPoi[id] ? city.restPoi[id] : null;
    return anchor && city.geo[anchor] ? city.geo[anchor] : null;
  }

  /* ---------------- 时间表（含行为回退） ----------------
     宵禁前放不下的点直接跳过（drops 记录），后面的点继续尝试——
     这样「去不了长城也能去成 neighbourhood 的公园」，行程不会整体报废。 */
  function scheduleDay(city, group, paceKey, opts, startGeo) {
    const curfew = CURFEW[paceKey];
    const items = [];
    const drops = [];
    let clock = START_HOUR[paceKey] * 60;
    let cur = startGeo;
    let lunchDone = false, restDone = false;
    let walkKm = 0, transitSum = 0, visitSum = 0, spots = 0;

    for (const g of group) {
      const gGeo = { lat: g.geo.lat, lng: g.geo.lng };
      // 午餐：临近中午就地在最近餐饮锚点插入
      if (!lunchDone && (clock + 0 >= LUNCH_EARLIEST || (g === group[group.length - 1] && clock >= LUNCH_EARLIEST - 60))) {
        const dn = nearestDining(city, cur);
        const dnG = diningGeo(city, dn) || cur;
        const dkm = distKm(cur, dnG), dt = transitMin(dkm);
        if (dn) items.push({ kind: 'food', id: dn, arrive: clock, transitKm: Math.round(dkm * 10) / 10, transitMin: dt, dinner: false });
        clock += dt + LUNCH_MIN;
        transitSum += dt;
        cur = dnG;
        lunchDone = true;
      }
      // 慢节奏午后休息
      if (!restDone && paceKey === 'slow' && clock >= 13.5 * 60) {
        items.push({ kind: 'free', name: '午后自由休息', dur: REST_MIN, arrive: clock });
        clock += REST_MIN;
        restDone = true;
      }
      const km = distKm(cur, gGeo), tmin = transitMin(km);
      const arrive = clock + tmin;
      const stay = visitOf(g.spot, paceKey);
      if (arrive + stay > curfew) { drops.push(g); continue; }   // ★ 行为回退
      items.push({ kind: 'spot', g, arrive, transitKm: Math.round(km * 10) / 10, transitMin: tmin, dur: stay });
      if (km <= NEAR_WALK_KM) walkKm += km; else transitSum += tmin;
      visitSum += stay;
      spots++;
      clock = arrive + stay;
      cur = gGeo;
    }
    // 特种兵档收尾晚饭
    if (paceKey === 'fast' && spots > 0 && clock >= 17.5 * 60 && clock < CURFEW.fast - DINNER_MIN - 40) {
      const dn = nearestDining(city, cur);
      const dnG = diningGeo(city, dn) || cur;
      const dkm = distKm(cur, dnG), dt = transitMin(dkm);
      if (dn) items.push({ kind: 'food', id: dn, arrive: clock, transitKm: Math.round(dkm * 10) / 10, transitMin: dt, dinner: true });
      clock += dt + DINNER_MIN;
      transitSum += dt;
    }
    return { items, drops, walkKm: Math.round(walkKm * 10) / 10, transitSum: Math.round(transitSum), visitSum: Math.round(visitSum), spots };
  }

  /* ---------------- 一套风格 plan ---------------- */
  function planOne(city, pool, paceKey, days, opts, styleMeta) {
    const [minN, maxN] = PER_DAY[paceKey];
    const target = Math.min(days * maxN, pool.length);
    const picked = pool.slice(0, target);
    const centerGeo = { lat: city.center[0], lng: city.center[1] };
    const groups = clusterDays(picked, days, centerGeo);

    // 配额再平衡：单日超上限的最低分点挪去质心最近且有富余的日子
    for (let round = 0; round < 6; round++) {
      let moved = false;
      groups.forEach((g, i) => {
        if (g.length <= maxN) return;
        g.sort((a, b) => b.score - a.score);
        const loser = g[g.length - 1];
        let bi = -1, bd = Infinity;
        groups.forEach((h, j) => {
          if (j === i || h.length >= maxN) return;
          const c = h.length
            ? { lat: h.reduce((a, x) => a + x.geo.lat, 0) / h.length, lng: h.reduce((a, x) => a + x.geo.lng, 0) / h.length }
            : centerGeo;
          const d = distKm({ lat: loser.geo.lat, lng: loser.geo.lng }, c);
          if (d < bd) { bd = d; bi = j; }
        });
        if (bi >= 0) { g.pop(); groups[bi].push(loser); moved = true; }
      });
      if (!moved) break;
    }

    const dayResults = groups.map(g => scheduleDay(city, orderDay(g, centerGeo), paceKey, opts, centerGeo));

    // 兜底：万一整天被宵禁清空，从最满的一天挪一个点过来重排
    dayResults.forEach((dr, i) => {
      if (dr.spots > 0) return;
      let fullest = -1;
      dayResults.forEach((x, j) => { if (x.spots > minN && (fullest < 0 || x.spots > dayResults[fullest].spots)) fullest = j; });
      if (fullest < 0) return;
      const donor = dayResults[fullest];
      const transfer = donor.items.filter(x => x.kind === 'spot').slice(-1)[0];
      if (!transfer) return;
      donor.items = donor.items.filter(x => x !== transfer);
      donor.spots--;
      const redo = scheduleDay(city, [transfer.g], paceKey, opts, centerGeo);
      dayResults[i] = redo;
    });

    // 生成渲染结构
    const start = /^\d{4}-\d{2}-\d{2}$/.test(opts.date || '') ? opts.date : '2026-10-02';
    const routeDays = [], itinDays = [], walkArr = [];
    dayResults.forEach((dr, d) => {
      const items = [], dayRoute = [];
      dr.items.forEach((it, i) => {
        const common = { id: `d${d + 1}-${i + 1}`, time: fmtClock(it.arrive) };
        if (it.kind === 'spot') {
          const name = it.g.name;
          items.push(Object.assign(common, {
            kind: 'spot', name, dur: `${it.dur} min`,
            note: dayRoute.length === 0 && items.every(x => x.kind !== 'spot')
              ? `从住处出发 · 通勤约 ${it.transitMin} 分钟`
              : `距上一站 ${it.transitKm} km · 约 ${it.transitMin} 分钟`,
            memoryIds: opts.memIdsOf ? opts.memIdsOf(name) : []
          }));
          dayRoute.push(name);
        } else if (it.kind === 'food') {
          const gid = it.id;
          if (gid && city.dining[gid]) {
            items.push(Object.assign(common, {
              kind: 'food', name: gid,
              note: `${it.dinner ? '晚餐' : '午餐'} · 距上一站 ${it.transitKm} km · 约 ${it.transitMin} 分钟`,
              memoryIds: opts.memIdsOf ? opts.memIdsOf('food') : []
            }));
          }
        } else {
          items.push(Object.assign(common, {
            kind: 'free', name: it.name, dur: `${it.dur} min`,
            note: '按你的节奏偏好插入的休息空档',
            memoryIds: opts.memIdsOf ? opts.memIdsOf('free') : []
          }));
        }
      });
      routeDays.push(dayRoute);
      walkArr.push(Math.round((dr.walkKm + dr.visitSum / 60 * ONSITE_WALK_FACTOR) * 10) / 10);
      const date = new Date(start + 'T12:00:00Z');
      date.setUTCDate(date.getUTCDate() + d);
      itinDays.push({
        day: d + 1, date: date.toISOString().slice(5, 10),
        theme: dayRoute.length ? `${dayRoute[0]} · ${dayRoute[dayRoute.length - 1]}` : '自由安排',
        pace: { fast: 5, mid: 3, slow: 2 }[paceKey],
        paceNote: `${fmtClock(START_HOUR[paceKey] * 60)} 出发 · 游览约 ${Math.round(dr.visitSum / 60)} 小时 · 通勤约 ${dr.transitSum} 分钟`,
        items, memoryIds: []
      });
    });

    const flatSpots = routeDays.flat();
    const plan = {
      id: styleMeta.id, style: styleMeta.style,
      paceKey,                                   // 超预算要按同一档重排，得记住自己是哪档
      tagline: styleMeta.tagline(days, flatSpots.length),
      pace: { fast: 5, mid: 3, slow: 2 }[paceKey],
      density: Math.round(flatSpots.length / days * 10) / 10,
      stay: { area: opts.stay.area, dist: opts.stay.theme || opts.stay.note || '' },
      food: styleMeta.food,
      walk: walkArr,
      walkNote: `步行约 ${Math.min(...walkArr)}—${Math.max(...walkArr)} km/天 · 通勤按点位实距计算`,
      highlights: flatSpots.slice(0, 5),
      routeDays, memoryIds: [], itinerary: null,
      /* 门票人均合计（按档位中值估）。没有预算数据时是 0，不影响既有行为 */
      ticketTotal: typeof TOURIS_BUDGET !== 'undefined' ? TOURIS_BUDGET.ticketTotal(city.name, routeDays) : 0
    };
    plan.itinerary = { planId: plan.id, stay: opts.stay, days: itinDays };
    plan.meta = { drops: dayResults.reduce((a, dr) => a + dr.drops.length, 0), transitPerDay: dayResults.map(dr => dr.transitSum) };
    return plan;
  }

  /* ---------------- 默认版 vs 记忆版 的 diff ---------------- */
  function diffRuns(city, defRes, memRes, memories, days, planId) {
    const changes = [];
    const cons = constraintsOf(memories || []);
    const avoidIds = n => {
      const sem = semOf(n, city.spots);
      return [...new Set([
        ...sem.avoid.flatMap(t => whoContributes(memories || [], 'avoid', t)),
        ...whoSpotted(memories || [], n)     // 「去过了」也是避开这处的理由，一样要上账
      ])];
    };
    const preferIds = n => {
      const sem = semOf(n, city.spots);
      return [...new Set(sem.prefer.flatMap(t => whoContributes(memories || [], 'prefer', t)))];
    };
    const paceIds = (memories || []).filter(m => m.pace).map(m => m.id);

    /* 只对照「所选方案」——S5 的语义是「记忆改变了你选的这套行程」，
       三套风格全对照会产生上百条噪音 diff */
    const mp = memRes.plans.find(p => p.id === planId);
    const dp = defRes.plans.find(p => p.id === planId);
    if (mp && dp) {
      for (let d = 0; d < days; d++) {
        const before = new Set(dp.routeDays[d] || []);
        const after = mp.routeDays[d] || [];
        const afterSet = new Set(after);
        before.forEach(n => {
          if (afterSet.has(n)) return;
          const ids = avoidIds(n);
          if (!ids.length) return;                       // 说不出理由的变化不上账
          changes.push({ id: `x-${mp.id}-${d}-r-${n}`, day: d + 1, kind: 'removed', target: n,
            text: `按你的记录避开「${n}」`, memoryIds: ids });
        });
        after.forEach(n => {
          if (before.has(n)) return;
          const ids = preferIds(n);
          if (!ids.length) return;
          changes.push({ id: `x-${mp.id}-${d}-a-${n}`, day: d + 1, kind: 'added', target: n,
            text: `补上「${n}」——和你记录的偏好一致`, memoryIds: ids });
        });
      }
    }
    if (cons.pace && paceIds.length && mp && dp && mp.pace !== dp.pace) {
      changes.push({ id: `x-pace-${mp.id}`, day: 0, kind: 'changed', target: 'pace',
        text: `「${mp.style}」从每日 ${dp.pace} 档调整为 ${mp.pace} 档`,
        from: `${dp.pace} 档`, to: `${mp.pace} 档`, memoryIds: paceIds });
    }
    if (cons.pace && paceIds.length) {
      changes.push({ id: 'x-rest', day: 0, kind: 'added', target: 'free',
        text: '按你的节奏偏好，行程里插入午后休息空档', memoryIds: paceIds });
    }
    /* 摘要现算 */
    const removedN = changes.filter(x => x.kind === 'removed').length;
    const addedN = changes.filter(x => x.kind === 'added' && x.target !== 'free').length;
    const paceN = changes.filter(x => x.target === 'pace').length;
    const restN = changes.filter(x => x.target === 'free').length;
    const parts = [];
    if (removedN) parts.push(`避开 ${removedN} 处与你记录冲突的点`);
    if (addedN) parts.push(`补上 ${addedN} 处你偏好的地方`);
    if (paceN) parts.push('按记忆调整了行程节奏');
    if (restN) parts.push('插入午后休息空档');
    if (!parts.length) parts.push('这套路线和你的记录没有冲突，选点与排序没有变化');
    return { changes, summary: parts.join('，') + '。' };
  }

  /* ---------------- 主入口 ---------------- */
  /**
   * compare(city, opts) → {
   *   def:  默认引擎结果（0 记忆）
   *   mem:  记忆引擎结果（可 = def，当 memories 为空）
   *   diffs, diffSummary
   * }
   * opts: { days, date, interest:'culture'|'nature'|'mixed', intensity:'fast'|'mid'|'slow',
   *         memories:[], llmCandidates:[names] }
   * 结果内部结构（def/mem 相同）：
   *   plans[], byId{}, recommendedId, poolSize, effPace, days
   */
  function run(city, opts) {
    opts = opts || {};
    const days = Math.max(2, Math.min(7, Number(opts.days) || 4));
    const memories = opts.memories || [];
    const { pool, cons } = buildPool(city, { memories, interest: opts.interest, llmCandidates: opts.llmCandidates });

    /* 住宿归一化：各城市字段形态不一（defaultStay/memoryStay / 单一 stayArea /
       按风格分组的 stay map），统一收敛成一个带 picks 的 stay 对象 */
    let stay = city.defaultStay || null;
    if (!stay && city.stay) {
      stay = city.stay.area ? city.stay : Object.values(city.stay).find(v => v && v.area) || null;
    }
    if (!stay && city.stayArea) {
      stay = {
        area: city.stayArea, theme: '住宿区域建议',
        note: '按实际到达车站、预算与预订条件选择；暂无酒店报价。',
        memoryIds: [],
        picks: [{ style: '交通方便的酒店', room: '房型自选', price: '查询实时房价', note: '预订前核对位置、取消政策与近期评价。' }]
      };
    }
    if (!stay) stay = { area: city.name + ' 市中心一带', theme: '交通方便', note: '出行前核对具体酒店。', memoryIds: [], picks: [] };
    /* 慢节奏记忆且城市备有「记忆版住宿」时换住 */
    if (cons.pace === 'slow' && city.memoryStay) stay = city.memoryStay;

    /* pace 合并：用户强度是意愿，记忆 pace 是事实——记忆优先 */
    const userPace = opts.intensity === 'fast' ? 'fast' : opts.intensity === 'slow' ? 'slow' : 'mid';
    const effPace = cons.pace || userPace;

    const styleMeta = {
      fast: { id: 'p-packed', style: '暴走打卡型', food: ['热门商圈餐饮', '连锁简餐'], tagline: (d, n) => `${d} 天 ${n} 个点位 · 特种兵强度，一个不漏` },
      mid: { id: 'p-local', style: '均衡探索型', food: ['本地小馆', '街区小吃'], tagline: (d, n) => `${d} 天 ${n} 个点位 · 通勤与游览均衡分配` },
      slow: { id: 'p-resort', style: '闲庭漫步型', food: ['街区茶座', '下午茶'], tagline: (d, n) => `${d} 天 ${n} 个点位 · 每天留足休息与散步余量` }
    };
    const memIdsOf = name => {
      if (name === 'free') return (memories || []).filter(m => m.pace).map(m => m.id);
      if (name === 'food') return whoContributes(memories, 'prefer', 'local-food');
      const sem = semOf(name, city.spots);
      return [...new Set(sem.prefer.flatMap(t => whoContributes(memories, 'prefer', t)))];
    };
    const paces = [effPace, ...['fast', 'mid', 'slow'].filter(p => p !== effPace)];
    /* 预算已经作为**加分项**进了 buildPool 的评分（见 budgetBonus），这里不再做任何过滤：
       三档节奏跑的还是同一个池子，只是贵的点在预算紧时排得靠后。
       于是「预算有限」会让方案整体变便宜，而不会退化成「只去免费景点」。 */
    const plans = paces.map(pk => planOne(city, pool, pk, days, { date: opts.date, stay, memIdsOf }, styleMeta[pk]));

    plans.forEach(p => {
      p.memoryIds = [...new Set(p.itinerary.days.flatMap(d => d.items.flatMap(i => i.memoryIds)))];
      if (memories.length) p.memoryNote = '选点与排序按你的记忆偏好与节奏计算';
    });
    /* 推荐位 / 冲突位 */
    if (memories.length) {
      const mid = plans.find(p => p.id === 'p-local'), fast = plans.find(p => p.id === 'p-packed'), slow = plans.find(p => p.id === 'p-resort');
      if (mid) mid.recommended = true;
      if (cons.pace === 'slow' && fast) { fast.conflict = true; fast.memoryNote = '与你的慢节奏记忆冲突较多：点位密度按特种兵档排出'; }
      if (cons.pace === 'fast' && slow) { slow.conflict = true; slow.memoryNote = '与你想走紧凑一点的记忆冲突：每天只安排 2-3 个点'; }
    }
    const byId = {};
    plans.forEach(p => { byId[p.id] = p; });
    return {
      plans, byId,
      recommendedId: memories.length ? 'p-local' : plans[0].id,
      poolSize: pool.length, effPace, days, city
    };
  }

  function compare(city, opts) {
    opts = opts || {};
    const days = Math.max(2, Math.min(7, Number(opts.days) || 4));
    const memories = opts.memories || [];
    const def = run(city, Object.assign({}, opts, { memories: [] }));
    if (!memories.length) {
      return { def, mem: def, diffs: [], diffSummary: '还没有记忆参与，这是通用默认版。', days };
    }
    const mem = run(city, opts);
    const planId = opts.planId || mem.recommendedId || 'p-local';
    const { changes, summary } = diffRuns(city, def, mem, memories, days, planId);
    return { def, mem, diffs: changes, diffSummary: summary, days, planId };
  }

  globalThis.TourisPlanner = { run, compare, transitMin, distKm, fmtClock };
})();
