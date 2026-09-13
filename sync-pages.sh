#!/usr/bin/env bash
# ==========================================================================
# Touris 知途 · 发布到 GitHub Pages
#
#   单一开发目录  prototype/      ← 所有改动只在这里做
#   Pages 源      gh-pages 分支    ← 本脚本推送到这里，不要手改
#
# 用法:
#   ./sync-pages.sh          发布（写入 gh-pages 并推送）
#   ./sync-pages.sh --check  只比对，不写入、不推送
#
# 同步方式: 把 prototype/ 下的全部内容镜像到 gh-pages 分支根目录
#          （含 img/ 等资源目录；新增文件无需改本脚本）
#           排除: _*.js 与 _*.html（测试与构建期工具）、以及 node 相关产物
#
# 背景: 仓库里曾有三处副本（根目录 / gh-pages 根 / gh-pages 内嵌 prototype/），
#       彼此独立演进导致线上白屏。现统一为「改 prototype/ → 跑本脚本」单向发布。
#
# 注意: app/ (模块化重构) 不在发布范围内。
# ==========================================================================
set -euo pipefail

cd "$(dirname "$0")"

SRC=prototype
BRANCH=gh-pages
WT=.gh-pages-worktree
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

[ -d "$SRC" ] || { echo "找不到源目录: $SRC"; exit 1; }

# 清理上次异常中断留下的 worktree 目录
git worktree prune
[ -d "$WT" ] && rm -rf "$WT"

git fetch origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" --quiet
git worktree add --detach "$WT" "origin/$BRANCH" --quiet

# 从源目录镜像到 worktree
sync_tree(){
  local dst="$1"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude='.git' --exclude='_*.js' --exclude='_*.html' --exclude='node_modules/' --exclude='.DS_Store' \
      "$SRC"/ "$dst"/
  else
    # 没有 rsync 时退化为逐项复制。
    # ★ 目录必须先删再拷：`cp -rf src/x dst/x` 在 dst/x 已存在时是把 src/x
    #   拷**进** dst/x，会变成 dst/x/x。gh-pages 上已经有 img/ 和 assets/ 了，
    #   所以这里每次发布都会多套一层，而多出来的那层是空的——页面照常打开，
    #   图片全 404，很难查。删掉再拷同时也还原了 rsync 的镜像语义。
    for p in "$SRC"/*; do
      b="$(basename "$p")"
      case "$b" in _*.js|_*.html|node_modules) continue;; esac
      if [ -d "$p" ]; then rm -rf "$dst/$b"; cp -rf "$p" "$dst/$b"; else cp -f "$p" "$dst/$b"; fi
    done
    # 同上，对齐 rsync 的 --delete：源里被排除的文件也要从目标清掉。
    # 否则早期发布过的 _verify.js / _imgcheck.js / _tile-render.html 会一直挂在 Pages 上——
    # 测试与构建期工具没必要公开，而且它们一旦落后于源码就开始骗人。
    for stale in "$dst"/_*.js "$dst"/_*.html "$dst"/node_modules; do
      if [ -e "$stale" ]; then echo "  清理  $(basename "$stale")"; rm -rf "$stale"; fi
    done
  fi
}
sync_tree "$WT"

# gh-pages 里内嵌的 prototype/ 是早期误提交的冗余副本（Pages 只服务根目录），清掉
if [ -d "$WT/prototype" ]; then
  echo "  清理  内嵌 prototype/（冗余副本）"
  [ "$CHECK" = 0 ] && rm -rf "$WT/prototype"
fi

cd "$WT"

# ★ 先 add 再判断，不要用 git status 判断有没有改动。
#   镜像刚用 cp 覆盖过这些文件，mtime 是"现在"，git 会把这些文件报成已修改
#   （racy timestamp）。据此判断会得出"有 6 项待发布"，而紧接着 git add -A
#   刷新内容后发现无差异、commit 报 nothing to commit——配合 set -e，脚本就
#   会在 worktree remove 之前中止，留下一个游离的 worktree。
git add -A
if git diff --cached --quiet; then
  echo "gh-pages 已是最新，无需发布。"
  cd ..
  git worktree remove --force "$WT"
  exit 0
fi

echo "=== 待发布变更 ==="
git diff --cached --name-status | head -20
git diff --cached --name-only | wc -l | xargs -I{} echo "  共 {} 项"

if [ "$CHECK" = 1 ]; then
  echo "（--check 未写入、未推送）"
  cd ..
  git worktree remove --force "$WT"
  exit 0
fi

git commit -q -m "deploy: 同步 prototype/ 到 Pages ($(date '+%Y-%m-%d %H:%M'))"
git push origin HEAD:"$BRANCH" 2>&1 | tail -2
cd ..
git worktree remove --force "$WT"
echo "发布完成。Pages 通常 1 分钟内更新。"
