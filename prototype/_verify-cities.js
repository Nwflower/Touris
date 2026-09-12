/* 由 _verify.js 复用真实脚本和 DOM 桩；覆盖两日素材包的行为契约。 */
module.exports=({S,g,render,nodes,CITY_DATA,assert,fs})=>{
for(const name of ['杭州','广州']){
  S.req={dest:name,date:'2026-12-31',days:2,people:2}; S.session={mode:'guest',id:null}; S.learned=[]; S.memoryOn=true;
  const c=CITY_DATA[name];
  for(const plan of c.plansDefault){
    S.chosenPlan=plan.id;
    const it=g('itin()');
    assert(it.planId===plan.id && JSON.stringify(it.days.map(d=>d.items.map(i=>i.name)))===JSON.stringify(plan.routeDays),name+' '+plan.style+' 详情对应所选路线');
    assert(it.days[0].date==='12-31' && it.days[1].date==='01-01',name+' 出发日期跨年正确');
    for(const screen of ['s1','s2','s5']){
      S.screen=screen; render(); const html=nodes.work.innerHTML;
      assert(!/undefined|NaN|sp-score|wsrv.nl/.test(html),name+' '+plan.style+' '+screen+' 无虚构评分、本地图片不走代理');
      if(screen==='s5') assert((html.match(/class="cmp-day"/g)||[]).length===2,name+' 对照页恰好两天');
    }
  }
  for(const [spot,url] of Object.entries(c.images)) assert(fs.existsSync(url),name+' '+spot+' 图片存在');
  S.chosenPlan=c.plansDefault[0].id;
  S.learned=[{id:'real-feedback',text:'不喜欢一天塞太多景点'}];
  assert(g('diffs()').length>0 && g('itin()').days.every(d=>d.items.filter(i=>i.kind==='spot').length<=2),name+' 太赶反馈减少点位');
  assert(g('diffs()').every(d=>d.memoryIds.includes('real-feedback')),name+' 变化溯源到实际反馈');
  S.memoryOn=false; assert(g('itin()').days[0].items.length===3,name+' 关闭记忆恢复所选路线');
  S.memoryOn=true; S.learned=[{id:'unrelated',text:'喜欢吃甜食'}];
  assert(g('diffs()').length===0 && g('usedMemoryIds()').length===0,name+' 不相关记忆不伪造变化');
  S.learned=[{id:'museum-feedback',text:'我晕博物馆（大型综合馆）'}];
  const resolved=c.resolve(S.req,c.plansDefault[2].id,S.learned);
  assert(name==='杭州' ? resolved.diffs.length===0 : resolved.diffs.some(x=>x.target==='广东省博物馆'),name+' 展馆偏好只影响匹配类别');
  S.learned=[{id:'rest-feedback',text:'习惯午后留 2 小时自由休息'}];
  assert(g('itin()').days.every(d=>d.items.some(i=>i.kind==='free')),name+' 午后休息反馈插入空档');
}
};
