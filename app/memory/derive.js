/* ==========================================================================
   Touris 知途 · 对照推导

   ★ 这个文件存在的理由

   原型里「用了记忆」和「没用记忆」是**两份手写数据**（PLANS_DEFAULT /
   PLANS_MEMORY、ITIN_DEFAULT / ITIN_MEMORY），住宿、出发时间、步行量、
   休息节点全都不同。要改一个偏心得同时改多处，而且「m03 意味着别排博物馆」
   这层含义硬编码在数据里，加城市就得重写一遍。

   这里反过来：只留**一份**默认路线，然后拿记忆聚合出的约束去过滤它，
   把前后差异算出来。于是：
     · 加城市只需填景点和路线，对照自动成立
     · 改一条记忆，对照立刻跟着变，不会出现「改了记忆忘了改对照」

   输出的 diff 形状与原型的 DIFFS 一致（id/day/kind/target/text/memoryIds），
   memoryIds 由**贡献该约束的记忆反查**得到，不再手写。
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

  /**
   * 推导对照差异。
   * @param city  城市数据对象
   * @param cons  Archive.constraints() 的输出
   * @returns { entries, summary, before, after }
   */
  function diffs(city, cons){
    const spotsMap = (city && city.spots) || {};
    const route = (city && city.routeDefault) || [];
    const entries = [];

    let removedCount = 0, keptCount = 0, activeDays = 0;
    const allDropped = [];

    route.forEach(d => {
      const { kept, dropped } = filterDay(d.spots, spotsMap, cons);
      allDropped.push(...dropped);
      removedCount += dropped.length;
      keptCount += kept.length;
      if(kept.length) activeDays++;
    });

    const totalBefore = route.reduce((a, d) => a + (d.spots || []).length, 0);

    /* --- 逐条差异 --- */
    let i = 1;
    groupDropped(allDropped).forEach(({ tag, names }) => {
      const ids = Archive.whoContributes('avoid', tag);
      entries.push({
        id: 'd' + i++,
        day: 0,                                  // 0 = 全局，非某一天专属
        kind: 'removed',
        target: names.join('、'),
        text: `砍掉「${names.join('」「')}」——${WHY[tag] || '与你的记录冲突'}`,
        memoryIds: ids
      });
    });

    if(cons.pace === 'slow'){
      const hasRest = route.every(d => (d.spots || []).some(n => /休息|自由/.test(n)));
      if(!hasRest){
        entries.push({
          id: 'd' + i++,
          day: 0,
          kind: 'added',
          target: 'free',
          text: '每天留出一段不安排的时间',
          memoryIds: Archive.all().filter(m => m.pace === 'slow').map(m => m.id)
        });
      }
      entries.push({
        id: 'd' + i++,
        day: 0,
        kind: 'changed',
        target: 'pace',
        text: '节奏放慢：一天 3–4 个点降到 2–3 个',
        from: `${totalBefore} 个点 / ${route.length} 天`,
        to: `${keptCount} 个点 / ${activeDays} 天`,
        memoryIds: Archive.all().filter(m => m.pace === 'slow').map(m => m.id)
      });
    }

    /* --- 一句话摘要：评委最先看到的就是它 --- */
    const parts = [];
    if(removedCount) parts.push(`砍掉 ${removedCount} 处与你记录冲突的安排`);
    if(cons.pace === 'slow') parts.push('整体节奏放慢');
    if(!parts.length) parts.push('这套路线和你的记录没有冲突，不需要改动');

    return {
      entries,
      summary: parts.join('，') + '。',
      before: { spots: totalBefore, days: route.length },
      after: { spots: keptCount, days: activeDays }
    };
  }

  return { diffs, filterDay, WHY };
})();
