/* ==========================================================================
   Touris 知途 · 成都

   数据来源全部可核验，取自 Wikidata（中文名 / 经纬度 / 官网 P856 / 配图 P18）
   与中文维基百科，逐条记在下面的 QID 与 site 字段里。**没有编造任何一条**。

   ★ 为什么没有评分 / 点评数 / 来源

   其他城市的景点都带 `score:4.7, count:12840, src:'大众点评'` 这类字段，但那批
   数字是手写的，全仓库没有一处来自真实抓取——界面上却渲染成「4.7 分 · 12840 条
   点评 · 大众点评」并带来源样式。设计方案把「可核验」当成卖点，那批数字恰恰是
   最容易被打穿的地方。

   成都不这么干：不写评分就不画那一行（app.js 里是 `s.score ? … : ''`），
   改为给出**能点开核对的**东西——官网链接与 Wikidata 条目。
   其余城市要不要统一到这个口径，是另一个待拍板的事。

   ★ poi 坐标不再手写

   其他城市的 `poi` 是一组 0–100 的手绘画布坐标，和真实经纬度没有关系。
   成都这里只写 `geo`（真实经纬度），画布坐标由 `toCanvas()` 按统一包围盒算出来。
   手写坐标是「19 条图片 URL 的哈希段是编的」那类问题的同源——能算的不要手抄。

   ★ resolve() 走语义标签

   和杭州/广州同一套：记忆 → 语义标签 → 约束 → 裁剪/补位。
   判断依据是标签不是措辞，词表与映射表都在 semantics.js。
   ========================================================================== */

