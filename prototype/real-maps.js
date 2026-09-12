/* Real geographic maps.
 *
 * 底图是**预渲染好的本地栅格瓦片**（JPEG），既不是矢量、也不访问任何外部服务。
 *
 * 为什么走到这一步（这条链换过三次，别再退回去）：
 *   1. 最早用 tile.openstreetmap.org 在线瓦片。OSM 因为批量抓取把本机封了，
 *      而且它是**用 HTTP 200 送来一张写着「403 Access blocked」的 PNG**——
 *      状态码、文件头、体积三种检查全部通过，直到人眼看图才发现。
 *   2. 改用 Protomaps 的 PMTiles 矢量归档（本地、可自托管、ODbL）。
 *      但 PMTiles 是单文件归档，浏览器要靠 **HTTP Range** 只读需要的段，
 *      而部署目标是魔搭创空间的 Static 类型——它支不支持 Range 没人测过，
 *      也没法先部署一次试。打开是灰的等于零分。
 *   3. 现在：把矢量瓦片烤成独立的 JPEG 文件。每个瓦片是一个普通静态资源，
 *      **不需要 Range，不需要后端，也不需要那三个 vendor 库**。
 *
 * 代价只有一处：缩放层级固定在烤进去的 z11–14。放大的方向靠 Leaflet 原生
 * 的 maxNativeZoom 缩放 z14 瓦片来补（瓦片存在，只是被放大，不会空白）；
 * 缩小的方向直接禁止（minZoom = 11），拖动范围也锁在数据范围附近——
 * 不然一缩一拖就走到没烤过的区域，看到的是纯空白。
 *
 * 重新生成底图：node tools/fetch-pmtiles.js && node tools/render-tiles.js
 * 署名见 tiles-raster/CREDITS.md。
 */
(function(){
  const DIR = 'tiles-raster/{z}/{x}/{y}.jpg';
  const ZMIN = 11, ZMAX = 14;          // 烤进去的层级范围
  const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
               + ' · 底图 <a href="https://protomaps.com/" target="_blank" rel="noopener">Protomaps</a>';
  /* 一张 1×1 透明 GIF。任何真缺的瓦片都用它兜住，
     免得浏览器显示裂图图标——那比留白更难看。 */
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  const colors=['#b96843','#527b65','#586a99','#b59043','#946197','#367d8a','#a45564'];
  let maps=[], observer=null;

  function dispose(){
    if(observer) observer.disconnect(); observer=null;
    maps.forEach(m=>m.remove()); maps=[];
  }

  function makeTileLayer(){
    return L.tileLayer(DIR, {
      /* 放大超出 ZMAX 时，Leaflet 会缩放 z14 的瓦片来补——那些瓦片是存在的，
         只是被放大，所以不会出现空白。缩小的方向则不允许（见 render 里的 minZoom）。 */
      maxNativeZoom: ZMAX,
      minNativeZoom: ZMIN,
      maxZoom: 19,
      attribution: ATTRIB,
      errorTileUrl: BLANK
    });
  }

  function render(container){
    const status=container.querySelector('.real-map-status');
    if(!globalThis.L){status.textContent='地图组件未能加载，请刷新页面重试。'; return;}
    let data;
    try {data=JSON.parse(container.dataset.routes);} catch {status.textContent='地图数据不可用。';return;}
    const canvas=container.querySelector('.real-map-canvas');
    /* ★ 视野必须锁在烤制覆盖的范围内。
       之前 minZoom 给到 9，结果缩小时 Leaflet 会去取 z9、z10 的瓦片——
       那几级根本没烤，缩下去就是一片空白，而且拖动还能拖到没有任何瓦片的
       区域。现在：缩不下去（minZoom = 烤制的最低层），也拖不出去
       （下面按点位范围设 maxBounds）。 */
    const map=L.map(canvas,{
      scrollWheelZoom:false, dragging:true, zoomControl:true,
      minZoom: ZMIN, maxZoom: 19
    }); maps.push(map);

    let loaded=0,failed=0;
    const tiles=makeTileLayer().addTo(map);
    tiles.on('tileload',()=>{loaded++; status.textContent=failed?'部分底图未加载，可重试。':''; status.hidden=!failed;});
    tiles.on('tileerror',()=>{failed++; status.hidden=false; status.textContent=loaded?'部分底图未加载，可重试。':'底图未能加载。';});
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
    if(points.length){
      const box=L.latLngBounds(points);
      /* 可拖动范围锁在点位范围外扩一圈以内——拖出去只有空白，没有意义。
         0.6 是取的经验值：够看清城市轮廓，又不至于到没瓦片的地方。 */
      map.setMaxBounds(box.pad(0.6));
      map.fitBounds(box,{padding:[26,26],maxZoom:14});
    }
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
