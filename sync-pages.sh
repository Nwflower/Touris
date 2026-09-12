#!/usr/bin/env bash
# ==========================================================================
# Touris 知途 · 发布同步
#
# 单一开发目录: prototype/     ← 所有改动只在这里做
# 发布目标:     仓库根目录      ← GitHub Pages 的入口，由本脚本生成，不要手改
#
# 用法:
#   ./sync-pages.sh          同步
#   ./sync-pages.sh --check  只比对，不写入
#
# 注意: app/ (模块化重构) 不在同步范围内。
# ==========================================================================
set -euo pipefail

cd "$(dirname "$0")"
SRC=prototype
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

# 需要发布到根目录的文件；_verify.js 是测试脚本，不发布
FILES=(
  index.html
  app.js
  data.js
  city-data.js
  images.js
  account.js
  styles.css
  styles-extra.css
  home.css
  logo.css
  account.css
)

missing=0
for f in "${FILES[@]}"; do
  [ -f "$SRC/$f" ] || { echo "缺少源文件: $SRC/$f"; missing=1; }
done
[ "$missing" = 1 ] && { echo "同步中止。"; exit 1; }

changed=0
for f in "${FILES[@]}"; do
  if [ -f "$f" ] && cmp -s "$SRC/$f" "$f"; then
    [ "$CHECK" = 1 ] && echo "  相同  $f"
  else
    changed=$((changed + 1))
    if [ -f "$f" ]; then echo "  更新  $f"; else echo "  新增  $f"; fi
    [ "$CHECK" = 0 ] && cp -f "$SRC/$f" "$f"
  fi
done

if [ "$changed" = 0 ]; then
  echo "根目录已是最新，无需同步。"
elif [ "$CHECK" = 1 ]; then
  echo "以上 $changed 个文件待同步（--check 未写入）。"
else
  echo "已同步 $changed 个文件到根目录。"
  echo "提交并推送后 GitHub Pages 即更新: git add -A && git commit -m 'chore: 同步发布' && git push"
fi
