/* ==========================================================================
   Touris 知途 · 原型数据层
   全部为演示用静态数据，无网络请求。

   商业化推荐口径（餐饮 / 住宿）：
   只给「某某一带」+ 3-4 个候选类型，不给具体店名和门牌地址；
   每个候选带人均、菜系/房型、评分与来源，供用户自己挑。
   ========================================================================== */

/* ---------- 京都 POI 坐标（归一化 0-100 画布，用于伪地图） ---------- */
const POI = {
  '京都站':        { x: 56, y: 79 },
  '清水寺':        { x: 73, y: 62 },
  '二年坂三年坂':  { x: 71, y: 60 },
  '祇园花见小路':  { x: 66, y: 54 },
  '八坂神社':      { x: 69, y: 52 },
  '伏见稻荷大社':  { x: 62, y: 93 },
  '金阁寺':        { x: 28, y: 21 },
  '龙安寺':        { x: 21, y: 25 },
  '岚山竹林':      { x: 9,  y: 44 },
  '天龙寺':        { x: 12, y: 47 },
  '渡月桥':        { x: 11, y: 52 },
  '锦市场':        { x: 52, y: 50 },
  '二条城':        { x: 42, y: 39 },
  '银阁寺':        { x: 79, y: 29 },
  '哲学之道':      { x: 76, y: 34 },
  '京都国立博物馆':{ x: 66, y: 67 },
  '三十三间堂':    { x: 64, y: 69 },
  '平安神宫':      { x: 72, y: 43 },
  '河原町':        { x: 58, y: 51 },
  '先斗町':        { x: 59, y: 53 },
  '鸭川河畔':      { x: 60, y: 57 },
  '西阵':          { x: 34, y: 33 },
  '京都塔':        { x: 56, y: 75 },
  '东寺':          { x: 47, y: 84 },
  '南禅寺':        { x: 74, y: 39 },
  '出町柳桝形商店街': { x: 63, y: 30 },
  '嵯峨野':        { x: 13, y: 45 },
  '京都站伊势丹':  { x: 56, y: 77 }
};

