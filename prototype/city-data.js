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
      '天坛公园':'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Temple_of_Heaven%2C_Beijing%2C_China_-_010.jpg/960px-Temple_of_Heaven%2C_Beijing%2C_China_-_010.jpg',
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
      '北京南站':'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Beijing_South_Railway_Station_2014.jpg/960px-Beijing_South_Railway_Station_2014.jpg'
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
    bigMuseum:'上海博物馆',queueFood:'s-lujiazui',marketArea:'老城厢一带',sunsetSpot:'外滩',localMarket:'愚园路',resortArea:'衡山路一带',cultureStyle:'海派街区型',cultureTagline:'沿梧桐街区与滨水空间慢慢走',images:{}
  });

  globalThis.CITY_DATA = {北京:beijing,上海:shanghai};
})();
