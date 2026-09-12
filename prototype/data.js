/* ==========================================================================
   Touris 知途 · 原型数据层
   全部为演示用静态数据，无网络请求。

   商业化推荐口径（餐饮 / 住宿）：
   只给「某某一带」+ 3-4 个候选类型，不给具体店名和门牌地址；
   每个候选带人均、菜系/房型、评分与来源，供用户自己挑。
   ========================================================================== */

/* ---------- 预置记忆库（预置演示账号 demo 的 20 条） ----------
   账号体系见 account.js：这份 MEMORIES 由 _seedDemo() 播种进演示账号，
   原样引用不复制不删改。游客模式则完全不读它——游客 = 0 记忆模式。
   想改演示账号的口令 / 名字，去 account.js 顶部的 DEMO_ACCOUNT。 */
const MEMORIES = [
  { id:'m01', text:'不喜欢早起赶路', type:'节奏', scope:'long', cited:3, used:true, pace:'slow',
    source:{ trip:'2026-03 成都 4 天', date:'2026-03-14', action:'你对第 2 天节奏点了不喜欢', quote:'太早出门' } },
  { id:'m02', text:'喜欢逛本地菜市场、早市', type:'餐饮', scope:'long', cited:4, used:true, prefer:["market"],
    source:{ trip:'2026-03 成都 4 天', date:'2026-03-15', action:'你对玉林一带的菜市场点了喜欢', quote:'想吃这个' } },
  { id:'m03', text:'我晕博物馆（大型综合馆）', type:'景点', scope:'long', cited:5, used:true, avoid:["museum"],
    source:{ trip:'2025-11 北京 5 天', date:'2025-11-08', action:'你对「成都博物馆」点了不喜欢', quote:'我晕博物馆' } },
  { id:'m04', text:'一天最多 3 个景点，超过就嫌赶', type:'节奏', scope:'long', cited:6, used:true, pace:'slow',
    source:{ trip:'2025-11 北京 5 天', date:'2025-11-07', action:'你对第 1 天节奏点了不喜欢', quote:'太赶' } },
  { id:'m05', text:'偏好住在有夜间小馆的生活街区，而不是商圈中心', type:'住宿', scope:'long', cited:2, used:true, avoid:["mall"], prefer:["old-town"],
    source:{ trip:'2026-03 成都 4 天', date:'2026-03-16', action:'你把住宿从春熙路一带改到玉林一带后点了喜欢', quote:'晚上有地方吃饭' } },
  { id:'m06', text:'喜欢盖碗茶与川式甜品', type:'餐饮', scope:'long', cited:3, used:true, prefer:["dessert"],
    source:{ trip:'2025-06 上海 3 天', date:'2025-06-21', action:'你对人民公园鹤鸣茶社点了喜欢', quote:'想吃这个' } },
  /* 只挂 queue。原先还挂了 crowd，但这条说的是「网红**店**」——是餐饮偏好，
     crowd 会把它变成「避开人多的地方」，一次清掉五个热门景点。
     语义标错了比不标更糟：界面会拿着一个错误理由去解释被砍掉的安排。 */
  { id:'m07', text:'不喜欢需要排队超过 30 分钟的网红店', type:'餐饮', scope:'long', cited:4, used:true, avoid:["queue"],
    source:{ trip:'2026-03 成都 4 天', date:'2026-03-15', action:'你对宽窄巷子一家排队网红店点了不喜欢', quote:'人太多' } },
  { id:'m08', text:'喜欢竹林、庭园这类安静的自然景观', type:'景点', scope:'long', cited:3, used:true, prefer:["bamboo","garden","quiet"],
    source:{ trip:'2025-06 上海 3 天', date:'2025-06-22', action:'你对望江楼公园的竹林点了喜欢', quote:'想多待会儿' } },
  { id:'m09', text:'习惯午后留 2 小时自由休息', type:'节奏', scope:'long', cited:2, used:false, pace:'slow',
    source:{ trip:'2025-11 北京 5 天', date:'2025-11-09', action:'你手动删掉了下午 3 点的行程' } },
  { id:'m10', text:'不喜欢一天里换两次交通枢纽', type:'交通', scope:'long', cited:2, used:false, avoid:["walk-heavy"],
    source:{ trip:'2025-11 北京 5 天', date:'2025-11-10', action:'你对第 4 天的都江堰往返点了不喜欢', quote:'太远' } },
  { id:'m11', text:'喜欢傍晚沿河散步', type:'景点', scope:'long', cited:1, used:false, prefer:["river","evening"],
    source:{ trip:'2025-06 上海 3 天', date:'2025-06-22', action:'你对锦江边的散步道点了喜欢' } },
  { id:'m12', text:'对购物中心、免税店兴趣很低', type:'购物', scope:'long', cited:3, used:false, avoid:["mall"],
    source:{ trip:'2026-03 成都 4 天', date:'2026-03-17', action:'你删掉了春熙路的购物这一段' } },
  { id:'m13', text:'小型有解说的展馆可以接受（与大型博物馆区分）', type:'景点', scope:'long', cited:1, used:false, prefer:["small-museum"],
    source:{ trip:'2025-11 北京 5 天', date:'2025-11-09', action:'你对一场小型专题展点了喜欢' } },
  { id:'m14', text:'愿意为一顿正式晚饭多花时间和预算', type:'餐饮', scope:'long', cited:2, used:false,
    source:{ trip:'2025-06 上海 3 天', date:'2025-06-21', action:'你把晚餐从快餐改成了一顿正式的川菜' } },
  { id:'m15', text:'不喜欢团队体验课程（汉服跟拍、茶艺班）', type:'景点', scope:'long', cited:2, used:false, avoid:["tour-group"],
    source:{ trip:'2025-06 上海 3 天', date:'2025-06-23', action:'你对「汉服跟拍」点了不喜欢', quote:'不感兴趣' } },
  { id:'m16', text:'喜欢住二层以下带小庭院的旅馆', type:'住宿', scope:'long', cited:1, used:false, prefer:["garden","quiet"],
    source:{ trip:'2025-06 上海 3 天', date:'2025-06-20', action:'你对一家老院落改造的民宿点了喜欢' } },
  { id:'m17', text:'偏好傍晚而非清晨游览寺庙', type:'节奏', scope:'long', cited:2, used:false, prefer:["evening","temple"],
    source:{ trip:'2025-06 上海 3 天', date:'2025-06-22', action:'你把大慈寺从早上挪到了傍晚' } },
  { id:'m18', text:'不喜欢主题乐园', type:'景点', scope:'long', cited:1, used:false, avoid:["theme-park"],
    source:{ trip:'2026-03 成都 4 天', date:'2026-03-16', action:'你对主题乐园点了不喜欢', quote:'不感兴趣' } },
  { id:'m19', text:'这次想控制在步行为主（仅本次）', type:'交通', scope:'session', cited:1, used:false,
    source:{ trip:'2026-09 本次规划', date:'2026-09-12', action:'你在需求里勾了「少坐车」' } },
  { id:'m20', text:'喜欢当地人开的小馆，不追米其林', type:'餐饮', scope:'long', cited:3, used:true, prefer:["local-food"],
    source:{ trip:'2026-03 成都 4 天', date:'2026-03-16', action:'你对玉林一带的一家小馆点了喜欢' } }
];

