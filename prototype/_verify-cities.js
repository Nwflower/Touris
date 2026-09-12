/* Behavioral regression tests for every exposed duration and both city packs. */
module.exports=({S,g,render,nodes,CITY_DATA,assert,fs})=>{
  for(const name of ['杭州','广州']){
    const c=CITY_DATA[name];
    assert(Object.keys(c.spots).length>=15,name+' 景点池至少15个');
    for(const spot of Object.keys(c.spots)){
      const p=c.geo[spot];
      assert(p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&/^https:\/\//.test(p.source),name+' '+spot+' 有带来源的经纬度');
      assert(c.images[spot]&&fs.existsSync(c.images[spot]),name+' '+spot+' 本地图片存在');
    }
    for(const days of [2,3,4,5,6,7]){
      S.req={dest:name,date:'2026-12-29',days,people:2};S.session={mode:'guest',id:null};S.learned=[];S.memoryOn=true;
      const result=c.resolve(S.req,null,[]);
      assert(new Set(result.plansDefault.map(p=>JSON.stringify(p.routeDays))).size===3,name+' '+days+'天 三套路线不同');
      if(days<=4){
        const sets=result.plansDefault.map(p=>new Set(p.routeDays.flat()));
        for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
          const common=[...sets[i]].filter(n=>sets[j].has(n)).length;
          assert(common/Math.max(sets[i].size,sets[j].size)<=0.7,name+' '+days+'天 两方案重合不超过70%');
        }
      }
      for(const plan of result.plansDefault){
        S.chosenPlan=plan.id;
        const it=g('itin()');const flat=plan.routeDays.flat();
        assert(it.days.length===days&&plan.routeDays.length===days,name+' '+days+'天 不改变所选天数');
        assert(new Set(flat).size===flat.length&&plan.routeDays.every(d=>d.length>0),name+' '+plan.style+' 行程无重复或空白天');
        assert(JSON.stringify(it.days.map(d=>d.items.map(i=>i.name)))===JSON.stringify(plan.routeDays),name+' '+plan.style+' 详情跟随选择');
        assert(it.days.at(-1).date===new Date(Date.UTC(2026,11,29+days-1)).toISOString().slice(5,10),name+' 日期跨年正确');
        for(const screen of ['s1','s2','s5']){
          S.screen=screen;render();const html=nodes.work.innerHTML;
          assert(!/undefined|NaN/.test(html),name+' '+days+'天 '+screen+' 无渲染异常');
          if(screen==='s5')assert((html.match(/class="cmp-day"/g)||[]).length===days,name+' 对照天数一致');
          if(screen!=='s5')assert(html.includes('real-map-canvas')&&!html.includes('class="sim-map'),name+' 显示真实地图容器');
        }
      }
      /* 走真实的表态路径建这条记忆：learn() 会把规则里的语义标签一起带上。
         以前这里手写一个只有 text 的对象就够——那时判断依据是正则匹配措辞。
         现在判断依据是标签，手写对象必须自带 pace 才有可能生效，所以改成
         调用真的 learn()，这样测的才是产品里实际发生的那条路径。 */
      S.chosenPlan=result.plansDefault[0].id;S.learned=[];g("learn('太赶','pace')");
      assert(g('itin()').days.length===days&&g('itin()').days.every(d=>d.items.filter(i=>i.kind==='spot').length<=3),name+' 反馈减点不减天（slow 时上限 PACE_CAP=3，与 app/memory/derive.js 同值）');
      S.memoryOn=false;assert(g('itin()').days[0].items.length===3,name+' 关闭记忆恢复选中路线');
      S.memoryOn=true;S.learned=[{id:'other',text:'喜欢吃甜食'}];
      assert(g('diffs()').length===0&&g('usedMemoryIds()').length===0,name+' 未匹配偏好不伪造变化');
    }
    for(const days of [0,1,8,2.5]){
      let error=false;try{c.resolve({date:'2026-10-02',days},null,[]);}catch(e){error=true;}
      assert(error,name+' 拒绝不支持的天数 '+days);
    }
  }
};
