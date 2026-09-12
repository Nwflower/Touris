# 旅行记忆规划

以「记忆」为护城河的旅行规划产品原型。核心叙事是让记忆**可见、可溯源、可对比**——一键开关记忆，直接看出推荐结果的差异。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `旅行记忆规划-Web界面设计方案.md` | 界面与交互设计方案（信息架构、屏次、优先级） |
| `prototype/` | **原型开发目录**。高保真可交互原型，纯静态前端 |
| `gh-pages` 分支 | **发布产物，不要手改**。GitHub Pages 的实际源（已核实：线上内容与该分支逐字节一致），由 `sync-pages.sh` 从 `prototype/` 生成 |
| `app/` | 模块化重构（独立工作流，不参与发布同步） |
| `server/` | 薄后端：静态托管 `app/` + 语义翻译接口（零依赖，只用 Node 内置模块） |
| `tools/` | 冒烟测试、种子抽取、大模型联调自检 |

> 所有改动只改 `prototype/`。仓库根目录**不再保留**发布副本——Pages 从 `gh-pages` 分支发布，根目录留一份只会造成双向漂移（历史上已因此出现过线上白屏）。

## 发布到 GitHub Pages

改完 `prototype/` 后，一条命令发布：

```bash
./sync-pages.sh          # 镜像 prototype/ 到 gh-pages 并推送
./sync-pages.sh --check  # 只比对，不写入、不推送
```

脚本会把 `prototype/` 下全部内容（含 `img/` 等资源目录）镜像到 `gh-pages` 分支根目录并推送，新增文件无需改脚本。排除 `_verify.js` 测试脚本。

> **不要**去改 `gh-pages` 分支上的文件，下次发布会覆盖。

## 本地运行

原型是纯静态页面，直接打开即可：

```bash
# 方式一：直接打开
start prototype/index.html

# 方式二：起本地服务（推荐，避免部分浏览器的本地文件限制）
python -m http.server 8000 --directory prototype
# 然后访问 http://localhost:8000
```

## 原型文件

- `index.html` — 两栏骨架（左栏：需求摘要 + 记忆资产 + 本次用到的记忆 + 流程导航；右侧：主工作区）
- `app.js` — 渲染与交互逻辑
- `data.js` — 演示数据（记忆条目、行程、点评）
- `city-data.js` — 北京、上海、杭州、威海城市资料（方案、四日行程、景点、餐饮住宿与地图点位）
- `images.js` — 图片资源映射
- `styles.css` / `styles-extra.css` / `home.css` / `logo.css` / `account.css` — 样式
- `account.js` — 账号面板（纯本地 localStorage 演示，无后端）

## 支持城市

目的地输入框支持从 `京都`、`北京`、`上海`、`杭州`、`威海`、`广州` 中选择。每个城市都有独立的方案、行程、景点资料、餐饮住宿候选和地图点位。

### 杭州、广州 MVP 素材包

新增杭州、广州，每城 3 套固定 **2 日**路线、6 个景点、当地照片和攻略参考（各含 3 篇小红书笔记）。可从首页快捷入口、目的地卡片或需求表单进入。选择的方案会对应到详情与记忆对照页。

资料和维护说明见 [城市素材文档](docs/cities/README.md)。新增数据文件为 `prototype/city-hangzhou-guangzhou.js`，图片位于 `prototype/assets/cities/`。地图仍是路线示意，票价、预约和交通需出行前核对。

回归验证：`cd prototype && node _verify.js`。

## 大模型接入（语义翻译）

`app/` 原本只能从 39 个固定的原因标签里学偏好——也就是说，**系统只能学会它已经会的东西**。接入大模型后多了一条路：用户自己写一句话，系统把它翻译成**已有的**语义标签。

### 它做什么、不做什么

| | |
| --- | --- |
| 做 | 把开放原话翻译成 `SEMANTICS` 里已有的标签（`pace` / `avoid` / `prefer`） |
| **不做** | 决定行程。路线依旧由 `memory/derive.js` 从记忆推导，大模型碰不到 |

这条界线就是产品护城河的位置：一旦让大模型直接排行程，「每条变更都能反查到哪条记忆」就断了，「100% 可溯源」会降级成「大概可溯源」。

翻不出来时**如实返回空数组**——宁可没记住，也不假装学会了什么。

### 跑起来

```bash
npm start            # 带语义翻译后端，默认 http://localhost:7860
npm run serve        # 纯静态、没有后端；入口自动隐藏，其余功能完全不变
```

后端要两个环境变量，**只放服务端**（创空间配在 Secrets 里）：

| 变量 | 说明 |
| --- | --- |
| `DASHSCOPE_API_KEY` | 百炼 API Key，各地域不通用 |
| `DASHSCOPE_BASE_URL` | 形如 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` |
| `DASHSCOPE_MODEL` | 可选，默认 `qwen3.8-flash` |
| `LLM_TIMEOUT_MS` | 可选，默认 6000 |

```bash
# Bash
DASHSCOPE_API_KEY=sk-xxx \
DASHSCOPE_BASE_URL=https://xxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1 \
npm start
```

### 三重闸门

模型的输出**从来不直接变成记忆**：

1. `response_format` 的 strict schema —— 约束输出形状。方便，但**不是**保证（官方文档写了非思考模式模型在思考态下可能静默失效）
2. `server/interpret.js` 的 `gate()` —— **真正的保证**。逐字段查词汇表，越界标签整条丢掉，不静默剔除后放行
3. `Archive.remember()` —— 最终只认闸门放行的那几条

词汇表只有一份：服务端用 `vm` 直接读 `app/data/memory.js`，不另抄。所以它不可能和 `derive.js`、`validate.js` 认的那份漂移。

### 降级

没配 key / 超时 / 返回垃圾 → 接口返回 `degraded`（HTTP 200，不是错误），前端提示「从上面的原因里选一个」。那张手写的 `REASON_TO_MEMORY` 表既是提示词里的范例，也是这里的兜底——**路演当天不怕服务不可用**。

### 联调自检

```bash
npm run llm:ping                      # 用默认例句
npm run llm:ping -- "这里人太多了"     # 指定句子
```

它真打一次接口、**不吞错**：失败时把 HTTP 状态和响应体原样打出来，并逐项给出排查方向（不支持 `json_schema` 怎么办、Key 与地域不匹配、base_url 写错等）。

> 文档能确认参数名，确认不了**你的**账号和地域。`response_format: {type:"json_schema"}` 与请求体里那个 `temperature: 0` 是否被接受，跑一次 `npm run llm:ping` 就知道。

### 测试

```bash
npm test        # 含服务端闸门（真调用 server/interpret.js）与前端接线（假 fetch）
```

闸门那部分不需要网络，也不需要 API Key。
