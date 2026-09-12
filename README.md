# 旅行记忆规划

以「记忆」为护城河的旅行规划产品原型。核心叙事是让记忆**可见、可溯源、可对比**——一键开关记忆，直接看出推荐结果的差异。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `旅行记忆规划-Web界面设计方案.md` | 界面与交互设计方案（信息架构、屏次、优先级） |
| `prototype/` | **唯一开发目录**。高保真可交互原型，纯静态前端 |
| 仓库根目录（`index.html` 等） | **发布产物，不要手改**。GitHub Pages 的入口，由 `sync-pages.sh` 从 `prototype/` 生成 |
| `app/` | 模块化重构（独立工作流，不参与发布同步） |

> 所有改动只改 `prototype/`。根目录那套是复制出来的发布副本，直接编辑会被下次同步覆盖。

## 发布到 GitHub Pages

改完 `prototype/` 后，一条命令同步到根目录：

```bash
./sync-pages.sh          # 同步
./sync-pages.sh --check  # 只比对，不写入
```

然后提交推送，Pages 即更新：

```bash
git add -A && git commit -m "chore: 同步发布" && git push
```

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
- `city-data.js` — 北京、上海城市资料（方案、四日行程、景点、餐饮住宿与地图点位）
- `images.js` — 图片资源映射
- `styles.css` / `styles-extra.css` / `home.css` / `logo.css` / `account.css` — 样式
- `account.js` — 账号面板（纯本地 localStorage 演示，无后端）

## 支持城市

目的地输入框支持从 `京都`、`北京`、`上海` 中选择。每个城市都有独立的三套方案、默认/记忆版四日行程、景点资料、餐饮住宿候选和地图点位。
