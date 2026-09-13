# 城市素材：来源、许可与编辑入口

六城（北京 · 上海 · 广州 · 杭州 · 成都 · 威海）的候选景点、坐标、照片与攻略来源记录。
产品侧的算法与交互说明见顶层 `README.md`；本目录只负责**素材从哪来、许可是什么、改哪里**。

## 编辑入口

- `prototype/spots-expansion.js`：候选景点扩充包，每城补到 50+（坐标 / 游玩时长 / 标签），
  并做归一化（poi 由 geo 反算、餐饮锚点、center）。
- `prototype/city-data.js` / `city-expansion.js` / `city-hangzhou-guangzhou.js` / `city-chengdu.js`：
  餐饮候选、住宿、攻略来源、权威坐标。
- `prototype/coords.js`：WGS-84 权威坐标表。
- `prototype/real-maps.js` / `real-maps.css`：Leaflet 地图挂载、销毁、懒加载、标记、弹窗、按天编号。
- `prototype/vendor/leaflet/`：Leaflet 1.9.4 与 BSD-2-Clause 许可，本地加载，不依赖 JS CDN。
- `multi-day-guides.md`：按天编排及参考来源。
- `new-image-credits.json`：新增照片作者、许可证、原图页面和下载地址。
- `image-manifest.json`：原 13 张贡献者照片；作者及许可仍未提供，不与新增开放许可图片混淆。

## 天数与方案

目的地卡片默认 4 天，表单提供 2—7 天。路线**不是预制线路**——每城 50+ 候选景点，
由「LLM 提名候选 → 算法排线」实时算出（见顶层 `README.md`）。三套风格方案
（暴走打卡 / 均衡探索 / 闲庭漫步）是同一引擎跑三档配额；减少赶场、大型综合馆偏好
和午后休息规则保持有限、可溯源。外部作者的偏好不写入用户记忆。

## 地图与坐标

底图有**两条路，运行时自动选一条**——`prototype/real-maps.js` 的文件头是权威说明，
**改动前先读它**：

- **矢量（首选）**：后端按 HTTP Range 读出 `prototype/tiles/*.pmtiles` 里的段，
  `protomaps-leaflet` 把矢量画进 canvas。归档含 z0–15 全级别，放大到 z15 依然清晰。
  需要 `server.js` 提供 Range；拿不到就走下一条。
- **栅格（回退）**：构建期预烤的 `prototype/tiles-raster/{z}/{x}/{y}.jpg`（z11–14），
  纯静态托管下也能跑，代价是层级固定、放大靠拉伸。

两条路都是运行时零外部请求。选型经过与理由见 `tiles/CREDITS.md` 与
`tiles-raster/CREDITS.md`；底图重烤走 `tools/fetch-pmtiles.js` → `tools/render-tiles.js`。
URL 上加 `?map=raster` / `?map=vector` 可临时强制走哪条，方便对比。

坐标为景点区域参考位置，非入口。杭州/广州/成都来自 Wikidata/OSM（可逐条核对），
扩充景点为公开资料整理，统一标注「出行前核对」；车站类只作地图参照，不参与排线。
植物园等大区域使用区域中心；西湖标记为湖区参考点，不是步行起点。
未来接国内地图服务时须处理 WGS84/GCJ-02 差异，不能直接混用。修正证据见 `research/selected-osm.json`。

## 发布与验证

仅编辑 `prototype/`。发布由 `./sync-pages.sh` 镜像到 gh-pages 分支并推送，
根目录不再保留发布副本；PR 阶段跑 `./sync-pages.sh --check` 只比对不推送。

```bash
cd prototype && node _verify.js   # 六城候选池完整性 · 规划器组合 · RAG 硬约束 ·
                                  # 身份播种 · LLM 降级路径 · 桩 DOM 渲染
npm run imgcheck                  # 图片引用核对
```

真实底图、缩放拖动、照片视觉及断网表现另外做浏览器验证，不能靠 DOM 桩断言替代。
历史验证记录见 `verification.md`。
