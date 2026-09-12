/* ==========================================================================
   Touris 知途 · 记忆与语义层

   这个文件是整个产品的核心。原型最大的结构问题在这里修掉：

   ★ 为什么记忆要自带语义标签

   原型里「m03 这条记忆意味着不该排博物馆」这层意思，是硬编码在数据层的
   diff 定义里的（city-data.js 的 baseMem.museum / c.bigMuseum）。后果是每
   加一个城市，都得有人手工重写一遍那七条对照，而且很容易和记忆本身矛盾。

   改成：把语义挂在记忆上（下面 MEMORIES 里的 avoid / prefer / pace），
   对照差异由 memory/derive.js 从约束推导出来。加城市只需加 POI 和路线，
   对照自动成立，且永远和记忆一致。

   ★ 两个命名空间

   原型把预置记忆（m01–m20）和运行期生成的记忆（n1、n2…）放在同一套 id 规则里，
   还靠 scope 字段事后区分，结果两者会撞。这里直接分开：

     pm01…  persistent memory，跨会话，存进账号档案
     sm01…  session memory，本次规划临时，刷新即散

   前缀写在 id 里，看一眼就知道这条记忆的寿命。
   ========================================================================== */

/* ---------------- 语义表 ----------------
   记忆能表达的约束种类。derive.js 只认这里的键，写错会被 validate.js 抓住。 */
const SEMANTICS = {
  pace:    ['slow', 'medium', 'fast'],                        // 节奏
  avoid:   ['museum', 'crowd', 'queue', 'mall', 'walk-heavy'], // 回避类
  prefer:  ['market', 'garden', 'bamboo', 'river', 'temple',   // 偏好类
            'local-food', 'street-food', 'dessert', 'evening',
            'quiet', 'old-town', 'view', 'craft']
};

const ALL_TAGS = (() => {
  const s = new Set();
  Object.values(SEMANTICS).forEach(list => list.forEach(t => s.add(t)));
  return s;
})();

/* ---------------- 预置记忆 ----------------
   演示账号 demo 的档案。文案沿用原型写得挺细的那 20 条，但补上了语义标签，
   并把 id 换成 pm 前缀。scope 字段取消——寿命由 id 前缀表达，不再靠字段。 */
