/* 北京、上海城市资料。京都保留在 data.js；本文件用同一数据协议扩展城市。 */
(function(){
  function spot(score, count, cat, intro, tags){ return {score,count,src:'大众点评',cat,intro,tags}; }
  function pick(style,cuisine,price,score,count,note){ return {style,cuisine,price,score,count,src:'大众点评',note}; }
  function dining(area,theme,walk,picks){ return {area,theme,walk,picks}; }
  function stay(area,theme,note,memoryIds,picks){ return {area,theme,note,memoryIds,picks}; }
  function room(style,room,price,score,count,note){ return {style,room,price,score,count,src:'大众点评',note}; }

  const baseMem = {
    slow:['m01','m04'], market:['m02'], nature:['m08'], rest:['m09'], local:['m20'],
    stay:['m05','m16'], river:['m11'], museum:['m03'], queue:['m07']
  };

  function makeCity(c){
    const p = c.poi, s = c.spots;
    const defaultPlans = [
      {id:'p-packed',style:'暴走打卡型',tagline:`4 天走满 ${c.packedRoutes.flat().length} 个城市地标，一个不漏`,pace:5,density:3.5,
        stay:{area:c.defaultStay.area,dist:c.defaultStay.note},food:['网红店','连锁快餐'],walk:[14800,16200,15100,12900],
        highlights:c.packedRoutes.flat().filter(n=>s[n]).slice(0,5),routeDays:c.packedRoutes,memoryIds:[]},
      {id:'p-local',style:'慢逛本地型',tagline:'每天 2-3 个点，把时间留给街区和吃',pace:2,density:2.3,
        stay:{area:c.memoryStay.area,dist:c.memoryStay.note},food:['本地小馆','市集'],walk:[8200,9100,7600,8400],
        highlights:c.localRoutes.flat().filter(n=>s[n]).slice(0,5),routeDays:c.localRoutes,memoryIds:[]},
      {id:'p-resort',style:'轻松度假型',tagline:'睡到自然醒，一天一个核心片区',pace:1,density:1.8,
        stay:{area:c.resortArea,dist:'核心片区 · 交通方便'},food:['酒店餐','下午茶'],walk:[6100,5700,6500,5200],
        highlights:c.relaxedRoutes.flat().filter(n=>s[n]).slice(0,4),routeDays:c.relaxedRoutes,memoryIds:[]}
    ];
    const memoryPlans = [
      {...defaultPlans[1],tagline:'每天 2-3 个点，市集开场、傍晚散步收尾',recommended:true,
        memoryIds:['m04','m02','m05','m08','m16'],memoryNote:'节奏、住宿和餐饮策略都由你的旅行记忆推出来'},
      {id:'p-culture',style:c.cultureStyle,tagline:c.cultureTagline,pace:3,density:2.5,
        stay:{area:c.memoryStay.area,dist:c.memoryStay.note},food:['本地小馆','特色餐饮'],walk:[9800,10600,9200,8800],
        highlights:c.cultureRoutes.flat().filter(n=>s[n]).slice(0,4),routeDays:c.cultureRoutes,
        memoryIds:['m08','m17'],memoryNote:'按「喜欢安静景观」「傍晚游览」安排时段'},
      {...defaultPlans[0],tagline:`4 天 ${c.packedRoutes.flat().length} 个点 · 与你的记录冲突较多`,conflict:true,
        memoryIds:['m04','m03','m07'],memoryNote:'与 3 条记忆冲突：节奏过密、含大型博物馆、多处热门排队点'}
    ];
    const defaultItin = {planId:'p-packed',stay:c.defaultStay,days:c.defaultDays};
    const memoryItin = {planId:'p-local',stay:c.memoryStay,days:c.memoryDays};
    const diffs = [
      {id:'x1',day:1,kind:'removed',target:c.bigMuseum,text:`砍掉「${c.bigMuseum}」的大型展馆安排`,memoryIds:baseMem.museum},
      {id:'x2',day:1,kind:'removed',target:c.queueFood,text:`午餐从热门排队餐饮换成「${c.marketArea}」`,memoryIds:baseMem.queue},
      {id:'x3',day:1,kind:'changed',target:c.sunsetSpot,text:`${c.sunsetSpot} 从早上挪到傍晚`,from:'上午热门时段',to:'傍晚错峰',memoryIds:['m17','m01']},
      {id:'x4',day:0,kind:'changed',target:'stay',text:`住宿从「${c.defaultStay.area}」换到「${c.memoryStay.area}」`,from:c.defaultStay.theme,to:c.memoryStay.theme,memoryIds:baseMem.stay},
      {id:'x5',day:3,kind:'added',target:c.localMarket,text:`新增「${c.localMarket}」本地市集体验`,memoryIds:baseMem.market},
      {id:'x6',day:1,kind:'added',target:'free',text:'每天插入午后 90-120 min 休息',memoryIds:baseMem.rest},
      {id:'x7',day:0,kind:'changed',target:'pace',text:'日均景点 3.5 → 2.3 个，日均步行约 14.8km → 8.3km',from:'3.5 个 / 14.8km',to:'2.3 个 / 8.3km',memoryIds:['m04','m01']}
    ];
    return {...c,plansDefault:defaultPlans,plansMemory:memoryPlans,itinDefault:defaultItin,itinMemory:memoryItin,diffs,
      diffSummary:`砍掉 1 个大型博物馆、午餐避开热门排队店、住宿换到生活街区、新增 1 个本地市集、补上午后休息，并把 ${c.sunsetSpot} 挪到傍晚。`};
  }

  const beijing = makeCity({
    name:'北京', mapLabels:[['6','15','海淀'],['42','45','老城'],['76','31','朝阳'],['48','92','南城'],['12','70','西山']],
    poi:{'故宫博物院':{x:49,y:43},'景山公园':{x:49,y:35},'天安门广场':{x:49,y:52},'天坛公园':{x:55,y:70},'颐和园':{x:18,y:20},'圆明园':{x:24,y:18},'慕田峪长城':{x:82,y:10},'什刹海':{x:43,y:34},'南锣鼓巷':{x:53,y:34},'雍和宫':{x:58,y:29},'国子监':{x:56,y:30},'798艺术区':{x:78,y:30},'三里屯':{x:70,y:45},'前门大街':{x:49,y:59},'大栅栏':{x:45,y:60},'国家博物馆':{x:53,y:51},'北海公园':{x:44,y:39},'亮马河':{x:72,y:39},'鼓楼':{x:48,y:31},'牛街':{x:38,y:65},'北京南站':{x:49,y:82}},
    spots:{
      '故宫博物院':spot(4.8,96500,'museum','明清皇家宫殿群，建议沿中轴线慢慢看。',['世界遗产','古建筑','需预约','人多']),
      '景山公园':spot(4.7,28400,'garden','登万春亭俯瞰故宫全景，傍晚光线最好。',['观景','傍晚好','动线短','爬坡']),
      '天安门广场':spot(4.7,52000,'street','北京中轴线核心广场，视野开阔。',['地标','免费','需预约','安检']),
      '天坛公园':spot(4.8,61000,'temple','祈年殿和古柏构成北京最经典的皇家祭坛景观。',['世界遗产','古建筑','公园','可久坐']),
      '颐和园':spot(4.8,83000,'garden','昆明湖、万寿山和长廊组成的大型皇家园林。',['世界遗产','园林','自然','动线长']),
      '圆明园':spot(4.6,35000,'garden','遗址与湖区并存，适合留半天慢走。',['遗址','公园','自然','动线长']),
      '慕田峪长城':spot(4.8,22000,'castle','保存完整、山景开阔的一段长城。',['世界遗产','山景','人较少','体力活']),
      '什刹海':spot(4.6,37000,'river','湖边胡同与老北京生活交织，适合傍晚散步。',['湖景','胡同','傍晚好','免费']),
      '南锣鼓巷':spot(4.3,48000,'street','连接多条胡同的步行街，热闹但游客较多。',['胡同','小吃','人多','免费']),
      '雍和宫':spot(4.7,39000,'temple','红墙黄瓦的藏传佛教寺院，香火旺盛。',['古建筑','寺院','需预约','人多']),
      '国子监':spot(4.6,8500,'museum','古代最高学府遗址，院落安静、古树很多。',['古建','小型展馆','安静','可久坐']),
      '798艺术区':spot(4.5,26000,'museum','工业厂房改造的当代艺术街区。',['艺术','街区','免费区大','步行']),
      '三里屯':spot(4.4,31000,'shopping','餐饮与夜生活集中的现代街区。',['夜生活','购物','餐饮','人多']),
      '前门大街':spot(4.5,42000,'street','中轴线南段的历史商业街。',['老字号','步行街','夜景','游客向']),
      '大栅栏':spot(4.5,23000,'street','老字号和胡同支巷密集的传统商业片区。',['胡同','老字号','本地','免费']),
      '国家博物馆':spot(4.8,64000,'museum','体量巨大的综合博物馆，完整参观需要一整天。',['大型馆','需预约','室内','费体力']),
      '北海公园':spot(4.7,30000,'garden','白塔、湖面和皇家园林连成舒缓的散步线。',['园林','湖景','安静','可久坐']),
      '亮马河':spot(4.6,9800,'river','城市水岸步道，入夜后灯光氛围很好。',['河川','夜景','免费','散步']),
      '鼓楼':spot(4.6,12000,'tower','中轴线北端地标，可俯瞰周边胡同。',['地标','胡同','观景','台阶']),
      '牛街':spot(4.6,18000,'market','清真小吃与社区市场集中的老街区。',['市集','本地','小吃','人多']),
      '北京南站':spot(4.3,21000,'station','高铁交通枢纽，连接市区南部。',['交通枢纽','返程','室内'])
    },
    restPoi:{'b-qianmen':'前门大街','b-hutong':'什刹海','b-niujie':'牛街','b-sanlitun':'三里屯','b-park':'北海公园','b-hotel':'鼓楼'},
    dining:{
      'b-qianmen':dining('前门一带','老北京小吃 · 快','故宫南线顺路',[pick('胡同炸酱面馆','京菜 · 面食','¥35-70',4.5,3200,'午前到店通常不用排队'),pick('老字号小吃集合','北京小吃','¥40-90',4.4,5100,'一次可尝多种小吃'),pick('家常烤鸭小馆','京菜','¥120-180',4.3,2100,'小份适合两人')]),
      'b-hutong':dining('什刹海一带','胡同家常菜 · 夜饭','湖边散步动线上',[pick('四合院家常菜','京菜','¥80-130',4.6,980,'院落座位安静'),pick('铜锅涮肉小馆','清真 · 涮肉','¥110-170',4.5,1800,'17:30 前容易有位'),pick('胡同精酿餐吧','简餐','¥90-150',4.3,760,'适合晚间小坐')]),
      'b-niujie':dining('牛街一带','清真市集 · 边逛边吃','社区市场内',[pick('清真糕点铺','北京小吃','¥20-50',4.7,6200,'上午品类最齐'),pick('社区涮肉馆','清真 · 涮肉','¥90-140',4.6,2900,'本地客多'),pick('牛羊肉馅饼摊','小吃','¥15-35',4.5,1700,'现烙即食')]),
      'b-sanlitun':dining('三里屯一带','热门商圈餐饮','选择多但高峰排队',[pick('人气融合菜','融合菜','¥160-240',4.1,4200,'晚餐排队约 40 分钟'),pick('商场连锁简餐','简餐','¥70-110',4.0,3500,'出餐较快')]),
      'b-park':dining('北海一带','公园周边简餐','与胡同线相邻',[pick('社区面馆','面食','¥30-55',4.4,1100,'翻台快'),pick('老北京早餐铺','早餐','¥15-30',4.5,2100,'午前营业')]),
      'b-hotel':dining('鼓楼一带','住处周边早餐','步行可达',[pick('胡同咖啡早餐','咖啡 · 早餐','¥45-75',4.5,880,'9 点后有座'),pick('社区早点铺','北京早餐','¥12-25',4.6,1600,'本地居民常去')])
    },
    defaultStay:stay('前门一带','交通方便 · 连锁酒店','距中轴线 0.8km · 游客较集中',[],[room('地铁旁连锁酒店','标准双床','¥650-900/晚',4.2,3600,'去核心景点方便'),room('胡同精品酒店','大床房','¥850-1200/晚',4.4,980,'公共空间有设计感')]),
    memoryStay:stay('鼓楼一带','胡同生活区 · 四合院旅宿','夜间小馆多 · 可步行到什刹海',['m05','m16'],[room('四合院精品旅宿','庭院双人房','¥900-1300/晚',4.7,560,'小院安静'),room('胡同设计民宿','复式双人房','¥700-980/晚',4.6,380,'周边餐饮丰富')]),
    packedRoutes:[['天安门广场','故宫博物院','国家博物馆','景山公园'],['颐和园','圆明园','798艺术区'],['慕田峪长城','三里屯','亮马河'],['天坛公园','前门大街','大栅栏','北京南站']],
    localRoutes:[['前门大街','故宫博物院','景山公园'],['雍和宫','国子监','什刹海'],['牛街','天坛公园','大栅栏'],['北海公园','鼓楼','北京南站']],
    relaxedRoutes:[['故宫博物院','景山公园'],['颐和园','圆明园'],['雍和宫','什刹海'],['前门大街','北京南站']],
    cultureRoutes:[['故宫博物院','景山公园'],['雍和宫','国子监','什刹海'],['天坛公园','大栅栏'],['北海公园','鼓楼']],
    defaultDays:[
      {day:1,date:'10-02',theme:'中轴线打卡',pace:5,paceNote:'08:00 出发 · 步行 14.8km',items:[{id:'d1-1',kind:'spot',time:'08:00',name:'天安门广场',dur:'60 min'},{id:'d1-2',kind:'spot',time:'09:30',name:'故宫博物院',dur:'180 min'},{id:'d1-3',kind:'food',time:'13:00',name:'b-sanlitun'},{id:'d1-4',kind:'spot',time:'14:30',name:'国家博物馆',dur:'150 min'},{id:'d1-5',kind:'spot',time:'17:30',name:'景山公园',dur:'60 min'}]},
      {day:2,date:'10-03',theme:'皇家园林',pace:4,paceNote:'08:00 出发 · 步行 16.2km',items:[{id:'d2-1',kind:'spot',time:'08:30',name:'颐和园',dur:'180 min'},{id:'d2-2',kind:'spot',time:'13:00',name:'圆明园',dur:'120 min'},{id:'d2-3',kind:'spot',time:'16:00',name:'798艺术区',dur:'120 min'}]},
      {day:3,date:'10-04',theme:'长城 + 城市夜景',pace:5,paceNote:'07:00 出发 · 步行 15.1km',items:[{id:'d3-1',kind:'spot',time:'07:00',name:'慕田峪长城',dur:'240 min'},{id:'d3-2',kind:'food',time:'14:30',name:'b-qianmen'},{id:'d3-3',kind:'spot',time:'17:00',name:'三里屯',dur:'90 min'},{id:'d3-4',kind:'spot',time:'19:00',name:'亮马河',dur:'60 min'}]},
      {day:4,date:'10-05',theme:'南城 + 返程',pace:3,paceNote:'08:30 出发 · 步行 12.9km',items:[{id:'d4-1',kind:'spot',time:'08:30',name:'天坛公园',dur:'150 min'},{id:'d4-2',kind:'spot',time:'11:30',name:'前门大街',dur:'60 min'},{id:'d4-3',kind:'spot',time:'13:00',name:'大栅栏',dur:'60 min'},{id:'d4-4',kind:'spot',time:'16:00',name:'北京南站',dur:'—',note:'返程'}]}
    ],
    memoryDays:[
      {day:1,date:'10-02',theme:'中轴线慢看 · 景山落日',pace:2,paceNote:'09:30 出发 · 步行 8.2km',memoryIds:baseMem.slow,items:[{id:'d1-1',kind:'food',time:'09:30',name:'b-qianmen',memoryIds:baseMem.local},{id:'d1-2',kind:'spot',time:'10:30',name:'故宫博物院',dur:'180 min'},{id:'d1-3',kind:'free',time:'14:00',name:'回住处休息',dur:'120 min',memoryIds:baseMem.rest},{id:'d1-4',kind:'spot',time:'17:00',name:'景山公园',dur:'75 min',memoryIds:['m17']},{id:'d1-5',kind:'food',time:'19:00',name:'b-hutong',memoryIds:baseMem.local}]},
      {day:2,date:'10-03',theme:'古建与胡同',pace:2,paceNote:'09:30 出发 · 步行 8.8km',items:[{id:'d2-1',kind:'spot',time:'09:30',name:'雍和宫',dur:'90 min'},{id:'d2-2',kind:'spot',time:'11:30',name:'国子监',dur:'75 min',memoryIds:['m13']},{id:'d2-3',kind:'free',time:'14:00',name:'午后休息',dur:'90 min',memoryIds:baseMem.rest},{id:'d2-4',kind:'spot',time:'16:30',name:'什刹海',dur:'120 min',memoryIds:baseMem.river}]},
      {day:3,date:'10-04',theme:'牛街市集 + 天坛',pace:2,paceNote:'09:00 出发 · 步行 7.6km',items:[{id:'d3-1',kind:'food',time:'09:00',name:'b-niujie',memoryIds:baseMem.market},{id:'d3-2',kind:'spot',time:'10:00',name:'牛街',dur:'90 min',memoryIds:baseMem.market},{id:'d3-3',kind:'spot',time:'14:30',name:'天坛公园',dur:'150 min',memoryIds:baseMem.nature},{id:'d3-4',kind:'spot',time:'17:30',name:'大栅栏',dur:'60 min'}]},
      {day:4,date:'10-05',theme:'北海慢走 · 返程',pace:1,paceNote:'10:00 出发 · 步行 8.4km',memoryIds:['m01'],items:[{id:'d4-1',kind:'spot',time:'10:00',name:'北海公园',dur:'120 min',memoryIds:baseMem.nature},{id:'d4-2',kind:'food',time:'12:30',name:'b-park',memoryIds:baseMem.local},{id:'d4-3',kind:'spot',time:'14:00',name:'鼓楼',dur:'60 min'},{id:'d4-4',kind:'spot',time:'16:30',name:'北京南站',dur:'—',note:'返程'}]}
    ],
    bigMuseum:'国家博物馆',queueFood:'b-sanlitun',marketArea:'前门一带',sunsetSpot:'景山公园',localMarket:'牛街',resortArea:'什刹海一带',cultureStyle:'古建胡同型',cultureTagline:'沿中轴线和胡同读懂老北京',
    images:{
      '天安门广场':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Tiananmen_Square_%E5%A4%A9%E5%AE%89%E9%97%A8%E5%B9%BF%E5%9C%BA_%285283031153%29.jpg/960px-Tiananmen_Square_%E5%A4%A9%E5%AE%89%E9%97%A8%E5%B9%BF%E5%9C%BA_%285283031153%29.jpg',
      '故宫博物院':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Sunset_of_the_Forbidden_City_2006.JPG/960px-Sunset_of_the_Forbidden_City_2006.JPG',
      '景山公园':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Forbidden_City_from_Jingshan_Park_%286349214639%29.jpg/960px-Forbidden_City_from_Jingshan_Park_%286349214639%29.jpg',
      '天坛公园':'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Temple_of_Heaven_-_Hall_of_Prayer_for_Good_Harvests.jpg/960px-Temple_of_Heaven_-_Hall_of_Prayer_for_Good_Harvests.jpg',
      '颐和园':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Longevity_Hill_of_the_Summer_Palace.jpg/960px-Longevity_Hill_of_the_Summer_Palace.jpg',
      '圆明园':'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/%E5%9C%86%E6%98%8E%E5%9B%AD%E8%A7%82%E6%B0%B4%E6%B3%95%E9%81%97%E5%9D%80%E5%9B%BE.jpg/960px-%E5%9C%86%E6%98%8E%E5%9B%AD%E8%A7%82%E6%B0%B4%E6%B3%95%E9%81%97%E5%9D%80%E5%9B%BE.jpg',
      '慕田峪长城':'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Great_Wall_of_China_July_2006.JPG/960px-Great_Wall_of_China_July_2006.JPG',
      '什刹海':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Peking_Gesch%C3%A4ft_Shichahai_Subdistrict-20131231-RM-112827.jpg/960px-Peking_Gesch%C3%A4ft_Shichahai_Subdistrict-20131231-RM-112827.jpg',
      '南锣鼓巷':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Beijing_Nanluoguxiang_%E5%8D%97%E9%94%A3%E9%BC%93%E5%B7%B7_-_panoramio.jpg/960px-Beijing_Nanluoguxiang_%E5%8D%97%E9%94%A3%E9%BC%93%E5%B7%B7_-_panoramio.jpg',
      '雍和宫':'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Peking_Jonghe_Tempel_-20071022-RM-094926.jpg/960px-Peking_Jonghe_Tempel_-20071022-RM-094926.jpg',
      '国子监':'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/%E5%A6%88%E5%A6%88%E5%9C%A8%E5%9B%BD%E5%AD%90%E7%9B%91_-_panoramio.jpg/960px-%E5%A6%88%E5%A6%88%E5%9C%A8%E5%9B%BD%E5%AD%90%E7%9B%91_-_panoramio.jpg',
      '798艺术区':'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Beijing_798_Art_District.jpg/960px-Beijing_798_Art_District.jpg',
      '三里屯':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/%E4%B8%89%E9%87%8C%E5%B1%AFSOHO.jpg/960px-%E4%B8%89%E9%87%8C%E5%B1%AFSOHO.jpg',
      '前门大街':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Beijing_Qianmen_Street_-_panoramio.jpg/960px-Beijing_Qianmen_Street_-_panoramio.jpg',
      '大栅栏':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Beijing_Qianmen_Street_-_panoramio.jpg/960px-Beijing_Qianmen_Street_-_panoramio.jpg',
      '国家博物馆':'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/National_Museum_of_China_building_wide.jpg/960px-National_Museum_of_China_building_wide.jpg',
      '北海公园':'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Beijing_Beihai_park_Qionghua-Insel_Tor-20110104-RM-141208.jpg/960px-Beijing_Beihai_park_Qionghua-Insel_Tor-20110104-RM-141208.jpg',
      '亮马河':'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Liangma_River_at_Xinyuan_St_%2820200808164518%29.jpg/960px-Liangma_River_at_Xinyuan_St_%2820200808164518%29.jpg',
      '鼓楼':'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/The_Drum_Tower_of_Beijing.jpg/960px-The_Drum_Tower_of_Beijing.jpg',
      '牛街':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Niujie_Mosque_-_CIMG3716.JPG/960px-Niujie_Mosque_-_CIMG3716.JPG',
      '北京南站':'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/CR200J-6002_at_Beijing_South_Railway_Station.jpg/960px-CR200J-6002_at_Beijing_South_Railway_Station.jpg'
    }
  });

  const shanghai = makeCity({
    name:'上海',mapLabels:[['8','18','虹桥'],['40','48','浦西'],['73','44','浦东'],['42','83','徐汇'],['76','72','世博']],
    poi:{'外滩':{x:56,y:43},'南京东路':{x:49,y:42},'豫园':{x:54,y:52},'城隍庙':{x:53,y:54},'陆家嘴':{x:65,y:42},'上海博物馆':{x:44,y:48},'上海中心':{x:66,y:44},'武康路':{x:34,y:61},'安福路':{x:37,y:57},'思南公馆':{x:42,y:59},'田子坊':{x:43,y:64},'新天地':{x:45,y:55},'愚园路':{x:31,y:49},'静安寺':{x:35,y:47},'苏州河':{x:46,y:35},'朱家角古镇':{x:8,y:70},'中华艺术宫':{x:57,y:76},'徐汇滨江':{x:39,y:81},'龙华寺':{x:36,y:76},'上海南站':{x:31,y:88},'虹口北外滩':{x:60,y:34}},
    spots:{
      '外滩':spot(4.8,120000,'river','万国建筑群与浦东天际线隔江相望。',['城市地标','夜景','免费','人多']),
      '南京东路':spot(4.5,76000,'street','连接人民广场与外滩的经典步行街。',['步行街','购物','夜景','人多']),
      '豫园':spot(4.7,52000,'garden','明代江南园林，亭台池石层次丰富。',['古典园林','需购票','人多','可久坐']),
      '城隍庙':spot(4.4,48000,'temple','传统建筑与上海小吃集中的老城厢地标。',['古建筑','小吃','游客向','人多']),
      '陆家嘴':spot(4.7,68000,'tower','摩天楼密集的金融区，滨江视野开阔。',['天际线','现代','夜景','免费']),
      '上海博物馆':spot(4.8,45000,'museum','中国古代艺术综合馆，展陈体量较大。',['大型馆','需预约','室内','费体力']),
      '上海中心':spot(4.6,31000,'tower','超高层观景台可俯瞰黄浦江两岸。',['观景台','城市地标','室内','游客向']),
      '武康路':spot(4.7,39000,'street','梧桐树与历史建筑组成的经典漫步路线。',['历史建筑','梧桐','免费','人多']),
      '安福路':spot(4.5,19000,'street','小店、剧场和咖啡馆密集的生活街道。',['街区','咖啡','本地','周末人多']),
      '思南公馆':spot(4.6,14000,'street','花园住宅群改造的开放街区。',['历史建筑','安静','免费','拍照']),
      '田子坊':spot(4.3,36000,'street','石库门弄堂里的文创与餐饮街区。',['石库门','小店','人多','游客向']),
      '新天地':spot(4.5,42000,'street','石库门建筑与现代商业结合的街区。',['石库门','夜生活','餐饮','人多']),
      '愚园路':spot(4.7,16000,'street','保留社区尺度的梧桐街区，适合慢走。',['本地街区','梧桐','小店','免费']),
      '静安寺':spot(4.6,28000,'temple','金色屋顶与现代商圈形成强烈对比。',['寺院','城市地标','交通方便','人多']),
      '苏州河':spot(4.7,15000,'river','仓库、桥梁和亲水步道串起城市更新带。',['河川','散步','免费','傍晚好']),
      '朱家角古镇':spot(4.6,33000,'river','水巷、石桥与老宅组成的江南古镇。',['古镇','水乡','一日游','人多']),
      '中华艺术宫':spot(4.6,12000,'museum','由世博中国馆改建的大型艺术馆。',['大型馆','建筑','室内','免费']),
      '徐汇滨江':spot(4.8,21000,'river','工业遗存与开阔江岸组成的长距离步道。',['滨江','日落','免费','散步']),
      '龙华寺':spot(4.7,11000,'temple','上海历史悠久的寺院，院落氛围安静。',['古建筑','寺院','安静','本地']),
      '上海南站':spot(4.3,18000,'station','城市南部铁路枢纽。',['交通枢纽','返程','室内']),
      '虹口北外滩':spot(4.7,13000,'river','能同时看到外滩与陆家嘴的滨水区域。',['滨江','夜景','免费','人少'])
    },
    restPoi:{'s-yuyuan':'豫园','s-wukang':'武康路','s-yuyuanrd':'愚园路','s-xuhui':'徐汇滨江','s-lujiazui':'陆家嘴','s-hotel':'安福路'},
    dining:{
      's-yuyuan':dining('老城厢一带','上海小吃 · 边逛边吃','豫园动线上',[pick('生煎小馆','本帮小吃','¥25-45',4.5,6800,'10 点前排队较短'),pick('汤包点心铺','上海点心','¥35-70',4.4,4900,'可选小份'),pick('本帮面馆','面食','¥30-60',4.5,2200,'翻台快')]),
      's-wukang':dining('武康路一带','街区小馆 · 午餐','梧桐区步行可达',[pick('社区本帮菜','本帮菜','¥90-140',4.6,1500,'家常口味'),pick('老洋房西餐','西餐','¥150-230',4.5,1200,'工作日午市安静'),pick('街角咖啡简餐','咖啡 · 简餐','¥65-100',4.4,2100,'适合休息')]),
      's-yuyuanrd':dining('愚园路一带','社区早餐 · 小店','街区内不绕路',[pick('弄堂早餐铺','上海早餐','¥15-30',4.7,1800,'本地居民常去'),pick('社区面包咖啡','烘焙 · 咖啡','¥40-70',4.5,980,'9 点后有座'),pick('本帮面馆','面食','¥30-55',4.6,1300,'浇头选择多')]),
      's-xuhui':dining('徐汇滨江一带','江景简餐 · 晚饭','日落动线上',[pick('滨江创意菜','融合菜','¥120-180',4.5,860,'有户外座'),pick('社区本帮小馆','本帮菜','¥80-130',4.6,1100,'步行离江岸不远')]),
      's-lujiazui':dining('陆家嘴一带','商场热门餐饮','景观好但高峰排队',[pick('高层景观餐厅','融合菜','¥260-400',4.1,3500,'晚餐需等位'),pick('商场连锁简餐','简餐','¥70-120',4.0,4200,'工作日午间拥挤')]),
      's-hotel':dining('安福路一带','住处周边早餐','步行可达',[pick('街角咖啡早餐','咖啡 · 早餐','¥55-85',4.6,1200,'工作日上午安静'),pick('弄堂早点铺','上海早餐','¥15-28',4.7,900,'7-10 点供应')])
    },
    defaultStay:stay('人民广场一带','交通枢纽旁 · 连锁酒店','地铁换乘方便 · 商业密集',[],[room('地铁旁连锁酒店','标准双床','¥700-980/晚',4.2,4800,'去主要景点方便'),room('商圈精品酒店','大床房','¥900-1300/晚',4.4,1600,'公共区域新')]),
    memoryStay:stay('衡山路一带','梧桐生活区 · 老洋房旅宿','夜间小馆多 · 街区适合步行',['m05','m16'],[room('老洋房精品旅宿','庭院大床房','¥1000-1500/晚',4.7,620,'小院安静'),room('弄堂设计民宿','复式双人房','¥800-1100/晚',4.6,440,'周边本地餐饮多')]),
    packedRoutes:[['外滩','南京东路','上海博物馆','豫园'],['陆家嘴','上海中心','虹口北外滩'],['武康路','安福路','田子坊','新天地'],['朱家角古镇','静安寺','上海南站']],
    localRoutes:[['豫园','外滩','虹口北外滩'],['武康路','安福路','思南公馆'],['愚园路','静安寺','苏州河'],['龙华寺','徐汇滨江','上海南站']],
    relaxedRoutes:[['外滩','南京东路'],['武康路','安福路'],['朱家角古镇','苏州河'],['徐汇滨江','上海南站']],
    cultureRoutes:[['豫园','外滩'],['武康路','思南公馆','新天地'],['愚园路','苏州河'],['龙华寺','徐汇滨江']],
    defaultDays:[
      {day:1,date:'10-02',theme:'经典上海打卡',pace:5,paceNote:'08:30 出发 · 步行 14.6km',items:[{id:'d1-1',kind:'spot',time:'08:30',name:'豫园',dur:'90 min'},{id:'d1-2',kind:'spot',time:'10:30',name:'城隍庙',dur:'60 min'},{id:'d1-3',kind:'food',time:'12:00',name:'s-lujiazui'},{id:'d1-4',kind:'spot',time:'13:30',name:'上海博物馆',dur:'150 min'},{id:'d1-5',kind:'spot',time:'17:00',name:'外滩',dur:'90 min'}]},
      {day:2,date:'10-03',theme:'浦东天际线',pace:4,paceNote:'09:00 出发 · 步行 13.8km',items:[{id:'d2-1',kind:'spot',time:'09:00',name:'陆家嘴',dur:'90 min'},{id:'d2-2',kind:'spot',time:'11:00',name:'上海中心',dur:'90 min'},{id:'d2-3',kind:'spot',time:'14:00',name:'中华艺术宫',dur:'150 min'},{id:'d2-4',kind:'spot',time:'18:00',name:'虹口北外滩',dur:'75 min'}]},
      {day:3,date:'10-04',theme:'梧桐区连走',pace:5,paceNote:'08:30 出发 · 步行 15.3km',items:[{id:'d3-1',kind:'spot',time:'08:30',name:'武康路',dur:'90 min'},{id:'d3-2',kind:'spot',time:'10:30',name:'安福路',dur:'60 min'},{id:'d3-3',kind:'food',time:'12:00',name:'s-wukang'},{id:'d3-4',kind:'spot',time:'14:00',name:'田子坊',dur:'90 min'},{id:'d3-5',kind:'spot',time:'16:30',name:'新天地',dur:'90 min'}]},
      {day:4,date:'10-05',theme:'古镇 + 返程',pace:3,paceNote:'08:00 出发 · 步行 12.4km',items:[{id:'d4-1',kind:'spot',time:'08:00',name:'朱家角古镇',dur:'240 min'},{id:'d4-2',kind:'spot',time:'14:30',name:'静安寺',dur:'60 min'},{id:'d4-3',kind:'spot',time:'17:00',name:'上海南站',dur:'—',note:'返程'}]}
    ],
    memoryDays:[
      {day:1,date:'10-02',theme:'老城厢慢逛 · 外滩夜景',pace:2,paceNote:'09:30 出发 · 步行 8.1km',memoryIds:baseMem.slow,items:[{id:'d1-1',kind:'food',time:'09:30',name:'s-yuyuan',memoryIds:baseMem.market},{id:'d1-2',kind:'spot',time:'10:30',name:'豫园',dur:'120 min'},{id:'d1-3',kind:'free',time:'14:00',name:'回住处休息',dur:'120 min',memoryIds:baseMem.rest},{id:'d1-4',kind:'spot',time:'17:00',name:'外滩',dur:'90 min',memoryIds:['m17']},{id:'d1-5',kind:'spot',time:'19:00',name:'虹口北外滩',dur:'60 min',memoryIds:baseMem.river}]},
      {day:2,date:'10-03',theme:'梧桐区慢走',pace:2,paceNote:'09:30 出发 · 步行 8.7km',items:[{id:'d2-1',kind:'spot',time:'09:30',name:'武康路',dur:'120 min'},{id:'d2-2',kind:'food',time:'12:00',name:'s-wukang',memoryIds:baseMem.local},{id:'d2-3',kind:'free',time:'14:00',name:'午后休息',dur:'90 min',memoryIds:baseMem.rest},{id:'d2-4',kind:'spot',time:'16:00',name:'安福路',dur:'75 min'},{id:'d2-5',kind:'spot',time:'17:30',name:'思南公馆',dur:'75 min'}]},
      {day:3,date:'10-04',theme:'愚园路 + 苏州河',pace:2,paceNote:'09:00 出发 · 步行 7.5km',items:[{id:'d3-1',kind:'food',time:'09:00',name:'s-yuyuanrd',memoryIds:baseMem.market},{id:'d3-2',kind:'spot',time:'10:00',name:'愚园路',dur:'120 min',memoryIds:baseMem.market},{id:'d3-3',kind:'spot',time:'14:30',name:'静安寺',dur:'60 min'},{id:'d3-4',kind:'spot',time:'16:30',name:'苏州河',dur:'120 min',memoryIds:baseMem.river}]},
      {day:4,date:'10-05',theme:'龙华 + 滨江返程',pace:1,paceNote:'10:00 出发 · 步行 8.3km',memoryIds:['m01'],items:[{id:'d4-1',kind:'spot',time:'10:00',name:'龙华寺',dur:'90 min',memoryIds:baseMem.nature},{id:'d4-2',kind:'food',time:'12:00',name:'s-xuhui',memoryIds:baseMem.local},{id:'d4-3',kind:'spot',time:'14:00',name:'徐汇滨江',dur:'120 min',memoryIds:baseMem.river},{id:'d4-4',kind:'spot',time:'17:00',name:'上海南站',dur:'—',note:'返程'}]}
    ],
    bigMuseum:'上海博物馆',queueFood:'s-lujiazui',marketArea:'老城厢一带',sunsetSpot:'外滩',localMarket:'愚园路',resortArea:'衡山路一带',cultureStyle:'海派街区型',cultureTagline:'沿梧桐街区与滨水空间慢慢走',
    images:{
      '外滩':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Pudong_Shanghai_November_2017_panorama.jpg/960px-Pudong_Shanghai_November_2017_panorama.jpg',
      '南京东路':'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/20090705_Shanghai_Nanjing_Road_0602.jpg/960px-20090705_Shanghai_Nanjing_Road_0602.jpg',
      '豫园':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Shanghai_-_Yu_Garden_-_0035.jpg/960px-Shanghai_-_Yu_Garden_-_0035.jpg',
      '城隍庙':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Shanghai_-_Yu_Garden_-_0035.jpg/960px-Shanghai_-_Yu_Garden_-_0035.jpg',
      '陆家嘴':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Pudong_Shanghai_November_2017_panorama.jpg/960px-Pudong_Shanghai_November_2017_panorama.jpg',
      '上海博物馆':'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Shanghai_Museum_exterior_1.jpg/960px-Shanghai_Museum_exterior_1.jpg',
      '上海中心':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Pudong_Shanghai_November_2017_panorama.jpg/960px-Pudong_Shanghai_November_2017_panorama.jpg',
      '武康路':'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Wukang_Mansion_20250504-2.jpg/960px-Wukang_Mansion_20250504-2.jpg',
      '安福路':'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/A_brunch_spot_at_Anfu_Rd.jpg/960px-A_brunch_spot_at_Anfu_Rd.jpg',
      '思南公馆':'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Sinan_Mansions%2C_Shanghai.jpg/960px-Sinan_Mansions%2C_Shanghai.jpg',
      '田子坊':'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Tianzifang_im_Sommer_2025.jpg/960px-Tianzifang_im_Sommer_2025.jpg',
      '新天地':'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Peet%27s_Coffee_at_Xintiandi%2C_Shanghai%2C_China_%2854272979833%29.jpg/960px-Peet%27s_Coffee_at_Xintiandi%2C_Shanghai%2C_China_%2854272979833%29.jpg',
      '愚园路':'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/202001_608_Lane_of_Yuyuan_Road%2C_Shanghai.jpg/960px-202001_608_Lane_of_Yuyuan_Road%2C_Shanghai.jpg',
      '静安寺':'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Jingan_Temple_in_Feburary_2026.jpg/960px-Jingan_Temple_in_Feburary_2026.jpg',
      '苏州河':'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Suzhou_creek%2C_Shanghai_in_2008.jpg/960px-Suzhou_creek%2C_Shanghai_in_2008.jpg',
      '朱家角古镇':'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Zhujiajiao_banner_Canal.jpg/960px-Zhujiajiao_banner_Canal.jpg',
      '中华艺术宫':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/China_Art_Museum_Shanghai_-_Matteo_Ricci_%26_Xu_Guangqi.jpg/960px-China_Art_Museum_Shanghai_-_Matteo_Ricci_%26_Xu_Guangqi.jpg',
      '徐汇滨江':'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Xuhui_Riverside_Shanghai.jpg/960px-Xuhui_Riverside_Shanghai.jpg',
      '龙华寺':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Shanghai_-_Longhua_Tempel_-_0009.jpg/960px-Shanghai_-_Longhua_Tempel_-_0009.jpg',
      '上海南站':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Shanghai_South_Railway_Station_metro_station_line_15_concourse.jpg/960px-Shanghai_South_Railway_Station_metro_station_line_15_concourse.jpg',
      '虹口北外滩':'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Pudong_CBD_viewed_from_the_North_Bund_in_Shanghai.jpg/960px-Pudong_CBD_viewed_from_the_North_Bund_in_Shanghai.jpg'
    }
  });

  /* 杭州：西湖、茶园、运河与江南生活 */
  const hangzhou = makeCity({
    name:'杭州',mapLabels:[['10','22','西溪'],['36','42','西湖'],['72','35','运河'],['67','78','钱塘江'],['30','85','湘湖']],
    poi:{'西湖':{x:38,y:46},'断桥残雪':{x:41,y:34},'苏堤':{x:34,y:51},'雷峰塔':{x:40,y:62},'灵隐寺':{x:21,y:42},'飞来峰':{x:23,y:44},'龙井村':{x:27,y:58},'九溪烟树':{x:31,y:68},'中国茶叶博物馆':{x:29,y:54},'西溪湿地':{x:13,y:30},'河坊街':{x:50,y:58},'南宋御街':{x:51,y:54},'京杭大运河':{x:62,y:29},'小河直街':{x:61,y:25},'良渚博物院':{x:54,y:10},'湘湖':{x:37,y:82},'钱塘江城市阳台':{x:70,y:69},'杭州植物园':{x:29,y:39},'杭州东站':{x:74,y:45}},
    spots:{
      '西湖':spot(4.9,156000,'river','湖山、堤桥与城市相接，四季都有不同景致。',['世界遗产','湖景','免费','可久坐']),
      '断桥残雪':spot(4.6,46000,'bridge','白堤东端的西湖名景，清晨与傍晚更舒展。',['西湖十景','免费','日落','人多']),
      '苏堤':spot(4.8,52000,'path','纵贯西湖的长堤，串联六桥与大片湖景。',['步道','湖景','免费','动线长']),
      '雷峰塔':spot(4.6,39000,'tower','登塔可看西湖全景与南屏山色。',['观景台','文化','日落','需购票']),
      '灵隐寺':spot(4.8,86000,'temple','古刹藏于北高峰林木间，香火与山林并存。',['古寺','山林','需预约','人多']),
      '飞来峰':spot(4.7,34000,'garden','溪谷石窟造像密集，与灵隐寺可连游。',['石窟','自然','文化','步行']),
      '龙井村':spot(4.7,22000,'garden','茶园沿山铺开，可体验杭州茶乡日常。',['茶园','本地','自然','安静']),
      '九溪烟树':spot(4.8,28000,'path','溪流、林荫与茶园组成清凉的徒步线。',['溪谷','自然','免费','步行']),
      '中国茶叶博物馆':spot(4.7,9200,'museum','以茶文化为主题的小型园林式博物馆。',['小型展馆','茶文化','安静','免费']),
      '西溪湿地':spot(4.7,44000,'river','河港、芦苇与村落交错的城市湿地。',['湿地','自然','可乘船','动线长']),
      '河坊街':spot(4.4,51000,'street','南宋老城商业街，集中传统小吃与手作。',['老街','小吃','夜景','人多']),
      '南宋御街':spot(4.5,23000,'street','保留历史街巷尺度的城市漫步线。',['历史街区','免费','本地','散步']),
      '京杭大运河':spot(4.7,27000,'river','古桥、仓库与河岸生活组成运河文化带。',['世界遗产','河川','夜景','免费']),
      '小河直街':spot(4.7,16000,'street','沿运河保存较好的清末民居街区。',['水乡街区','本地','安静','免费']),
      '良渚博物院':spot(4.8,15000,'museum','展示五千年良渚文明的重要专题馆。',['专题展馆','需预约','建筑','室内']),
      '湘湖':spot(4.7,21000,'river','比西湖更安静的开阔湖区，适合骑行散步。',['湖景','人少','免费','自然']),
      '钱塘江城市阳台':spot(4.6,12000,'river','看城市天际线与钱塘江日落的开放空间。',['江景','日落','免费','散步']),
      '杭州植物园':spot(4.7,17000,'garden','山林植物与溪流庭园相连，四季清幽。',['植物','安静','自然','可久坐']),
      '杭州东站':spot(4.4,32000,'station','杭州主要高铁枢纽。',['交通枢纽','返程','室内'])
    },
    restPoi:{'h-hefang':'河坊街','h-longjing':'龙井村','h-canal':'小河直街','h-westlake':'西湖','h-qianjiang':'钱塘江城市阳台','h-hotel':'南宋御街'},
    dining:{
      'h-hefang':dining('河坊街一带','杭帮小吃 · 边逛边吃','老城动线上',[pick('片儿川面馆','杭帮面食','¥25-45',4.6,3800,'翻台快'),pick('传统糕团铺','江南点心','¥15-35',4.5,2600,'可买小份'),pick('家常杭帮菜','杭帮菜','¥80-130',4.5,1900,'午市更轻松')]),
      'h-longjing':dining('龙井村一带','茶园农家菜 · 午饭','茶园步行可达',[pick('茶园家常菜','杭帮菜','¥90-140',4.6,1200,'可坐院子'),pick('龙井茶点小院','茶点','¥60-110',4.5,860,'适合休息')]),
      'h-canal':dining('小河直街一带','运河本地小馆 · 晚饭','沿河动线上',[pick('运河家常菜馆','杭帮菜','¥75-120',4.6,980,'本地客多'),pick('旧仓库创意餐吧','融合菜','¥110-170',4.4,720,'夜间氛围好')]),
      'h-westlake':dining('湖滨一带','热门景区餐饮','方便但高峰排队',[pick('湖景杭帮菜','杭帮菜','¥180-280',4.1,5200,'午晚高峰等位'),pick('商场连锁简餐','简餐','¥60-100',4.0,3600,'出餐快')]),
      'h-qianjiang':dining('钱江新城一带','江景晚餐','日落动线上',[pick('江景融合菜','融合菜','¥130-210',4.5,1100,'靠窗位需预约'),pick('社区杭帮小馆','杭帮菜','¥80-130',4.6,900,'不追景观更实惠')]),
      'h-hotel':dining('南宋御街一带','住处周边早餐','步行可达',[pick('街坊早餐铺','杭州早餐','¥12-28',4.7,1600,'本地居民常去'),pick('老街咖啡早餐','咖啡 · 烘焙','¥45-75',4.5,780,'9 点后有座')])
    },
    defaultStay:stay('湖滨一带','核心景区旁 · 连锁酒店','距西湖 0.5km · 游客集中',[],[room('湖滨连锁酒店','标准双床','¥650-950/晚',4.2,4200,'交通方便'),room('商圈精品酒店','景观大床','¥900-1400/晚',4.4,1500,'部分房间看湖')]),
    memoryStay:stay('南宋御街一带','老城生活区 · 小院旅宿','夜间小馆多 · 可步行到西湖',['m05','m16'],[room('老宅小院旅宿','庭院双人房','¥750-1100/晚',4.7,520,'院落安静'),room('街巷设计民宿','复式双人房','¥600-900/晚',4.6,390,'周边餐饮丰富')]),
    packedRoutes:[['断桥残雪','西湖','雷峰塔','河坊街'],['灵隐寺','飞来峰','龙井村','九溪烟树'],['西溪湿地','良渚博物院','京杭大运河'],['湘湖','钱塘江城市阳台','杭州东站']],
    localRoutes:[['河坊街','南宋御街','西湖'],['龙井村','中国茶叶博物馆','杭州植物园'],['小河直街','京杭大运河','西溪湿地'],['湘湖','钱塘江城市阳台','杭州东站']],
    relaxedRoutes:[['西湖','雷峰塔'],['灵隐寺','杭州植物园'],['西溪湿地','小河直街'],['钱塘江城市阳台','杭州东站']],
    cultureRoutes:[['南宋御街','河坊街'],['龙井村','中国茶叶博物馆'],['良渚博物院','京杭大运河'],['杭州植物园','西湖']],
    defaultDays:[
      {day:1,date:'10-02',theme:'西湖全景打卡',pace:5,paceNote:'08:00 出发 · 步行 14.5km',items:[{id:'d1-1',kind:'spot',time:'08:00',name:'断桥残雪',dur:'60 min'},{id:'d1-2',kind:'spot',time:'09:30',name:'西湖',dur:'120 min'},{id:'d1-3',kind:'food',time:'12:00',name:'h-westlake'},{id:'d1-4',kind:'spot',time:'14:00',name:'中国茶叶博物馆',dur:'120 min'},{id:'d1-5',kind:'spot',time:'17:00',name:'雷峰塔',dur:'90 min'}]},
      {day:2,date:'10-03',theme:'灵隐 + 龙井',pace:5,paceNote:'07:30 出发 · 步行 16.1km',items:[{id:'d2-1',kind:'spot',time:'07:30',name:'灵隐寺',dur:'150 min'},{id:'d2-2',kind:'spot',time:'10:30',name:'飞来峰',dur:'90 min'},{id:'d2-3',kind:'spot',time:'13:00',name:'龙井村',dur:'120 min'},{id:'d2-4',kind:'spot',time:'16:00',name:'九溪烟树',dur:'120 min'}]},
      {day:3,date:'10-04',theme:'湿地 + 运河',pace:4,paceNote:'08:00 出发 · 步行 14.2km',items:[{id:'d3-1',kind:'spot',time:'08:00',name:'西溪湿地',dur:'180 min'},{id:'d3-2',kind:'spot',time:'13:00',name:'良渚博物院',dur:'120 min'},{id:'d3-3',kind:'spot',time:'16:00',name:'京杭大运河',dur:'90 min'},{id:'d3-4',kind:'food',time:'18:00',name:'h-canal'}]},
      {day:4,date:'10-05',theme:'老城 + 返程',pace:3,paceNote:'09:00 出发 · 步行 11.8km',items:[{id:'d4-1',kind:'spot',time:'09:00',name:'河坊街',dur:'90 min'},{id:'d4-2',kind:'spot',time:'11:00',name:'南宋御街',dur:'75 min'},{id:'d4-3',kind:'spot',time:'15:30',name:'杭州东站',dur:'—',note:'返程'}]}
    ],
    memoryDays:[
      {day:1,date:'10-02',theme:'老城早餐 · 西湖落日',pace:2,paceNote:'09:30 出发 · 步行 8.0km',memoryIds:baseMem.slow,items:[{id:'d1-1',kind:'food',time:'09:30',name:'h-hefang',memoryIds:baseMem.market},{id:'d1-2',kind:'spot',time:'10:30',name:'河坊街',dur:'90 min',memoryIds:baseMem.market},{id:'d1-3',kind:'free',time:'13:30',name:'回住处休息',dur:'120 min',memoryIds:baseMem.rest},{id:'d1-4',kind:'spot',time:'16:30',name:'雷峰塔',dur:'90 min',memoryIds:['m17']},{id:'d1-5',kind:'spot',time:'18:00',name:'西湖',dur:'75 min',memoryIds:baseMem.river}]},
      {day:2,date:'10-03',theme:'龙井茶乡慢走',pace:2,paceNote:'09:00 出发 · 步行 8.7km',items:[{id:'d2-1',kind:'spot',time:'09:00',name:'龙井村',dur:'120 min',memoryIds:baseMem.nature},{id:'d2-2',kind:'food',time:'11:30',name:'h-longjing',memoryIds:baseMem.local},{id:'d2-3',kind:'spot',time:'13:30',name:'中国茶叶博物馆',dur:'90 min',memoryIds:['m13']},{id:'d2-4',kind:'spot',time:'16:00',name:'杭州植物园',dur:'120 min',memoryIds:baseMem.nature}]},
      {day:3,date:'10-04',theme:'运河生活半日',pace:2,paceNote:'09:30 出发 · 步行 7.6km',items:[{id:'d3-1',kind:'spot',time:'09:30',name:'小河直街',dur:'120 min',memoryIds:baseMem.market},{id:'d3-2',kind:'spot',time:'12:00',name:'京杭大运河',dur:'90 min'},{id:'d3-3',kind:'free',time:'14:00',name:'午后休息',dur:'90 min',memoryIds:baseMem.rest},{id:'d3-4',kind:'food',time:'17:00',name:'h-canal',memoryIds:baseMem.local}]},
      {day:4,date:'10-05',theme:'钱塘江散步 · 返程',pace:1,paceNote:'10:00 出发 · 步行 8.2km',memoryIds:['m01'],items:[{id:'d4-1',kind:'spot',time:'10:00',name:'湘湖',dur:'120 min',memoryIds:baseMem.nature},{id:'d4-2',kind:'food',time:'13:00',name:'h-qianjiang',memoryIds:baseMem.local},{id:'d4-3',kind:'spot',time:'15:00',name:'钱塘江城市阳台',dur:'75 min',memoryIds:baseMem.river},{id:'d4-4',kind:'spot',time:'17:00',name:'杭州东站',dur:'—',note:'返程'}]}
    ],
    bigMuseum:'中国茶叶博物馆',queueFood:'h-westlake',marketArea:'河坊街一带',sunsetSpot:'雷峰塔',localMarket:'河坊街',resortArea:'湖滨一带',cultureStyle:'茶园运河型',cultureTagline:'从龙井茶山走到千年运河',
    images:{
      '西湖':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '断桥残雪':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '苏堤':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '雷峰塔':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '灵隐寺':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Lingyin_Temple_Da_Xiong_Bao_Dian.JPG/960px-Lingyin_Temple_Da_Xiong_Bao_Dian.JPG',
      '飞来峰':'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Stone_budai.jpg/960px-Stone_budai.jpg',
      '龙井村':'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Longjing_villiage.jpg/960px-Longjing_villiage.jpg',
      '九溪烟树':'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Longjing_villiage.jpg/960px-Longjing_villiage.jpg',
      '中国茶叶博物馆':'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Longjing_villiage.jpg/960px-Longjing_villiage.jpg',
      '西溪湿地':'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Longjing_villiage.jpg/960px-Longjing_villiage.jpg',
      '河坊街':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '南宋御街':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '京杭大运河':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '小河直街':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '良渚博物院':'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Longjing_villiage.jpg/960px-Longjing_villiage.jpg',
      '湘湖':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '钱塘江城市阳台':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg',
      '杭州植物园':'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Longjing_villiage.jpg/960px-Longjing_villiage.jpg',
      '杭州东站':'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg/960px-LiuYing_Hotel_West_Lake_Hangzhou_20250505.jpg'
    }
  });

  /* 威海：海岸、岛屿、近代史与胶东渔村 */
  const weihai = makeCity({
    name:'威海',mapLabels:[['8','20','高区'],['40','45','环翠'],['76','25','刘公岛'],['71','76','荣成'],['18','82','经区']],
    poi:{'刘公岛':{x:72,y:38},'中国甲午战争博物院':{x:73,y:40},'定远舰景区':{x:59,y:44},'幸福门':{x:50,y:49},'威海公园':{x:48,y:58},'悦海公园':{x:45,y:67},'国际海水浴场':{x:18,y:32},'火炬八街':{x:20,y:27},'猫头山':{x:35,y:29},'半月湾':{x:44,y:35},'成山头':{x:89,y:67},'那香海':{x:72,y:71},'海驴岛':{x:91,y:57},'鸡鸣岛':{x:77,y:63},'荣成海草房':{x:76,y:79},'华夏城':{x:37,y:73},'威海站':{x:40,y:82},'环翠楼公园':{x:43,y:47}},
    spots:{
      '刘公岛':spot(4.8,42000,'river','海岛自然与甲午历史遗迹集中，需乘船往返。',['海岛','近代史','需乘船','一日游']),
      '中国甲午战争博物院':spot(4.8,18000,'museum','系统展示甲午战争与北洋海军历史。',['大型馆','历史','室内','需预约']),
      '定远舰景区':spot(4.6,12000,'museum','按历史资料复制的定远舰主题展陈。',['舰船','小型展馆','海港','文化']),
      '幸福门':spot(4.5,23000,'tower','威海湾标志性城市景观与观景平台。',['城市地标','海景','夜景','免费区']),
      '威海公园':spot(4.8,31000,'river','沿海岸展开的城市公园，视野开阔。',['海岸','免费','散步','日落']),
      '悦海公园':spot(4.8,22000,'river','灯塔、草坪与海岸步道组成舒缓路线。',['灯塔','海景','免费','安静']),
      '国际海水浴场':spot(4.7,36000,'river','沙滩平缓、海水清澈的城市海滨浴场。',['沙滩','日落','免费','旺季人多']),
      '火炬八街':spot(4.5,28000,'street','坡路尽头直通大海的热门摄影街道。',['摄影','海景','免费','人多']),
      '猫头山':spot(4.8,15000,'garden','环海路上的山海观景点，可俯瞰礁石海湾。',['山海','观景','自驾友好','风大']),
      '半月湾':spot(4.7,11000,'river','弧形海湾安静开阔，适合清晨或傍晚。',['海湾','人少','免费','散步']),
      '成山头':spot(4.7,27000,'garden','中国大陆海岸东端，海蚀崖与浪涛壮观。',['海岬','日出','风大','路程远']),
      '那香海':spot(4.6,21000,'river','长沙滩与松林相连的海滨度假区。',['沙滩','度假','日落','免费区']),
      '海驴岛':spot(4.6,13000,'river','海鸟栖息的近海岛屿，季节性开放。',['海岛','海鸟','需乘船','看天气']),
      '鸡鸣岛':spot(4.7,10000,'river','保留渔村生活气息的小岛。',['渔村','海岛','本地','需乘船']),
      '荣成海草房':spot(4.7,8500,'street','胶东传统海草屋村落，屋顶极具辨识度。',['传统村落','建筑','安静','摄影']),
      '华夏城':spot(4.3,19000,'garden','山谷景观与文化演艺结合的大型景区。',['演艺','游客向','夜游','动线长']),
      '环翠楼公园':spot(4.7,9200,'garden','登楼可俯瞰威海城区与海湾。',['公园','观景','免费','本地']),
      '威海站':spot(4.4,16000,'station','威海主要铁路枢纽。',['交通枢纽','返程','室内'])
    },
    restPoi:{'w-harbor':'幸福门','w-bath':'国际海水浴场','w-rongcheng':'荣成海草房','w-park':'威海公园','w-island':'刘公岛','w-hotel':'环翠楼公园'},
    dining:{
      'w-harbor':dining('威海湾一带','胶东海鲜 · 晚饭','海岸动线上',[pick('家常海鲜馆','胶东菜 · 海鲜','¥100-160',4.6,2200,'明码标价更安心'),pick('鲅鱼水饺馆','胶东面食','¥45-80',4.7,3100,'本地特色')]),
      'w-bath':dining('国际海水浴场一带','海边简餐','看日落顺路',[pick('海边烧烤小馆','烧烤 · 海鲜','¥80-130',4.4,1700,'旺季需早到'),pick('社区韩餐小馆','韩餐','¥65-110',4.6,1200,'威海本地常见')]),
      'w-rongcheng':dining('荣成渔村一带','渔家菜 · 午饭','村落动线上',[pick('渔家当日海鲜','胶东菜','¥90-150',4.7,860,'按当天渔获选'),pick('海草房家常饭','家常菜','¥55-90',4.6,520,'院落座位')]),
      'w-park':dining('威海公园一带','本地小馆 · 午饭','滨海步道附近',[pick('胶东家常菜','胶东菜','¥65-105',4.6,1400,'本地客多'),pick('海鲜面馆','面食 · 海鲜','¥35-60',4.5,980,'出餐快')]),
      'w-island':dining('刘公岛一带','景区餐饮','方便但选择有限',[pick('岛上游客餐厅','胶东菜','¥100-160',4.0,2300,'午间集中排队'),pick('码头简餐','简餐','¥45-75',3.9,1800,'胜在方便')]),
      'w-hotel':dining('环翠楼一带','住处周边早餐','步行可达',[pick('胶东早餐铺','早餐','¥15-30',4.7,1100,'海鲜馄饨是特色'),pick('社区咖啡早餐','咖啡 · 烘焙','¥40-70',4.5,620,'9 点后安静')])
    },
    defaultStay:stay('威海站一带','交通枢纽旁 · 连锁酒店','换乘方便 · 距海岸稍远',[],[room('车站旁连锁酒店','标准双床','¥320-480/晚',4.2,2800,'到站方便'),room('经区商务酒店','海景大床','¥450-650/晚',4.4,1100,'部分房间看海')]),
    memoryStay:stay('环翠楼一带','老城生活区 · 小型旅宿','夜间小馆多 · 步行可达海岸',['m05','m16'],[room('老城庭院旅宿','庭院双人房','¥380-560/晚',4.7,420,'院落安静'),room('海港设计民宿','海景双人房','¥450-680/晚',4.6,360,'周边餐饮丰富')]),
    packedRoutes:[['刘公岛','中国甲午战争博物院','定远舰景区'],['国际海水浴场','火炬八街','猫头山','半月湾'],['成山头','海驴岛','那香海'],['华夏城','幸福门','威海公园','威海站']],
    localRoutes:[['幸福门','威海公园','悦海公园'],['半月湾','猫头山','国际海水浴场'],['荣成海草房','鸡鸣岛','那香海'],['环翠楼公园','定远舰景区','威海站']],
    relaxedRoutes:[['威海公园','悦海公园'],['国际海水浴场','火炬八街'],['那香海','荣成海草房'],['环翠楼公园','威海站']],
    cultureRoutes:[['刘公岛','中国甲午战争博物院'],['定远舰景区','幸福门'],['荣成海草房','鸡鸣岛'],['环翠楼公园','威海公园']],
    defaultDays:[
      {day:1,date:'10-02',theme:'刘公岛历史线',pace:5,paceNote:'07:30 出发 · 步行 13.8km',items:[{id:'d1-1',kind:'spot',time:'07:30',name:'刘公岛',dur:'150 min'},{id:'d1-2',kind:'spot',time:'10:30',name:'中国甲午战争博物院',dur:'150 min'},{id:'d1-3',kind:'food',time:'13:30',name:'w-island'},{id:'d1-4',kind:'spot',time:'15:00',name:'定远舰景区',dur:'90 min'},{id:'d1-5',kind:'spot',time:'17:00',name:'幸福门',dur:'60 min'}]},
      {day:2,date:'10-03',theme:'西海岸打卡',pace:5,paceNote:'08:00 出发 · 步行 15.4km',items:[{id:'d2-1',kind:'spot',time:'08:00',name:'火炬八街',dur:'60 min'},{id:'d2-2',kind:'spot',time:'10:00',name:'猫头山',dur:'120 min'},{id:'d2-3',kind:'spot',time:'13:30',name:'半月湾',dur:'90 min'},{id:'d2-4',kind:'spot',time:'16:00',name:'国际海水浴场',dur:'120 min'}]},
      {day:3,date:'10-04',theme:'荣成远线',pace:5,paceNote:'07:00 出发 · 车程较长',items:[{id:'d3-1',kind:'spot',time:'07:00',name:'成山头',dur:'180 min'},{id:'d3-2',kind:'spot',time:'12:00',name:'海驴岛',dur:'150 min'},{id:'d3-3',kind:'food',time:'15:00',name:'w-rongcheng'},{id:'d3-4',kind:'spot',time:'17:00',name:'那香海',dur:'90 min'}]},
      {day:4,date:'10-05',theme:'城市海岸 + 返程',pace:3,paceNote:'09:00 出发 · 步行 11.2km',items:[{id:'d4-1',kind:'spot',time:'09:00',name:'威海公园',dur:'90 min'},{id:'d4-2',kind:'spot',time:'11:00',name:'悦海公园',dur:'75 min'},{id:'d4-3',kind:'spot',time:'15:30',name:'威海站',dur:'—',note:'返程'}]}
    ],
    memoryDays:[
      {day:1,date:'10-02',theme:'老城早饭 · 海湾落日',pace:2,paceNote:'09:30 出发 · 步行 7.8km',memoryIds:baseMem.slow,items:[{id:'d1-1',kind:'food',time:'09:30',name:'w-hotel',memoryIds:baseMem.local},{id:'d1-2',kind:'spot',time:'10:30',name:'环翠楼公园',dur:'90 min'},{id:'d1-3',kind:'free',time:'13:00',name:'回住处休息',dur:'120 min',memoryIds:baseMem.rest},{id:'d1-4',kind:'spot',time:'16:00',name:'幸福门',dur:'60 min',memoryIds:['m17']},{id:'d1-5',kind:'spot',time:'17:30',name:'威海公园',dur:'90 min',memoryIds:baseMem.river}]},
      {day:2,date:'10-03',theme:'山海公路慢游',pace:2,paceNote:'09:00 出发 · 步行 8.5km',items:[{id:'d2-1',kind:'spot',time:'09:00',name:'半月湾',dur:'90 min',memoryIds:baseMem.nature},{id:'d2-2',kind:'spot',time:'11:00',name:'猫头山',dur:'120 min',memoryIds:baseMem.nature},{id:'d2-3',kind:'free',time:'14:00',name:'午后休息',dur:'90 min',memoryIds:baseMem.rest},{id:'d2-4',kind:'spot',time:'16:30',name:'国际海水浴场',dur:'120 min',memoryIds:baseMem.river},{id:'d2-5',kind:'food',time:'19:00',name:'w-bath',memoryIds:baseMem.local}]},
      {day:3,date:'10-04',theme:'海草房渔村',pace:2,paceNote:'09:00 出发 · 步行 7.4km',items:[{id:'d3-1',kind:'spot',time:'09:00',name:'荣成海草房',dur:'150 min',memoryIds:baseMem.market},{id:'d3-2',kind:'food',time:'12:00',name:'w-rongcheng',memoryIds:baseMem.local},{id:'d3-3',kind:'spot',time:'14:30',name:'鸡鸣岛',dur:'180 min',memoryIds:baseMem.nature}]},
      {day:4,date:'10-05',theme:'悦海散步 · 返程',pace:1,paceNote:'10:00 出发 · 步行 8.0km',memoryIds:['m01'],items:[{id:'d4-1',kind:'spot',time:'10:00',name:'悦海公园',dur:'120 min',memoryIds:baseMem.river},{id:'d4-2',kind:'food',time:'12:30',name:'w-park',memoryIds:baseMem.local},{id:'d4-3',kind:'spot',time:'14:00',name:'定远舰景区',dur:'75 min',memoryIds:['m13']},{id:'d4-4',kind:'spot',time:'16:30',name:'威海站',dur:'—',note:'返程'}]}
    ],
    bigMuseum:'中国甲午战争博物院',queueFood:'w-island',marketArea:'威海湾一带',sunsetSpot:'幸福门',localMarket:'荣成海草房',resortArea:'国际海水浴场一带',cultureStyle:'海岛人文型',cultureTagline:'在海风里读懂甲午历史与胶东渔村',
    images:{
      '刘公岛':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Weihai.port_de_Liugong_dao.jpg/960px-Weihai.port_de_Liugong_dao.jpg',
      '中国甲午战争博物院':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Weihai.port_de_Liugong_dao.jpg/960px-Weihai.port_de_Liugong_dao.jpg',
      '定远舰景区':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/View_of_Weihai_Bay_from_Liugong_Island.jpg/960px-View_of_Weihai_Bay_from_Liugong_Island.jpg',
      '幸福门':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Weihai_china.jpg/960px-Weihai_china.jpg',
      '威海公园':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio.jpg/960px-Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio.jpg',
      '悦海公园':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg/960px-Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg',
      '国际海水浴场':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio.jpg/960px-Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio.jpg',
      '火炬八街':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg/960px-Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg',
      '猫头山':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio.jpg/960px-Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio.jpg',
      '半月湾':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg/960px-Huancui%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg',
      '成山头':'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/%E6%88%90%E5%B1%B1%E5%A4%B4_-_altar-fountain_complex_with_statues_of_various_Chinese_gods_in_Weihai%2C_Shandong.jpg/960px-%E6%88%90%E5%B1%B1%E5%A4%B4_-_altar-fountain_complex_with_statues_of_various_Chinese_gods_in_Weihai%2C_Shandong.jpg',
      '那香海':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Rongcheng%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg/960px-Rongcheng%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg',
      '海驴岛':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Rongcheng%2C_Weihai%2C_Shandong%2C_China_-_panoramio_-_Roddy_Pfeiffer.jpg/960px-Rongcheng%2C_Weihai%2C_Shandong%2C_China_-_panoramio_-_Roddy_Pfeiffer.jpg',
      '鸡鸣岛':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Rongcheng%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg/960px-Rongcheng%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%281%29.jpg',
      '荣成海草房':'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Rongcheng%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%282%29.jpg/960px-Rongcheng%2C_Weihai%2C_Shandong%2C_China_-_panoramio_%282%29.jpg',
      '华夏城':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Weihai_china.jpg/960px-Weihai_china.jpg',
      '环翠楼公园':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Weihai_china.jpg/960px-Weihai_china.jpg',
      '威海站':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Weihai_china.jpg/960px-Weihai_china.jpg'
    }
  });

  globalThis.CITY_DATA = {北京:beijing,上海:shanghai,杭州:hangzhou,威海:weihai};
})();
