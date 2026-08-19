<p align="center">
  <img src="packages/frontend/public/sprites/logo.svg" alt="RoboFarm" width="520" />
</p>

<p align="center">
  <b>基于 TypeScript 编程的回合制农场经营游戏</b>
</p>

## 目录

- [简介](#简介)
- [核心玩法](#核心玩法)
- [架构](#架构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [常用命令](#常用命令)
- [生产部署](#生产部署)
- [API 参考](#api-参考)
- [环境变量](#环境变量)
- [玩家程序约束](#玩家程序约束)
- [设计文档](#设计文档)

## 简介

`RoboFarm` 是一个以 **玩家编程** 为核心的农场经营游戏。  

你需要编写 `Typescript` 控制农业无人机，在限定的场地和回合数内，通过合理种植农作物，并利用农作物的布局与自身特殊性质来实现最大化收益。

你可以在游戏内 ***右侧边栏*** 看到全部的无人机 API, 作物信息与规则。

游戏也提供全部的 **MCP** 功能与 **后端API**, 允许通过 Agent 或自动程序快速迭代农业策略。


## 核心玩法

游戏内置了两个游戏模式: 

### 单人种植

在该模式下，你初始获得 1 架无人机和一个固定的地图。你需要通过编程, 在 **500 个回合** 内尽可能多地种植作物赚取金钱。

**地块类型、位置、作物种类、水源** 均会对策略产生影响。  
例如，部分作物需要*多次浇水*，否则停止生长。最好将他们种植在水源附近，方便无人机就近取水。


### 多人竞技

在该模式下，你初始获得 2 架无人机和一个对称的固定地图。

除了尽可能挣得更多金钱，你还可以悄悄光顾对方的田地，摘下其播种的果实; 亦或是种植作物，干扰对方的运营体系。  
但对方并非赤手空拳: **"拦截"** 操作会将你的非法所得悉数回收。


## 架构

项目采用 npm workspaces 组织，包含三个包：

```
packages/
  shared/    游戏核心 (纯 TypeScript, 零平台依赖): 地图与作物注册表、回合引擎、
             玩家 API、坐标镜像、esbuild-wasm 编译、GameController 回合编排
  backend/   Express + node:sqlite + ws: GitHub OAuth、单人验证与排行榜、
             竞技房间与 WebSocket 直播、回放存储、MCP 服务器
  frontend/  Vite + CodeMirror 6 + Canvas: 各模式界面、本地执行 (Web Worker 沙箱)
```

- 玩家代码经 esbuild-wasm 编译为统一产物，前端与后端共用同一份实现执行，保证行为一致。
- 单人种植在前端本地执行；提交排行榜时由后端在沙箱中重新执行验证。
- 竞技模式由服务器按固定节奏推演（双方各自坐标系，P2 为镜像），每回合事件经 WebSocket 推送。

## 环境要求

- Node.js >= 24（使用内置 `node:sqlite`，启动时输出 ExperimentalWarning，可忽略）
- npm >= 10

## 快速开始

```bash
npm install

# 终端 1: 增量编译共享包 (修改 shared 源码后需重新构建, 亦可保持 tsc -w 运行)
npm run dev:shared

# 终端 2: 启动后端 (默认端口 3001)
npm run dev:backend

# 终端 3: 启动前端开发服务器 (默认端口 5173, 已配置代理到后端)
npm run dev:frontend
```

访问 http://localhost:5173 。

未配置 GitHub OAuth 时，后端进入**开发模式**，所有请求自动以 `local-dev` 身份登录。如需启用真实登录，将 `packages/backend/.env.example` 复制为 `.env` 并填写 `GITHUB_CLIENT_ID` 与 `GITHUB_CLIENT_SECRET`。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 依次构建 shared → backend → frontend |
| `npm run package` | 构建并生成可独立部署的 `release/` 目录（前端产物 + 后端单文件 + 启动脚本） |
| `npm test` | 运行 shared 与 backend 的全部测试（vitest） |
| `npm run typecheck` | 对所有包执行 `tsc --noEmit` |
| `npm run dev:shared` | 共享包增量编译（tsc -w） |
| `npm run dev:backend` | 后端热重载（tsx watch） |
| `npm run dev:frontend` | 前端开发服务器（vite） |
| `npm run build -w @robofarm/backend` | 构建后端（含 runner.worker.js 打包） |
| `npm run build -w @robofarm/frontend` | 构建前端（自动复制 esbuild.wasm 至 public/） |
| `node scripts/verify-browser-sandbox.js` | 验证浏览器沙箱机制（Node 环境模拟） |

## 生产部署

### 方式一：独立发布包（推荐）

执行 `npm run package` 生成完全自包含的 `release/` 目录。目标机器仅需安装 Node.js >= 24，无需 `npm install`：

```
release/
  server.cjs                后端单文件 (内嵌 esbuild-wasm, 进程内编译玩家代码)
  esbuild.wasm              玩家代码编译所需 wasm
  runner/runner.worker.js   玩家代码沙箱 (worker_threads)
  public/                   前端构建产物 (由后端静态托管, 单端口访问)
  start.sh / start.cmd      启动脚本 (Linux / Windows)
  .env.example              环境变量示例
```

部署步骤：

```bash
# 将 release/ 目录拷贝至目标机器, 然后执行:
./release/start.sh                # 默认监听 http://localhost:3001
PORT=8080 ./release/start.sh      # 指定端口

# GitHub OAuth 配置: 在启动目录创建 .env (参考 release/.env.example), 或直接设置环境变量;
# .env 与 data.db 均基于启动时的工作目录 (pwd) 解析
```

### 方式二：Docker 容器

项目提供多阶段构建的 `Dockerfile`，单端口（默认 3001）暴露全部服务：前端页面、后端 API、MCP（`POST /mcp`）与 WebSocket 直播。

```bash
docker build -t robofarm:1.0.1 .
docker run -d -p 3001:3001 -v robofarm-data:/data robofarm:1.0.1
```

- **数据持久化**：容器内 `/data` 为数据卷挂载点。`data.db` 与 `.env` 均基于启动时工作目录（`/data`）生成，挂载 `-v 卷:/data` 即可持久化与备份；使用 bind mount 时需确保宿主目录对容器内 `node` 用户（UID 1000）可写。
- **配置注入**：通过环境变量或挂载至 `/data/.env` 的配置文件提供（容器环境变量优先）。

### 方式三：源码直接运行

适用于开发或自托管场景：

```bash
npm run build
cd packages/backend
node dist/index.js        # 自动托管 packages/frontend/dist
```

### GitHub OAuth 配置

1. 在 GitHub → Settings → Developer settings → OAuth Apps 中创建应用。
2. Homepage URL 填写 `http://<域名>`。
3. Authorization callback URL 填写 `http://<域名>/auth/github/callback`。
4. 设置环境变量 `GITHUB_CLIENT_ID` 与 `GITHUB_CLIENT_SECRET`；部署于独立域名时另行设置 `GITHUB_REDIRECT_URI`（默认按请求 Host 自动推导）。
5. 未配置时进入开发模式，所有请求自动以 `local-dev` 登录，仅适用于本机调试。

### esbuild.wasm 分离部署

`esbuild.wasm` 体积较大，可部署于独立服务器（如 CDN），通过环境变量 `ESBUILD_WASM_URL` 指定其完整 URL：

- 后端启动时从该地址下载 wasm 并用于进程内编译；下载失败自动回退至本地文件。
- 前端启动时通过 `GET /config` 获取该地址，浏览器端编译改为远程加载；未配置时保持同源 `/esbuild.wasm`。

### MCP 服务器

后端内置 MCP 服务器，向接入的 AI Agent 提供游戏 API 文档与后端接口调用能力（内容与前端手册同源于 `packages/shared/src/docs.ts`）。

**接入方式（HTTP，streamable HTTP）**：

- Claude Desktop：将 MCP 服务器地址配置为 `http://<host>:3001/mcp`。
- 或使用 `npx mcp-remote http://<host>:3001/mcp`。

界面内展示的接入地址默认与前端同源（`/mcp`）；前后端分离部署时，可通过前端环境变量 `VITE_MCP_BASE` 覆盖。

**提供的能力**：

- 文档资源：`robofarm://docs/{overview|operations|functions|types|crops|rules|all}`（Markdown）。
- 文档工具：`list_docs` / `get_doc(section)` / `get_crop(crop)` / `get_map(mode)`。
- 认证：`login_start` / `login_finish`（会话令牌自动随请求携带）。
- 通用代理：`api_call`（任意 method + path + body）。
- 后端接口封装：`single_validate` / `single_validate_status` / `single_history` / `single_leaderboard` / `single_replay(id)`，`combat_state` / `combat_upload` / `combat_list` / `combat_start(opponentId)` / `combat_room` / `combat_history` / `combat_replay(id)`。
- Prompt：`write_player_code`（编写玩家程序的指引模板）。

## API 参考

### 前端路由（hash 路由；开发默认 http://localhost:5173，发布版与后端同端口）

| 路由 | 页面 |
| --- | --- |
| `#/` 或 `#/menu` | 主菜单 |
| `#/single` | 单人种植 |
| `#/simulate` | 模拟竞技 |
| `#/match` | 多人竞技匹配 |
| `#/battle?opponentId=:id` | 多人对战（挑战指定玩家） |
| `#/battle?roomId=:id&spectate=1` | 观战指定房间 |
| `#/replay?id=:matchId` | 对局回放 |
| `#/spectate` | 观战房间列表 |
| `#/api-docs` | API 文档 |

### 后端 HTTP（默认 http://localhost:3001）

**认证**

| 方法 / 路径 | 说明 |
| --- | --- |
| `GET /auth/github` | 跳转 GitHub OAuth 授权页（未配置 client id 时进入开发模式） |
| `GET /auth/github/callback` | OAuth 回调，建立会话并跳回前端 |
| `GET /auth/me` | 当前登录用户 `{ user: { id, name, dev } }`；未登录返回 401 |

**单人种植**（除排行榜与配置外均需登录）

| 方法 / 路径 | 说明 |
| --- | --- |
| `GET /single/leaderboard` | 排行榜，按大版本分 Tab：`{ tabs: [{ version, entries: [{ name, score, me }] }] }` |
| `POST /single/validate` | 提交代码验证 `{ code }`；已有任务在运行或并发受限时返回 409 |
| `GET /single/validate` | 验证状态 `{ busy, progress, score, error }` |
| `GET /single/history` | 当前用户的提交历史 |
| `GET /single/replay/:id` | 回放文件（仅本人） |

**竞技模式**（均需登录）

| 方法 / 路径 | 说明 |
| --- | --- |
| `GET /combat/state` | 出战代码与战绩 `{ code, wins, losses }` |
| `POST /combat/upload` | 上传出战代码 `{ code }`（胜败清零） |
| `GET /combat/list` | 可挑战玩家列表（排除自己） |
| `POST /combat/start` | 发起对战 `{ id }` → `{ roomId }` |
| `GET /combat/room` | 进行中的房间列表（观战） |
| `GET /combat/history` | 历史对局 |
| `GET /combat/replay/:id` | 回放数据（仅对局双方） |

**公共端点**

| 方法 / 路径 | 说明 |
| --- | --- |
| `GET /config` | 运行时配置 `{ esbuildWasmUrl }`（前端启动时拉取） |
| `GET /llm.txt` | 全部游戏文档拼接（LLM 可直接抓取） |
| `GET /api-docs` | 后端 API 文档（Markdown） |

**WebSocket**

| 地址 | 说明 |
| --- | --- |
| `WS /ws/combat/room/:roomId` | 对战直播；消息类型：`match-start` / `replay-buffer` / `turn { turn, events }` / `match-end { matchId, result }` / `error` |

**MCP**

| 方式 | 地址 |
| --- | --- |
| HTTP（streamable HTTP） | `POST /mcp`（会话经 `Mcp-Session-Id` 头管理；`GET` 返回 405，`DELETE` 关闭会话） |

## 环境变量

### 后端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | 3001 | 服务端口 |
| `HOST` | 所有网卡 | 绑定地址 |
| `DB_PATH` | `data.db`（相对启动目录） | SQLite 文件路径 |
| `FRONTEND_DIST` | 自动探测 | 前端静态目录（发布版为 `release/public/`，源码为 `frontend/dist/`） |
| `FRONTEND_ORIGIN` | 请求 Host 推导 | OAuth 登录后的跳转地址 |
| `BACKEND_ORIGIN` | 请求 Host 推导 | OAuth redirect_uri 前缀 |
| `GITHUB_REDIRECT_URI` | `{BACKEND_ORIGIN}/auth/github/callback` | OAuth 回调地址 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 空 | 未配置时进入开发模式 |
| `ESBUILD_WASM_URL` | 空 | esbuild.wasm 远程地址（分离部署时配置） |
| `TURN_INTERVAL_MS` | 800 | 竞技对战回合间隔（毫秒） |
| `SINGLE_MAX_CONCURRENT` | 按 CPU 核心数, 上限 32 | 单人验证全局并发上限 (每个验证一个 worker_thread)，超限返回 409 |
| `SINGLE_SUBMIT_LIMIT_PER_MIN` | 0（不限流） | 单人验证每用户每分钟提交上限，超限返回 429 |

### 前端（`packages/frontend/.env`）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_MCP_BASE` | 同源 `/mcp` | MCP 服务器地址（前后端分离部署时覆盖） |

## 玩家程序约束

- 必须定义 `function run(droneId: number): DroneOperation`；每回合对每架无人机调用一次，返回操作类实例或 `null`。
- 单次 `run()` 执行时限为 ***400ms***；超时、内存超限或运行时报错将导致本局以失败结果提前结束。
- 沙箱内屏蔽网络、系统与异步 API（如 `fetch`、`setTimeout`），无法逃逸回合控制。
- 编译阶段不做类型检查（esbuild 仅剥离类型注解），类型错误将在运行时暴露。