# RoboFarm

编程类农场游戏: 玩家编写 TypeScript 控制无人机, 在限定回合内赚取最多金钱。
支持单人种植 (排行榜) 与多人竞技 (偷菜/拦截, 服务器推演直播)。每局初始资金 20 金钱。
特色机制: 能量 (充能与行/列范围操作)、沙地地块 (生长周期 ×1.5)。

详细设计见 [`agent/`](agent/AGENT.md) (游戏规则 `GAME.md` / 前端 `FRONTEND.md` / 后端 `BACKEND.md`)。

## 架构

```
packages/
  shared/    游戏核心 (纯 TS): 地图/作物注册表、回合引擎、玩家 API、
             坐标镜像 (竞技双方各自坐标系)、esbuild-wasm 编译、GameController 编排
  backend/   Express + node:sqlite + ws: GitHub OAuth、单人验证与排行榜、
             竞技房间与 WebSocket 直播、回放存储
  frontend/  Vite + CodeMirror + Canvas: 各模式界面、本地执行 (Web Worker 沙箱)
```

- 玩家代码 (TS) 在前端与后端**用同一份共享代码**编译 (esbuild-wasm) 与执行, 结果一致。
- 单人种植前端本地执行; 提交排行榜时由后端在沙箱中重新执行验证。
- 竞技模式由服务器推演 (双方各自坐标系, P2 为镜像), 每回合事件经 WS 推送。

## 环境要求

- Node.js >= 24 (使用内置 `node:sqlite`, 会打印 ExperimentalWarning, 可忽略)
- npm >= 10

## 快速开始

```bash
npm install

# 终端 1: 编译共享包 (改动 shared 源码后需重新构建, 或保持 tsc -w 运行)
npm run dev:shared

# 终端 2: 后端 (默认 3001)
npm run dev:backend

# 终端 3: 前端 (默认 5173, 已配置代理到后端)
npm run dev:frontend
```

打开 http://localhost:5173 。

未配置 GitHub OAuth 时后端进入**开发模式**: 自动以 `local-dev` 登录。
要启用真实登录, 复制 `packages/backend/.env.example` 为 `.env` 并填入
`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 依次构建 shared → backend → frontend |
| `npm run package` | 构建并打包出可独立部署的 `release/` (前端 + 后端 + 启动脚本) |
| `npm test` | 运行 shared 与 backend 的全部测试 (vitest) |
| `npm run typecheck` | 所有包 tsc --noEmit |
| `npm run dev:shared` | shared 增量编译 (tsc -w) |
| `npm run dev:backend` | 后端热重载 (tsx watch) |
| `npm run dev:frontend` | 前端开发服务器 (vite) |
| `npm run build -w @robofarm/backend` | 构建后端 (含 runner.worker.js 打包) |
| `npm run build -w @robofarm/frontend` | 构建前端 (自动复制 esbuild.wasm 到 public/) |
| `node scripts/verify-browser-sandbox.js` | 验证浏览器沙箱机制 (Node 模拟) |

## 生产部署

### 方式一: 打包发布版 (推荐)

一条命令构建前端 + 后端并产出**独立部署目录** (只需目标机器安装 Node >= 24):

```bash
npm run package
```

生成 `./release/`, 结构如下:

```
release/
  server.cjs                后端单文件 (内嵌 esbuild-wasm, 进程内编译玩家代码)
  esbuild.wasm              玩家代码编译所需 wasm
  runner/runner.worker.js   玩家代码沙箱 (worker_threads)
  public/                   前端构建产物 (后端自动托管, 单端口访问)
  start.sh / start.cmd      启动脚本 (Linux / Windows)
  .env.example              环境变量示例
```

部署:

```bash
# 拷贝 release/ 到目标机器, 然后:
./release/start.sh                     # 默认 http://localhost:3001
PORT=8080 ./release/start.sh           # 改端口
# 配置 GitHub OAuth: 在当前目录创建 .env (参考 release/.env.example), 或直接 export 环境变量;
# .env 与 data.db 均基于启动时所在目录 (pwd)
```

发布版完全自包含: 无需 `npm install`, 无 node_modules 依赖。

### 方式二: 源码直接运行 (开发/自托管)

```bash
npm run build
cd packages/backend
node dist/index.js        # 自动托管 packages/frontend/dist
```

### GitHub OAuth 配置

- 在 GitHub → Settings → Developer settings → OAuth Apps 创建应用
- Homepage URL: `http://<你的域名>`
- Authorization callback URL: `http://<你的域名>/auth/github/callback`
- 设置环境变量 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` /
  `GITHUB_REDIRECT_URI=http://<你的域名>/auth/github/callback`
- 不配置时进入开发模式: 所有请求自动以 `local-dev` 登录 (仅适合本机调试)

### MCP 服务器 (向 AI Agent 提供游戏 API 文档)

后端内置 MCP 服务器, 向任何接入的 Agent 提供 AI 友好的游戏 API 文档
(内容与前端右侧手册同一来源: `packages/shared/src/docs.ts`)。

**接入方式 (HTTP, streamable HTTP)**:
后端启动后, 在 MCP 客户端中添加 HTTP 服务器:
- Claude Desktop: 配置 MCP server 为 `http://localhost:3001/mcp`
- 或 `npx mcp-remote http://localhost:3001/mcp`

