/* ==========================================================================
   Touris 知途 · 对照推导

   ★ 这个文件存在的理由

   原型里「用了记忆」和「没用记忆」是**两份手写数据**（PLANS_DEFAULT /
   PLANS_MEMORY、ITIN_DEFAULT / ITIN_MEMORY），住宿、出发时间、步行量、
   休息节点全都不同。要改一个偏心得同时改多处，而且「m03 意味着别排博物馆」
   这层含义硬编码在数据里，加城市就得重写一遍。

   这里反过来：只留**一份**默认路线，然后拿记忆聚合出的约束去**组合**它，
   把前后差异算出来。于是：
     · 加城市只需填景点和路线，对照自动成立
     · 改一条记忆，对照立刻跟着变，不会出现「改了记忆忘了改对照」

   输出的 diff 形状与原型的 DIFFS 一致（id/day/kind/target/text/memoryIds），
   memoryIds 由**贡献该约束的记忆反查**得到，不再手写。

   ★ 组合，不只是过滤

   曾经这里只读 cons.avoid 和 cons.pace，cons.prefer 一路只走到徽章为止——
   后果是**记忆只能否决，不能偏好**：首页写着「会优先」，引擎从不执行优先。
   一份 18 个点的行程被砍掉 7 个却只补回 1 个（候选被第一天贪心吃光），
   「记忆版」于是只剩"少了几个点"。

   现在有两组动作，都是确定性的：
     裁剪  pace=slow 时一天压到 PACE_CAP 个点，优先留下命中偏好的
     补位  有空缺就从库里挑命中偏好的点补进来

   三条纪律：
     · **一天的点位控制在预算内**：normal 的预算是作者写好的长度，slow 是
       min(PACE_CAP, 长度)。超了就裁，没满就补喜欢的——两种动作共用同一个预算，
       不按 pace 分成两套规则。
     · **不重排时间轴**：每个点带着自己原来的槽位，时刻仍取 d.times[槽位]。
       补进来的点占空缺的槽位，候补不够就如实留空——不把后面的时刻往前挪，
       也不为了填补而编一份没算过的行程（见 app/views/plan.js 的同一处约定）。
     · **候选按轮分配，不按天贪心**：贪心的后果实测过，京都有 7 个空缺、4 个候选，
       却只补进 1 个——全被第一天吃光，后面的天还空掉了。
   ========================================================================== */

