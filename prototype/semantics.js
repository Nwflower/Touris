/* ==========================================================================
   Touris 知途 · 语义层

   ★ 为什么要有这一层

   原先「记忆 → 推荐」是靠**正则匹配记忆的中文原文**打通的，在
   city-hangzhou-guangzhou.js 里：

     const museum = memories.filter(m => /我晕博物馆/.test(m.text));
     const rest   = memories.filter(m => /午后.*休息/.test(m.text));

   后果实测过：
     · 20 条预置记忆里只有 3 条能命中，其余 17 条静默无效
     · 换一种说法就漏——「不想看大型博物馆」不匹配 /我晕博物馆/，
       「午后需要放空」不匹配 /午后.*休息/
     · 判断依据是措辞，而措辞是随时会改的展示层

   这一层把判断依据从**措辞**换成**标签**：记忆挂 avoid/prefer/pace，
   景点通过下面的映射表得到同样的标签，两边比标签而不是比字面。

   ★ 关于景点的中文标签

   原型里景点用的是描述性中文标签（`SPOTS.tags`），全仓库共 147 种，
   长尾一百多种只出现一次——它天然不是受控词表，也不该被当成受控词表。
   所以这里做一张**单向映射表**：把语义明确的那些中文标签翻成语义标签，
   翻不出来的就不翻（`semOf` 只返回能翻的），不做模糊猜测。

   映射表来自 tools/extract-seed.js 的 TAG_MAP / AVOID_MAP——那份是给 app
   生成 city-seed.js 用的，两边共用同一套对应关系，改的时候一起改。
   ========================================================================== */

/* ---------------- 词表 ----------------
   记忆能表达的约束种类。derive 只认这里的键；写错会被 _verify.js 抓住。 */
const SEMANTICS = {
  pace: ['slow', 'medium', 'fast'],

  /* 回避类：命中即从路线里拿掉。

     walk-heavy 是个**合并类**：「费体力 / 体力活 / 爬山 / 爬坡 / 台阶 / 坡道 /
     动线长 / 路程远」都归它。词表里没有单独的「距离」类，所以「太远」
     「不喜欢一天里换两次交通枢纽」这类记忆也走这个标签——一天要换两次枢纽，
     实际就是点位离得远。合并是刻意的：分得越细，能命中的记忆反而越少。 */
  avoid: ['museum', 'crowd', 'queue', 'mall', 'walk-heavy', 'tour-group', 'theme-park'],

  /* 偏好类：命中即优先保留 / 优先补位 */
  prefer: ['market', 'garden', 'bamboo', 'river', 'temple', 'local-food',
           'street-food', 'dessert', 'evening', 'quiet', 'old-town', 'view',
           'craft', 'free', 'indoor', 'small-museum']
};

const ALL_TAGS = (() => {
  const s = new Set();
  Object.values(SEMANTICS).forEach(list => list.forEach(t => s.add(t)));
  return s;
})();

/* ---------------- 景点中文标签 → 语义标签 ----------------
   左列是景点上真实出现过的中文标签，右列是 SEMANTICS 里的键。
   一份表管两个方向：prefer 用 PREFER_MAP，avoid 用 AVOID_MAP。
   同一个中文标签可以两边都出现（如「游客向」既是 crowd 也是 queue 的线索）。 */

const SPOT_PREFER_MAP = {
  '安静': 'quiet',      '人少': 'quiet',     '人较少': 'quiet',   '可久坐': 'quiet',
  '庭园': 'garden',     '苔庭': 'garden',    '枯山水': 'garden',  '园林': 'garden',
  '古典园林': 'garden', '植物': 'garden',
  '竹林': 'bamboo',     '自然': 'bamboo',    '湿地': 'bamboo',    '公园': 'bamboo',
  '户外': 'bamboo',
  '河川': 'river',      '水路阁': 'river',   '散步': 'river',     '运河': 'river',
  '滨江': 'river',      '湖景': 'river',     '江景': 'river',     '海湾': 'river',
  '海景': 'river',      '海岸': 'river',     '沙滩': 'river',     '步道': 'river',
  '神社': 'temple',     '寺院': 'temple',    '国宝': 'temple',    '世界遗产': 'temple',
  '古建筑': 'temple',   '历史建筑': 'temple','古塔': 'temple',    '五重塔': 'temple',
  '鸟居': 'temple',     '遗址': 'temple',    '考古': 'temple',
  '傍晚好': 'evening',  '夜景': 'evening',   '夜间': 'evening',   '日落': 'evening',
  '夜游': 'evening',    '夜生活': 'evening', '日出': 'evening',
  '本地': 'old-town',   '町屋': 'old-town',  '夜巷': 'old-town',  '老城': 'old-town',
  '老街': 'old-town',   '胡同': 'old-town',  '石库门': 'old-town', '古镇': 'old-town',
  '水乡': 'old-town',   '传统村落': 'old-town', '本地街区': 'old-town',
  '渔村': 'old-town',   '街区': 'old-town',  '步行街': 'old-town',
  '市集': 'market',     '早市': 'market',
  '本地小馆': 'local-food', '老字号': 'local-food',
  '小吃': 'street-food', '餐饮': 'street-food',
  '咖啡': 'dessert',                        // 能坐下来喝点东西的地方
  '茶文化': 'indoor', '茶园': 'garden',      // 茶文化展馆 ≠ 甜品店，别混
  '观景': 'view',       '观景台': 'view',    '登高': 'view',      '地标': 'view',
  '城市地标': 'view',   '天际线': 'view',    '山景': 'view',      '海岬': 'view',
  '灯塔': 'view',       '古塔': 'view',
  '购物': 'craft',      '伴手礼': 'craft',   '小店': 'craft',     '工艺': 'craft',
  '免费': 'free',       '免费区': 'free',    '免费区大': 'free',
  '室内': 'indoor',     '展馆': 'indoor',    '文博': 'indoor',    '阅读': 'indoor',
  '小型展馆': 'small-museum', '专题馆': 'small-museum'
};

