/* ==========================================================================
   Touris 知途 · 语义词汇表（服务端）

   ★ 为什么服务端要读前端的文件

   约束的词汇表（SEMANTICS）只应该有一份。前端 app/data/memory.js 里那份是
   权威——derive.js 认它、validate.js 查它。如果服务端另抄一份，"词汇表漂移"
   就会发生，而且正是 validate.js 存在的理由（防手写数据对不上）。

   所以这里用 vm 把 app/data/memory.js 直接跑起来读它的导出，不复制。

   ★ 顺带白拿一份 few-shot

   REASON_TO_MEMORY 是原型手写的 39 条「用户点选的原因 → 语义标签」对照。
   它既是提示词里最好的范例（学它的措辞风格和标签粒度），也是 LLM 不可用时的
   降级路径。同一份资产，三种用途。
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MEMORY_JS = path.resolve(__dirname, '..', 'app', 'data', 'memory.js');

function loadVocabulary(){
  if(!fs.existsSync(MEMORY_JS)){
    throw new Error('找不到 ' + MEMORY_JS + '——服务端依赖前端的语义定义，别把它挪走');
  }
  const ctx = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(MEMORY_JS, 'utf8'), ctx, { filename: 'app/data/memory.js' });

  const SEMANTICS = vm.runInContext('SEMANTICS', ctx);
  const ALL_TAGS  = [...vm.runInContext('ALL_TAGS', ctx)];
  const RULES     = vm.runInContext('REASON_TO_MEMORY', ctx);

  /* 允许的记忆类别：从手写规则里反推，而不是另立一份 */
  const types = [...new Set(Object.values(RULES).map(r => r.type))].sort();

  return {
    SEMANTICS,
    ALL_TAGS,
    RULES,
    types,
    pace: SEMANTICS.pace.slice(),
    avoid: SEMANTICS.avoid.slice(),
    prefer: SEMANTICS.prefer.slice()
  };
}

/** 词汇表指纹。词汇表一变，提示词缓存和 LLM 结果缓存都要失效。 */
function fingerprint(v){
  const crypto = require('crypto');
  const shape = JSON.stringify({ s: v.SEMANTICS, t: v.types, r: Object.keys(v.RULES).sort() });
  return crypto.createHash('sha256').update(shape).digest('hex').slice(0, 12);
}

/** 标签 → 中文人话。给提示词里列词汇表用，让模型理解每个标签的含义。 */
const TAG_TEXT = {
  museum:'大型综合博物馆', crowd:'人多/人流高峰', queue:'排长队的店',
  mall:'大型商场', 'walk-heavy':'走路过多',
  market:'本地市场/早市', garden:'庭园', bamboo:'竹林', river:'临水路线',
  temple:'寺庙神社', 'local-food':'本地小馆', 'street-food':'小吃摊/生食',
  dessert:'甜品与茶室', evening:'傍晚时段', quiet:'安静的地方',
  'old-town':'老城区', view:'观景点', craft:'手作小店', free:'免费'
};

const PACE_TEXT = { slow:'节奏放慢（别赶、别早起、留放空时间）', medium:'正常节奏', fast:'多逛几个点' };

/**
 * 生成 few-shot 范例。按类型轮流取，保证覆盖，且顺序稳定（缓存前缀要稳定）。
 * 不取全部 39 条——词汇表本身才是约束，范例只需要教会「措辞风格」。
 */
const TYPE_TEXT = { '节奏':'节奏', '餐饮':'餐饮', '景点':'景点', '住宿':'住宿', '交通':'交通', '购物':'购物' };

function fewShot(v, perType){
  const n = perType || 2;
  const byType = new Map();
  Object.keys(v.RULES).sort().forEach(reason => {
    const r = v.RULES[reason];
    if(!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type).push({ reason, rule: r });
  });
  const picked = [];
  v.types.forEach(t => {
    (byType.get(t) || []).slice(0, n).forEach(x => picked.push(x));
  });
  return picked;
}

module.exports = { loadVocabulary, fingerprint, TAG_TEXT, PACE_TEXT, TYPE_TEXT, fewShot, MEMORY_JS };
