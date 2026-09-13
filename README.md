# Touris 知途

**记忆驱动的旅行规划原型** —— 路线不是预制的，是当场算出来的；每一条变更都能反查到是哪条记忆改的。

六座城市 · 每城 50+ 候选景点 · 图片与底图全部入库，运行时零外部请求

```bash
npm run serve     # 纯静态，无 LLM 时自动降级为本地算法   → http://localhost:8000
npm start         # 带 LLM 后端（零依赖，Node 18+）        → http://localhost:7860
npm verify        # 回归：候选池 · 规划器 · RAG 硬约束 · 降级路径 · 28 种渲染组合
```

---

## 三块拼图

| | 做成了什么 | 落在哪 |
| --- | --- | --- |
| **实时排线** | 路线由「LLM 提名候选 → 算法排线」现算，不再有手工线路 | `planner.js` + `spots-expansion.js` |
| **RAG 攻略** | 按目的地 / 出发季节 / 天数三道硬约束查相似攻略，再按偏好改编 | `rag.js` + `guides-data.js` |
| **交互正常化** | 预设身份下拉（无注册无密码）、返回键与面包屑、浏览器前进后退、切屏滚动归零 | `app.js` + `account.js` |

## 它怎么算出一条路线

```
需求（目的地 / 日期 / 天数 / 偏好 / 强度）
   │
   ├─ ① RAG 检索           rag.js + guides-data.js
   │     硬约束：城市一致 · 出行月份 ∈ 攻略适合月份 · 天数 ∈ 攻略适配区间
   │     软排序：人文历史/自然风光 + 特种兵/闲庭漫步
   │     LLM 可用 → 按提示词改写；不可用 → 本地模板合成（都标注来源）
   │
   ├─ ② LLM 候选提名        llm.js + server.js（可选）
   │     从 50+ 候选池按记忆偏好提名约 days×5 个
   │     名字必须逐字命中候选池，越界提名整条丢掉（闸门）
   │     没后端 → 退回本地评分，流程不断
   │
   └─ ③ 算法排线            planner.js（核心，纯本地确定性）
         候选池过滤（车站出局、记忆 avoid 出局）
         → 评分排序（兴趣匹配 + 记忆 prefer + LLM 提名加分）
         → 确定性 k-means 分天聚类 + 配额再平衡
         → 日内最近邻 + 2-opt（目标：最小化通勤）
         → 按游玩/通勤时间排时刻表（就近午餐、慢节奏午后休息）
         → 宵禁前放不下的点自动回退丢弃（行为回退）
```

三套风格方案（**暴走打卡 / 均衡探索 / 闲庭漫步**）= 同一引擎跑三档配额。
**「默认版 vs 记忆版」= 引擎跑两次**（0 记忆 vs 全部记忆），diff 由两次结果逐天对齐得出
—— 六座城市走同一套推导，不再有任何手工对照。

## 语义记忆怎么起作用

判断依据是**语义标签**，不是记忆的中文措辞（教训见 `semantics.js` 文件头）：

- 记忆挂 `avoid` / `prefer` / `pace` 标签（如「我晕博物馆」→ `avoid:museum`）；
- 景点的中文标签经单向映射表翻成同一套语义标签，翻不出来的静默无效；
- `constraintsOf()` 聚合所有记忆 → `avoid` 直接出局、`prefer` 加分、`pace` 决定每天点位
  上限与出发时间（**记忆 pace 优先于用户选的强度**——事实压过意愿）；
- 每处取舍都通过 `whoContributes()` 反查到具体记忆 id，界面上的 🧠 可点开源。

三份预置档案给出三种完全不同的推荐：

| 档案 | 脾性 |
| --- | --- |
| **林小满** | 慢节奏 · 晕博物馆 · 爱市集 |
| **陈铁腿** | 特种兵 · 博物馆控 · 要夜景 |
| **周晚晚** | 自然派 · 怕人多 · 日落刚需 |

## 目录结构

**前端本体 `prototype/`**（纯静态，所有改动只改这里）

| 路径 | 说明 |
| --- | --- |
| `semantics.js` | 语义词表 + 景点中文标签映射（记忆 → 推荐的唯一通道） |
| `data.js` | 反馈规则表 + 三份预置身份档案 |
| `city-*.js` | 城市资料（`city-data` / `city-expansion` / `city-hangzhou-guangzhou` / `city-chengdu`）：餐饮候选、住宿、攻略来源、权威坐标 |
| `coords.js` | 景点经纬度（WGS-84）—— 统一给缺坐标的城市补上 |
| `spots-expansion.js` | **候选景点扩充包**：每城补到 50+（坐标/游玩时长/标签），并做归一化 |
| `budget-data.js` | 预算数据：门票档位 + 住宿价位区间 |
| `planner.js` | **算法排线引擎**：聚类 / 2-opt / 时刻表 / 回退 / 默认版 vs 记忆版 diff |
| `guides-data.js` | RAG 攻略语料（每城 6 篇，带月份/天数/风格/强度元数据）+ 季节天气口径 |
| `rag.js` | RAG 检索（硬约束过滤 + 软打分）与本地合成 |
| `llm.js` | LLM 客户端：超时、缓存、闸门、降级 |
| `account.js` | 预置身份与会话（游客不落盘；localStorage 可用时记忆跨会话保留） |
| `app.js` | 渲染与交互（屏幕状态机 `home/s0/guide/s1/s2/s5/generating`） |
| `styles.css` `styles-extra.css` `home.css` `logo.css` `account.css` | 样式 |
| `images.js` | 景点配图映射（**由 `tools/fetch-images.js` 生成，勿手改**） |
| `img/` `assets/` | 景点照片，全部下载入库；署名见 `img/CREDITS.md` |
| `real-maps.js` `real-maps.css` | Leaflet 底图挂载 —— 两条路自动选，离线、零外部请求 |
| `vendor/leaflet/` | Leaflet 1.9.4（BSD-2-Clause），本地加载，不依赖 CDN |
| `tiles/` | **矢量底图（首选）**：PMTiles 归档 z0–15，运行时由后端按 HTTP Range 读 |
| `tiles-raster/` | **栅格底图（回退）**：构建期预烤的 z11–14 JPEG，后端不支持 Range 时用 |
| `_verify.js` `_imgcheck.js` `_tile-render.html` | 自检与构建期工具，**不发布到 Pages** |