(function(){

  /* ---------------- 景点 ----------------
     字段：qid（Wikidata 条目，可点开核对）、cat（缩略图类别）、intro、
           tags（中文标签，经 semantics.js 映射成语义约束）、
           hours / ticket（开放与票务口径，出行前核对的提醒，不写死具体数字）、
           site（官网，来自 Wikidata P856；没有的留空） */
  const SPOTS = [
    { name:'宽窄巷子', cat:'street', qid:'Q10951691',
      intro:'清代旧城改造的三条巷子，川西民居与院落式商业混合，适合傍晚逛。',
      tags:['老城','步行街','小吃','夜景','人多','免费'] },

    { name:'锦里', cat:'street', qid:'Q6202606', site:'https://www.chinajinli.com/',
      intro:'紧邻武侯祠的仿古商业街，夜里灯笼亮起时最出片，与武侯祠可一并安排。',
      tags:['老城','步行街','小吃','夜景','人多'] },

    { name:'成都武侯祠', cat:'museum', qid:'Q1069942', site:'https://www.wuhouci.net.cn/',
      intro:'纪念诸葛亮与刘备的祠庙与三国主题博物馆，与锦里在同一片。',
      tags:['古建筑','历史建筑','文博','展馆','人多'] },

    { name:'杜甫草堂', cat:'garden', qid:'Q4390891', site:'https://www.cddfct.com/',
      intro:'杜甫寓居成都的旧址，园林与诗史陈列结合，院里有大片竹林，可久坐。',
      tags:['园林','古建筑','竹林','安静','可久坐','文博'] },

    { name:'成都大熊猫繁育研究基地', cat:'garden', qid:'Q1067861', site:'https://www.panda.org.cn/',
      intro:'看大熊猫的首选地，园区很大且离市区较远，上午熊猫活动更活跃。',
      tags:['自然','公园','户外','人多','路程远','旺季人多'] },

    { name:'青羊宫', cat:'temple', qid:'Q2121639',
      intro:'成都市区现存最完整的道教宫观，与二仙庵、文化公园相邻。',
      tags:['寺院','古建筑','安静','可久坐'] },

    { name:'文殊院', cat:'temple', qid:'Q11080015',
      intro:'闹市中的禅林，周边是成都老牌小吃与茶馆聚集地，适合午后停留。',
      tags:['寺院','古建筑','茶文化','可久坐'] },

    { name:'春熙路', cat:'shopping', qid:'Q5116461',
      intro:'成都最核心的商圈步行街，与大慈寺、太古里连成一片。',
      tags:['购物','步行街','城市地标','夜景','人多'] },

    { name:'大慈寺', cat:'temple', qid:'Q9907170',
      intro:'藏在商圈里的千年古寺，寺内有茶馆，与春熙路一墙之隔。',
      tags:['寺院','古建筑','茶文化','安静'] },

    { name:'人民公园', cat:'garden', qid:'Q16927648',
      intro:'成都最有生活感的老公园，鹤鸣茶社就在园内，适合坐下来待一下午。',
      tags:['公园','茶文化','可久坐','本地','免费'] },

    { name:'四川博物院', cat:'museum', qid:'Q10924774', site:'https://www.scmuseum.cn/',
      intro:'省级综合博物馆，巴蜀青铜、汉画像砖与张大千书画是重点。',
      tags:['文博','展馆','室内','免费','大型馆'] },

    { name:'金沙遗址', cat:'museum', qid:'Q217618', site:'https://www.jinshasitemuseum.com/',
      intro:'商周时期古蜀都邑遗址，太阳神鸟金饰出土于此，遗址馆与陈列馆分设。',
      tags:['遗址','考古','文博','展馆','室内'] },

    { name:'成都博物馆', cat:'museum', qid:'Q55696247', site:'https://www.cdmuseum.com/',
      intro:'天府广场旁的城市通史馆，常设展从古蜀一路讲到近现代，动线清楚。',
      tags:['文博','展馆','室内','免费','大型馆'] },

    { name:'望江楼公园', cat:'garden', qid:'Q21017523',
      intro:'锦江边的薛涛纪念地，园中竹林品种极多，崇丽阁是成都标志之一。',
      tags:['公园','古建筑','古塔','竹林','安静','可久坐'] },

    { name:'天府广场', cat:'street', qid:'Q10939558',
      intro:'成都地理中心，地铁 1、2 号线换乘处，多数行程的自然起点。',
      tags:['城市地标','免费','夜景'] },

    { name:'成都东站', cat:'station', qid:'Q5091316',
      intro:'成都主要高铁枢纽，成渝、西成方向多由此发车。',
      tags:['交通枢纽','返程'] },

    { name:'成都南站', cat:'station', qid:'Q11074637',
      intro:'成贵、成绵乐方向的车站，离主城区比东站更近。',
      tags:['交通枢纽','返程'] },

    { name:'都江堰', cat:'river', qid:'Q824157',
      intro:'两千多年仍在运行的引水工程，世界文化遗产；与青城山同一方向，需整日。',
      tags:['世界遗产','古建筑','河川','观景','路程远'] },

    { name:'青城山', cat:'temple', qid:'Q13729001',
      intro:'道教发源名山，前山道观集中、后山以溪谷徒步为主，需整日且费体力。',
      tags:['世界遗产','寺院','自然','爬山','费体力','路程远'] },

    { name:'新世纪环球中心', cat:'shopping', qid:'Q13580991',
      intro:'体量极大的室内综合体，含海洋乐园与商业；雨天或高温天的备选。',
      tags:['购物','室内','城市地标'] }
  ];

  /* ---------------- 真实经纬度 ----------------
     来源：Wikidata P625，条目见各景点的 qid。
     ★ 青城山用的是「青城山镇」(Q13729001) 的坐标：Wikidata 上那条名为「青城山」
       的条目 (Q905536) 给的坐标与都江堰完全重合，明显有误；而「青城山镇」与
       「青城山站」(Q7267794) 两个独立条目互相印证在 30.89–30.90 一带。 */
  const GEO = {
    '宽窄巷子':              [30.6673, 104.0492],
    '锦里':                  [30.6485, 104.0474],
    '成都武侯祠':            [30.6483, 104.0470],
    '杜甫草堂':              [30.6622, 104.0263],
    '成都大熊猫繁育研究基地': [30.7386, 104.1419],
    '青羊宫':                [30.6624, 104.0386],
    '文殊院':                [30.6813, 104.0790],
    '春熙路':                [30.6587, 104.0786],
    '大慈寺':                [30.6570, 104.0814],
    '人民公园':              [30.6594, 104.0554],
    '四川博物院':            [30.6603, 104.0343],
    '金沙遗址':              [30.6834, 104.0109],
    '成都博物馆':            [30.6597, 104.0612],
    '望江楼公园':            [30.6319, 104.0899],
    '天府广场':              [30.6599, 104.0633],
    '成都东站':              [30.6311, 104.1390],
    '成都南站':              [30.6090, 104.0661],
    '都江堰':                [31.0093, 103.6044],
    '青城山':                [30.8989, 103.5903],
    '新世纪环球中心':        [30.5711, 104.0608]
  };

  /* 画布包围盒：把主城区和都江堰/青城山一起框进来。
     略放宽一点留边，免得最北/最南的点贴在画布边缘上。 */
  const BOX = { south:30.50, north:31.06, west:103.50, east:104.20 };
  /** 经纬度 → 0–100 画布坐标（西→东为 x，北→南为 y） */
  function toCanvas(lat, lng){
    return {
      x: Math.round((lng - BOX.west) / (BOX.east - BOX.west) * 1000) / 10,
      y: Math.round((BOX.north - lat) / (BOX.north - BOX.south) * 1000) / 10
    };
  }

  function geoByName(name){
    const g = GEO[name];
    return g ? { lat:g[0], lng:g[1],
      source:'Wikidata ' + (SPOTS.find(s => s.name === name) || {}).qid } : null;
  }

  /* ---------------- 路线 ----------------
     三天核心城区 + 一天远郊。景点名必须和上面 SPOTS 对得上。
     时间轴由 itinerary() 按顺序生成，这里只定顺序。 */
  const ROUTES = {
    packed: [
      ['宽窄巷子','人民公园','成都博物馆','春熙路'],
      ['成都大熊猫繁育研究基地','金沙遗址','杜甫草堂','青羊宫'],
      ['成都武侯祠','锦里','文殊院','望江楼公园'],
      ['都江堰','青城山','成都东站']
    ],
    local: [
      ['人民公园','宽窄巷子','文殊院'],
      ['杜甫草堂','青羊宫','望江楼公园'],
      ['成都武侯祠','锦里','大慈寺','春熙路'],
      ['都江堰','成都南站']
    ],
    relaxed: [
      ['人民公园','天府广场'],
      ['杜甫草堂','青羊宫'],
      ['文殊院','大慈寺'],
      ['望江楼公园','成都东站']
    ]
  };

  /* ---------------- 餐饮候选 ----------------
     口径与其余城市一致：只说「某某一带」+ 候选类型，不给店名门牌。 */
  const DINE = {
    'c-kuanzhai': { area:'宽窄巷子一带', walk:'步行可达', theme:'景区周边餐饮',
      picks:[
        {style:'川菜家常馆',cuisine:'川菜',price:'人均查询实时',note:'巷口一带选择多，饭点较挤'},
        {style:'小吃集合店',cuisine:'成都小吃',price:'人均查询实时',note:'一次可尝多种'},
        {style:'茶馆简餐',cuisine:'茶点',price:'人均查询实时',note:'可久坐'}
      ]},
    'c-jinli': { area:'武侯祠一带', walk:'与锦里相邻', theme:'景区小吃与川菜',
      picks:[
        {style:'景区小吃街',cuisine:'成都小吃',price:'人均查询实时',note:'边走边吃为主'},
        {style:'川菜馆',cuisine:'川菜',price:'人均查询实时',note:'出景区后价格更实'},
        {style:'火锅店',cuisine:'川渝火锅',price:'人均查询实时',note:'晚餐排队较常见'}
      ]},
    'c-wenshu': { area:'文殊院一带', walk:'步行可达', theme:'老牌小吃与素斋',
      picks:[
        {style:'寺院素斋',cuisine:'素斋',price:'人均查询实时',note:'午市为主'},
        {style:'老字号小吃',cuisine:'成都小吃',price:'人均查询实时',note:'甜水面、凉粉一类'},
        {style:'老茶馆',cuisine:'茶馆',price:'人均查询实时',note:'可久坐，适合午后'}
      ]},
    'c-chunxi': { area:'春熙路一带', walk:'与太古里相连', theme:'商圈餐饮',
      picks:[
        {style:'川菜正餐',cuisine:'川菜',price:'人均查询实时',note:'晚市需取号'},
        {style:'面食小馆',cuisine:'面食',price:'人均查询实时',note:'出餐快'},
        {style:'甜品饮品',cuisine:'甜品',price:'人均查询实时',note:'适合中途歇脚'}
      ]},
    'c-caotang': { area:'草堂一带', walk:'与青羊宫相邻', theme:'社区餐饮',
      picks:[
        {style:'社区川菜馆',cuisine:'川菜',price:'人均查询实时',note:'本地客为主'},
        {style:'面馆',cuisine:'面食',price:'人均查询实时',note:'午市快'},
        {style:'公园旁茶馆',cuisine:'茶馆',price:'人均查询实时',note:'可久坐'}
      ]},
    'c-hotpot': { area:'玉林一带', walk:'需短途交通', theme:'本地夜宵',
      picks:[
        {style:'老火锅',cuisine:'川渝火锅',price:'人均查询实时',note:'本地口碑店多，等位常见'},
        {style:'串串香',cuisine:'串串',price:'人均查询实时',note:'按签计价'},
        {style:'烧烤摊',cuisine:'烧烤',price:'人均查询实时',note:'夜宵时段'}
      ]}
  };

  /* ---------------- 住宿 ---------------- */
  const STAY = {
    area:'天府广场 / 春熙路一带',
    theme:'地铁 1、2 号线换乘处，多数景点半小时内可达',
    note:'按实际到达车站、预算与预订条件选择；暂无酒店报价，出行前核对位置、取消政策与近期评价。',
    picks:[
      {style:'地铁站旁商务酒店',room:'房型自选',price:'查询实时房价',note:'换乘方便，适合多点位行程'},
      {style:'老城院落民宿',room:'房型自选',price:'查询实时房价',note:'靠近宽窄巷子一带，氛围好但出行略依赖打车'},
      {style:'商圈高层酒店',room:'房型自选',price:'查询实时房价',note:'春熙路一带，餐饮与购物方便'}
    ]
  };

  /* ---------------- 组装 ---------------- */
  const spotsMap = {}, poi = {};
  SPOTS.forEach(s => {
    spotsMap[s.name] = {
      cat:s.cat, intro:s.intro, tags:s.tags,
      qid:s.qid, site:s.site || null
      /* 刻意没有 score / count / src —— 见文件头 */
    };
    poi[s.name] = toCanvas(GEO[s.name][0], GEO[s.name][1]);
  });
  /* 配图不在这里指定：成都走公共图库 SPOT_IMG（prototype/images.js），
     由 tools/fetch-images.js 按 tools/image-sources.json 统一生成。
     app.js 的 spotImages() 是 `Object.assign(SPOT_IMG, city.images)`，
     所以 city.images 留空即可。 */

  const ALL_ROUTES = [...ROUTES.packed, ...ROUTES.local, ...ROUTES.relaxed];

  function plan(id, style, tagline, routeDays, pace, food){
    return {
      id, style, tagline, pace,
      density: Math.round(routeDays.flat().length / routeDays.length * 10) / 10,
      stay:{ area:STAY.area, dist:STAY.theme },
      food, walk:[], walkNote:'出行前查询实际交通',
      highlights: routeDays.flat().filter(n => spotsMap[n]).slice(0, 5),
      routeDays, memoryIds:[]
    };
  }

  const plansDefault = [
    plan('p-packed','暴走打卡型',`4 天走满 ${new Set(ALL_ROUTES.flat()).size} 个点位，一个不漏`,ROUTES.packed,5,['商圈餐饮','连锁快餐']),
    plan('p-local','慢逛本地型','每天 3 个点，把时间留给公园、茶馆和吃',ROUTES.local,2,['本地小馆','茶馆']),
    plan('p-resort','轻松度假型','睡到自然醒，一天一个片区',ROUTES.relaxed,1,['酒店餐','下午茶'])
  ];

  /* ---------------- 行程 ----------------
     时间只是「上午/下午/傍晚」的槽位提示，不写死具体时刻——
     具体开放与预约都要出行前核对，写死一个时刻反而是假精确。 */
  function itinerary(routeDays, id, req){
    const start = /^\d{4}-\d{2}-\d{2}$/.test(req.date || '') ? req.date : '2026-10-02';
    return {
      planId:id, stay:STAY,
      days: routeDays.map((names, d) => {
        const date = new Date(start + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() + d);
        const slots = ['上午','下午','傍晚'];
        return {
          day: d + 1, date: date.toISOString().slice(5, 10),
          theme: names.map(n => spotsMap[n] ? spotsMap[n].cat : '').length ? names.join(' · ') : '自由安排',
          pace: names.length > 3 ? 3 : 2,
          paceNote: '点位顺序为建议；开放时间、预约与交通请出行前核对',
          items: names.map((name, i) => ({
            id: `${id}-d${d + 1}-${i + 1}`, kind:'spot', name,
            time: slots[Math.min(i, 2)], note:'按当日开放与体力调整',
            memoryIds:[]
          }))
        };
      })
    };
  }

  /* ---------------- 记忆 → 推荐 ----------------
     与杭州/广州同一套：judgment 依据是语义标签不是措辞。
     实现放在 city-hangzhou-guangzhou.js 里，两边共用同一段逻辑会更好，
     这里先各留一份，等它稳定后再抽出来。 */
  function resolve(req, selected, memories){
    memories = memories || [];
    const dayCount = req.days == null ? 4 : Number(req.days);
    /* slow 时一天压到几个点。取 3 不是算出来的，是拿文案里「2–3 个」的**上限**：
       宁可少裁一点，也不要为了叙事把行程掏空。取 2 会把一条 4/4/4/3 的路线砍掉
       近一半，S5 上出现「砍掉 9 处」，看着像行程被删空了而不是被调整了。
       （app/memory/derive.js 的 PACE_CAP.slow 也是 3，同样的理由。） */
    const PACE_CAP = 3;
    const cons = constraintsOf(memories);
    const slow = cons.pace === 'slow';
    const paceIds = () => memories.filter(m => m.pace === 'slow').map(m => m.id);
    const rel = name => {
      const sem = semOf(name, spotsMap);
      return {
        avoid:  sem.avoid.filter(t => cons.avoid.includes(t)),
        prefer: sem.prefer.filter(t => cons.prefer.includes(t))
      };
    };

    const fit = days => {
      const out = days.slice(0, dayCount);
      /* 天数多于路线时，补上还没用过的点，别让第 5 天没内容 */
      const used = new Set(out.flat());
      const pool = Object.keys(spotsMap).filter(n => !used.has(n));
      let i = 0;
      while(out.length < dayCount){
        const day = pool.slice(i, i + 3);
        out.push(day.length ? day : []);
        day.forEach(n => used.add(n));
        i += 3;
        if(i > pool.length + 3) break;
      }
      return out;
    };

    const changes = [];
    const plansMemory = plansDefault.map(p => {
      const record = p.id === (selected || plansDefault[0].id);
      const ids = new Set();
      const usedAll = new Set(p.routeDays.flat());
      const pending = [];
      const routeDays = p.routeDays.map((day, d) => {
        let picks = [], dropped = [];
        day.forEach((name, i) => {
          const hit = rel(name).avoid[0];
          if(hit){ dropped.push({ name, tag:hit }); whoContributes(memories, 'avoid', hit).forEach(id => ids.add(id)); }
          else picks.push({ name, slot:i });
        });
        const cap = slow ? Math.min(PACE_CAP, day.length) : day.length;
        if(picks.length > cap){
          const ranked = picks.slice().sort((a, b) =>
            rel(b.name).prefer.length - rel(a.name).prefer.length || a.slot - b.slot);
          const keep = new Set(ranked.slice(0, cap).map(x => x.name));
          picks.filter(x => !keep.has(x.name)).forEach(x => {
            dropped.push({ name:x.name, tag:'pace' });
            paceIds().forEach(id => ids.add(id));
          });
          picks = picks.filter(x => keep.has(x.name));
        }
        const added = [];
        if(cons.prefer.length && picks.length < cap){
          const taken = new Set(picks.map(x => x.slot));
          const holes = day.map((_, i) => i).filter(i => !taken.has(i)).slice(0, cap - picks.length);
          const pool = Object.keys(spotsMap)
            .filter(n => !usedAll.has(n) && !rel(n).avoid.length && rel(n).prefer.length)
            .sort((a, b) => rel(b).prefer.length - rel(a).prefer.length || (a < b ? -1 : a > b ? 1 : 0));
          holes.forEach((h, k) => {
            const pick = pool[k];
            if(!pick) return;
            usedAll.add(pick);
            picks.push({ name:pick, slot:h });
            added.push(pick);
            rel(pick).prefer.forEach(t => whoContributes(memories, 'prefer', t).forEach(id => ids.add(id)));
          });
        }
        picks.sort((a, b) => a.slot - b.slot);
        if(record){
          dropped.forEach(x => pending.push({
            id:`drop-${d}-${x.name}`, day:d + 1, kind:'removed', target:x.name,
            text: x.tag === 'pace' ? `减少赶场：${x.name}留作备选` : `按你的记录避开${x.name}`,
            memoryIds: x.tag === 'pace' ? paceIds() : whoContributes(memories, 'avoid', x.tag)
          }));
          added.forEach((name, k) => {
            const addIds = [...new Set(rel(name).prefer.flatMap(t => whoContributes(memories, 'prefer', t)))];
            pending.push({
              id:`add-${d}-${k}`, day:d + 1, kind:'added', target:name,
              text:`补上${name}——和你记录的偏好一致`, memoryIds:addIds
            });
          });
        }
        return picks.map(x => x.name);
      });
      pending.forEach(x => changes.push(x));
      return Object.assign({}, p, {
        routeDays,
        highlights: routeDays.flat().filter(n => spotsMap[n]).slice(0, 5),
        density: Math.round(routeDays.flat().length / dayCount * 10) / 10,
        memoryIds:[...ids],
        memoryNote:'根据你已记录的偏好与节奏调整'
      });
    });

    const index = Math.max(0, plansDefault.findIndex(p => p.id === selected));
    const chosen = plansDefault[index], adapted = plansMemory[index];
    const itinDefault = itinerary(fit(chosen.routeDays), chosen.id, req);
    const itinMemory  = itinerary(fit(adapted.routeDays), chosen.id, req);

    itinMemory.days.forEach(d => {
      d.memoryIds = [...new Set(changes.filter(x => x.day === d.day).flatMap(x => x.memoryIds))];
    });
    if(slow){
      itinMemory.days.forEach(d => {
        const ids = paceIds();
        d.items.splice(Math.min(1, d.items.length), 0,
          { id:`rest-${d.day}`, kind:'free', time:'午间', name:'午后自由休息', dur:'120 min', memoryIds:ids });
        changes.push({
          id:`rest-${d.day}`, day:d.day, kind:'added', target:'free',
          text:`第 ${d.day} 天留出午后休息，后续游览时间灵活调整`, memoryIds:ids
        });
      });
    }

    const removedN = changes.filter(x => x.kind === 'removed').length;
    const addedN   = changes.filter(x => x.kind === 'added' && x.target !== 'free').length;
    const restN    = changes.filter(x => x.target === 'free').length;
    const parts = [];
    if(removedN) parts.push(`砍掉 ${removedN} 处与你记录冲突的安排`);
    if(addedN)   parts.push(`补上 ${addedN} 处你偏好的地方`);
    if(restN)    parts.push('每天留出午后休息');
    if(!parts.length) parts.push('这套路线和你的记录没有冲突，不需要改动');

    return {
      plansDefault, plansMemory, itinDefault, itinMemory,
      diffs: changes, diffSummary: parts.join('，') + '。'
    };
  }

  const chengdu = {
    name:'成都', slug:'chengdu',
    durationRange:[2,3,4,5,6,7], defaultDays:4, staticDays:4,
    mapLabels:[['16','14','都江堰'],['30','34','青羊'],['48','46','锦江'],['70','40','成华'],['52','72','高新'],['20','78','双流']],
    center:[30.6599, 104.0633],
    geo: (() => { const g = {}; Object.keys(GEO).forEach(n => g[n] = geoByName(n)); return g; })(),
    spots: spotsMap, poi,
    dining: DINE, restPoi:{},
    stay: { '慢逛本地型': STAY },
    sources: [
      { title:'Wikidata：成都各景点条目（经纬度 P625、官网 P856、配图 P18）',
        url:'https://www.wikidata.org/wiki/Q30002',
        note:'每个景点的具体条目见其 qid 字段，可逐条核对坐标与官网。' },
      { title:'中文维基百科：青城山',
        url:'https://zh.wikipedia.org/wiki/青城山',
        note:'用于核对青城山坐标——Wikidata 上「青城山」条目的坐标与都江堰重合。' }
    ]
  };
  chengdu.resolve = resolve;

  /* 加载时先按「0 记忆」跑一遍，把 itinDefault / itinMemory 挂到城市对象上。
     杭州/广州也是这么做的，_verify.js 与若干渲染路径都会直接读这两个字段，
     不先跑一遍的话它们是 undefined。 */
  Object.assign(chengdu, resolve({ date:'2026-10-02', days:4 }, null, []));

  Object.assign(globalThis.CITY_DATA, { 成都: chengdu });
})();
