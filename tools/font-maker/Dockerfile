# 用 maplibre/font-maker 把 NotoSansSC 转成 MapLibre 的 SDF 字形 PBF。
#
# 为什么需要这个：Protomaps 的 basemaps-assets 只提供拉丁/西里尔/阿拉伯/天城文等
# 语种字形，官方生成脚本里没有 NotoSansSC —— 汉字区间实测是空的 29 字节 stub。
# 所以中文地名渲染不出来，必须自己生成一套 CJK 字形。
#
# 构建依赖来自 font-maker 的 CI 配方（.github/workflows/actions.yml）：
#   clang + Boost>=1.73 + Freetype + 四个递归子模块
#
# 用法：
#   docker build -t touris-font-maker -f tools/font-maker/Dockerfile .
#   docker run --rm -v "%CD%\tiles\assets\fonts:/out" touris-font-maker \
#     --name "Noto Sans SC" /out /font/NotoSansSC-Regular.otf

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git \
      cmake make clang \
      libboost-dev libboost-iostreams-dev \
      libfreetype-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# NotoSansSC 静态实例（Regular 400）。取自 noto-cjk 的简体中文子集。
# 用静态 OTF 而非 Google Fonts 的可变字体，避免字形生成器取到错误的默认实例。
RUN mkdir -p /font && curl -sSL --retry 3 --retry-delay 2 -o /font/NotoSansSC-Regular.otf \
      https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf \
    && test -s /font/NotoSansSC-Regular.otf

# CMakeLists.txt 把编译器硬编码成 /usr/bin/clang，依赖这个路径
WORKDIR /src
RUN git clone --depth 1 --recursive --shallow-submodules \
      https://github.com/maplibre/font-maker.git . \
    && test -d vendor/sdf-glyph-foundry/include \
    && cmake . && make -j"$(nproc)" \
    && test -x /src/font-maker

WORKDIR /work
ENTRYPOINT ["/src/font-maker"]
