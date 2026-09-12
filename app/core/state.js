/* ==========================================================================
   Touris 知途 · 应用状态

   只放**会话态**——刷新即散、不需要持久化的东西。需要注意的一处分工：

   - 本次会话新学的记忆 → 由 memory/archive.js 管（游客态存内存，登录态回写账号）
   - 当前登录的账号     → account.js 管（zt.v1 键）
   - 界面状态（当前城市、当前规划）→ 这里

   这里刻意不放「记忆」。原型的教训：把预置记忆、会话记忆、账号档案混在一个
   S.learned 数组里，靠 scope 字段事后区分，结果 id 命名空间都撞上了。
   ========================================================================== */

const App = {
  cityKey: '京都',          // 当前城市，对应 CITY_DATA 的键
  trip: {                   // 本次规划的输入
    date: '',
    days: 4,
    people: 2
  },
  planId: null,             // 当前查看的方案 id
  memoryOn: true,           // 记忆开关——产品叙事的胜负手，默认开
  stance: {},               // 元素级表态：key → { v:'up'|'down', reason, note }
  openReason: null          // 当前展开的原因选择器
};

/** 取当前城市数据。找不到就退回第一个可用城市，避免整个页面挂掉。 */
function city(){
  const c = (typeof CITY_DATA !== 'undefined' && CITY_DATA[App.cityKey]) || null;
  if(c) return c;
  const keys = Object.keys(typeof CITY_DATA !== 'undefined' ? CITY_DATA : {});
  return keys.length ? CITY_DATA[keys[0]] : null;
}

/** 本次行程的天数（受城市数据里可用路线数的约束） */
function tripDays(){
  const c = city();
  return Math.max(1, Math.min(App.trip.days | 0 || 1, c ? (c.maxDays || 7) : 7));
}