界面内展示的接入地址默认取**前端同源** `/mcp` (开发模式由 vite 代理转发到后端);
前后端分离部署时, 用前端环境变量 `VITE_MCP_BASE` 覆盖
(见 `packages/frontend/.env.example`), 例如 `VITE_MCP_BASE=https://game.example.com`。

**提供的内容**:
- 资源 `robofarm://docs/{overview|operations|functions|types|crops|rules|all}` (Markdown)
- 工具: `list_docs` / `get_doc(section)` / `get_crop(crop)` (作物参数 JSON) / `get_map(mode)` (单人/竞技地图 JSON)
- Prompt: `write_player_code` (编写玩家代码的指引模板)

前端开始界面、主菜单与 API 手册顶部也内置了 MCP 接入说明。

## Endpoint 一览

### 前端页面 (hash 路由, 开发默认 http://localhost:5173, 发布版同后端端口)

| 路由 | 页面 |
| --- | --- |
| `#/` 或 `#/start` | 开始界面 (含 MCP 接入说明) |
| `#/menu` | 主菜单 (含 API 手册弹窗) |
| `#/single` | 单人种植 |
| `#/simulate` | 模拟竞技 |
| `#/match` | 多人竞技匹配 |
| `#/battle?opponentId=:id` | 多人对战 (挑战指定玩家) |
| `#/battle?roomId=:id&spectate=1` | 观战指定房间 |
| `#/replay?id=:matchId` | 对局回放 |
| `#/spectate` | 观战房间列表 |

### 后端 HTTP (默认 http://localhost:3001)

**认证**:
| 方法/路径 | 说明 |
| --- | --- |
| `GET /auth/github` | 跳转 GitHub OAuth 授权页 (未配置 client id 时进入开发模式) |
| `GET /auth/github/callback` | OAuth 回调, 建立会话并跳回前端 |
| `GET /auth/me` | 当前登录用户 `{ user: { id, name, dev } }`; 未登录 401 |

**单人种植** (除 leaderboard 外均需登录):
| 方法/路径 | 说明 |
| --- | --- |
| `GET /single/leaderboard` | 排行榜 `{ entries: [{ name, score }] }` |
| `POST /single/validate` | 提交代码验证 `{ code }`; 已有任务运行返回 409 |
| `GET /single/validate` | 验证状态 `{ busy, progress, score, error }` |
| `GET /single/history` | 我的成绩历史 |

**竞技模式** (均需登录):
| 方法/路径 | 说明 |
| --- | --- |
| `GET /combat/state` | 我的出战代码与胜败 `{ code, wins, losses }` |
| `POST /combat/upload` | 上传出战代码 `{ code }` (清空胜败) |
| `GET /combat/list` | 可挑战列表 `{ entries: [{ id, name, wins, losses }] }` (排除自己) |
| `POST /combat/start` | 发起对战 `{ id }` → `{ roomId }` |
| `GET /combat/room` | 观战房间列表 |
| `GET /combat/history` | 我的历史对局 |
| `GET /combat/replay/:id` | 回放数据 (仅对局双方) |

**WebSocket**:
| 地址 | 说明 |
| --- | --- |
| `WS /ws/combat/room/:roomId` | 对战直播; 消息: `match-start` / `replay-buffer` / `turn { turn, events }` / `match-end { matchId, result }` / `error` |

### MCP (游戏 API 文档)

| 方式 | 地址/命令 |
| --- | --- |
| HTTP (streamable HTTP) | `POST /mcp` (会话经 `Mcp-Session-Id` 头; `GET` 返回 405, `DELETE` 关闭会话) |

内容: 资源 `robofarm://docs/{overview\|operations\|functions\|types\|crops\|rules\|all}`;
工具 `list_docs` / `get_doc(section)` / `get_crop(crop)` / `get_map(mode)`;
提示词 `write_player_code`。

## 环境变量 (backend)

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | 3001 | 后端端口 |
| `DB_PATH` | `./data.db` | SQLite 文件路径 |
| `FRONTEND_DIST` | 自动探测 | 前端静态目录 (发布版为 `release/public/`, 源码为 `frontend/dist/`) |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | OAuth 回调后的跳转地址 |
| `BACKEND_ORIGIN` | `http://localhost:3001` | OAuth redirect_uri 前缀 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 空 | 不配置则进入开发模式 |
| `TURN_INTERVAL_MS` | 800 | 竞技对战回合间隔 |

### 前端环境变量 (packages/frontend/.env)

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `VITE_MCP_BASE` | 同源 `/mcp` | MCP 服务器地址 (前后端分离部署时覆盖, 如 `https://game.example.com`) |

## 玩家代码约束

- 必须定义 `function run(droneId: number): DroneOperation`。
- 单次 run() 限时 400ms, 超时/内存超限立即终止 (游戏判负)。
- 沙箱内屏蔽网络/系统/异步 API (fetch、setTimeout 等), 无法逃逸回合控制。
- 编译不做类型检查 (esbuild 仅剥离类型), 类型错误在运行时暴露。