const MEMORIES = [
  { id:'pm01', text:'不喜欢早起赶路', type:'节奏', cited:3, used:true, pace:'slow',
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-14', action:'你对第 2 天节奏点了不喜欢', quote:'太早出门' } },

  { id:'pm02', text:'喜欢逛本地菜市场、早市', type:'餐饮', cited:4, used:true, prefer:['market'],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-15', action:'你对「黑门市场」点了喜欢', quote:'想吃这个' } },

  { id:'pm03', text:'我晕博物馆（大型综合馆）', type:'景点', cited:5, used:true, avoid:['museum'],
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-08', action:'你对「江户东京博物馆」点了不喜欢', quote:'我晕博物馆' } },

  { id:'pm04', text:'一天最多 3 个景点，超过就嫌赶', type:'节奏', cited:6, used:true, pace:'slow',
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-07', action:'你对第 1 天节奏点了不喜欢', quote:'太赶' } },

  { id:'pm05', text:'住宿偏生活街区，不住景区门口', type:'住宿', cited:3, used:true, prefer:['old-town','quiet'],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-13', action:'你把住宿从难波换到了福岛区', quote:'晚上想安静点' } },

  { id:'pm06', text:'别给我排排队两小时以上的店', type:'餐饮', cited:4, used:true, avoid:['queue'],
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-09', action:'你对一家排队的拉面店点了不喜欢', quote:'等太久了' } },

  { id:'pm07', text:'讨厌人特别多的地方', type:'景点', cited:5, used:true, avoid:['crowd'],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-16', action:'你放弃了道顿堀的夜景安排', quote:'人太多了' } },

  { id:'pm08', text:'喜欢安静的自然景观', type:'景点', cited:6, used:true, prefer:['garden','bamboo','quiet'],
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-10', action:'你在明治神宫待了一下午', quote:'这里舒服' } },

  { id:'pm09', text:'午后想有一段什么都不安排的时间', type:'节奏', cited:2, used:true, pace:'slow',
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-17', action:'你跳过了第 3 天的下午行程', quote:'想歇会儿' } },

  { id:'pm10', text:'偏好室内的、能坐下来的地方', type:'景点', cited:2, used:true, prefer:['dessert'],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-15', action:'你选了茶室而没去逛街', quote:'想坐着' } },

  { id:'pm11', text:'喜欢临水的路线', type:'景点', cited:3, used:true, prefer:['river','quiet'],
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-11', action:'你沿隅田川走了很久', quote:'河边好走' } },

  { id:'pm12', text:'不吃生食', type:'餐饮', cited:3, used:true, avoid:['street-food'],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-14', action:'你把海鲜刺身换成了烤物', quote:'我不吃生的' } },

  { id:'pm13', text:'不买门票贵的纯观光线', type:'景点', cited:2, used:true, avoid:['mall','crowd'],
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-12', action:'你跳过了晴空塔观景台', quote:'不值这个价' } },

  { id:'pm14', text:'喜欢手作和小店，不喜欢大商场', type:'购物', cited:3, used:true, prefer:['craft','old-town'], avoid:['mall'],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-16', action:'你在道具屋筋逛了两小时', quote:'这种店有意思' } },

  { id:'pm15', text:'每天留一个傍晚给寺庙或神社', type:'节奏', cited:5, used:true, prefer:['evening','temple'],
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-09', action:'你连着两天选了傍晚的寺庙', quote:'傍晚好看' } },

  { id:'pm16', text:'住宿要有独立卫浴', type:'住宿', cited:2, used:true, avoid:['crowd'],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-13', action:'你否掉了一家共用卫浴的青旅', quote:'要独立卫浴' } },

  { id:'pm17', text:'不喜欢行程被切得太碎', type:'节奏', cited:4, used:true, pace:'slow',
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-07', action:'你把一整天拆成四处后改成了两处', quote:'来回跑太累' } },

  { id:'pm18', text:'愿意为了一顿好饭吃坐车', type:'餐饮', cited:2, used:true, prefer:['local-food'],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-15', action:'你专门去了趟郊区的一家面馆', quote:'值得跑一趟' } },

  { id:'pm19', text:'这次想控制在步行为主（仅本次）', type:'交通', cited:1, used:false, avoid:['walk-heavy'],
    source:{ trip:'2026-09 本次规划', date:'2026-09-12', action:'你在需求里勾了「少坐车」' } },

  { id:'pm20', text:'喜欢当地人开的小馆，不追米其林', type:'餐饮', cited:3, used:true, prefer:['local-food','old-town'],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-16', action:'你对福岛区一带的一家居酒屋点了喜欢' } }
];

/* ---------------- 原因 → 记忆 ----------------
   用户在详情页点 👍/👎 后选原因，这张表把原因翻成一条记忆。
   原型的 REASONS 有 39 个标签但只有 36 条规则——三个标签点了学不到东西，
   正好打在产品核心上。这里两边的键**必须集合相等**，validate.js 会强制检查。
   kind 决定生成的记忆算哪一类，tags 决定它带什么语义。 */
const REASON_TO_MEMORY = {
  /* --- 节奏 --- */
  '太早出门':        { text:'不喜欢早起赶路',             type:'节奏', pace:'slow' },
  '太赶':            { text:'一天排太满会嫌赶',           type:'节奏', pace:'slow' },
  '来回跑太累':      { text:'不喜欢行程被切得太碎',       type:'节奏', pace:'slow' },
  '想歇会儿':        { text:'午后需要一段放空时间',       type:'节奏', pace:'slow' },

  /* --- 景点 o 偏好 --- */
  '我晕博物馆':      { text:'大型综合博物馆会让我不适',   type:'景点', avoid:['museum'] },
  '人太多了':        { text:'人多的地方体验很差',         type:'景点', avoid:['crowd'] },
  '这里舒服':        { text:'安静的自然景观待得住',       type:'景点', prefer:['garden','quiet'] },
  '傍晚好看':        { text:'傍晚的寺庙/神社值得留时间',  type:'景点', prefer:['evening','temple'] },
  '河边好走':        { text:'临水的路线走起来舒服',       type:'景点', prefer:['river'] },
  '不值这个价':      { text:'门票贵的纯观光线不去',       type:'景点', avoid:['crowd'] },
  '想坐着':          { text:'偏好能坐下来的室内空间',     type:'景点', prefer:['dessert'] },
  '想多逛几个点':    { text:'希望一天多看几个地方',       type:'节奏', pace:'fast' },
  '这个点没意思':    { text:'这类景点对我没吸引力',       type:'景点', avoid:['crowd'] },

  /* --- 餐饮 --- */
  '等太久了':        { text:'不排长队的店',               type:'餐饮', avoid:['queue'] },
  '想尝尝本地的':    { text:'想吃本地人的日常餐馆',       type:'餐饮', prefer:['local-food'] },
  '我不吃生的':      { text:'不吃生食',                   type:'餐饮', avoid:['street-food'] },
  '想吃这个':        { text:'喜欢逛本地市场和小吃摊',     type:'餐饮', prefer:['market','street-food'] },
  '不值得专门去':    { text:'不为一家店特意绕路',         type:'餐饮', avoid:['queue'] },
  '太贵了':          { text:'人均偏高的一餐会觉得不值',   type:'餐饮', avoid:['queue'] },
  '想吃得清淡点':    { text:'偏好清淡的做法',             type:'餐饮', prefer:['local-food'] },
  '想喝点甜的':      { text:'喜欢下午的甜品时间',         type:'餐饮', prefer:['dessert'] },

  /* --- 住宿 --- */
  '晚上想安静点':    { text:'住宿要避开嘈杂区域',         type:'住宿', prefer:['quiet'] },
  '要独立卫浴':      { text:'住宿必须有独立卫浴',         type:'住宿', avoid:['crowd'] },
  '离地铁近点好':    { text:'住宿优先靠近地铁',           type:'住宿', prefer:['old-town'] },
  '想住老城区':      { text:'偏好老城区的住宿',           type:'住宿', prefer:['old-town'] },
  '不想住景区门口':  { text:'不住景区门口',               type:'住宿', prefer:['quiet'] },
  '有早餐最好':      { text:'住宿带早餐会加分',           type:'住宿', prefer:['local-food'] },
  '房间太小了':      { text:'房间太小的不住',             type:'住宿', avoid:['crowd'] },
  '性价比不高':      { text:'住宿性价比优先',             type:'住宿', avoid:['mall'] },

  /* --- 交通 --- */
  '换乘太多':        { text:'尽量少换乘',                 type:'交通', avoid:['walk-heavy'] },
  '走路太久了':      { text:'步行量要控制',               type:'交通', avoid:['walk-heavy'] },
  '想少坐车':        { text:'尽量以步行为主',             type:'交通', avoid:['walk-heavy'] },
  '打车也行':        { text:'必要时打车没问题',           type:'交通', pace:'medium' },
  '太远了':          { text:'单点距离太远的不去',         type:'交通', avoid:['walk-heavy'] },

  /* --- 购物 / 其它 --- */
  '这种店有意思':    { text:'喜欢手作和小店',             type:'购物', prefer:['craft','old-town'] },
  '不喜欢逛商场':    { text:'不逛大型商场',               type:'购物', avoid:['mall'] },
  '买点东西挺好':    { text:'行程里愿意留购物时间',       type:'购物', prefer:['craft'] }
};
