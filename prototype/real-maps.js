/* Real geographic maps.
 *
 * 底图有**两条路，运行时自动挑一条**：
 *
 *   · 矢量（首选）——后端吐出 PMTiles 归档的字节（靠 HTTP Range 只读需要的段），
 *     protomaps-leaflet 把矢量画进 canvas。需要后端支持 Range。
 *   · 栅格（回退）——构建期预烤好的 JPEG，每个瓦片都是普通静态资源，
 *     不需要 Range、不需要后端、也不需要那三个 vendor 库。
 *
 * 为什么栅格曾经是唯一选择：部署目标是魔搭创空间的 **Static 类型**，
 * 它支不支持 Range 没人测过，也没法先部署一次试——「打开是灰的」等于零分。
 * 现在部署改成了 Docker + server.js 薄后端，**自己就能实现 Range**，
 * 这条约束不再成立，所以矢量重新做首选；栅格留着回退，
 * 万一哪天回落成纯静态托管，页面照常打开。
 *
 * 这条链换过三次，每一代死在哪（别再退回去）：
 *   1. tile.openstreetmap.org 在线瓦片——OSM 因批量抓取把本机封了，而且它是
 *      **用 HTTP 200 送来一张写着「403 Access blocked」的 PNG**：状态码、
 *      文件头、体积三种检查全部通过，直到人眼看图才发现。
 *   2. MapLibre + 自托管 PMTiles——MapLibre 要自托管字体 PBF 与 sprites
 *      （顶层 tiles/assets/ 那 14MB），而且同样卡在 Range 上。整体已删除。
 *   3. 烤成独立 JPEG（现在的回退路径）——Range 依赖消失，代价是缩放层级
 *      固定在烤进去的 z11–14。
 *
 * 两条路都是**运行时零外部请求**：protomaps-leaflet 走 document.fonts 加载
 * **系统字体**，不下载 webfont，也不需要 sprite 文件；归档里自带 name:zh-Hans，
 * 中文标签原生可用。
 *
 * 重新生成：node tools/fetch-pmtiles.js && node tools/render-tiles.js
 * 署名见 tiles-raster/CREDITS.md 与 tiles/CREDITS.md。
 */
