# 离线矢量瓦片

底图有两条路，**这是矢量那条（首选）**：运行时由 `server.js` 按 HTTP Range
读出需要的段，`protomaps-leaflet` 把矢量画进 canvas——归档含 z0–15 全级别，
所以放大到 z15 依然清晰。见 `prototype/real-maps.js` 的文件头。
另一条是 `../tiles-raster/` 的预烤栅格，在后端不支持 Range 时兜底。

本目录同时是重烤栅格的**前置输入**：`tools/render-tiles.js` 读这里的归档烤出 JPEG。

来自 [Protomaps](https://protomaps.com/) 的每日全球构建包（`build.protomaps.com/20260912.pmtiles`），
按各城市 bbox 用 `pmtiles extract` 提取。

- 底图数据：© [OpenStreetMap](https://www.openstreetmap.org/) contributors，ODbL
- 瓦片构建：Protomaps，明确允许自托管与再分发
- 提取脚本：`tools/fetch-pmtiles.js`
- 提取日期：20260912

| 文件 | 城市 |
| --- | --- |
| `beijing.pmtiles` | 北京 |
| `chengdu.pmtiles` | 成都 |
| `guangzhou.pmtiles` | 广州 |
| `hangzhou.pmtiles` | 杭州 |
| `kyoto.pmtiles` | 京都 |
| `shanghai.pmtiles` | 上海 |
| `weihai.pmtiles` | 威海 |

重新提取：`node tools/fetch-pmtiles.js`
