/* ==========================================================================
   Touris 知途 · 景点经纬度（WGS-84）

   为什么单独一个文件：
 * city-data.js 里北京/上海/威海由 makeCity() 从配置对象产出，
     杭州/广州的坐标由 city-hangzhou-guangzhou.js 从 CITY_EXPANSION 取。四处格式各异。
     本文件在最后统一给缺坐标的城市补上，不动上述任一文件的既有结构。

   覆盖范围：
 * 北京 21 · 上海 21 等（此前三城没有坐标，真实地图接不上，回退成示意图）
     威海 17（该城原本 geo 完全为空）
     杭州/广州在 city-expansion.js 已有完整坐标，这里不重复。

   坐标口径：
     - 区域/街道类（先斗町、西阵、三里屯、武康路…）取代表中心，不取某个门牌
     - 公园类取 OSM 公园多边形质心，故 颐和园/北海公园 会落在水面上；要"落脚点"请改用大门
     - 威海点位跨度很大：刘公岛为近海岛屿，成山头/那香海/海驴岛/鸡鸣岛/荣成海草房
       均在荣成或海上，离市区 30–65 km，不是市区内散点
     - 经 OSM(Nominatim/Overpass) 与 Wikidata P625 交叉核对，非凭记忆填写

   未收录：威海「猫头山」—— OSM 与维基均无对应条目，查不到就不写，
   地图上少一个点，好过打错位置。

   与既有 geo 的字段对齐：按城市可整体覆盖 source，个别点位可单独标注。
   ========================================================================== */
(function () {
  'use strict';

  const SRC_OSM = 'https://www.openstreetmap.org/';
  const SRC_WIKI = 'https://zh.wikipedia.org/wiki/';
  const NOTE = '景点参考位置，非入口导航';

  /* 写法一：[纬度, 经度]  —— 写成直观顺序，输出时转成 {lat,lng}
     写法二：{ ll:[纬度,经度], src:'…' } —— 个别点位需要单独标注来源时用 */
  const DATA = {  };

  /* 转成既有 geo 的字段格式；兼容 [lat,lng] 与 {ll,src} 两种写法 */
  function toGeo(list) {
    const out = {};
    Object.keys(list).forEach(name => {
      const raw = list[name];
      const ll = Array.isArray(raw) ? raw : raw.ll;
      if (!Array.isArray(ll) || ll.length !== 2) return;   // 查不到的条目直接跳过
      out[name] = {
        lat: ll[0],
        lng: ll[1],
        source: (Array.isArray(raw) ? SRC_OSM : (raw.src || SRC_OSM)),
        coordinateSystem: 'WGS84',
        note: NOTE
      };
    });
    return out;
  }

  const GEO = {};
  Object.keys(DATA).forEach(city => { GEO[city] = toGeo(DATA[city]); });

  /* 挂到已建好的城市对象上；已有 geo 的城市（杭州/广州）不覆盖，
     但缺项会被补齐 —— 它们的坐标更全，这里只做加法。 */
  const target = (typeof globalThis !== 'undefined' && globalThis.CITY_DATA) || null;


  /* 威海点位跨度 30–65 km（市区 / 近海岛屿 / 荣成海岸），按平均质心算出的
     center 会落在海上，所以显式给市区中心；真正的视野由 fitBounds 决定。 */
  if (target && target['威海']) {
    target['威海'].center = [37.5044, 122.1046];   // 环翠楼（市区）
  }

  if (target) {
    Object.keys(GEO).forEach(city => {
      const c = target[city];
      if (!c) return;
      c.geo = Object.assign({}, GEO[city], c.geo || {});  // 既有值优先
      if (!c.center) {
        const pts = Object.keys(c.geo).map(n => c.geo[n]);
        if (pts.length) {
          c.center = [
            pts.reduce((a, p) => a + p.lat, 0) / pts.length,
            pts.reduce((a, p) => a + p.lng, 0) / pts.length
          ];
        }
      }
    });
  }

  /* 暴露出来便于校验脚本直接比对本表与各城市实际生效的 geo */
  globalThis.TOURIS_GEO = GEO;
})();