/* ---------- 反馈原因标签 ---------- */
const REASONS = {
  down: {
    spot: ['太赶', '太远', '我晕博物馆', '人太多', '不感兴趣', '不想早起'],
    food: ['要排队', '太贵', '游客向', '不合口味', '离得远'],
    pace: ['太赶', '太早出门', '换乘太多', '太松了'],
    stay: ['太远', '周边没吃的', '太吵', '不喜欢商圈'],
    free: ['不需要休息', '浪费时间']
  },
  up: {
    spot: ['想多待会儿', '正是我想要的', '安静', '风景好'],
    food: ['想吃这个', '本地感', '不用排队', '性价比高'],
    pace: ['节奏舒服', '不用早起', '走得不多'],
    stay: ['位置合适', '周边有夜宵', '有庭院'],
    free: ['需要这个空档']
  }
};

/* ---------- 原因 → 生成的记忆文本（把反馈变记忆的规则表） ---------- */
const REASON_TO_MEMORY = {
  '太赶':        { text:'不喜欢一天塞太多景点', type:'节奏', pace:'slow' },
  '太远':        { text:'不喜欢跨城长距离移动', type:'交通', avoid:["walk-heavy"] },
  '我晕博物馆':  { text:'我晕博物馆（大型综合馆）', type:'景点', avoid:["museum"] },
  '人太多':      { text:'不喜欢人多需要排队的地方', type:'景点', avoid:["crowd","queue"] },
  '不感兴趣':    { text:'对这类景点兴趣低', type:'景点' },
  '不想早起':    { text:'不喜欢早起赶路', type:'节奏', pace:'slow' },
  '太早出门':    { text:'不喜欢早起赶路', type:'节奏', pace:'slow' },
  '换乘太多':    { text:'不喜欢一天里换两次交通枢纽', type:'交通', avoid:["walk-heavy"] },
  '太松了':      { text:'希望行程再紧凑一点', type:'节奏', pace:'fast' },
  '要排队':      { text:'不喜欢需要排队超过 30 分钟的店', type:'餐饮', avoid:["queue"] },
  '太贵':        { text:'不接受高价游客向餐厅', type:'餐饮' },
  '游客向':      { text:'不喜欢游客向餐厅，偏好本地小馆', type:'餐饮', avoid:["crowd"], prefer:["local-food"] },
  '不合口味':    { text:'不喜欢这类菜式', type:'餐饮' },
  '离得远':      { text:'希望吃饭地点在行程动线上', type:'餐饮' },
  '周边没吃的':  { text:'偏好住在有夜间小馆的街区', type:'住宿', prefer:["old-town"] },
  '太吵':        { text:'不喜欢住在喧闹商圈', type:'住宿', avoid:["mall","crowd"] },
  '不喜欢商圈':  { text:'偏好住生活街区而非商圈中心', type:'住宿', avoid:["mall"], prefer:["old-town"] },
  '不需要休息':  { text:'不需要午后长休息', type:'节奏', pace:'fast' },
  '浪费时间':    { text:'不喜欢行程里的空档', type:'节奏', pace:'fast' },
  '想多待会儿':  { text:'喜欢在喜欢的地方多停留，别赶时间', type:'节奏', pace:'slow' },
  '正是我想要的':{ text:'喜欢这类景点', type:'景点' },
  '安静':        { text:'喜欢安静的自然与庭园景观', type:'景点', prefer:["quiet","garden"] },
  '风景好':      { text:'喜欢有景观视野的地点', type:'景点', prefer:["view"] },
  '想吃这个':    { text:'喜欢这类餐饮体验', type:'餐饮' },
  '本地感':      { text:'喜欢当地人开的小馆，不追米其林', type:'餐饮', prefer:["local-food"] },
  '不用排队':    { text:'偏好不用排队的餐厅', type:'餐饮', avoid:["queue"] },
  '性价比高':    { text:'喜欢性价比高的本地餐厅', type:'餐饮', prefer:["local-food"] },
  '节奏舒服':    { text:'喜欢一天 2-3 个景点的节奏', type:'节奏', pace:'slow' },
  '不用早起':    { text:'喜欢 9 点后出发的行程', type:'节奏', pace:'slow' },
  '走得不多':    { text:'偏好日均步行 8km 以内', type:'节奏', avoid:["walk-heavy"] },
  '位置合适':    { text:'喜欢步行可达主要动线的住宿', type:'住宿' },
  '周边有夜宵':  { text:'偏好住在有夜间小馆的街区', type:'住宿', prefer:["old-town"] },
  '有庭院':      { text:'喜欢带庭院的小型旅馆', type:'住宿', prefer:["garden"] },
  '需要这个空档':{ text:'习惯午后留 2 小时自由休息', type:'节奏', pace:'slow' }
};

/* ---------- Demo 动线提词 ----------
   seeded: false = 以游客（0 记忆）身份跑；true = 登录预置演示账号看 20 条记忆的档案。
   演示动线会自己切换档案，不沿用用户当前的登录状态。 */
const DEMO_STEPS = [
  { n:1, title:'空记忆开场',      hint:'停在游客模式（0 记忆），输入成都 4 天',        screen:'s0', seeded:false },
  { n:2, title:'三套通用方案',    hint:'注意：没有一个 🧠 标签，和通用工具没区别',      screen:'s1', seeded:false },
  { n:3, title:'元素级表态',      hint:'点开详情，对博物馆点踩、茶馆点赞 3-4 次',     screen:'s2', seeded:false },
  { n:4, title:'换到有记忆的账号', hint:'登录演示账号 demo，同样输入成都 4 天',          screen:'s1', seeded:true  },
  { n:5, title:'对照开关一拨',    hint:'S5 切换记忆开关，7 处 diff 逐个亮起',           screen:'s5', seeded:true  },
  { n:6, title:'收尾',            hint:'“这些记忆换个 App 带不走。”按 F 进全屏演示',    screen:'s5', seeded:true  }
];
