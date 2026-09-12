# 离线栅格底图

本目录下的瓦片是**构建期预渲染**的产物，运行时不访问任何外部服务。

## 来源

- 底图数据：© [OpenStreetMap](https://www.openstreetmap.org/) contributors，[ODbL](https://opendatacommons.org/licenses/odbl/)
- 瓦片构建：[Protomaps](https://protomaps.com/) 每日全球构建包（`build.protomaps.com`），
  明确允许自托管与再分发
- 覆盖城市：京都、北京、上海、杭州、广州、威海、成都

## 生成方式

```bash
node tools/fetch-pmtiles.js     # 从 Protomaps 构建包按 bbox 提取矢量归档
node tools/render-tiles.js      # 用无头 Chromium 渲染成 JPEG 瓦片
```

两步都需要 Docker。第一步只下载 bbox 范围内的数据（约 20MB/城，而非整个 138GB 的包）。

## 规格

- 缩放层级：z11–14（运行时用 Leaflet 的 `minNativeZoom` / `maxNativeZoom` 在范围外缩放补齐）
- 尺寸：256×256 JPEG，质量 0.82
- 目录结构：`{z}/{x}/{y}.jpg`（Web Mercator，坐标全局唯一，七城共用一棵树）

## 为什么是 JPEG 而不是 PNG

底图不是线条图——路网、标注、建筑轮廓的细节密度很高，无损压不动
（实测 PNG 每张约 46KB，JPEG 约 14KB）。在这个尺寸下标签边缘的振铃肉眼看不出来，
体积降到三分之一，对仓库和加载都更友好。

## 为什么烤成栅格而不是直接用矢量

PMTiles 是单文件归档，浏览器要靠 **HTTP Range** 只读需要的段。部署目标是
魔搭创空间的 Static 类型，它支不支持 Range 没人测过，也没法先部署一次试。
烤成独立文件之后，Range 这个依赖整个消失，也不需要任何后端。