(function(){
  /* ------------------------------------------------------------------
     引擎选择。URL 上加 ?map=raster / ?map=vector 可临时强制，方便对比两条路。
       'auto'   探测后端支不支持 Range：支持走矢量，否则回退栅格（默认）
       'vector' 强制矢量（后端不支持 Range 时这里会退化成整包 GET，别这么用）
       'raster' 强制栅格——纯静态托管下唯一可用的一条
     ------------------------------------------------------------------ */
  const MODE = new URLSearchParams(location.search).get('map') || 'auto';

  const RASTER_DIR = 'tiles-raster/{z}/{x}/{y}.jpg';
  const VECTOR_DIR = 'tiles/';
  const VECTOR_MAXZOOM = 15;           // Protomaps 每日构建包的层级上限

  /* 可视范围两条路**锁得一样紧**，这不是偷懒：
     栅格是按点位 bbox 外扩 0.03° 烤的（tools/fetch-pmtiles.js 与
     render-tiles.js 的 PAD），矢量归档是拿同一个 bbox 去 extract 的，
     范围外**同样没有数据**。所以矢量虽然含 z0–15 全部层级，缩得太小
     或拖得太远一样是空白——minZoom 仍然锁 ZMIN，拖动仍然锁 BOUNDS_PAD。

     矢量真正的收益在另一头：z14 以上不再是放大糊图，而是一直清晰到 z15。 */
  const ZMIN = 11, ZMAX = 14;          // 栅格烤进去的层级范围
  /* 可拖动范围在点位外扩这么多**度**。
     必须小于 fetch-pmtiles.js / render-tiles.js 里的 PAD（0.03°）——
     那边是按点位 bbox 外扩 0.03° 去烤/提取的，而且只会多不会少。
     这里取 0.02，保证拖到边界的任何一帧都还踩在有效数据上。
     之前给的是 box.pad(0.6)，那是**比例**不是度，等于外扩 60%——
     超出范围一大截，一拖就请求没有数据的瓦片，状态条弹「部分底图未加载」。 */
  const BOUNDS_PAD = 0.02;

  /* 城市名 → 归档文件名。与 tools/render-tiles.js 的 SLUG 同一张表。 */
  const SLUG = { '京都':'kyoto', '北京':'beijing', '上海':'shanghai',
                 '杭州':'hangzhou', '广州':'guangzhou', '威海':'weihai', '成都':'chengdu' };

  const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
               + ' · 底图 <a href="https://protomaps.com/" target="_blank" rel="noopener">Protomaps</a>';
  /* 一张 1×1 透明 GIF。任何真缺的瓦片都用它兜住，
     免得浏览器显示裂图图标——那比留白更难看。 */
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  const colors=['#b96843','#527b65','#586a99','#b59043','#946197','#367d8a','#a45564'];
  let maps=[], observer=null;
  /* 每个容器一份实例：地图 + 按天索引的标记 / 连线 / 点位，供 setDay() 就地更新。
     之所以按住引用而不是重绘，是因为**切天由鼠标划过触发**——重绘得把 Leaflet
     整个拆掉重挂，划过时间轴时会一路闪。 */
  const instances=new Map();
  /* 鼠标划过地图上的标记时回调外面（app 侧据此切到那一天）。
     底图这层不该知道 S.s2day 的存在，所以用回调，不直接依赖。 */
  let spotHoverCb=null;

  function dispose(){
    if(observer) observer.disconnect(); observer=null;
    maps.forEach(m=>m.remove()); maps=[];
    instances.clear();
  }

  /* ---------------- 两条路各自的图层 ---------------- */

  function makeRasterLayer(){
    return L.tileLayer(RASTER_DIR, {
      /* 放大超出 ZMAX 时，Leaflet 会缩放 z14 的瓦片来补——那些瓦片是存在的，
         只是被放大，所以不会出现空白。缩小的方向则不允许（见 render 里的 minZoom）。 */
      maxNativeZoom: ZMAX,
      minNativeZoom: ZMIN,
      maxZoom: 19,
      attribution: ATTRIB,
      errorTileUrl: BLANK
    });
  }

  function makeVectorLayer(slug){
    return protomapsL.leafletLayer({
      url: VECTOR_DIR + slug + '.pmtiles',
      /* flavor 与 lang 必须和 tools/render-tiles.js 烤栅格时用的那套一致
         （见 prototype/_tile-render.html）——两条路画出来才是一种画法。 */
      flavor: 'light',
      lang: 'zh-Hans',
      maxZoom: VECTOR_MAXZOOM,
      attribution: ATTRIB
    });
  }

  /* ------------------------------------------------------------------
     探测后端支不支持 Range。

     PMTiles 是单文件归档，浏览器靠 HTTP Range 只读需要的段。自建后端
     （server.js）能实现，纯静态托管多半不能——**不支持就必须走栅格**，
     否则 pmtiles.js 会退化成整包 GET（单城 9–21MB，打开就是长时间白屏）。

     只发 2 字节的请求，成本可以忽略。结果按归档缓存：一次会话里每城只探一次。
     ------------------------------------------------------------------ */
  const probes = new Map();
  function supportsRange(slug){
    const url = VECTOR_DIR + slug + '.pmtiles';
    if(!probes.has(url)){
      probes.set(url,
        fetch(url, { headers: { Range: 'bytes=0-1' } })
          /* 不是 206 就立刻掐断 body。server.js 还没加 Range 之前，它会对
             这个请求照常返回**整个归档**（单城 9–21MB）——不掐断的话，
             每次打开详情页都白拉一遍。 */
          .then(r => {
            if (r.status !== 206 && r.body && r.body.cancel) r.body.cancel();
            return r.status === 206;
          })
          .catch(() => false));
    }
    return probes.get(url);
  }

  /** 挑一条路。任何一步不满足都退回栅格——宁可糊，不可空。 */
  async function chooseLayer(container){
    const raster = why => ({ layer: makeRasterLayer(), kind: 'raster', why });
    if(MODE === 'raster') return raster('URL 指定 raster');
    const slug = SLUG[container.dataset.city || ''];
    if(!slug) return raster('该城没有矢量归档');
    if(!globalThis.protomapsL || !globalThis.pmtiles) return raster('矢量库未加载');
    if(MODE !== 'vector' && !await supportsRange(slug)) return raster('后端不支持 Range');
    return { layer: makeVectorLayer(slug), kind: 'vector' };
  }

  /* ---------------- 渲染 ---------------- */

  async function render(container){
    const status=container.querySelector('.real-map-status');
    if(!globalThis.L){status.textContent='地图组件未能加载，请刷新页面重试。'; return;}
    let data;
    try {data=JSON.parse(container.dataset.routes);} catch {status.textContent='地图数据不可用。';return;}
    const canvas=container.querySelector('.real-map-canvas');

    const picked=await chooseLayer(container);
    container.dataset.mapEngine=picked.kind;   // 便于核对实际走了哪条路

    /* ★ 视野必须锁在数据覆盖的范围内。
       之前 minZoom 给到 9，结果缩小时 Leaflet 会去取 z9、z10 的瓦片——
       栅格那几级根本没烤（矢量的 bbox 外也没有数据），缩下去就是一片空白，
       而且拖动还能拖到没有任何数据的区域。现在：缩不下去（minZoom = ZMIN），
       也拖不出去（下面按点位范围设 maxBounds）。 */
    const map=L.map(canvas,{
      scrollWheelZoom:false, dragging:true, zoomControl:true,
      minZoom: ZMIN, maxZoom: 19,
      /* 黏度 1 = 拖不动就是拖不动。默认 0 是「能拖出去、松手弹回来」，
         可拖动过程中 Leaflet 照样会去取屏幕外那圈瓦片——弹回来也白搭，
         没数据的那几张已经 404 了。 */
      maxBoundsViscosity: 1
    }); maps.push(map);

    let loaded=0,failed=0;
    const tiles=picked.layer.addTo(map);
    tiles.on('tileload',()=>{loaded++; status.textContent=failed?'部分底图未加载，可重试。':''; status.hidden=!failed;});
    tiles.on('tileerror',()=>{failed++; status.hidden=false; status.textContent=loaded?'部分底图未加载，可重试。':'底图未能加载。';});
    tiles.on('loading',()=>{loaded=0;failed=0;});

    const points=[];
    const dayMarkers=new Map(), dayLines=new Map(), dayPoints=new Map();
    const mode=container.dataset.mapMode||'overview';
    data.forEach((day,di)=>day.forEach((p,i)=>{
      const color=colors[(p.day-1)%colors.length]; points.push([p.lat,p.lng]);
      if(!dayPoints.has(p.day)) dayPoints.set(p.day,[]);
      dayPoints.get(p.day).push([p.lat,p.lng]);
      const marker=L.marker([p.lat,p.lng],{title:`第${p.day}天 · ${p.name}`,icon:L.divIcon({className:'touris-marker',html:`<span style="background:${color}">${p.day}.${i+1}</span>`,iconSize:[34,28],iconAnchor:[17,14]})}).addTo(map);
      if(!dayMarkers.has(p.day)) dayMarkers.set(p.day,[]);
      dayMarkers.get(p.day).push(marker);
      /* 划过地图上的这个点 = 切到这一天（回调出去由 app 改 S.s2day） */
      marker.on('mouseover',()=>{ if(spotHoverCb) spotHoverCb(p.day,p.name); });
      marker.on('mouseout', ()=>{ if(spotHoverCb) spotHoverCb(null,null); });
      const label=document.createElement('div');
      const title=document.createElement('strong');title.textContent=p.name;label.appendChild(title);
      const desc=document.createElement('p');desc.textContent=`第 ${p.day} 天 · 第 ${i+1} 站`;label.appendChild(desc);
      const a=document.createElement('a');a.textContent='在 OpenStreetMap 查看';a.href=`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}`;a.target='_blank';a.rel='noopener noreferrer';label.appendChild(a);
      marker.bindPopup(label);
    }));
    // Dashed connections convey visit order only, not road routing.
    data.forEach(day=>{if(day.length>1){
      const line=L.polyline(day.map(p=>[p.lat,p.lng]),{color:colors[(day[0].day-1)%colors.length],weight:3,dashArray:'6 7'}).addTo(map);
      dayLines.set(day[0].day,line);
    }});
    if(points.length){
      const box=L.latLngBounds(points);
      /* 拖动范围锁在点位外扩 BOUNDS_PAD 度以内——拖出去只有空白，没有意义。
         注意别用 box.pad()：那个参数是**比例**不是度。 */
      map.setMaxBounds(L.latLngBounds(
        [box.getSouth()-BOUNDS_PAD, box.getWest()-BOUNDS_PAD],
        [box.getNorth()+BOUNDS_PAD, box.getEast()+BOUNDS_PAD]
      ));
      map.fitBounds(box,{padding:[26,26],maxZoom:14});
    }
    else {
      /* 当天没有景点，只能按城市中心站住脚。这里也上锁：不然这一天可以
         一路拖到数据范围外面去，同样是满屏空白。锁得紧一点没关系，
         本来就没有东西可看。 */
      const c=JSON.parse(container.dataset.center);
      const cen=L.latLng(c[0],c[1]);
      map.setMaxBounds(L.latLngBounds(
        [cen.lat-BOUNDS_PAD, cen.lng-BOUNDS_PAD],
        [cen.lat+BOUNDS_PAD, cen.lng+BOUNDS_PAD]
      ));
      map.setView(cen, ZMIN);
      status.textContent='当天没有需标记的景点，可切换其他天。';
    }
    container.querySelector('[data-map-retry]').addEventListener('click',()=>{status.hidden=false;status.textContent='正在重新加载底图…';tiles.redraw();});
    map.on('click',()=>map.scrollWheelZoom.enable());
    map.on('mouseout',()=>map.scrollWheelZoom.disable());
    const inst={map,dayMarkers,dayLines,dayPoints,mode};
    instances.set(container,inst);
    applyTo(inst,Number(container.dataset.highlight)||null);
    requestAnimationFrame(()=>map.invalidateSize());
  }

  /* ---------------- 切天 ----------------
     两类图对「当前是第几天」的反应不同：
       mode='overview'  全部点位与连线都在，只把非当天的**淡化**——总览要能一眼看到全城；
       mode='day'       只留当天的线，其余隐藏——它就是「第 N 天动线」。
     视野只有 day 那张跟着走：总览图要是也跟着当天放大，就不叫总览了。 */
  function applyTo(inst,n){
    if(!inst) return;
    const only=inst.mode==='day';
    for(const [day,markers] of inst.dayMarkers){
      const on=!n||day===n;
      markers.forEach(m=>{
        const el=m.getElement(); if(!el) return;
        if(only) el.style.display=on?'':'none';
        else el.style.opacity=on?'':'0.28';
      });
    }
    for(const [day,line] of inst.dayLines){
      const on=!n||day===n;
      line.setStyle({opacity: only ? (on?1:0) : (on?1:0.12)});
    }
    if(only&&n&&inst.dayPoints.get(n)){
      inst.map.fitBounds(L.latLngBounds(inst.dayPoints.get(n)),{padding:[30,30],maxZoom:14});
    }
  }

  /** 切到第 n 天，页面上所有底图一起响应。 */
  function setDay(n){ instances.forEach(inst=>applyTo(inst,n)); }

  function mount(){
    const els=document.querySelectorAll('.real-map');
    if(!els.length)return;
    /* render 现在是 async（要等一次 Range 探测），异常不再像同步函数那样
       抛给调用方——不接住的话只剩一张空地图，什么提示都没有。 */
    const run=el=>{ render(el).catch(e=>{
      const s=el.querySelector('.real-map-status');
      if(s){s.hidden=false;s.textContent='底图渲染失败，可重试。';}
      if(globalThis.console) console.error('[real-maps] 渲染失败',e);
    }); };
    if(typeof IntersectionObserver==='undefined'){els.forEach(run);return;}
    observer=new IntersectionObserver(entries=>entries.forEach(e=>{
      if(e.isIntersecting){observer.unobserve(e.target);run(e.target);}
    }),{root:null,rootMargin:'0px'});
    els.forEach(el=>observer.observe(el));
  }

  globalThis.TourisMaps={
    dispose, mount, setDay,
    /** app 侧注册：鼠标划过地图标记时收到 (day, name)；划出时 day 为 null。 */
    onSpotHover(fn){ spotHoverCb=fn; }
  };
})();
