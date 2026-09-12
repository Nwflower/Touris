# 杭州、广州多日攻略与真实地图

杭州18个景点、广州21个景点；每城三种主题，每种支持2—7日，合计36个城市/主题/天数组合。保留原13张照片，新增27张有作者与许可记录的照片。

## 编辑入口

- `prototype/city-expansion.js`：新增点位、WGS84坐标、逐点来源、图片署名、七日主题安排及补充攻略来源。
- `prototype/city-hangzhou-guangzhou.js`：原有素材、按所选天数取路线、日期计算和有限记忆规则。
- `prototype/real-maps.js` / `real-maps.css`：Leaflet地图挂载、销毁、懒加载、标记、弹窗、按天编号及加载失败提示。
- `prototype/vendor/leaflet/`：Leaflet 1.9.4和BSD-2-Clause许可，本地加载，不依赖JS CDN。
- `multi-day-guides.md`：按天编排及参考来源。
- `new-image-credits.json`：新增照片作者、许可证、原图页面和下载地址。详情页及攻略来源区域均提供署名入口。
- `image-manifest.json`：原13张贡献者照片；作者及许可仍未提供，不与新增开放许可图片混淆。

## 天数与方案

首页搜索、快捷入口使用所选天数；目的地卡片默认4天；表单提供2—7天。每种主题按片区安排七个具体游览日，取前N天组成N日行程。短线突出主题，长线增加深度片区；同一行程不重复景点。三方案在2—4日时，两两交集不超过较大方案点位数的70%，长线允许共享城市地标。

选择方案后，详情和对照都以该方案为基准。减少赶场、大型综合馆偏好和午后休息规则保持有限、可溯源；调整点位不减少天数。外部作者的偏好不写入用户记忆。

## 地图与坐标

Leaflet使用OpenStreetMap真实底图；只为可见地图请求瓦片，遵守浏览器缓存，不提供离线下载或批量预取。保留显式署名、正常Referer，支持拖动、缩放和景点弹窗。虚线仅表达游览顺序，**不是实际道路导航**，不生成未经核验的交通耗时。瓦片受网络可达性影响，失败时有提示、重试和外部地图入口。

地图默认配置可在加载real-maps.js之前设置 `globalThis.TOURIS_MAP_CONFIG={tileUrl,attribution,maxZoom}`，便于后续换为适合正式流量的地图服务。不要将服务端密钥写进静态前端。

坐标为景点区域参考位置，非入口。Wikidata/Wikipedia数据和OSM具名区域交叉核对，发现多馆区/旧馆位置时明确馆区；修正证据见research/selected-osm.json。植物园等大区域使用区域中心；西湖标记为湖区参考点，不是步行起点。未来接国内地图服务时须处理WGS84/GCJ-02差异，不能直接混用。

地图技术与政策参考：[Leaflet快速开始](https://leafletjs.com/examples/quick-start/)、[OSM瓦片使用政策](https://operations.osmfoundation.org/policies/tiles/)。

## 发布与验证

仅编辑prototype/。团队已改为由 `./sync-pages.sh` 镜像到 gh-pages 分支并推送，根目录不再保留发布副本。PR 阶段仅运行 `./sync-pages.sh --check` 检查待发布文件，合并后由维护者发布。

`cd prototype && node _verify.js` 覆盖原三城回归、新两城全部36个行程组合、日期、方案重复度、无重复/空白日、记忆变化、地图数据与图片引用。真实底图、缩放拖动、照片视觉及断网提示另外做浏览器验证，不能靠DOM桩断言替代。
