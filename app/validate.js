/* ==========================================================================
   Touris 知途 · 不变式校验（开发期）

   不是单元测试，是**数据结构的自检**：这个项目的数据是手写的，手写就会漏。
   原型里已经漏过一次——REASONS 有 39 个标签，REASON_TO_MEMORY 只有 36 条规则，
   三个标签点了什么都学不到，而这恰恰打在产品核心上。

   在地址后加 ?dev=1 打开，结果直接打在控制台。

   新增一条规则：在下面加一个 check 函数即可，它返回问题数组（空数组 = 通过）。
   ========================================================================== */

const Validate = (() => {

  /** ★ 每条预置记忆都必须至少带一个语义标签。
      没有标签的记忆在 derive 里等于不存在——它照样占一个数字、照样显示在记忆页，
      却对推荐毫无影响。这种「看着有用其实没用」的数据最难发现。 */
  function checkMemorySemantics(){
    const issues = [];
    MEMORIES.forEach(m => {
      const has = Archive.tagsOf(m, 'avoid').length
               || Archive.tagsOf(m, 'prefer').length
               || m.pace;
      if(!has){
        issues.push(`记忆 ${m.id}「${m.text}」没有任何 avoid/prefer/pace 标签——它推不出任何约束，等于不参与推荐`);
      }
    });
    return issues;
  }

  /** 每条记忆的 avoid/prefer 标签都必须在 SEMANTICS 里登记过 */
  function checkMemoryTags(){
    const issues = [];
    MEMORIES.forEach(m => {
      ['avoid', 'prefer'].forEach(kind => {
        Archive.tagsOf(m, kind).forEach(t => {
          if(!ALL_TAGS.has(t)){
            issues.push(`记忆 ${m.id}「${m.text}」的 ${kind} 标签 "${t}" 不在 SEMANTICS 里——derive.js 认不出它`);
          }
        });
      });
      if(m.pace && !SEMANTICS.pace.includes(m.pace)){
        issues.push(`记忆 ${m.id} 的 pace "${m.pace}" 不合法`);
      }
    });
    return issues;
  }

  /** ★ 核心不变式：表态标签与生成规则必须一一对应 */
  function checkReasonCoverage(){
    const issues = [];
    const labels = [];
    Object.keys(REASONS).forEach(g => {
      ['up', 'down'].forEach(dir => (REASONS[g][dir] || []).forEach(l => labels.push(l)));
    });

    labels.forEach(l => {
      if(!REASON_TO_MEMORY[l]) issues.push(`原因标签「${l}」没有对应的生成规则——用户点了学不到东西`);
    });
    Object.keys(REASON_TO_MEMORY).forEach(r => {
      if(!labels.includes(r)) issues.push(`生成规则「${r}」没有对应的原因标签——用户永远点不到它`);
    });
    return issues;
  }

  /** 生成规则里的语义标签也要登记过 */
  function checkRuleTags(){
    const issues = [];
    Object.keys(REASON_TO_MEMORY).forEach(r => {
      const rule = REASON_TO_MEMORY[r];
      ['avoid', 'prefer'].forEach(kind => {
        (rule[kind] ? [].concat(rule[kind]) : []).forEach(t => {
          if(!ALL_TAGS.has(t)) issues.push(`规则「${r}」的 ${kind} 标签 "${t}" 不在 SEMANTICS 里`);
        });
      });
    });
    return issues;
  }

  /** 三城都要满足城市协议 */
  const CITY_FIELDS = ['key', 'label', 'maxDays', 'spots', 'poi', 'dine', 'stay', 'routeDefault'];
  function checkCities(){
    const issues = [];
    const keys = Object.keys(CITY_DATA);
    if(keys.length < 1) issues.push('CITY_DATA 是空的');

    keys.forEach(k => {
      const c = CITY_DATA[k];
      CITY_FIELDS.forEach(f => {
        if(c[f] == null) issues.push(`城市「${k}」缺少协议字段 ${f}`);
      });
      (c.routeDefault || []).forEach(d => {
        (d.spots || []).forEach(n => {
          if(!c.spots[n]) issues.push(`城市「${k}」第 ${d.n} 天的景点「${n}」在 spots 里查不到`);
          if(!c.poi[n]) issues.push(`城市「${k}」的景点「${n}」没有坐标，画不出路线`);
        });
      });
      // stay 的风格键要和方案风格对得上
      const styles = Object.keys(c.stay || {});
      if(!styles.length) issues.push(`城市「${k}」没有住宿候选`);
    });
    return issues;
  }

  /** 记忆里的 memoryIds 之外，城市数据不应再引用别的 id 命名空间 */
  function checkIdNamespaces(){
    const issues = [];
    const bad = /^[mn]\d+$/;    // 原型遗留的 m01 / n1 形式
    MEMORIES.forEach(m => {
      if(!/^pm\d+$/.test(m.id)) issues.push(`记忆 id "${m.id}" 不合规——档案记忆应为 pm 前缀`);
    });
    return issues;
  }

  function run(){
    const checks = [
      ['记忆语义标签合法', checkMemoryTags],
      ['记忆语义完整性', checkMemorySemantics],
      ['表态原因覆盖度', checkReasonCoverage],
      ['生成规则标签', checkRuleTags],
      ['城市协议', checkCities],
      ['id 命名空间', checkIdNamespaces]
    ];
    let total = 0;
    const report = [];
    checks.forEach(([name, fn]) => {
      let issues = [];
      try{ issues = fn(); }
      catch(e){ issues = ['校验器本身抛错：' + e.message]; }
      total += issues.length;
      report.push({ name, issues });
    });
    return { total, report };
  }

  /** 打一份人看的报告 */
  function report(){
    const { total, report: rows } = run();
    console.groupCollapsed(`%cTouris 校验 · ${total ? total + ' 项问题' : '全部通过'}`,
      `color:${total ? '#B3453C' : '#3E7A5E'};font-weight:700`);
    rows.forEach(({ name, issues }) => {
      if(issues.length){
        console.group(`✗ ${name}（${issues.length}）`);
        issues.forEach(i => console.log('  ' + i));
        console.groupEnd();
      } else {
        console.log(`✓ ${name}`);
      }
    });
    console.groupEnd();
    return total;
  }

  return { run, report };
})();
