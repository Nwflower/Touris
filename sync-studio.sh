#!/usr/bin/env bash
# ==========================================================================
# Touris 知途 · 发布到魔搭创空间（Docker 类型）
#
#   单一开发目录  仓库根 + prototype/
#   发布目标      魔搭创空间 Nwflower/Touris 的 master 分支
#
# 用法:
#   ./sync-studio.sh                 推代码 + 触发部署 + 轮询到 Running
#   ./sync-studio.sh --check         只比对，不推、不部署
#   ./sync-studio.sh --no-deploy     只推代码
#   ./sync-studio.sh secrets         只配 LLM 的 Secrets（需先设好三个环境变量）
#
# 前置:
#   export MODELSCOPE_API_KEY=ms-...     魔搭访问令牌（创空间读写）
#   git / curl / node 可用
#
# --------------------------------------------------------------------------
# ★ 为什么不能复用 sync-pages.sh
#
# 两者要的**目录布局是相反的**：
#   gh-pages（Static）: prototype/ 的内容要摊在分支根目录——根目录必须有 index.html
#   Docker            : 根目录是 server.js / Dockerfile / package.json，
#                       prototype/ 必须是**子目录**（server.js 里 ROOT = __dirname/prototype）
# 所以这里单独一个脚本。改哪边都别顺手去改另一个。
#
# ★ 为什么排除 prototype/tiles/
#
# 那 108MB 的 .pmtiles 运行时无人加载（底图走 tiles-raster/*.jpg），塞进镜像纯属浪费。
# **但它不是垃圾**：它是 tools/render-tiles.js 重烤底图的构建输入，必须留在本地仓库与
# gh-pages 那边，只是不进创空间。要重烤底图时它还在。
# ==========================================================================
set -euo pipefail

cd "$(dirname "$0")"

OWNER=Nwflower
REPO=Touris
STUDIO="$OWNER/$REPO"
BRANCH=master
WT=.ms-studio-worktree
ENDPOINT="${MODELSCOPE_ENDPOINT:-https://www.modelscope.cn}"

# 发布到创空间的东西。静态托管只服务 prototype/（见 server.js 的 ROOT），
# 所以根目录只需要后端与镜像定义这几个文件。
ROOT_FILES=(server.js package.json Dockerfile .dockerignore)

MODE=deploy
case "${1:-}" in
  --check)     MODE=check ;;
  --no-deploy) MODE=push  ;;
  secrets)     MODE=secrets ;;
  "")          ;;
  *) echo "未知参数: $1"; exit 1 ;;
esac

need_token(){
  if [ -z "${MODELSCOPE_API_KEY:-}" ]; then
    cat >&2 <<'EOF'
缺少 MODELSCOPE_API_KEY。

  1) 到 https://modelscope.cn/my/myaccesstoken 取访问令牌
  2) export MODELSCOPE_API_KEY=ms-xxxx
     然后重跑本脚本

创空间需要「读写」权限的令牌；API-Inference 那种「仅供推理」的令牌推不了代码。
EOF
    exit 1
  fi
}