/* ---------- 景点资料（分数 / 一句话 / 标签 / 缩略图类别） ---------- */
const SPOTS = {
  '清水寺':        { score:4.7, count:12840, src:'大众点评', cat:'temple',
    intro:'悬空木舞台俯瞰京都市区，傍晚人少还有夕照。', tags:['世界遗产','观景台','傍晚好','人多'] },
  '二年坂三年坂':  { score:4.5, count:6210, src:'大众点评', cat:'street',
    intro:'通往清水寺的石板坡道，两侧是伴手礼铺和茶屋。', tags:['石板街','伴手礼','拍照','坡道'] },
  '京都国立博物馆':{ score:4.4, count:2180, src:'大众点评', cat:'museum',
    intro:'大型综合馆，常设加特展走完要两小时以上。', tags:['大型馆','常设+特展','室内','费体力'] },
  '三十三间堂':    { score:4.6, count:3140, src:'大众点评', cat:'temple',
    intro:'1001 尊等身佛像排成一列的木造长堂。', tags:['国宝','室内','安静','雨天可'] },
  '祇园花见小路':  { score:4.5, count:8900, src:'大众点评', cat:'street',
    intro:'町屋木格子沿街排开，入夜灯笼亮起来最好看。', tags:['夜景','町屋','人多','免费'] },
  '金阁寺':        { score:4.6, count:15200, src:'大众点评', cat:'temple',
    intro:'金箔阁楼倒映在镜湖池上，绕池一圈约 40 分钟。', tags:['世界遗产','必看','人多','动线短'] },
  '龙安寺':        { score:4.5, count:4300, src:'大众点评', cat:'garden',
    intro:'十五块石头的枯山水方丈庭园，坐着看比走着看好。', tags:['枯山水','庭园','安静','可久坐'] },
  '岚山竹林':      { score:4.6, count:11800, src:'大众点评', cat:'bamboo',
    intro:'几百米高竹夹道，早上 9 点前几乎没人。', tags:['竹林','自然','清晨好','免费'] },
  '天龙寺':        { score:4.6, count:5200, src:'大众点评', cat:'garden',
    intro:'曹源池庭园借景岚山，坐在廊下看最舒服。', tags:['世界遗产','庭园','安静','可久坐'] },
  '渡月桥':        { score:4.4, count:7600, src:'大众点评', cat:'river',
    intro:'横跨桂川的木桥，桥头正对岚山山脊。', tags:['河川','拍照','免费','人多'] },
  '二条城':        { score:4.5, count:5400, src:'大众点评', cat:'castle',
    intro:'将军居城，二之丸御殿的走廊一踩就响。', tags:['世界遗产','室内','闭园早','动线长'] },
  '伏见稻荷大社':  { score:4.7, count:18900, src:'大众点评', cat:'shrine',
    intro:'千本鸟居一路上山，走到山顶来回约 2.5 小时。', tags:['鸟居','爬山','24 小时','体力活'] },
  '东寺':          { score:4.4, count:3900, src:'马蜂窝', cat:'temple',
    intro:'日本最高的五重塔，池边能看到塔的倒影。', tags:['五重塔','世界遗产','人少','动线短'] },
  '锦市场':        { score:4.5, count:9200, src:'大众点评', cat:'market',
    intro:'四百年的室内市场街，以边逛边吃为主。', tags:['市集','本地','小吃','雨天可'] },
  '出町柳桝形商店街':{ score:4.5, count:1900, src:'马蜂窝', cat:'market',
    intro:'本地人买菜的有顶商店街，早市名物多。', tags:['早市','本地','小吃','人少'] },
  '平安神宫':      { score:4.3, count:5100, src:'大众点评', cat:'shrine',
    intro:'朱红大殿加收费神苑，庭园比正殿更值得。', tags:['神社','庭园','拍照','动线短'] },
  '银阁寺':        { score:4.5, count:6800, src:'大众点评', cat:'temple',
    intro:'素色阁楼配苔庭，动线是一条上坡单行道。', tags:['世界遗产','苔庭','动线短','安静'] },
  '哲学之道':      { score:4.6, count:5600, src:'大众点评', cat:'path',
    intro:'沿水渠的两公里步道，慢走大约一小时。', tags:['步道','安静','免费','自然'] },
  '南禅寺':        { score:4.6, count:4700, src:'大众点评', cat:'garden',
    intro:'巨大三门加红砖水路阁，免费区就够逛。', tags:['庭园','水路阁','安静','免费区大'] },
  '鸭川河畔':      { score:4.7, count:7300, src:'大众点评', cat:'river',
    intro:'穿城而过的河岸草坡，傍晚本地人坐一整排。', tags:['河川','傍晚好','免费','散步'] },
  '先斗町':        { score:4.4, count:6100, src:'大众点评', cat:'street',
    intro:'一条只容两人并行的夜巷，两侧都是小馆。', tags:['夜巷','本地小馆','夜间','人多'] },
  '京都塔':        { score:4.0, count:5900, src:'大众点评', cat:'tower',
    intro:'车站对面的观景塔，主要是看夜景。', tags:['观景台','夜景','游客向','室内'] },
  '京都站伊势丹':  { score:4.2, count:4200, src:'大众点评', cat:'shopping',
    intro:'车站直连百货，地下食品层适合买了带走。', tags:['购物','车站直连','雨天可','游客向'] },
  '京都站':        { score:4.3, count:8100, src:'大众点评', cat:'station',
    intro:'大屋顶车站本身就是地标，也是返程集散点。', tags:['交通枢纽','购物','集散'] }
};

/* ---------- 预置记忆库（预置演示账号 demo 的 20 条） ----------
   账号体系见 account.js：这份 MEMORIES 由 _seedDemo() 播种进演示账号，
   原样引用不复制不删改。游客模式则完全不读它——游客 = 0 记忆模式。
   想改演示账号的口令 / 名字，去 account.js 顶部的 DEMO_ACCOUNT。 */
