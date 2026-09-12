# 离线矢量瓦片

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