# --------------------------------------------------------------------------
# 只配 Secrets：LLM 的三个变量
# --------------------------------------------------------------------------
if [ "$MODE" = secrets ]; then
  need_token
  : "${LLM_API_KEY:?请先 export LLM_API_KEY（魔搭访问令牌，用于 API-Inference）}"
  : "${LLM_BASE_URL:?请先 export LLM_BASE_URL（默认 https://api-inference.modelscope.cn/v1）}"
  : "${LLM_MODEL:?请先 export LLM_MODEL（魔搭 Model-Id，如 Qwen/Qwen3-235B-A22B）}"

  # ★ 一律进 Secrets，不进明文变量：
  #   LLM_API_KEY 是凭证；LLM_BASE_URL 里可能带 WorkspaceId，同样算敏感。
  #   Secrets 只写不读（列表接口只回 key），所以配完这里查不到值，属正常。
  put_secret(){
    local key="$1" val="$2"
    # 先试新增，已存在则改成更新
    if curl -sS --max-time 30 -X POST "$ENDPOINT/openapi/v1/studios/$STUDIO/secrets" \
         -H "Authorization: Bearer $MODELSCOPE_API_KEY" -H "Content-Type: application/json" \
         -d "$(node -e 'process.stdout.write(JSON.stringify({key:process.argv[1],value:process.argv[2]}))' "$key" "$val")" \
       | grep -q '"success":true'; then
      echo "  新增 secret  $key"
    else
      curl -sS --max-time 30 -X PUT "$ENDPOINT/openapi/v1/studios/$STUDIO/secrets" \
        -H "Authorization: Bearer $MODELSCOPE_API_KEY" -H "Content-Type: application/json" \
        -d "$(node -e 'process.stdout.write(JSON.stringify({key:process.argv[1],value:process.argv[2]}))' "$key" "$val")" \
        | grep -q '"success":true' && echo "  更新 secret  $key" || { echo "  ✗ $key 配置失败" >&2; exit 1; }
    fi
  }

  echo "=== 配置 Secrets（值不会被回显）==="
  put_secret LLM_API_KEY  "$LLM_API_KEY"
  put_secret LLM_BASE_URL "$LLM_BASE_URL"
  put_secret LLM_MODEL    "$LLM_MODEL"
  echo
  echo "已配置。改 Secrets 需要重新部署才生效，接着跑一次 ./sync-studio.sh"
  exit 0
fi

# --------------------------------------------------------------------------
# ★ 关于魔搭账号登录（OAuth）
#
# 这一节不需要在这里配任何东西：OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET /
# OPENID_PROVIDER_URL / STUDIO_ID / STUDIO_HOST 都由**平台注入**，
# 前提是在创空间设置里开启了 OAuth。
#   · 没开 → server.js 的 OAUTH_ON 为 false，界面只显示预设身份，其余功能照旧
#   · 改了 OAuth 设置 → 要重新部署才生效（所以改完记得重跑本脚本）
#   · client secret 轮换会让已登录的会话全部失效（会话签名密钥由它派生），
#     这是有意的：不额外多一个要维护的 SESSION_SECRET
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# 推代码
# --------------------------------------------------------------------------
need_token
# 清掉上一次的残留。
# ★ `git worktree prune` 处理不了「已注册但目录已失」这一种（这正是上次报
#   `fatal: '.ms-studio-worktree' is a missing but already registered worktree`
#   把 add 挡下来的原因）：prune 清的是 .git/worktrees 里的**陈旧记录**，
#   而那条记录在它看来是新的。所以先显式注销，再删目录，最后才 prune。
git worktree remove --force "$WT" 2>/dev/null || true
rm -rf "$WT"
git worktree prune

git fetch modelscope "$BRANCH" --quiet 2>/dev/null || {
  echo "取不到 modelscope remote，先配一个："
  echo "  git remote add modelscope https://oauth2:\$MODELSCOPE_API_KEY@${ENDPOINT#https://}/studios/$STUDIO.git"
  exit 1
}
git worktree add --detach "$WT" "modelscope/$BRANCH" --quiet

# 清空旧内容，只留 .git* 与创空间自己的 README（那是空间说明，不属于本项目源码）
( cd "$WT" && find . -maxdepth 1 -mindepth 1 ! -name '.git*' ! -name 'README.md' -exec rm -rf {} + )

# 根目录文件
for f in "${ROOT_FILES[@]}"; do
  [ -f "$f" ] || { echo "缺少 $f"; exit 1; }
  cp -f "$f" "$WT/$f"
done

# prototype/ 整棵镜像过去。
# ★ tiles/ （108MB 的 PMTiles 归档）**必须带上**：底图首选矢量那条路，
#   浏览器靠 HTTP Range 只读归档里的段，而 Range 由 server.js 提供（已实现）。
#   曾一度把它排除过——那是误判，见 real-maps.js 文件头。
mkdir -p "$WT/prototype"
( cd prototype && for p in *; do
    cp -rf "$p" "../$WT/prototype/$p"
  done )

