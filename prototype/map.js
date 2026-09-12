/* ==========================================================================
   Touris 知途 · 离线地图模块

   用 maplibre-gl 渲染本地 PMTiles 矢量瓦片，全程不访问外部网络。

   为什么必须走 HTTP 而不是双击打开：
     PMTiles 是单文件归档，前端靠 HTTP Range 只读「需要的那一段」；
     且 maplibre 需要 module worker。这两样在 file:// 下都不可用。
     → 本地预览用 `node tools/tile-server.js 8080 tiles`。
     → 若检测到 file://，本模块不报错，改为显示一条可操作的提示。

   依赖（均在本地，无 CDN）：
     vendor/maplibre-gl.mjs + Worker     地图渲染
     vendor/pmtiles.js                   PMTiles 协议
     vendor/basemaps.js                  Protomaps 底图样式
     style-patch.js                      往字体栈末尾追加 CJK 字体做逐字回退
     tiles/<city>.pmtiles                四座城市的矢量瓦片
     map-assets/fonts|sprites            字形与图标

   坐标来自 coords.js；未查证到的点不会画，也不猜。
   ========================================================================== */
(function (global) {
  'use strict';

  const VENDOR = 'vendor/';
  const TILES  = 'tiles/';
  const ASSETS = 'map-assets/';

  /* 城市 → 瓦片文件、初始视野 */
  const CITY = {
    '京都': { file: 'kyoto.pmtiles',    center: [135.7750, 35.0000], zoom: 12 },
    '北京': { file: 'beijing.pmtiles',  center: [116.4500, 40.0500], zoom: 11 },
    '上海': { file: 'shanghai.pmtiles', center: [121.4250, 31.2000], zoom: 11 },
    '成都': { file: 'chengdu.pmtiles',  center: [103.9500, 30.7750], zoom: 11 }
  };

  const state = {
    map: null,
    gl: null,          // maplibre 模块
    container: null,
    city: null,
    markers: [],
    ready: false,
    failed: null       // 失败原因，用于展示降级提示
  };

  const abs = p => new URL(p, location.href).href;

  /* ---------------- 加载 maplibre（只加载一次） ---------------- */
  let glPromise = null;
  let protocol = null;

  function loadGL() {
    if (glPromise) return glPromise;
    glPromise = (async () => {
      if (!global.pmtiles) throw new Error('pmtiles 未加载');
      const gl = await import(abs(VENDOR + 'maplibre-gl.mjs'));
      // PMTiles 协议只注册一次
      if (!protocol) {
        protocol = new global.pmtiles.Protocol();
        gl.addProtocol('pmtiles', protocol.tile);
      }
      state.gl = gl;
      return gl;
    })();
    return glPromise;
  }

  /* ---------------- 样式 ---------------- */
  function makeStyle(city) {
    const c = CITY[city];
    const layers = global.basemaps.layers('protomaps', global.basemaps.namedFlavor('light'), { lang: 'zh-Hans' });
    if (typeof global.patchFontstack === 'function') {
      global.patchFontstack({ layers });
    }
    return {
      version: 8,
      glyphs: abs(ASSETS + 'fonts/{fontstack}/{range}.pbf'),
      sprite: abs(ASSETS + 'sprites/light'),
      sources: {
        protomaps: {
          type: 'vector',
          url: 'pmtiles://' + abs(TILES + c.file),
          attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>'
        }
      },
      layers
    };
  }

  /* ---------------- 打点与连线 ---------------- */
  function clearOverlay() {
    state.markers.forEach(m => { try { m.remove(); } catch (e) {} });
    state.markers = [];
    if (state.map && state.map.getLayer('touris-route')) {
      try {
        state.map.removeLayer('touris-route');
        state.map.removeSource('touris-route');
      } catch (e) {}
    }
  }

  /**
   * points: [{ name, lng, lat, label, kind }]  kind: spot | food | free
   */
  function drawOverlay(points, opts) {
    const gl = state.gl, map = state.map;
    if (!map || !gl) return;

    /* 动线 */
    if (points.length > 1) {
      const fc = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: points.map(p => [p.lng, p.lat]) }
      };
      const src = map.getSource('touris-route');
      if (src) src.setData(fc);
      else {
        map.addSource('touris-route', { type: 'geojson', data: fc });
        map.addLayer({
          id: 'touris-route', type: 'line', source: 'touris-route',
          paint: { 'line-color': '#C4622D', 'line-width': 2, 'line-dasharray': [2, 1.6], 'line-opacity': 0.85 }
        });
      }
    }

    /* 点位 */
    points.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'tmk tmk-' + (p.kind || 'spot');
      el.innerHTML = `<span>${i + 1}</span>`;
      if (p.label) el.title = p.label;
      const marker = new gl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.lng, p.lat]);
      if (p.label) {
        marker.setPopup(new gl.Popup({ offset: 16, closeButton: false }).setText(p.label));
      }
      marker.addTo(map);
      state.markers.push(marker);
    });

    /* 视野：有动线就框住全部点，否则回到城市默认视野 */
    if (opts && opts.fit && points.length) {
      const b = new gl.LngLatBounds();
      points.forEach(p => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: 46, maxZoom: 14, duration: 400 });
    }
  }

  /* ---------------- 对外接口 ---------------- */
  const TourisMap = {
    /** file:// 下不可用——由调用方决定怎么提示 */
    supported() { return location.protocol !== 'file:'; },

    /** 当前城市是否有查证过的坐标 */
    hasCity(city) { return !!(global.COORD && global.COORD[city] && Object.keys(global.COORD[city]).length); },

    coord(city, name) {
      const c = global.COORD && global.COORD[city];
      const v = c && c[name];
      return Array.isArray(v) && v.length === 2 ? { lng: v[0], lat: v[1] } : null;
    },

    /**
     * 挂载地图。containerId 指向一个空 div。
     * 返回 Promise；失败不抛，写入 state.failed 供界面降级。
     */
    async init(containerId, city, points, opts) {
      const el = document.getElementById(containerId);
      if (!el) return false;

      if (!this.supported()) {
        state.failed = 'file';
        return false;
      }
      if (!global.pmtiles || !global.basemaps) {
        state.failed = 'vendor';
        return false;
      }
      if (!CITY[city]) {
        state.failed = 'city';
        return false;
      }

      try {
        const gl = await loadGL();
        state.city = city;

        if (state.map && state.container === containerId) {
          // 复用同一个实例：只换数据与视野
          state.map.resize();
          clearOverlay();
          drawOverlay(points || [], opts);
          return true;
        }

        if (state.map) { state.map.remove(); state.map = null; }

        state.map = new gl.Map({
          container: containerId,
          style: makeStyle(city),
          center: CITY[city].center,
          zoom: CITY[city].zoom,
          attributionControl: false,
          dragRotate: false
        });
        state.container = containerId;
        state.map.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
        state.map.addControl(new gl.AttributionControl({ compact: true }), 'bottom-right');
        state.map.on('error', e => { state.failed = (e && e.error && e.error.message) || 'map error'; });

        await new Promise(res => {
          if (state.map.loaded()) return res();
          state.map.once('load', res);
        });
        state.ready = true;
        drawOverlay(points || [], opts);
        return true;
      } catch (err) {
        state.failed = (err && err.message) || 'init failed';
        return false;
      }
    },

    /** 只换数据，不重建地图 */
    update(points, opts) {
      if (!state.map || !state.ready) return;
      clearOverlay();
      drawOverlay(points || [], opts);
    },

    /** 释放实例（切到非地图页时调用） */
    destroy() {
      clearOverlay();
      if (state.map) { try { state.map.remove(); } catch (e) {} }
      state.map = null;
      state.container = null;
      state.ready = false;
    },

    get failedReason() { return state.failed; },
    get isReady() { return state.ready; }
  };

  global.TourisMap = TourisMap;
})(typeof window !== 'undefined' ? window : this);