const Derive = (() => {

  /** 某一天里，哪些景点该被排除，以及分别是被哪条约束排除的 */
  function filterDay(spots, spotsMap, cons){
    spotsMap = spotsMap || {};
    cons = cons || { avoid: [], prefer: [] };
    const avoid = cons.avoid || [];
    const kept = [];
    const dropped = [];
    (spots || []).forEach(name => {
      const s = spotsMap[name];
      // 没有资料的点保留：宁可留着，不要因为缺数据就把行程掏空
      if(!s){ kept.push(name); return; }
      const hit = (s.avoid || []).find(t => avoid.includes(t));
      if(hit){ dropped.push({ name, tag:hit }); }
      else { kept.push(name); }
    });
    return { kept, dropped };
  }

  /** 把一堆被排除的景点按原因归并成几条人话，不要每个点单列一条 */
  function groupDropped(dropped){
    const byTag = new Map();
    dropped.forEach(d => {
      if(!byTag.has(d.tag)) byTag.set(d.tag, []);
      byTag.get(d.tag).push(d.name);
    });
    return [...byTag.entries()].map(([tag, names]) => ({ tag, names }));
  }

  /** 标签 → 人话。用产品语言，不要暴露内部标签名。 */
  const WHY = {
    museum:      '你明确说过不喜欢大型博物馆',
    crowd:       '这几处人流高峰时会很挤',
    queue:       '这类店通常要排队',
    'walk-heavy':'走路太多，超出你习惯的量',
    mall:        '你不逛大型商场'
  };

  /** 偏好标签 → 人话。同样写成一句话，因为它要当补位的理由。 */
  const LIKE = {
    market:       '你爱逛本地市场',
    garden:       '你喜欢庭园',
    bamboo:       '你喜欢竹林',
    river:        '你喜欢临水的路线',
    temple:       '你喜欢寺庙神社',
    'local-food': '你偏好本地小馆',
    'street-food':'你喜欢小吃摊',
    dessert:      '你喜欢甜品与茶室',
    evening:      '你愿意把傍晚留给寺庙',
    quiet:        '你喜欢安静的地方',
    'old-town':   '你偏爱老城区',
    view:         '你喜欢登高看景',
    craft:        '你喜欢手作小店',
    free:         '你偏好不花钱的地方'
  };

  /* ---------------- 组合 ----------------
     注意 PACE_CAP 只是个可调常量，不是什么推导出来的真理。取 3 是拿文案里
     「2–3 个」的**上限**——宁可少裁一点，也不要为了叙事把行程掏空。 */
  const PACE_CAP = { slow: 3 };

  /** 一个点命中了哪些偏好约束 */
  function preferTags(name, spotsMap, cons){
    const s = spotsMap[name];
    if(!s) return [];
    const p = (cons && cons.prefer) || [];
    return (s.prefer || []).filter(t => p.includes(t));
  }

  /** 当天点位的预算。slow 压缩，其余维持作者写好的长度。 */
  function dayCap(day, cons){
    const len = (day.spots || []).length;
    return (cons && cons.pace === 'slow') ? Math.min(PACE_CAP.slow, len) : len;
  }

  /** 当天已保留点位的中心，用来判断候补点会不会远到离谱 */
  function centroid(names, poi){
    const pts = names.map(n => poi[n]).filter(Boolean);
    if(!pts.length) return null;
    return {
      x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
      y: pts.reduce((a, p) => a + p.y, 0) / pts.length
    };
  }
  /** 平方距离。缺坐标的返回 Infinity：排最后，但不排除。 */
  function dist2(a, b){
    if(!a || !b) return Infinity;
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  /** 候补点的排序：命中偏好多的优先 → 离当天近的 → 名字兜底（保证结果稳定） */
  function rankCandidates(spotsMap, cons, poi, center){
    return (a, b) => {
      const ha = preferTags(a, spotsMap, cons).length;
      const hb = preferTags(b, spotsMap, cons).length;
      if(ha !== hb) return hb - ha;
      const da = dist2(poi[a], center), db = dist2(poi[b], center);
      if(da !== db) return da - db;
      return a < b ? -1 : a > b ? 1 : 0;
    };
  }

  /** 补位候选：库里有资料、有坐标、不撞 avoid、命中偏好、本次路线里没用过 */
  function fillCandidates(city, cons, used){
    const spotsMap = (city && city.spots) || {};
    const poi = (city && city.poi) || {};
    const avoid = (cons && cons.avoid) || [];
    return Object.keys(spotsMap).filter(n =>
      !used.has(n)
      && poi[n]                                              // 没坐标就画不出路线
      && !(spotsMap[n].avoid || []).some(t => avoid.includes(t))
      && preferTags(n, spotsMap, cons).length > 0
    );
  }

  /**
   * 组合出「用了记忆」的那份路线。diffs() 与各视图都从这里取结果，
   * 保证「显示出来的行程」和「算出来的差异」永远是同一份东西。
   *
   * @returns { days, added, trimmed, removed, before, after, emptyDays }
   *   days[i] 在原始天对象基础上多了 entries（逐点带槽位与来历）和 changed
   */
  function compose(city, cons){
    cons = cons || { avoid: [], prefer: [], pace: null };
    const spotsMap = (city && city.spots) || {};
    const poi = (city && city.poi) || {};
    const route = (city && city.routeDefault) || [];

    /* --- 一：过 avoid，并把所有保留点登记进 used，防止补位时跨天重复 --- */
    const staged = route.map(d => {
      const r = filterDay(d.spots, spotsMap, cons);
      return { d, kept: r.kept, dropped: r.dropped };
    });
    const used = new Set();
    staged.forEach(st => st.kept.forEach(n => used.add(n)));

    const removed = [], trimmed = [], added = [];

    /* --- 二：裁剪。命中偏好多的先留，再按槽位还原顺序——
           偏好决定"留谁"，不该决定"先去哪"；顺序一动时间轴就假了。 --- */
    const wants = staged.map(st => {
      const d = st.d, cap = dayCap(d, cons);
      st.dropped.forEach(x => removed.push({ day: d.n, name: x.name, tag: x.tag }));

      let picks = st.kept.map(name => ({
        name, slot: (d.spots || []).indexOf(name), origin: 'kept'
      }));

      if(picks.length > cap){
        const ranked = picks.slice().sort((a, b) =>
          preferTags(b.name, spotsMap, cons).length - preferTags(a.name, spotsMap, cons).length
          || a.slot - b.slot);
        const keep = new Set(ranked.slice(0, cap).map(p => p.name));
        picks.forEach(p => {
          if(!keep.has(p.name)){
            trimmed.push({ day: d.n, name: p.name, tags: preferTags(p.name, spotsMap, cons) });
          }
        });
        picks = picks.filter(p => keep.has(p.name));
      }

      /* 要补的槽位 = 原作腾出来的那些。
         ★ 放慢时**也补**，只补到当天的预算为止。一开始我把"放慢"写成"只裁不补"，
           结果演示账号的记忆里正好有 pace=slow，「补位」整个不执行，永远显示"补 0"。
           而且这条规则本身站不住：预算是"每天最多 N 个"——超了就裁、没满就补喜欢的，
           是同一件事的两面，没有理由按 pace 分成两种规则。 */
      const holes = (d.spots || []).map((_, i) => i)
        .filter(i => !picks.some(p => p.slot === i))
        .slice(0, Math.max(0, cap - picks.length));

      return { day: d.n, d, dropped: st.dropped, picks, holes };
    });

    /* --- 三：补位。候选按「轮」分配，**不按天贪心**。
           贪心的后果实测过：京都有 7 个空缺、5 个候选，却只补进 1 个——
           全被第一天吃光，后面的天还直接空掉了。按轮走，稀缺时每天先各得一个，
           「这一天没有可用的安排」比「第一天多补一个」难看得多。 --- */
    let pool = fillCandidates(city, cons, used);
    let progressed = pool.length > 0;
    while(progressed){
      progressed = false;
      wants.forEach(w => {
        if(!w.holes.length || !pool.length) return;
        const center = centroid(w.picks.map(p => p.name), poi);
        const chosen = pool.slice().sort(rankCandidates(spotsMap, cons, poi, center))[0];
        const slot = w.holes.shift();
        used.add(chosen);
        pool = pool.filter(n => n !== chosen);
        w.picks.push({ name: chosen, slot, origin: 'added' });
        added.push({ day: w.day, name: chosen, tags: preferTags(chosen, spotsMap, cons) });
        progressed = true;
      });
    }

    /* --- 四：整理成最终的天 --- */
    const days = wants.map(w => {
      const d = w.d;
      const picks = w.picks.slice().sort((a, b) => a.slot - b.slot);
      const entries = picks.map(p => {
        return {
          name: p.name,
          origin: p.origin,
          tags: preferTags(p.name, spotsMap, cons),
          time: (d.times || [])[p.slot] || '',
          // 补进来的点沿用**槽位**原有的时长（槽位是时间预算，不是景点的属性）。
          // 备注留空：那是原作者写给**那个点**的话，替一个新点编一句等于伪造；
          // 这个点自己的简介在 spotRow 里另有一行，也不需要这里再补一句。
          dur:  (d.durs || [])[p.slot] || '',
          note: p.origin === 'added' ? '' : ((d.notes || [])[p.slot] || '')
        };
      });
      return Object.assign({}, d, {
        spots: entries.map(e => e.name),
        entries,
        dropped: w.dropped,
        changed: w.dropped.length > 0
              || entries.some(e => e.origin === 'added')
              || entries.length !== (d.spots || []).length
      });
    });

    /* before / after 的「天」都用行程天数：行程长度是用户定的，不会因为
       记忆而变短——某一天空着是"那天没凑出安排"，不是"行程变成 3 天"。
       （原实现 after 用的是"有内容的天数"，和 before 口径不一致，会把
       空天读成行程缩水。） */
    return {
      days,
      added, trimmed, removed,
      before: { spots: route.reduce((a, d) => a + (d.spots || []).length, 0), days: route.length },
      after:  { spots: days.reduce((a, d) => a + d.spots.length, 0), days: route.length },
      emptyDays: days.filter(d => !d.spots.length).length
    };
  }

  /* ---------------- 对照 ----------------
     全部从 compose() 的结果反推，不另算一份，避免「显示的行程」和
     「算出来的差异」对不上。 */

  const paceIds = () => Archive.all().filter(m => m.pace === 'slow').map(m => m.id);

  /**
   * 推导对照差异。
   * @param city  城市数据对象
   * @param cons  Archive.constraints() 的输出
   * @returns { entries, summary, before, after }
   */
  function diffs(city, cons){
    const plan = compose(city, cons);
    const entries = [];
    let i = 1;

    /* --- 砍掉：按标签归并 --- */
    groupDropped(plan.removed).forEach(({ tag, names }) => {
      entries.push({
        id: 'd' + i++,
        day: 0,                                  // 0 = 全局，非某一天专属
        kind: 'removed',
        target: names.join('、'),
        text: `砍掉「${names.join('」「')}」——${WHY[tag] || '与你的记录冲突'}`,
        memoryIds: Archive.whoContributes('avoid', tag)
      });
    });

    /* --- 补上：这一条就是「会优先」的实现 --- */
    const addedByTag = new Map();
    plan.added.forEach(a => {
      const tag = a.tags[0];                     // 命中的第一个偏好标签，当这条的理由
      if(!tag) return;
      if(!addedByTag.has(tag)) addedByTag.set(tag, []);
      addedByTag.get(tag).push(a.name);
    });
    addedByTag.forEach((names, tag) => {
      entries.push({
        id: 'd' + i++,
        day: 0,
        kind: 'added',
        target: names.join('、'),
        text: `补上「${names.join('」「')}」——${LIKE[tag] || '与你的偏好一致'}`,
        memoryIds: Archive.whoContributes('prefer', tag)
      });
    });

    /* --- 节奏：数字必须是真的，不能只有文案 ---
       曾经的写法是「节奏放慢：一天 3–4 个点降到 2–3 个」，但底下根本没裁，
       于是同一条里出现"18 个点 / 4 天 → 18 个点 / 4 天"这种自相矛盾的话。 */
    if(plan.trimmed.length){
      entries.push({
        id: 'd' + i++,
        day: 0,
        kind: 'trimmed',
        target: 'pace',
        text: `按节奏裁掉 ${plan.trimmed.length} 处——一天压到 ${PACE_CAP.slow} 个点以内`,
        from: `${plan.before.spots} 个点 / ${plan.before.days} 天`,
        to: `${plan.after.spots} 个点 / ${plan.after.days} 天`,
        memoryIds: paceIds()
      });
    }

    if(cons && cons.pace === 'slow'){
      const route = (city && city.routeDefault) || [];
      const hasRest = route.every(d => (d.spots || []).some(n => /休息|自由/.test(n)));
      if(!hasRest){
        entries.push({
          id: 'd' + i++,
          day: 0,
          kind: 'added',
          target: 'free',
          text: '每天留出一段不安排的时间',
          memoryIds: paceIds()
        });
      }
    }

    /* --- 一句话摘要：评委最先看到的就是它 --- */
    const parts = [];
    if(plan.removed.length) parts.push(`砍掉 ${plan.removed.length} 处与你记录冲突的安排`);
    if(plan.added.length)   parts.push(`补上 ${plan.added.length} 处你偏好的地方`);
    if(plan.trimmed.length) parts.push('整体节奏放慢');
    // 凑不出安排的天要单独说：那是数据不够，不是"我们改好了"
    if(plan.emptyDays)      parts.push(`${plan.emptyDays} 天没能凑出安排`);
    if(!parts.length) parts.push('这套路线和你的记录没有冲突，不需要改动');

    return {
      entries,
      summary: parts.join('，') + '。',
      before: plan.before,
      after: plan.after,
      emptyDays: plan.emptyDays
    };
  }

  return { diffs, compose, filterDay, preferTags, dayCap, rankCandidates, WHY, LIKE, PACE_CAP };
})();
