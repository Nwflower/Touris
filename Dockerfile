# Touris 知途 · ModelScope Studio（Docker）
#
# ★ 为什么比 Skill 的 Node 模板少两步
#
# 模板是：
#     FROM node:18 / WORKDIR / COPY / RUN npm install / RUN npm run build / EXPOSE 7860 / CMD npm start
#
# 那两步对本项目都不适用：
#   · server.js 是**零依赖单文件**，package.json 里没有 dependencies，npm install 什么也装不了
#   · **没有构建步骤**，`npm run build` 会因为 package.json 里没有 build 脚本而直接失败
# 所以裁掉。构建因此只有「拉基础镜像 + COPY」，本项目的 Docker 构建应当是分钟级的。
#
# ★ 端口
# Studio 要求 0.0.0.0:7860（8080 被平台占用）。server.js 默认就是 7860，
# 并在 listen 时显式绑 0.0.0.0，不依赖 Node 省略 host 时的默认行为。
#
# ★ 密钥
# DASHSCOPE_API_KEY / DASHSCOPE_BASE_URL 一律走 Studio 的 **Secrets**，
# 不写进镜像、不写进这个文件、不进 git。没配也能跑——server.js 会优雅降级，
# 前端自动回落到本地路径，功能不全断。
FROM node:18
WORKDIR /home/user/app
COPY ./ /home/user/app
EXPOSE 7860
CMD ["node", "server.js"]
