/* Real geographic maps. WGS84 data is stored with provenance in city-expansion.js.
 * Requests only visible maps, uses normal browser tile caching, never prefetches.
 */
(function(){
  const cfg = globalThis.TOURIS_MAP_CONFIG || {
    tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    maxZoom:19
  };
  const colors=['#b96843','#527b65','#586a99','#b59043','#946197','#367d8a','#a45564'];
  let maps=[], observer=null;
  function dispose(){
    if(observer) observer.disconnect(); observer=null;
    maps.forEach(m=>m.remove()); maps=[];
  }
  function render(container){
    const status=container.querySelector('.real-map-status');
    if(!globalThis.L){status.textContent='地图组件未能加载，请刷新页面重试。'; return;}
    let data;
    try {data=JSON.parse(container.dataset.routes);} catch {status.textContent='地图数据不可用。';return;}
    const canvas=container.querySelector('.real-map-canvas');
    const map=L.map(canvas,{scrollWheelZoom:false,dragging:true,zoomControl:true}); maps.push(map);
    let loaded=0,failed=0;
    const tiles=L.tileLayer(cfg.tileUrl,{attribution:cfg.attribution,maxZoom:cfg.maxZoom,referrerPolicy:'strict-origin-when-cross-origin'}).addTo(map);
    tiles.on('tileload',()=>{loaded++; status.textContent=failed?'部分底图未加载，可重试或打开地图网站。':'';status.hidden=!failed;});
    tiles.on('tileerror',()=>{failed++;status.hidden=false; status.textContent=loaded?'部分底图未加载，可重试或打开地图网站。':'底图暂时无法加载，请检查网络或打开地图网站。';});
    tiles.on('loading',()=>{loaded=0;failed=0;});
    const points=[];
    data.forEach((day,di)=>day.forEach((p,i)=>{
      const color=colors[(p.day-1)%colors.length]; points.push([p.lat,p.lng]);
      const marker=L.marker([p.lat,p.lng],{title:`第${p.day}天 · ${p.name}`,icon:L.divIcon({className:'touris-marker',html:`<span style="background:${color}">${p.day}.${i+1}</span>`,iconSize:[34,28],iconAnchor:[17,14]})}).addTo(map);
      const label=document.createElement('div');
      const title=document.createElement('strong');title.textContent=p.name;label.appendChild(title);
      const desc=document.createElement('p');desc.textContent=`第 ${p.day} 天 · 第 ${i+1} 站`;label.appendChild(desc);
      const a=document.createElement('a');a.textContent='在 OpenStreetMap 查看';a.href=`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}`;a.target='_blank';a.rel='noopener noreferrer';label.appendChild(a);
      marker.bindPopup(label);
    }));
    // Dashed connections convey visit order only, not road routing.
    data.forEach(day=>{if(day.length>1)L.polyline(day.map(p=>[p.lat,p.lng]),{color:colors[(day[0].day-1)%colors.length],weight:3,dashArray:'6 7'}).addTo(map);});
    if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[26,26],maxZoom:14});
    else {map.setView(JSON.parse(container.dataset.center),11);status.textContent='当天没有需标记的景点，可切换其他天。';}
    container.querySelector('[data-map-retry]').addEventListener('click',()=>{status.hidden=false;status.textContent='正在重新加载底图…';tiles.redraw();});
    map.on('click',()=>map.scrollWheelZoom.enable());
    map.on('mouseout',()=>map.scrollWheelZoom.disable());
    requestAnimationFrame(()=>map.invalidateSize());
  }
  function mount(){
    const els=document.querySelectorAll('.real-map');
    if(!els.length)return;
    if(typeof IntersectionObserver==='undefined'){els.forEach(render);return;}
    observer=new IntersectionObserver(entries=>entries.forEach(e=>{
      if(e.isIntersecting){observer.unobserve(e.target);render(e.target);}
    }),{root:null,rootMargin:'0px'});
    els.forEach(el=>observer.observe(el));
  }
  globalThis.TourisMaps={dispose,mount};
})();
