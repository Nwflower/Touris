/* ==========================================================================
   Touris 知途 · 原型数据层
   全部为演示用静态数据，无网络请求。

   商业化推荐口径（餐饮 / 住宿）：
   只给「某某一带」+ 3-4 个候选类型，不给具体店名和门牌地址；
   每个候选带人均、菜系/房型、评分与来源，供用户自己挑。
   ========================================================================== */

/* ---------- 预置身份档案 ----------
   三份「用了一段时间」的记忆档案，登录下拉直接切换（account.js 播种）。
   MEMORIES      = 林小满：慢节奏、安静自然、市集茶馆，晕博物馆
   MEMORIES_IRON = 陈铁腿：特种兵、博物馆控、要景观与夜景
   MEMORIES_EVE  = 周晚晚：自然风光、傍晚散步、怕人多
   语义标签与 semantics.js 的词表一致；id 前缀区分档案（d/f/e）。 */
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

/* 陈铁腿：特种兵 · 博物馆控 · 早上精神最好 */
const MEMORIES_IRON = [
  { id:'f01', text:'喜欢早起赶首波，人少光线好', type:'节奏', scope:'long', cited:4, used:true, pace:'fast',
    source:{ trip:'2026-05 西安 3 天', date:'2026-05-02', action:'你对第 1 天节奏点了喜欢', quote:'开门就进' } },
  { id:'f02', text:'博物馆怎么都看不够，大馆优先', type:'景点', scope:'long', cited:5, used:true, prefer:["small-museum","indoor"],
    source:{ trip:'2026-05 西安 3 天', date:'2026-05-02', action:'你对陕历博点了喜欢', quote:'再来三小时也行' } },
  { id:'f03', text:'古建寺庙这类愿意多排几个', type:'景点', scope:'long', cited:4, used:true, prefer:["temple"],
    source:{ trip:'2025-10 山西 5 天', date:'2025-10-03', action:'你对佛光寺点了喜欢' } },
  { id:'f04', text:'喜欢登高看城市全景', type:'景点', scope:'long', cited:3, used:true, prefer:["view"],
    source:{ trip:'2025-10 山西 5 天', date:'2025-10-04', action:'你对观景台点了喜欢', quote:'看得远' } },
  { id:'f05', text:'夜景和灯光秀是每天的保留节目', type:'景点', scope:'long', cited:3, used:true, prefer:["evening"],
    source:{ trip:'2026-05 西安 3 天', date:'2026-05-03', action:'你对大唐不夜城点了喜欢' } },
  { id:'f06', text:'历史街区爱听讲解，愿意跟半日导览', type:'景点', scope:'long', cited:2, used:false, prefer:["old-town"],
    source:{ trip:'2025-10 山西 5 天', date:'2025-10-05', action:'你请了平遥古城讲解' } },
  { id:'f07', text:'步行不怕多，一天 15km 没问题', type:'交通', scope:'long', cited:2, used:true, pace:'fast',
    source:{ trip:'2025-10 山西 5 天', date:'2025-10-05', action:'你对步行强度点了喜欢' } },
  { id:'f08', text:'吃饭求快，小吃快餐优先', type:'餐饮', scope:'long', cited:2, used:false,
    source:{ trip:'2026-05 西安 3 天', date:'2026-05-02', action:'你把正餐改成了肉夹馍快餐' } },
  { id:'f09', text:'不喜欢纯休闲类（温泉、下午茶占行程）', type:'景点', scope:'long', cited:1, used:true,
    /* 有意不挂标签：「太闲」落不进当前词表（walk-heavy 意思正好相反），
       硬贴一个标签会反向生效——见 _verify.js 的 INERT_MEMORIES。 */
    source:{ trip:'2026-05 西安 3 天', date:'2026-05-03', action:'你删掉了温泉半日', quote:'太闲了' } },
  { id:'f10', text:'主题乐园可以接受', type:'景点', scope:'long', cited:1, used:false,
    source:{ trip:'2024-08 珠海 2 天', date:'2024-08-11', action:'你对长隆点了喜欢' } },
  { id:'f11', text:'喜欢市集淘宝（古玩、旧货）', type:'景点', scope:'long', cited:1, used:false, prefer:["market"],
    source:{ trip:'2026-05 西安 3 天', date:'2026-05-03', action:'你对八仙庵古玩市集点了喜欢' } },
  { id:'f12', text:'住宿就要交通枢纽旁，出门就是地铁', type:'住宿', scope:'long', cited:2, used:true,
    source:{ trip:'2026-05 西安 3 天', date:'2026-05-01', action:'你把住宿改到地铁站旁' } }
];