const MEMORIES = [
  { id:'m01', text:'不喜欢早起赶路', type:'节奏', scope:'long', cited:3, used:true, pace:'slow',
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-14', action:'你对第 2 天节奏点了不喜欢', quote:'太早出门' } },
  { id:'m02', text:'喜欢逛本地菜市场、早市', type:'餐饮', scope:'long', cited:4, used:true, prefer:["market"],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-15', action:'你对「黑门市场」点了喜欢', quote:'想吃这个' } },
  { id:'m03', text:'我晕博物馆（大型综合馆）', type:'景点', scope:'long', cited:5, used:true, avoid:["museum"],
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-08', action:'你对「江户东京博物馆」点了不喜欢', quote:'我晕博物馆' } },
  { id:'m04', text:'一天最多 3 个景点，超过就嫌赶', type:'节奏', scope:'long', cited:6, used:true, pace:'slow',
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-07', action:'你对第 1 天节奏点了不喜欢', quote:'太赶' } },
  { id:'m05', text:'偏好住在有夜间小馆的生活街区，而不是商圈中心', type:'住宿', scope:'long', cited:2, used:true, avoid:["mall"], prefer:["old-town"],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-16', action:'你把住宿从心斋桥一带改到福岛区一带后点了喜欢', quote:'晚上有地方吃饭' } },
  { id:'m06', text:'喜欢抹茶与和式甜品', type:'餐饮', scope:'long', cited:3, used:true, prefer:["dessert"],
    source:{ trip:'2025-06 京都 3 天', date:'2025-06-21', action:'你对祇园一带的一家抹茶茶寮点了喜欢', quote:'想吃这个' } },
  { id:'m07', text:'不喜欢需要排队超过 30 分钟的网红店', type:'餐饮', scope:'long', cited:4, used:true, avoid:["queue","crowd"],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-15', action:'你对道顿堀一家排队网红店点了不喜欢', quote:'人太多' } },
  { id:'m08', text:'喜欢竹林、庭园这类安静的自然景观', type:'景点', scope:'long', cited:3, used:true, prefer:["bamboo","garden","quiet"],
    source:{ trip:'2025-06 京都 3 天', date:'2025-06-22', action:'你对「岚山竹林」点了喜欢', quote:'想多待会儿' } },
  { id:'m09', text:'习惯午后留 2 小时自由休息', type:'节奏', scope:'long', cited:2, used:false, pace:'slow',
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-09', action:'你手动删掉了下午 3 点的行程' } },
  { id:'m10', text:'不喜欢一天里换两次交通枢纽', type:'交通', scope:'long', cited:2, used:false, avoid:["walk-heavy"],
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-10', action:'你对第 4 天节奏点了不喜欢', quote:'太远' } },
  { id:'m11', text:'喜欢傍晚沿河散步', type:'景点', scope:'long', cited:1, used:false, prefer:["river","evening"],
    source:{ trip:'2025-06 京都 3 天', date:'2025-06-22', action:'你对「鸭川河畔」点了喜欢' } },
  { id:'m12', text:'对购物中心、免税店兴趣很低', type:'购物', scope:'long', cited:3, used:false, avoid:["mall"],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-17', action:'你删掉了「心斋桥购物」这一段' } },
  { id:'m13', text:'小型有解说的展馆可以接受（与大型博物馆区分）', type:'景点', scope:'long', cited:1, used:false, prefer:["small-museum"],
    source:{ trip:'2025-11 东京 5 天', date:'2025-11-09', action:'你对「刀剑博物馆」点了喜欢' } },
  { id:'m14', text:'愿意为一顿正式晚饭多花时间和预算', type:'餐饮', scope:'long', cited:2, used:false,
    source:{ trip:'2025-06 京都 3 天', date:'2025-06-21', action:'你把晚餐从便利店改成了怀石料理' } },
  { id:'m15', text:'不喜欢团队体验课程（和服体验、茶道班）', type:'景点', scope:'long', cited:2, used:false, avoid:["tour-group"],
    source:{ trip:'2025-06 京都 3 天', date:'2025-06-23', action:'你对「和服体验」点了不喜欢', quote:'不感兴趣' } },
  { id:'m16', text:'喜欢住二层以下带小庭院的旅馆', type:'住宿', scope:'long', cited:1, used:false, prefer:["garden","quiet"],
    source:{ trip:'2025-06 京都 3 天', date:'2025-06-20', action:'你对一家町屋改造旅馆点了喜欢' } },
  { id:'m17', text:'偏好傍晚而非清晨游览寺庙', type:'节奏', scope:'long', cited:2, used:false, prefer:["evening","temple"],
    source:{ trip:'2025-06 京都 3 天', date:'2025-06-22', action:'你把清水寺从早上挪到了傍晚' } },
  { id:'m18', text:'不喜欢主题乐园', type:'景点', scope:'long', cited:1, used:false, avoid:["theme-park"],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-16', action:'你对「环球影城」点了不喜欢', quote:'不感兴趣' } },
  { id:'m19', text:'这次想控制在步行为主（仅本次）', type:'交通', scope:'session', cited:1, used:false,
    source:{ trip:'2026-09 本次规划', date:'2026-09-12', action:'你在需求里勾了「少坐车」' } },
  { id:'m20', text:'喜欢当地人开的小馆，不追米其林', type:'餐饮', scope:'long', cited:3, used:true, prefer:["local-food"],
    source:{ trip:'2026-03 大阪 4 天', date:'2026-03-16', action:'你对福岛区一带的一家居酒屋点了喜欢' } }
];

/* ---------- S1 三方案：默认版（空记忆 / 关闭记忆） ---------- */
const PLANS_DEFAULT = [
  {
    id: 'p-packed',
    style: '暴走打卡型',
    tagline: '4 天走满 13 个必打卡点，一个不漏',
    pace: 5,
    density: 3.3,
    stay: { area: '京都站前一带', dist: '距核心区 2.1km · 交通枢纽旁' },
    food: ['网红店', '连锁便利'],
    walk: [14200, 16800, 15400, 12600],
    highlights: ['清水寺', '金阁寺', '伏见稻荷大社', '岚山竹林', '京都国立博物馆'],
    routeDays: [
      ['清水寺','二年坂三年坂','京都国立博物馆','三十三间堂','祇园花见小路'],
      ['金阁寺','龙安寺','岚山竹林','渡月桥','二条城'],
      ['伏见稻荷大社','东寺','锦市场','平安神宫','京都站伊势丹'],
      ['银阁寺','哲学之道','京都塔','京都站']
    ],
    memoryIds: []
  },
  {
    id: 'p-local',
    style: '慢逛本地型',
    tagline: '每天 2-3 个点，把时间留给街区和吃',
    pace: 2,
    density: 2.3,
    stay: { area: '西阵一带', dist: '距核心区 1.6km · 生活街区' },
    food: ['本地小馆', '市集'],
    walk: [8600, 9200, 7800, 8100],
    highlights: ['锦市场', '岚山竹林', '哲学之道', '先斗町', '鸭川河畔'],
    routeDays: [
      ['锦市场','清水寺','先斗町'],
      ['岚山竹林','天龙寺','渡月桥'],
      ['出町柳桝形商店街','哲学之道','银阁寺'],
      ['南禅寺','鸭川河畔','京都站']
    ],
    memoryIds: []
  },
  {
    id: 'p-resort',
    style: '轻松度假型',
    tagline: '睡到自然醒，一天一个大景点',
    pace: 1,
    density: 1.8,
    stay: { area: '四条河原町一带', dist: '距核心区 0.3km · 商圈中心' },
    food: ['酒店餐', '网红店'],
    walk: [6200, 5800, 6600, 5200],
    highlights: ['清水寺', '平安神宫', '京都塔', '京都站伊势丹'],
    routeDays: [
      ['清水寺','祇园花见小路'],
      ['平安神宫','南禅寺'],
      ['锦市场','京都塔'],
      ['京都站伊势丹','京都站']
    ],
    memoryIds: []
  }
];

/* ---------- S1 三方案：记忆版（有记忆人设 / 开启记忆） ---------- */
const PLANS_MEMORY = [
  {
    id: 'p-local',
    style: '慢逛本地型',
    tagline: '每天 2-3 个点，早市开场、傍晚寺庙收尾',
    pace: 2,
    density: 2.3,
    stay: { area: '西阵一带 · 町屋旅馆', dist: '距核心区 1.6km · 夜间小馆多' },
    food: ['本地小馆', '市集', '抹茶甜品'],
    walk: [8600, 9200, 7800, 8100],
    highlights: ['锦市场', '岚山竹林', '哲学之道', '先斗町', '出町柳桝形商店街'],
    routeDays: [
      ['锦市场','清水寺','先斗町'],
      ['岚山竹林','天龙寺','渡月桥'],
      ['出町柳桝形商店街','哲学之道','银阁寺'],
      ['南禅寺','鸭川河畔','京都站']
    ],
    recommended: true,
    memoryIds: ['m04', 'm02', 'm05', 'm08', 'm16'],
    memoryNote: '这套方案的节奏、住宿、餐饮策略都由你的记忆推出来'
  },
  {
    id: 'p-temple',
    style: '古寺庭园型',
    tagline: '避开人潮时段，专攻庭园与竹林',
    pace: 3,
    density: 2.5,
    stay: { area: '西阵一带', dist: '距核心区 1.6km · 生活街区' },
    food: ['本地小馆', '精进料理'],
    walk: [10400, 11200, 9600, 9800],
    highlights: ['龙安寺', '南禅寺', '天龙寺', '哲学之道'],
    routeDays: [
      ['龙安寺','金阁寺','二条城'],
      ['天龙寺','岚山竹林','渡月桥'],
      ['南禅寺','哲学之道','银阁寺'],
      ['三十三间堂','清水寺','京都站']
    ],
    memoryIds: ['m08', 'm17'],
    memoryNote: '按「喜欢庭园」「傍晚逛寺庙」排的时段'
  },
  {
    id: 'p-packed',
    style: '暴走打卡型',
    tagline: '4 天 13 个点 · 与你的记录冲突较多',
    pace: 5,
    density: 3.3,
    stay: { area: '京都站前一带', dist: '距核心区 2.1km · 交通枢纽旁' },
    food: ['网红店', '连锁便利'],
    walk: [14200, 16800, 15400, 12600],
    highlights: ['清水寺', '金阁寺', '伏见稻荷大社', '京都国立博物馆'],
    routeDays: [
      ['清水寺','二年坂三年坂','京都国立博物馆','三十三间堂','祇园花见小路'],
      ['金阁寺','龙安寺','岚山竹林','渡月桥','二条城'],
      ['伏见稻荷大社','东寺','锦市场','平安神宫','京都站伊势丹'],
      ['银阁寺','哲学之道','京都塔','京都站']
    ],
    conflict: true,
    memoryIds: ['m04', 'm03', 'm07'],
    memoryNote: '与 3 条记忆冲突：节奏过密、含大型博物馆、多家排队网红店'
  }
];

/* ---------- 餐饮候选组（只给「某一带」+ 3-4 个候选，不给店名地址） ---------- */
const DINING = {
  'r-nishiki': {
    area:'锦市场一带', theme:'市集小吃 · 边逛边吃', walk:'在景点动线上，无需绕路',
    picks:[
      { style:'渍物老铺', cuisine:'和食 · 渍物', price:'¥300-800',   score:4.5, count:1842, src:'大众点评', note:'可以试吃再决定买哪种' },
      { style:'现烤海鲜摊', cuisine:'海鲜 · 烤物', price:'¥800-1,500', score:4.4, count:960,  src:'大众点评', note:'站着吃，9 点前几乎不排队' },
      { style:'玉子烧专门店', cuisine:'和食 · 玉子烧', price:'¥400-900', score:4.3, count:1220, src:'大众点评', note:'现做，午后常售完' },
      { style:'豆乳甜品摊', cuisine:'甜品 · 豆乳', price:'¥300-600',  score:4.2, count:540,  src:'大众点评', note:'适合边走边喝' }
    ]
  },
  'r-tsujiri': {
    area:'祇园一带', theme:'抹茶甜品 · 下午茶', walk:'从清水寺方向步行可达',
    picks:[
      { style:'老字号抹茶茶寮', cuisine:'甜品 · 抹茶', price:'¥1,200-1,800', score:4.6, count:3120, src:'大众点评', note:'平日 14 点后约排 15 分钟' },
      { style:'町屋改造茶室', cuisine:'甜品 · 和菓子', price:'¥900-1,500',  score:4.5, count:870,  src:'Tabelog 转译', note:'座位少但周转快' },
      { style:'宇治茶园直营店', cuisine:'甜品 · 抹茶', price:'¥800-1,400', score:4.4, count:1560, src:'大众点评', note:'可买茶叶带走' }
    ]
  },
  'r-pontocho': {
    area:'先斗町一带', theme:'本地小馆 · 夜饭', walk:'住宿区步行 12 分钟',
    picks:[
      { style:'二楼串烧小店', cuisine:'居酒屋 · 串烧', price:'¥2,500-3,500', score:4.4, count:967, src:'Tabelog 转译', note:'8 个座位，19 点前基本能坐' },
      { style:'家庭式小料理', cuisine:'和食 · 家常', price:'¥2,000-3,000', score:4.3, count:420, src:'Tabelog 转译', note:'菜单当天写在墙上' },
      { style:'河岸居酒屋', cuisine:'居酒屋', price:'¥3,000-4,000', score:4.2, count:610, src:'大众点评', note:'河边座位要早到' }
    ]
  },
  'r-yudofu': {
    area:'嵯峨野一带', theme:'汤豆腐午市 · 庭园座', walk:'竹林出来步行 6 分钟',
    picks:[
      { style:'庭园座汤豆腐店', cuisine:'和食 · 豆腐', price:'¥3,000-4,500', score:4.3, count:604, src:'Tabelog 转译', note:'午市套餐性价比高' },
      { style:'精进料理小店', cuisine:'精进料理', price:'¥2,500-3,500', score:4.4, count:380, src:'Tabelog 转译', note:'全素，需提前一天订' },
      { style:'荞麦面老铺', cuisine:'和食 · 荞麦', price:'¥1,200-1,800', score:4.2, count:720, src:'大众点评', note:'基本不用等位' }
    ]
  },
  'r-demachi': {
    area:'出町柳一带', theme:'早市名物 · 边逛边吃', walk:'商店街内，与景点同一段',
    picks:[
      { style:'豆饼老铺', cuisine:'和菓子', price:'¥200-500', score:4.7, count:2210, src:'大众点评', note:'10 点前排队 5 分钟内，卖完即止' },
      { style:'商店街可乐饼摊', cuisine:'小吃 · 炸物', price:'¥150-400', score:4.4, count:690, src:'大众点评', note:'现炸，拿着走' },
      { style:'町屋咖啡早餐', cuisine:'咖啡 · 早餐', price:'¥800-1,200', score:4.3, count:510, src:'大众点评', note:'有座位，可以歇脚' }
    ]
  },
  'r-ichiran': {
    area:'河原町一带', theme:'连锁快餐 · 午饭', walk:'商圈中心，选择多但高峰拥挤',
    picks:[
      { style:'人气连锁拉面', cuisine:'拉面', price:'¥1,000-1,500', score:4.1, count:5602, src:'大众点评', note:'午晚高峰排队 40-60 分钟' },
      { style:'商场内牛丼连锁', cuisine:'丼饭', price:'¥600-900', score:3.9, count:2100, src:'大众点评', note:'出餐快，翻台紧' },
      { style:'百货美食街定食', cuisine:'定食', price:'¥1,200-1,800', score:3.8, count:880, src:'大众点评', note:'评价集中在「方便但一般」' }
    ]
  },
  'r-kyotower': {
    area:'京都塔一带', theme:'游客向食堂 · 快',  walk:'车站对面，返程动线上',
    picks:[
      { style:'观光楼大食堂', cuisine:'美食广场', price:'¥1,000-1,600', score:3.8, count:1290, src:'大众点评', note:'出餐快，评价一般' },
      { style:'车站便当卖场', cuisine:'便当', price:'¥800-1,300', score:4.0, count:3400, src:'大众点评', note:'可带上车吃' },
      { style:'连锁咖啡简餐', cuisine:'简餐', price:'¥700-1,100', score:3.7, count:950, src:'大众点评', note:'有插座，可久坐' }
    ]
  },
  'r-hotel': {
    area:'住宿一带', theme:'酒店早午餐 · 晚起友好', walk:'不用出门',
    picks:[
      { style:'酒店自助早午餐', cuisine:'和洋自助', price:'¥2,000-3,000', score:4.0, count:432, src:'酒店官网', note:'11 点前供应' },
      { style:'街角面包店', cuisine:'面包 · 咖啡', price:'¥600-1,000', score:4.3, count:280, src:'大众点评', note:'步行 3 分钟' }
    ]
  },
  'r-kaiseki': {
    area:'祇园一带', theme:'正式午间怀石 · 需预约', walk:'从鸭川步行 8 分钟',
    picks:[
      { style:'町屋怀石', cuisine:'怀石料理', price:'¥8,000-12,000', score:4.6, count:518, src:'Tabelog 转译', note:'需提前 3 天预约，午市比晚市便宜四成' },
      { style:'老铺割烹', cuisine:'割烹', price:'¥6,000-9,000', score:4.5, count:340, src:'Tabelog 转译', note:'吧台位可看料理过程' },
      { style:'庭园料亭午市', cuisine:'料亭', price:'¥10,000-15,000', score:4.7, count:260, src:'Tabelog 转译', note:'必须预约，含庭园参观' }
    ]
  }
};

/* ---------- 住宿候选组（同口径：只给一带 + 候选类型） ---------- */
const STAY_DEFAULT = {
  area:'京都站前一带', theme:'交通枢纽旁 · 商务酒店', note:'距核心区 2.1km · 换乘方便但夜里没什么吃的',
  memoryIds: [],
  picks:[
    { style:'车站直连商务酒店', room:'双床房', price:'¥9,000-13,000/晚', score:4.0, count:2400, src:'大众点评', note:'步行 3 分钟到车站' },
    { style:'连锁商务酒店', room:'标准双人', price:'¥7,500-11,000/晚', score:3.9, count:1800, src:'大众点评', note:'房间小，胜在便宜' },
    { style:'车站南口新酒店', room:'双床房', price:'¥10,000-14,000/晚', score:4.2, count:640, src:'大众点评', note:'新装修，有自助洗衣' }
  ]
};
const STAY_MEMORY = {
  area:'西阵一带', theme:'生活街区 · 町屋改造小旅馆', note:'距核心区 1.6km · 夜间小馆多 · 多为二层带庭院',
  memoryIds: ['m05', 'm16'],
  picks:[
    { style:'町屋改造旅馆', room:'和室双人', price:'¥12,000-16,000/晚', score:4.6, count:312, src:'大众点评', note:'二层带小庭院，夜间小馆步行可达' },
    { style:'家庭经营民宿', room:'和室双人', price:'¥8,000-11,000/晚', score:4.5, count:208, src:'Booking 转译', note:'有小院，房东会给周边手绘图' },
    { style:'老宅整栋出租', room:'两室一厅', price:'¥15,000-20,000/晚', score:4.7, count:96, src:'Booking 转译', note:'带厨房，适合住 3 晚以上' }
  ]
};

/* ---------- 行程：默认版（不使用记忆） ---------- */
const ITIN_DEFAULT = {
  planId: 'p-packed',
  stay: STAY_DEFAULT,
  days: [
    { day:1, date:'10-02', theme:'东山打卡线', pace:5, paceNote:'08:00 出发 · 步行 14.2km',
      items:[
        { id:'d1-1', kind:'spot', time:'08:00', name:'清水寺', dur:'90 min', note:'开门即入，人少' },
        { id:'d1-2', kind:'spot', time:'10:00', name:'二年坂三年坂', dur:'60 min', note:'伴手礼一条街' },
        { id:'d1-3', kind:'food', time:'11:30', name:'r-ichiran' },
        { id:'d1-4', kind:'spot', time:'13:30', name:'京都国立博物馆', dur:'120 min', note:'常设展 + 特展' },
        { id:'d1-5', kind:'spot', time:'16:00', name:'三十三间堂', dur:'60 min', note:'1001 尊佛像' },
        { id:'d1-6', kind:'spot', time:'18:00', name:'祇园花见小路', dur:'60 min', note:'夜景' }
      ] },
    { day:2, date:'10-03', theme:'金阁 + 岚山',  pace:5, paceNote:'07:30 出发 · 步行 16.8km · 换乘 3 次',
      items:[
        { id:'d2-1', kind:'spot', time:'07:30', name:'金阁寺', dur:'60 min', note:'早班车避人' },
        { id:'d2-2', kind:'spot', time:'09:30', name:'龙安寺', dur:'60 min', note:'枯山水' },
        { id:'d2-3', kind:'spot', time:'11:30', name:'岚山竹林', dur:'60 min' },
        { id:'d2-4', kind:'food', time:'13:00', name:'r-yudofu' },
        { id:'d2-5', kind:'spot', time:'15:00', name:'渡月桥', dur:'45 min' },
        { id:'d2-6', kind:'spot', time:'17:30', name:'二条城', dur:'60 min', note:'闭园前赶进' }
      ] },
    { day:3, date:'10-04', theme:'伏见稻荷 + 市区', pace:4, paceNote:'08:00 出发 · 步行 15.4km',
      items:[
        { id:'d3-1', kind:'spot', time:'08:00', name:'伏见稻荷大社', dur:'150 min', note:'爬到山顶' },
        { id:'d3-2', kind:'spot', time:'11:30', name:'东寺', dur:'60 min' },
        { id:'d3-3', kind:'food', time:'13:00', name:'r-kyotower' },
        { id:'d3-4', kind:'spot', time:'14:30', name:'锦市场', dur:'60 min', note:'快速逛' },
        { id:'d3-5', kind:'spot', time:'16:00', name:'平安神宫', dur:'60 min' },
        { id:'d3-6', kind:'spot', time:'18:00', name:'京都站伊势丹', dur:'90 min', note:'购物' }
      ] },
    { day:4, date:'10-05', theme:'银阁寺 + 返程', pace:3, paceNote:'08:30 出发 · 步行 12.6km',
      items:[
        { id:'d4-1', kind:'spot', time:'08:30', name:'银阁寺', dur:'60 min' },
        { id:'d4-2', kind:'spot', time:'10:00', name:'哲学之道', dur:'60 min' },
        { id:'d4-3', kind:'food', time:'12:00', name:'r-tsujiri' },
        { id:'d4-4', kind:'spot', time:'14:00', name:'京都塔', dur:'45 min' },
        { id:'d4-5', kind:'spot', time:'16:00', name:'京都站', dur:'—', note:'返程' }
      ] }
  ]
};

/* ---------- 行程：记忆版（使用记忆） ---------- */
const ITIN_MEMORY = {
  planId: 'p-local',
  stay: STAY_MEMORY,
  days: [
    { day:1, date:'10-02', theme:'锦市场开场 · 傍晚东山', pace:2, paceNote:'09:30 出发 · 步行 8.6km',
      memoryIds:['m01','m04'],
      items:[
        { id:'d1-1', kind:'food', time:'09:30', name:'r-nishiki', memoryIds:['m02'] },
        { id:'d1-2', kind:'spot', time:'11:00', name:'锦市场', dur:'90 min', note:'边逛边吃', memoryIds:['m02'] },
        { id:'d1-3', kind:'free', time:'13:30', name:'回旅馆休息', dur:'120 min', memoryIds:['m09'] },
        { id:'d1-4', kind:'spot', time:'16:30', name:'清水寺', dur:'90 min', note:'傍晚人少、有夕照', memoryIds:['m17'] },
        { id:'d1-5', kind:'food', time:'19:00', name:'r-pontocho', memoryIds:['m20'] }
      ] },
    { day:2, date:'10-03', theme:'岚山竹林慢逛', pace:2, paceNote:'09:00 出发 · 步行 9.2km · 换乘 1 次',
      memoryIds:['m10'],
      items:[
        { id:'d2-1', kind:'spot', time:'09:00', name:'岚山竹林', dur:'120 min', note:'留足停留时间', memoryIds:['m08'] },
        { id:'d2-2', kind:'spot', time:'11:30', name:'天龙寺', dur:'75 min', note:'曹源池庭园', memoryIds:['m08'] },
        { id:'d2-3', kind:'food', time:'13:00', name:'r-yudofu', memoryIds:['m20'] },
        { id:'d2-4', kind:'spot', time:'15:00', name:'渡月桥', dur:'45 min' },
        { id:'d2-5', kind:'free', time:'16:30', name:'回旅馆休息', dur:'90 min', memoryIds:['m09'] }
      ] },
    { day:3, date:'10-04', theme:'早市 + 哲学之道', pace:2, paceNote:'09:00 出发 · 步行 7.8km',
      items:[
        { id:'d3-1', kind:'food', time:'09:00', name:'r-demachi', memoryIds:['m02'] },
        { id:'d3-2', kind:'spot', time:'10:30', name:'出町柳桝形商店街', dur:'60 min', note:'本地早市街', memoryIds:['m02'] },
        { id:'d3-3', kind:'spot', time:'13:00', name:'哲学之道', dur:'90 min', note:'沿水道慢走', memoryIds:['m08'] },
        { id:'d3-4', kind:'spot', time:'15:30', name:'银阁寺', dur:'60 min' },
        { id:'d3-5', kind:'food', time:'17:00', name:'r-tsujiri', memoryIds:['m06'] }
      ] },
    { day:4, date:'10-05', theme:'鸭川散步 · 返程', pace:1, paceNote:'10:00 出发 · 步行 8.1km',
      memoryIds:['m01'],
      items:[
        { id:'d4-1', kind:'spot', time:'10:00', name:'南禅寺', dur:'75 min', note:'水路阁庭园', memoryIds:['m08'] },
        { id:'d4-2', kind:'food', time:'12:30', name:'r-kaiseki', memoryIds:['m14'] },
        { id:'d4-3', kind:'spot', time:'15:00', name:'鸭川河畔', dur:'60 min', note:'傍晚沿河走回', memoryIds:['m11'] },
        { id:'d4-4', kind:'spot', time:'17:00', name:'京都站', dur:'—', note:'返程' }
      ] }
  ]
};

/* ---------- S5 diff 清单（记忆 vs 默认，7 处） ---------- */
const DIFFS = [
  { id:'x1', day:1, kind:'removed', target:'京都国立博物馆',
    text:'砍掉「京都国立博物馆」(120 min)', memoryIds:['m03'] },
  { id:'x2', day:1, kind:'removed', target:'r-ichiran',
    text:'午餐从河原町连锁拉面（排队 40-60 分钟）换成锦市场一带', memoryIds:['m07'] },
  { id:'x3', day:1, kind:'changed', target:'清水寺',
    text:'清水寺从 08:00 挪到 16:30', from:'08:00 开门即入', to:'16:30 傍晚', memoryIds:['m17','m01'] },
  { id:'x4', day:0, kind:'changed', target:'stay',
    text:'住宿从「京都站前一带」换到「西阵一带 · 町屋旅馆」', from:'京都站前一带 · 商务酒店', to:'西阵一带 · 町屋改造小旅馆', memoryIds:['m05','m16'] },
  { id:'x5', day:3, kind:'added', target:'出町柳桝形商店街',
    text:'新增「出町柳早市」半天', memoryIds:['m02'] },
  { id:'x6', day:1, kind:'added', target:'free',
    text:'每天插入午后 90-120 min 休息', memoryIds:['m09'] },
  { id:'x7', day:0, kind:'changed', target:'pace',
    text:'日均景点 3.3 → 2.3 个，日均步行 14.8km → 8.4km', from:'3.3 个 / 14.8km', to:'2.3 个 / 8.4km', memoryIds:['m04','m01'] }
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
  { n:1, title:'空记忆开场',      hint:'停在游客模式（0 记忆），输入京都 4 天',        screen:'s0', seeded:false },
  { n:2, title:'三套通用方案',    hint:'注意：没有一个 🧠 标签，和通用工具没区别',      screen:'s1', seeded:false },
  { n:3, title:'元素级表态',      hint:'点开详情，对博物馆点踩、抹茶店点赞 3-4 次',     screen:'s2', seeded:false },
  { n:4, title:'换到有记忆的账号', hint:'登录演示账号 demo，同样输入京都 4 天',          screen:'s1', seeded:true  },
  { n:5, title:'对照开关一拨',    hint:'S5 切换记忆开关，7 处 diff 逐个亮起',           screen:'s5', seeded:true  },
  { n:6, title:'收尾',            hint:'“这些记忆换个 App 带不走。”按 F 进全屏演示',    screen:'s5', seeded:true  }
];
