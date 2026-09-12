/* 杭州、广州静态两日游素材包。坐标为排版用示意坐标，非经纬度。
 * 来源详见 docs/cities；行程是编辑建议，不含实时价格、评分或导航数据。
 */
(function () {
  const source = (title, url, note) => ({title, url, note});
  const xhs = (id, title, author, date, note) => ({title, url:`https://www.xiaohongshu.com/explore/${id}`, note, author, date, platform:'小红书'});
  function make(c) {
    c.staticDays = 2;
    c.poi = {}; c.spots = {}; c.images = {};
    c.entries.forEach(([name, file, cat, x, y, intro, tags]) => {
      c.poi[name] = {x,y};
      c.spots[name] = {cat,intro,tags,src:'整理建议 · 见攻略来源'};
      c.images[name] = `assets/cities/${c.slug}/${file}.jpg`;
    });
    c.dining = {}; c.restPoi = {};
    const stay = {area:c.stayArea,theme:'住宿区域建议',note:'按实际到达车站、预算和预订条件选择；暂无酒店报价。',memoryIds:[],
      picks:[{style:'交通方便的酒店',room:'房型自选',price:'查询实时房价',src:'编辑建议',note:'预订前核对位置、取消政策与近期评价。'}]};
    function itinerary(routes, id, req, memoryIds=[]) {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(req.date||'') ? req.date : '2026-10-02';
      return {planId:id,stay,days:routes.map((names,d) => {
        const date = new Date(start+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+d);
        return {day:d+1,date:date.toISOString().slice(5,10),theme:names.join(' · ') || '自由安排',pace:names.length>2?3:2,
          paceNote:'建议分配上午 / 下午 / 傍晚；交通、开放及预约需出行前核对',memoryIds,
          items:names.map((name,i)=>({id:`${id}-${name}`,kind:'spot',name,time:i===0?'上午':i===1?'下午':'傍晚',note:'游览顺序建议；根据当天开放和体力调整。',memoryIds:[]}))};
      })};
    }
    c.resolve = (req, selected, memories=[]) => {
      const slow = memories.filter(m=>/不喜欢一天塞太多|一天最多|喜欢一天\s*2-3/.test(m.text));
      const museum = memories.filter(m=>/我晕博物馆/.test(m.text));
      const rest = memories.filter(m=>/午后.*休息/.test(m.text));
      const changes = [];
      const plansDefault = c.routes.map((r,i)=>({id:`${c.slug}-${i}`,style:r.style,tagline:r.note,pace:r.days.flat().length>4?3:2,
        density:r.days.flat().length/2,stay:{area:stay.area,dist:stay.note},food:c.food,walk:[],walkNote:'出行前查询实际交通',
        highlights:r.days.flat(),routeDays:r.days,memoryIds:[]}));
      const plansMemory = plansDefault.map(p=>{
        const ids = new Set();
        const routeDays=p.routeDays.map((day,d)=>{
          let names=day.filter(name=>{
            if(museum.length && c.spots[name].tags.includes('大型综合馆')){
              museum.forEach(m=>ids.add(m.id));
              if(p.id===(selected||plansDefault[0].id)) changes.push({id:`museum-${d}`,day:d+1,kind:'removed',target:name,text:`按你的偏好移除${name}，留出自由安排时间`,memoryIds:museum.map(m=>m.id)});
              return false;
            } return true;
          });
          if(slow.length && names.length>2){
            const removed=names.slice(2); names=names.slice(0,2); slow.forEach(m=>ids.add(m.id));
            if(p.id===(selected||plansDefault[0].id)) removed.forEach(name=>changes.push({id:`slow-${d}-${name}`,day:d+1,kind:'removed',target:name,text:`减少赶场：${name}留作备选`,memoryIds:slow.map(m=>m.id)}));
          } return names;
        });
        return {...p,routeDays,highlights:routeDays.flat(),density:routeDays.flat().length/2,memoryIds:[...ids],memoryNote:'根据你已记录的节奏或展馆偏好调整'};
      });
      const index=Math.max(0,plansDefault.findIndex(p=>p.id===selected));
      const chosen=plansDefault[index], adapted=plansMemory[index];
      const itinDefault=itinerary(chosen.routeDays,chosen.id,req);
      const itinMemory=itinerary(adapted.routeDays,chosen.id,req);
      itinMemory.days.forEach(d=>{
        d.memoryIds=[...new Set(changes.filter(x=>x.day===d.day).flatMap(x=>x.memoryIds))];
      });
      if(rest.length){
        itinMemory.days.forEach(d=>{
          const ids=rest.map(m=>m.id);
          d.items.splice(Math.min(1,d.items.length),0,{id:`${chosen.id}-rest-${d.day}`,kind:'free',time:'午间',name:'午后自由休息',dur:'120 min',memoryIds:ids});
          changes.push({id:`rest-${d.day}`,day:d.day,kind:'added',target:'free',text:`第 ${d.day} 天留出午后休息，后续游览时间灵活调整`,memoryIds:ids});
        });
      }
      return {plansDefault,plansMemory,itinDefault,itinMemory,diffs:changes,
        diffSummary:changes.length?'按当前方案和已记录偏好调整，逐条变化见下方。':'当前偏好未触发这套路线的调整，保留原安排。'};
    };
    Object.assign(c,c.resolve({date:'2026-10-02'},null,[]));
    delete c.entries;
    return c;
  }
  const hangzhou = make({name:'杭州',slug:'hangzhou',stayArea:'西湖东侧 / 湖滨周边',food:['杭帮菜','街区小吃'],
    mapLabels:[[8,12,'良渚'],[12,44,'西溪'],[35,62,'西湖'],[75,65,'老城']],
    entries:[
      ['西湖','west-lake','river',53,56,'湖岸散步与湖景摄影，可选择一段湖岸慢逛，不必一天环湖。',['湖景','自然','户外']],
      ['雷峰塔','leifeng-pagoda','tower',53,78,'西湖南岸的观景地标，可与湖岸游览组合；登塔按当日售票信息安排。',['地标','观景']],
      ['清河坊','qinghefang','street',79,75,'杭州老城历史街区，适合看街巷建筑、逛店与尝试小吃。',['老街','人文']],
      ['灵隐寺','lingyin-temple','temple',30,54,'山林中的古寺，适合留出独立游览时段；寺院与周边景区入园规则分别核对。',['寺院','古建筑']],
      ['西溪湿地','xixi-wetland','garden',19,36,'以湿地水网与自然景观为主，选一个游览片区，避免与多处远端景点赶场。',['湿地','自然']],
      ['良渚博物院','liangzhu-museum','museum',22,13,'了解良渚文化的专题博物院。与良渚古城遗址公园是不同地点，本路线不包含遗址公园。',['文博','专题馆']]
    ],
    routes:[
      {style:'湖景老城型',note:'西湖与老街一天，湿地单独留一天',days:[['西湖','雷峰塔','清河坊'],['西溪湿地']]},
      {style:'古寺文博型',note:'古寺与湖景开场，第二天专程去良渚',days:[['灵隐寺','西湖'],['良渚博物院']]},
      {style:'自然慢游型',note:'每天一个核心片区，给休息和摄影留余量',days:[['西湖','雷峰塔'],['西溪湿地']]}
    ],
    sources:[
      source('良渚博物院：实用参访指南','https://www.lzmuseum.cn/LiangBoXinWen/2024334405331.html','官方旧文；用于区分博物院与遗址公园。当前预约与开放请查看官网通知。'),
      source('杭州文旅：城市·漫步','https://wgly.hangzhou.gov.cn/cw/cn/index.html','官方路线检索入口；完整来源及访问状态见项目素材文档。'),
      xhs('6a07460b000000003503b722','杭州2天1夜｜慢逛西湖古寺老街路线','谢小谢的出逃日记','05-16','看展、西湖和古寺老街的组合参考。'),
      xhs('6a560719000000001700a07c','西湖2天1晚｜少走路、不折返慢游攻略','阿君不上班','07-14','湖岸、游船、雷峰塔和老城玩法参考；未采用原帖步行耗时。'),
      xhs('6a27dc2a000000001702a6bd','杭州2天1夜特种兵攻略｜适合爱拍照的小女孩✨','cary✨','06-09','摄影、游船和古寺体验参考；原帖价格及开放时间未采纳。')
    ]});
  const guangzhou = make({name:'广州',slug:'guangzhou',stayArea:'越秀 / 荔湾地铁沿线',food:['粤菜','广式点心','街区小吃'],
    mapLabels:[[12,52,'荔湾'],[39,19,'越秀'],[75,27,'天河'],[72,78,'海珠']],
    entries:[
      ['陈家祠','chen-clan-hall','temple',27,42,'岭南传统建筑与工艺看点，可作为西关人文路线起点。',['古建筑','工艺']],
      ['永庆坊','yongqingfang','street',22,62,'历史街区与当代小店结合，适合慢逛和建筑摄影。',['街区','人文']],
      ['沙面','shamian','street',30,78,'以历史建筑和林荫街道为特色的步行游览片区。',['建筑','散步']],
      ['越秀公园','yuexiu-park','garden',44,22,'可看五羊石像、古城墙等人文景观；园内有起伏，按体力选择线路。',['公园','自然','坡道']],
      ['广东省博物馆','guangdong-museum','museum',80,45,'综合性博物馆，适合按兴趣选择展厅，出发前核对预约与展览信息。',['文博','室内','大型综合馆']],
      ['广州塔','canton-tower','tower',76,70,'珠江沿岸城市地标，可安排外观摄影；登塔与游乐项目需另查票务。',['地标','夜景']]
    ],
    routes:[
      {style:'西关地标型',note:'老城建筑一天，展馆与城市夜景一天',days:[['陈家祠','永庆坊','沙面'],['广东省博物馆','广州塔']]},
      {style:'公园慢逛型',note:'公园与街区分天游览，减少一天内赶场',days:[['越秀公园'],['沙面','永庆坊']]},
      {style:'文博摄影型',note:'传统建筑、综合展馆和天际线组合',days:[['陈家祠','沙面'],['广东省博物馆','广州塔']]}
    ],
    sources:[
      source('广州政府：西关Citywalk，看这一篇就够了！','https://www.gz.gov.cn/zt/jrshts/2026n/nwzgz/nwgz/content/post_10686807.html','文旅荔湾，2026-02-12；陈家祠、永庆坊、沙面组合参考。'),
      source('广州文旅：20条暑期精选旅游线路','https://wglj.gz.gov.cn/ggfw/lyl/content/post_10898332.html','2026-07-13；多个主题的候选点位，未照搬成单条行程。'),
      source('广州政府：越秀公园介绍','https://www.gz.gov.cn/zlgz/gzly/wzgz/ylgy/content/mpost_9500464.html','用于公园及五羊石像的人文看点。'),
      xhs('6a2a335b000000001603dff6','广州2天1晚｜不走回头路Citywalk攻略✨','草莓雪花酥🍓','编辑于07-24','老城与都市文艺点位参考，项目路线已删减重排。'),
      xhs('69785e03000000001a020b3f','广州|两天一夜极简攻略🌆登塔坐船不踩坑','格格巫爱美丽','01-27','登塔与夜景玩法参考；价格、套餐和个人负面评价未录入。'),
      xhs('6a8e55a0000000000402a929','广州两日游｜把城市人文地标一次逛个遍📸','Solace','08-26','展馆、建筑摄影与夜景主题参考。')
    ]});
  Object.assign(globalThis.CITY_DATA,{杭州:hangzhou,广州:guangzhou});
})();