const SPOT_AVOID_MAP = {
  '人多': 'crowd',      '游客向': 'crowd',   '周末人多': 'crowd', '旺季人多': 'crowd',
  '大型馆': 'museum',   '大型综合馆': 'museum', '常设+特展': 'museum',
  '费体力': 'walk-heavy', '体力活': 'walk-heavy', '爬山': 'walk-heavy',
  '爬坡': 'walk-heavy', '动线长': 'walk-heavy', '台阶': 'walk-heavy',
  '坡道': 'walk-heavy', '登山': 'walk-heavy',  '路程远': 'walk-heavy',
  '需乘船': 'walk-heavy', '风大': 'walk-heavy', '看天气': 'walk-heavy'
};

/* 一张表反查用：中文标签 → 它贡献了哪些语义标签 */
function _mapTags(tags, map){
  const out = [];
  (tags || []).forEach(t => { const s = map[t]; if(s && !out.includes(s)) out.push(s); });
  return out;
}

/** 一个景点的语义标签。翻不出来的中文标签直接忽略，不猜。 */
function semOf(name, spotsMap){
  const s = (spotsMap || {})[name] || {};
  return {
    prefer: _mapTags(s.tags, SPOT_PREFER_MAP),
    avoid:  _mapTags(s.tags, SPOT_AVOID_MAP)
  };
}

/* ---------------- 记忆 → 约束 ----------------
   这是「记忆 → 界面」的唯一通道：视图只认这组约束，不认记忆本身。
   加一条记忆、改一条记忆，界面自动跟着变。 */

/** 某条记忆挂了哪些 avoid / prefer 标签（允许写成单值或数组） */
function memTagsOf(m, kind){
  const v = m && m[kind];
  return Array.isArray(v) ? v : (v ? [v] : []);
}

/**
 * 把一堆记忆聚合成一组去重后的约束。
 * pace 取最慢的那条：一条「不要赶」就足以否决所有快节奏。
 */
function constraintsOf(memories){
  const out = { avoid: [], prefer: [], pace: null, budget: null, hits: {} };
  const seen = { avoid: new Set(), prefer: new Set() };
  (memories || []).forEach(m => {
    ['avoid', 'prefer'].forEach(kind => {
      memTagsOf(m, kind).forEach(t => {
        if(!seen[kind].has(t)){ seen[kind].add(t); out[kind].push(t); }
        // 记下每个标签是哪几条记忆贡献的，对照条目要据此标出处
        (out.hits[t] = out.hits[t] || []).push(m.id);
      });
    });
    if(m.pace === 'slow') out.pace = 'slow';
    else if(m.pace === 'fast' && out.pace !== 'slow') out.pace = 'fast';
    /* 预算取**最紧**的那条（low < mid < high）：一条「预算有限」不该因为
       另有一条「偶尔想住好点」就放宽——事实压过意愿，与上面 pace 同理。 */
    if(m.budget === 'low') out.budget = 'low';
    else if(m.budget === 'mid' && out.budget !== 'low') out.budget = 'mid';
    else if(m.budget === 'high' && !out.budget) out.budget = 'high';
  });
  return out;
}

/** 哪些记忆贡献了某个标签——对照条目据此反查出处，不再手写 memoryIds */
function whoContributes(memories, kind, tag){
  return (memories || []).filter(m => memTagsOf(m, kind).includes(tag)).map(m => m.id);
}