# 目录必须先删再拷（cp -rf src/x dst/x 在 dst/x 存在时是拷**进**去，会多套一层）
# —— 上面已整目录清空，这里不会踩到；保留此注记以免以后有人改成增量拷贝。

echo "=== 镜像完成，共 $(find "$WT" -type f -not -path '*/.git/*' | wc -l) 个文件，$(du -sh "$WT" 2>/dev/null | cut -f1) ==="

cd "$WT"
git add -A
if git diff --cached --quiet; then
  echo "创空间已是最新，无需推送。"
  cd .. && git worktree remove --force "$WT"
  [ "$MODE" = check ] && exit 0
  echo "（仍然触发一次部署，确保在跑）"
else
  echo "=== 待发布变更 ==="
  git diff --cached --name-status | head -20
  git diff --cached --name-only | wc -l | xargs -I{} echo "  共 {} 项"
  if [ "$MODE" = check ]; then
    echo "（--check 未推送）"
    cd .. && git worktree remove --force "$WT"
    exit 0
  fi
  git commit -q -m "deploy: 同步到创空间 ($(date '+%Y-%m-%d %H:%M'))"
  git push modelscope HEAD:"$BRANCH" 2>&1 | tail -3
fi
cd ..
git worktree remove --force "$WT"

[ "$MODE" = push ] && { echo "只推送，未部署。"; exit 0; }

# --------------------------------------------------------------------------
# 触发部署并轮询
# --------------------------------------------------------------------------
echo
echo "=== 触发部署 ==="
curl -sS --max-time 60 -X POST "$ENDPOINT/openapi/v1/studios/$STUDIO/deploy" \
  -H "Authorization: Bearer $MODELSCOPE_API_KEY" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{try{const j=JSON.parse(s);console.log('  '+(j.success?'已触发，状态 '+((j.data||{}).status||'?'):'失败: '+s.slice(0,200)));}catch(e){console.log('  '+s.slice(0,200));}});"

status_of(){
  curl -sS --max-time 30 "$ENDPOINT/openapi/v1/studios/$STUDIO" -H "Authorization: Bearer $MODELSCOPE_API_KEY" \
    | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{try{process.stdout.write(JSON.parse(s).data.status)}catch(e){process.stdout.write('?')}});"
}

echo "=== 轮询（Docker 构建通常 3–5 分钟）==="
# Docker 类型：先看 build 日志，构建过再看 run 日志
for i in $(seq 1 40); do
  S=$(status_of)
  echo "  [$i] $(date +%H:%M:%S)  $S"
  case "$S" in
    Running) echo "  ✓ 部署成功"; break ;;
    Failed|Error|Stopped)
      echo "  ✗ 失败，build 日志末尾："
      curl -sS --max-time 40 "$ENDPOINT/openapi/v1/studios/$STUDIO/logs/build" -H "Authorization: Bearer $MODELSCOPE_API_KEY" \
        | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{try{((JSON.parse(s).data||{}).logs||[]).slice(-25).forEach(l=>console.log('     '+String(l).slice(0,160)));}catch(e){console.log(s.slice(0,300))}});"
      exit 1 ;;
  esac
  sleep 20
done

echo
echo "=== run 日志末尾 ==="
curl -sS --max-time 40 "$ENDPOINT/openapi/v1/studios/$STUDIO/logs/run" -H "Authorization: Bearer $MODELSCOPE_API_KEY" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{try{((JSON.parse(s).data||{}).logs||[]).slice(-12).forEach(l=>console.log('  '+String(l).slice(0,170)));}catch(e){console.log(s.slice(0,300))}});"

echo
echo "空间页   $ENDPOINT/studios/$STUDIO"
echo "访问地址 https://$(echo "$STUDIO" | tr 'A-Z' 'a-z' | tr '/' '-').ms.show"
echo
echo "注意：空间若是 private，外部访问会 403（Unauthorized）——路演前记得公开。"
