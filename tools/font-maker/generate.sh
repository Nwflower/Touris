#!/usr/bin/env bash

# ⚠️ 已下线（第 0 代地图方案）
# 本工具服务于早期的 MapLibre + PMTiles 离线底图，配套的 tiles/ 与 tiles/assets/
# 已在 2026-09-13 的仓库整理中删除，现在没有任何引用。
# 现行方案是构建期预烤栅格——见 prototype/tiles-raster/CREDITS.md 与
# prototype/real-maps.js 的文件头。重启矢量方案前不要使用本工具。
# 生成 CJK 字形 PBF。前置：先构建镜像
#   docker build -t touris-font-maker tools/font-maker
#
# 产物原本落在 tiles/assets/fonts/Noto Sans SC/ 下，与 Protomaps 的字体并排（该目录已随第 0 代方案删除）。
# 样式里靠 style-patch.js 把 "Noto Sans SC" 追加到每个字体栈末尾做逐字回退。
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT="$(pwd)/tiles/assets/fonts"
mkdir -p "$OUT"

echo "输出目录: $OUT"
echo "开始生成（CJK 字符集较大，可能需要几分钟）…"

docker run --rm \
  -v "$OUT:/out" \
  touris-font-maker \
  --name "Noto Sans SC" /out /font/NotoSansSC-Regular.otf

echo
echo "=== 产物 ==="
D="$OUT/Noto Sans SC"
if [ ! -d "$D" ]; then
  echo "未生成目录：$D" >&2
  exit 1
fi

TOTAL=$(du -sb "$D" | cut -f1)
COUNT=$(find "$D" -name '*.pbf' | wc -l)
echo "分片数: $COUNT"
echo "总体积: $((TOTAL / 1048576)) MiB"

# 关键校验：汉字区间必须非空。Protomaps 这边是 29 字节的空 stub，
# 如果我们生成的也是这个尺寸，说明字体没被正确读取，别急着往下走。
CJK="$D/19968-20223.pbf"
if [ ! -f "$CJK" ]; then
  echo "缺少汉字区间 $CJK —— 生成失败" >&2
  exit 1
fi
SZ=$(wc -c < "$CJK")
echo "汉字首区间 19968-20223: $SZ 字节"
if [ "$SZ" -lt 1000 ]; then
  echo "汉字区间过小（$SZ 字节），字形未生成成功" >&2
  exit 1
fi
echo "校验通过。"