/* 周晚晚：自然风光 · 傍晚散步 · 怕人多 */
const MEMORIES_EVE = [
  { id:'e01', text:'不喜欢早起，10 点后再出门', type:'节奏', scope:'long', cited:5, used:true, pace:'slow',
    source:{ trip:'2026-04 厦门 3 天', date:'2026-04-11', action:'你对第 2 天节奏点了不喜欢', quote:'起不来' } },
  { id:'e02', text:'只喜欢自然风景，博物馆一概不去', type:'景点', scope:'long', cited:4, used:true, avoid:["museum"], prefer:["bamboo","garden"],
    source:{ trip:'2026-04 厦门 3 天', date:'2026-04-11', action:'你删掉了市博物馆', quote:'我晕博物馆' } },
  { id:'e03', text:'人多的地方待不住，避开网红打卡点', type:'景点', scope:'long', cited:4, used:true, avoid:["crowd"],
    source:{ trip:'2026-04 厦门 3 天', date:'2026-04-12', action:'你对鼓浪屿核心圈点了不喜欢', quote:'全是人' } },
  { id:'e04', text:'最爱傍晚的湖边和海边散步', type:'景点', scope:'long', cited:4, used:true, prefer:["river","evening"],
    source:{ trip:'2026-04 厦门 3 天', date:'2026-04-12', action:'你对环岛路日落点了喜欢', quote:'想每天来' } },
  { id:'e05', text:'日落是硬需求，行程要给日落留位', type:'景点', scope:'long', cited:3, used:true, prefer:["evening","view"],
    source:{ trip:'2025-09 大理 4 天', date:'2025-09-14', action:'你手动加了洱海日落点位' } },
  { id:'e06', text:'喜欢安静庭园与咖啡馆，能坐一下午', type:'景点', scope:'long', cited:3, used:true, prefer:["quiet","garden","dessert"],
    source:{ trip:'2025-09 大理 4 天', date:'2025-09-15', action:'你对庭院咖啡馆点了喜欢' } },
  { id:'e07', text:'一天最多 2 个点，多一个都累', type:'节奏', scope:'long', cited:3, used:true, pace:'slow',
    source:{ trip:'2025-09 大理 4 天', date:'2025-09-14', action:'你对第 3 天节奏点了不喜欢', quote:'太赶' } },
  { id:'e08', text:'费体力爬山之类统统不要', type:'景点', scope:'long', cited:2, used:true, avoid:["walk-heavy"],
    source:{ trip:'2025-09 大理 4 天', date:'2025-09-16', action:'你对苍山徒步点了不喜欢', quote:'爬不动' } },
  { id:'e09', text:'住宿要安静，别在商圈和酒吧街', type:'住宿', scope:'long', cited:2, used:true, avoid:["mall","crowd"], prefer:["quiet"],
    source:{ trip:'2026-04 厦门 3 天', date:'2026-04-10', action:'你把住宿从中山路换到曾厝垵安静侧' } },
  { id:'e10', text:'喜欢逛花卉、植物类的小园子', type:'景点', scope:'long', cited:1, used:true, prefer:["garden"],
    source:{ trip:'2025-09 大理 4 天', date:'2025-09-15', action:'你对兰花小院点了喜欢' } }
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
   seeded: false = 以游客（0 记忆）身份跑；true = 切到「林小满」预置档案看 20 条记忆的效果。
   演示动线会自己切换档案，不沿用用户当前的身份。 */
const DEMO_STEPS = [
  { n:1, title:'空记忆开场',      hint:'停在游客模式（0 记忆），输入成都 4 天',        screen:'s0', seeded:false },
  { n:2, title:'三套算法方案',    hint:'注意：没有一个 🧠 标签，和通用工具没区别',      screen:'s1', seeded:false },
  { n:3, title:'元素级表态',      hint:'点开详情，对博物馆点踩、茶馆点赞 3-4 次',     screen:'s2', seeded:false },
  { n:4, title:'换到有记忆的档案', hint:'身份下拉切到「林小满」，同样成都 4 天',        screen:'s1', seeded:true  },
  { n:5, title:'对照开关一拨',    hint:'S5 切换记忆开关，记忆改动逐个亮起',            screen:'s5', seeded:true  },
  { n:6, title:'收尾',            hint:'“这些记忆换个 App 带不走。”按 F 进全屏演示',    screen:'s5', seeded:true  }
];