**后端与工具**

| 路径 | 说明 |
| --- | --- |
| `server.js` | 薄后端（零依赖）：静态托管 + LLM 候选/攻略接口 + 健康检查 |
| `tools/` | 构建脚本：图片抓取（`fetch-images`）、景点配图搜索（`search-expansion-images`）、底图预烤（`fetch-pmtiles` → `render-tiles`）、`llm-ping` 自检 |
| `docs/cities/` | 城市素材的来源与许可记录 · 历史验证记录 |
| `sync-pages.sh` | 镜像 `prototype/` 到 gh-pages 分支并推送（`--check` 只比对） |

> `gh-pages` 分支是发布产物，不要手改；由 `./sync-pages.sh` 从 `prototype/` 生成。

## 本地运行

```bash
npm run serve     # 方式一：纯静态（无 LLM，前端自动降级为本地算法）
npm start         # 方式二：带 LLM 后端（零依赖，Node 18+）
```

后端环境变量（只放服务端，创空间配在 Secrets）：

| 变量 | 说明 |
| --- | --- |
| `DASHSCOPE_API_KEY` | 百炼 API Key，各地域不通用 |
| `DASHSCOPE_BASE_URL` | 形如 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` |
| `DASHSCOPE_MODEL` | 可选，默认 `qwen-plus` |
| `LLM_TIMEOUT_MS` | 可选，默认 8000 |

**没配 Key 一切照常**：候选提名退回本地评分、攻略退回本地模板，生成流水线第 2 步会如实
标注「未接入大模型服务」—— 路演当天服务挂了不开天窗。

```bash
npm run llm:ping  # 真打一次接口，失败时打印 HTTP 状态与排查方向
```

### LLM 三重闸门（为什么「大模型碰不到行程」）

1. **提示词层** —— 候选名单只来自真实数据，`name` 必须与候选表逐字一致；
2. **服务端 `gate()`** —— 逐字段查类型、查候选池，越界提名整条丢掉；
3. **客户端再闸** —— `llm.js` 按同样的规则过滤一遍，结构不对整体降级。

模型只**提名**景点、只**改编**检索到的攻略；路线排序、时间表、diff 全部由 `planner.js`
的确定性算法产出 ——「每条变更都能反查到哪条记忆」这条不断。

## 支持城市

**北京 · 上海 · 广州 · 杭州 · 成都 · 威海**（每城 50+ 可排线候选景点，2—7 天）

- **坐标口径**：杭州/广州/成都来自 Wikidata/OSM（可逐条核对），扩充景点为公开资料整理，
  统一标注「出行前核对」；车站类只作地图参照，不参与排线。
- **底图有两条路**，运行时自动选：
  - 首选**矢量** —— 后端按 HTTP Range 读出 `tiles/` 里的 PMTiles 归档，
    `protomaps-leaflet` 画进 canvas，归档含 z0–15 全级别；
  - 拿不到 Range 就回退**栅格** —— 预烤的 `tiles-raster/*.jpg`。

  两条路都是运行时零外部请求。署名见 `tiles/CREDITS.md` 与 `tiles-raster/CREDITS.md`。

## 交互约定

- **身份切换**：顶栏头像 → 下拉选 游客 / 林小满 / 陈铁腿 / 周晚晚。
  没有注册和密码（纯静态原型，localStorage 只存演示数据，请勿填真实信息）。
- **返回**：顶栏「←」返回上一屏；面包屑可跳任意环节；浏览器后退键等效。
- **切屏滚动归零**：修复了首页下滑后点「规划」停在中部的问题。
- **可溯源**：S1/S2/S5 里每个 🧠 标签都可点开，显示「哪条记忆 → 什么变化」。
- **全屏演示**：详情页 / 对照页按 `F`。

## 回归验证

| 命令 | 查什么 |
| --- | --- |
| `npm verify` | 候选池完整性 · 规划器 648 种组合 · RAG 硬约束 · 身份播种 · LLM 降级路径 · 桩 DOM 实跑 28 种渲染组合 |
| `npm run imgcheck` | 图片引用是否都真的落地（离线；未配图的景点只计数，不算失败） |

## LOGO

原始素材 `TOURIS.png`（知途 + TOURIS 中英组合）已遗失，但由它生成的三个位图变体完整保留在
`prototype/logo.css`（`--logo-mark` / `--logo-word` / `--logo-lock`，data URI 内联、离线可用）。
顶栏与首屏使用完整中英组合 `--logo-lock`。
