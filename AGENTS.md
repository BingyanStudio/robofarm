# AGENTS.md

RoboFarm: 玩家编写 TypeScript 控制无人机的回合制农场游戏。设计文档在
[`agent/`](agent/AGENT.md) (游戏规则 / 前端 / 后端), 本文件补充实现层面的
非显而易见知识。

## 仓库结构 (npm workspaces)

```
packages/shared   游戏核心, 纯 TS, 零平台依赖 (仅 esbuild-wasm)
packages/backend  Express + node:sqlite + ws
packages/frontend Vite + CodeMirror 6 + Canvas, 无框架 (原生 TS)
scripts/          verify-browser-sandbox.js 等开发辅助脚本
```

**构建顺序依赖**: frontend/backend 依赖 shared 的 dist (exports map: `.` 与
`./player` 两个入口)。开发 shared 时需 `npm run dev:shared` (tsc -w) 保持产物最新。
前端 vite.config.ts 将 `@robofarm/shared` 直接 alias 到 TS 源码 (无需重建 shared),
但 **backend 始终使用 shared 的 dist**, 改动 shared 后必须重新构建才能在后端生效。

## 命令

- `npm test` — shared + backend 的 vitest 测试; backend 的 `npm test` 会先 build。
- `npm run build` — shared → backend (含 runner.worker.js 的 esbuild 打包) → frontend。
- `npm run package` — 构建 + 打包出独立部署目录 `release/` (见下文"发布版打包")。
- `npm run dev:backend` (tsx watch, 端口 3001) / `npm run dev:frontend` (vite, 5173, 已代理 /auth /single /combat /ws)。
- 未配置 `GITHUB_CLIENT_ID` 时后端进入开发模式, 所有请求自动以 `local-dev` 登录。

## 发布版打包 (scripts/package.mjs)

`npm run package` 生成完全自包含的 `release/` (只需目标机安装 Node >= 24, 无需 npm install):

- **server.cjs**: esbuild 把整个后端 (express + 全部服务) 打成单文件。
  关键技巧: `alias` 把 `esbuild-wasm` 指向其 **浏览器入口** (`lib/browser.js`),
  并以 `define` 注入 `process.env.ROBOFARM_EMBEDDED_WASM="1"`, 使
  `backend/src/index.ts` 用 `setWasmModule()` 在进程内加载 `release/esbuild.wasm`,
  不 spawn 子进程, 因此不需要 node_modules。
- **注意**: esbuild-wasm 浏览器入口在 Node 下需要 `globalThis.self` 垫片
  (index.ts 里设置) 且 `initialize({ wasmModule, worker: false })`
  (compile.ts 的 setWasmModule 分支)。
- **wasm 单独部署 (ESBUILD_WASM_URL)**: esbuild.wasm 过大时可放到另一台服务器,
  在 `.env` 配置 `ESBUILD_WASM_URL`。后端启动时 `loadCompilerWasm()` 从该 URL 下载
  并 `setWasmModule` (下载失败回退本地文件); `GET /config` 返回该 URL,
  前端 main.ts 启动时拉取并 `setWasmUrl()` (浏览器编译改从远程加载, 未配置保持同源
  /esbuild.wasm)。
- 其他文件: `runner/runner.worker.js` (沙箱, 经 node-program.ts 的
  `resolveWorkerPath()` 候选路径 `__dirname/runner/` 找到)、`public/` (前端产物,
  由 app.ts 的 `resolveFrontendDist()` 探测)、`start.sh`/`start.cmd`、`.env.example`。
- 改了打包逻辑后重新 `npm run package` 并启动 `release/start.sh` 冒烟验证
  (单人验证会走内嵌 wasm 编译路径, 竞技对战会走 release/runner/ 的 worker)。

## 容器化 (Dockerfile)

- 多阶段构建: `node:24-slim` 构建阶段 `npm ci && npm run package` 生成 `release/`,
  运行阶段只拷贝 `release/` (无需 node_modules)。对外单端口 3001 暴露全部服务:
  前端页面 / 后端 API / MCP (POST /mcp) / WS 直播。`.dockerignore` 排除 node_modules /
  dist / release / .env / data.db。
- **数据卷**: 容器内 `/data` (node 用户, UID 1000) 为挂载点, 启动 cwd=/data →
  `data.db` 与 `.env` 都落在卷内 (db.ts 的 startCwd 在模块加载时捕获, 不会被
  index.ts 的 chdir 切走), 挂载 `-v 卷:/data` 即可持久化/备份。bind mount 需宿主目录
  对 UID 1000 可写。
- server.cjs 按 `__dirname` 解析 esbuild.wasm / runner / public, 必须放在 /app。
- **start.sh 尊重 pwd**: 不再 cd 到脚本目录, `.env` 从当前目录读取, `data.db` 也存当前目录。
  实现关键: db.ts 在模块加载时捕获 `startCwd` (此时尚未被 index.ts 的 chdir 切走),
  `getDbPath()` 用 `resolve(startCwd, DB_PATH ?? 'data.db')` 解析 —— 改这块要小心顺序。

## 核心设计: 前后端执行一致性

玩家代码在前端 (Web Worker) 与后端 (worker_threads + vm) 执行, 必须结果一致。
实现方式:

1. **编译**: `shared/src/compile.ts` 用 esbuild-wasm 将玩家代码与导出桩
   (`export const __robofarm_run = run`) 打包为 IIFE (globalName `__ROBOFARM__`,
   platform `browser`)。前后端用同一份代码, 产物完全一致。
2. **沙箱**: `packages/frontend/src/player-worker.ts` 用 `new Function(...参数表, 代码)`
   执行, 参数表把注入的 API 与要屏蔽的危险全局 (fetch/setTimeout/process 等)
   作为形参遮蔽。`packages/backend/src/runner/runner.worker.ts` 用
   `vm.createContext(sandbox)` + `vm.runInContext` 执行, timeout 打断死循环。
3. **API**: `shared/src/player-api.ts` 的 `playerApiFactory(getView)` 前后端共用,
   每回合宿主传入 PlayerView 快照, API 函数只读快照 → 天然一致。
4. **超时语义 (重要)**: 单次 run() 限 `TIMEOUT_MS = 400ms`。超时/报错/内存超限
   → **该玩家程序被判死, 整局游戏以 error 结果提前结束** (不是跳过回合)。
   前端靠宿主侧看门狗 terminate worker; 后端靠 vm timeout, 超时后同样终止 worker。

## 核心设计: 竞技模式坐标镜像

- 地图 14×7, 左半 = 单人地图, 右半为镜像 (地图构造保证关于 x=6.5 对称)。
- P1 frame=`normal`, P2 frame=`mirror`: 双方都用"自己半场在左"的本地坐标系编程。
- `shared/src/view.ts`: `buildPlayerView(world, player, drone, frame)` 负责
  本地坐标转换, `fromLocal()` 把玩家操作中的坐标映射回绝对坐标 (移动/拦截目标)。
- 前端渲染与回放一律使用**绝对坐标**; 观战/回放页可选 mirror 视角 (渲染器 `rx()`)。
- **不要破坏镜像对称**: 改地图 (maps.ts) 或新增水/地分布时, 竞技地图必须保持对称。

## 核心设计: 扩展机制 (禁止 if 硬编码特例)

- 地块/作物: `shared/src/registry.ts` 数据注册表 (`TILES` / `CROPS`)。
  地块配置: name、canCollectWater、**growthFactor** (沙地 1.5, 种植时生长周期
  ×growthFactor 向下取整)、sprite/spriteWithCrop (前端贴图名, 有作物时用 _field 变体)、
  color (程序化绘制兜底)。
  作物配置: habitats(可种地块)、plantCost、value、growCycles、
  `thirstInterval` (**null = 无需浇水**, 如草莓)。
  **缺水机制**: 作物进入 Thirsty 后长期保持该状态、生长不推进,
  **不枯萎** (GAME.md 已取消枯萎设定), 浇水后从剩余进度继续生长。
  缺水次数在种植时按实际生长周期动态计算 (CropData.thirstTotal =
  floor(实际周期 / thirstInterval)), 触发点 = ceil((剩余次数)·thirstInterval),
  **不依赖固定的剩余取模**, 因此沙地 (周期 ×1.5) 等调整过周期的作物缺水次数同步增加。
  当前地块: 土地 / 水池 / 沙地 (可种草莓/葡萄/南瓜)。
- 无人机操作: 玩家侧为**操作类** API (`shared/src/player-api.ts` 的 `Move` /
  `Teleport` / `Plant` / `CollectWater` / `Water` / `Harvest` / `Clear` / `Intercept` /
  `Charge` / `HarvestRow` / `HarvestCol` / `WaterRow` / `WaterCol` /
  `InterceptRow` / `InterceptCol` / `PlantRow` / `PlantCol`, 均继承 `DroneOperation`,
  参数经构造函数传入),
  引擎按**构造类名**识别操作; 内部传输/引擎仍用判别联合 `DroneOperation`
  (`types.ts`), 由 `ops.ts` 的 `normalizeOp` 把类实例统一转换为纯对象
  (同时兼容 `{ type: ... }` 旧写法)。新增操作 = 添加操作类 + OP_SCHEMAS +
  OP_HANDLERS 三处。
- **能量机制**: DroneState.energy (上限 MAX_ENERGY=10, 初始 0), Charge 原地 +5;
  行/列范围操作消耗能量 (收割 4 / 浇灌 3 / 种植 3 / 拦截 6, 常量在 config.ts);
  Teleport 消耗 ceil(欧氏距离) 能量 (尝试时即扣除, 仲裁失败不退还; 竞技模式只能
  在我方半场内传送, 与移动同走仲裁); ChangeTile 消耗 CHANGE_TILE_COST=6;
  NewDrone 消耗 NEW_DRONE_COST=4000 金钱 (上限 DRONE_LIMIT: 单人 2 / 竞技 3,
  GameInfo.droneLimit 可查)。
  行/列范围操作覆盖以无人机为中心的 3 格 (interceptZone 记录施法点 center);
  行/列收割仅限己方半场; 行/列拦截在回合结束结算。
  行/列种植 (PlantRow/PlantCol) 按 plants 数组顺序在 3 格内种植,
  跳过无法种植的格子 (地块不适配/已有作物/金钱不足) (ops.ts 的 `crops` 字段 kind 校验)。
- 当前作物: 草莓 / 葡萄 / 小麦 (需水) / 荷花 (水生) / 南瓜 (需水) /
  西瓜 (成本 1000/收获 1800/100 周期) /
  紫云英 (成本 100/收获 120/160 周期, 生长加速邻格 onGrow) /
  香菇 (基础 20 周期, 实际周期 = 20 + 2×场上香菇数, 需水, 成熟后分 4 回合按上右下左扩散 onMature) /
  水仙 (生长自动浇水 onGrow),
  完整属性见 agent/CROP.md, 数据在 `CROPS` 注册表 (改文档或加作物只改这一处)。
- **沙漠化 / 间作**: 收获作物时, 若其周围存在沙地则该格转化为沙地 (仅蚕食土地,
  不影响水池, engine.ts `maybeDesertify`); 若作物的四方向邻格有 ≥2 个不同种类作物,
  收获收益 +20% (向下取整, engine.ts `intercroppingValue`)。
- **成熟特效 (onMature)**: 每种作物成熟时都会执行其挂接的特效 (多数作物不声明)。
  效果按 id 在 engine.ts 的 `MATURITY_EFFECTS` 表注册 (如 selfSpread),
  新增特效 = 加一个处理器 + 在注册表声明, 无需 if 硬编码。
  香菇: 成熟时设置 `spreadLeft=4`, 之后每回合在 Grown 分支按上右下左扩散 1 株
  (CropData.spreadLeft 字段, 到 0 停止)。
- **生长特效 (onGrow)**: 与 onMature 同构, 每个生长回合执行 (如 Daffodil 的 autoWater,
  每 3 周期按 上→右→下→左 给邻格缺水作物浇水, 一次/回合, 成熟失效), 处理器在
  engine.ts 的 `GROWTH_EFFECTS` 表注册。
- **ChangeTile**: 消耗 CHANGE_TILE_COST=6, 需上下左右有同类型地块 (orthNeighbors 检查),
  有作物的地块不可转换; 按操作三处注册 (player-api + OP_SCHEMAS + OP_HANDLERS)。

## 引擎语义 (shared/src/engine.ts, 改前必读)

- 所有操作视为回合结束瞬间同时发生。移动冲突仲裁: 目标格被任何无人机的
  **最终位置**占据则失败, 按 (执行耗时, 全局无人机 id) 升序认领。
  静止无人机占据其所在格; 因此**相邻互换会被阻止** (双方目标都是对方
  回合开始时所在格), 但移入"另一架无人机正在离开的空格"是允许的。
- **移动范围限制**: 只能移动到周围 8 格 (相邻格), 超出或原地不动都会
  产生 invalid-op 错误信息 (前端日志面板会显示), 无人机不移动。
- 回合内结算顺序: 非移动操作 → 移动仲裁 → 拦截 → 偷菜资金带回 → 作物生长。
  (偷菜无人机回到己方半场的**同一回合**结束时就 stash, 拦截也先于 stash 结算。)
- 偷菜: 对方半场收获 → 进入无人机 bounty; 回到己方半场 → 入账;
  被 intercept 命中 (回合结束时在拦截格) → bounty 清零, 资金返还受害方。
- 种植回合算作第 1 个生长周期: 草莓 5 回合成熟 = 种植回合 + 4 次生长。
- 事件流: 每回合 = `turn` → 操作事件 → `snapshot` (全量世界快照, 渲染/回放
  的**唯一数据来源**) → (可选) `end`。action 事件仅供日志/动画。

## 平台执行细节与坑

- **backend worker 路径**: `node-program.ts` 的 `resolveWorkerPath()` 探测多个
  候选路径, 因为 vitest 下 `__dirname` 指向 test/ 而非 dist/runner/。改路径逻辑要小心。
- **runner.worker.ts 被排除在 tsc 之外**, 由 `scripts/build-worker.mjs` (esbuild)
  单独打包到 dist/runner/runner.worker.js。改了 worker 必须重新 build backend,
  否则测试/运行仍在用旧产物 (本仓库踩过这个坑)。
- **esbuild-wasm 在 Node 下不能用 wasmURL**: 常规运行自动使用包内磁盘 wasm
  (`node_modules/esbuild-wasm/bin/esbuild`), 发布版用其**浏览器入口 + wasmModule**
  进程内编译 (见上文"发布版打包")。compile.ts 通过
  `typeof globalThis.location !== 'undefined'` 区分浏览器/Node。
  Node 侧 (`backend/src/index.ts`, 测试) 需调用 `setWasmUrl(file://...esbuild.wasm)`
  或 `setWasmModule(...)`。
- **esbuild 不做类型检查**, 只剥离类型。玩家代码的类型错误要等运行时暴露。
- **未使用的 import 会被 tree-shake 掉**: 玩家代码 `import x from "./helper"` 若
  从不使用 x, esbuild 不会报解析错误; 用了才会报 "Could not resolve"。
- vm 超时错误是普通 `Error` (message 含 "timed out"), name/code 不可靠,
  worker 里按 message 匹配。
- Node 24 的 `node:sqlite` (DatabaseSync) 会打印 ExperimentalWarning, 无害。
- 数据库 `getDb()` 惰性初始化: 首次请求才建表。测试直接改 DB 文件前,
  先请求一次 `/auth/me` 或调用 getDb()。
- 前端 `public/esbuild.wasm` 由 `scripts/copy-wasm.mjs` 从 node_modules 复制
  (gitignore 了它), 改了 esbuild-wasm 版本要重新跑 dev/build。

## 前端要点

- 无框架, hash 路由在 `main.ts`; 布局辅助在 `ui.ts` / `game-layout.ts`。
- 编辑器: CodeMirror 6, `editor.ts`; 切换 tab 用 `EditorHandle.dom` 重新挂载
  (不要重建 EditorView); 动态只读用 StateField + readOnlyEffect (游戏进行中锁定)。
- 渲染: `renderer.ts` 纯 Canvas, 快照驱动; 首次渲染自动 fit, 之后保留缩放/平移。
- **贴图**: `public/sprites/` (规范见 agent/SPRITE.md)。`sprites.ts` 负责加载
  (模块级缓存, 缺图不阻塞), `renderer.ts` 优先贴图、失败回退程序化绘制:
  - 地块: grass.svg (无作物) / field.svg (有作物) / water.svg
  - 无人机: drone.svg / drone_enemy.svg (机身+螺旋桨, 机身区域为图片坐标
    (149,143)-(383,324), 中心 (266,233.5)); 编号画在额头 (机身上半部),
    眼睛 drone_eyes.svg 画在机身中心、移动时向移动方向偏移 (动画插值)。
    调整渲染位置: `drawDroneSprite` 里的 BODY_* 常量与眼睛 kE/偏移参数。
  - 作物: `crop/<type>_<n>.avif` 正方形铺满一格, 生长阶段由
    `cropStageIndex()` (进度 = 1 - 剩余/总生长) 均匀映射。
- 本地执行: `BrowserProgram` (看门狗超时) + `player-worker.ts` (new Function 沙箱)。
- **GameRunner** (`game-runner.ts`): 单人种植 / 模拟竞技共用的回合循环
  (编译→开始→步进/暂停/调速→结束, 含首次编译下载日志与编译锁)。
  屏幕只注入 buildGame (编译+构建控制器) / setEditorLocked / gameStartLog / onEnd,
  不要在两个 screen 里重复实现开始/暂停/步进逻辑。
- localStorage 键: `robofarm.single`、`robofarm.simulate.me` (与多人匹配页同步)、
  `robofarm.simulate.enemy`、`robofarm.log-height`。

## MCP 服务器 (游戏 API 文档)

- **内容单一来源**: `shared/src/docs.ts` 存放全部 API 文档数据
  (操作类/函数/类型/作物/规则), 前端右侧手册 (`api-manual.ts`) 与
  后端 MCP 服务器 (`backend/src/mcp/server.ts`) 都从它生成, 改文档只改一处。
- **传输 (仅 HTTP)**: streamable HTTP, Express `POST /mcp`
  (app.ts 的 mountMcp, 会话按 `Mcp-Session-Id` 管理,
  `onsessioninitialized` 时注册到 map —— 改会话逻辑小心)。
  前端展示的地址默认同源 `/mcp` (vite 代理已转发), 可用前端 env
  `VITE_MCP_BASE` 覆盖。
- **内容**: 资源 `robofarm://docs/{overview|operations|functions|types|crops|rules|all}`;
  文档工具 `list_docs` / `get_doc(section)` / `get_crop(crop)` / `get_map(mode)`;
  认证 `login_start` / `login_finish` (会话令牌绑定后自动携带); 通用代理 `api_call`;
  后端 API 封装工具 (按路由逐个添加): 单人 `single_validate` / `single_validate_status` /
  `single_history` / `single_leaderboard` (公开) / `single_replay(id)`,
  竞技 `combat_state` / `combat_upload` / `combat_list` / `combat_start(opponentId)` /
  `combat_room` (公开) / `combat_history` / `combat_replay(id)`; Prompt `write_player_code`。
- **坑**: McpServer 的 zod 泛型在部分 zod 版本下会触发
  "Type instantiation is excessively deep" —— 实现用底层 `Server` API +
  原生 JSON Schema, 不依赖 zod 类型推断。
- 发布版已内嵌 MCP (esbuild 打包 SDK)。
- `src/mcp-cli.ts` / `npm run mcp` 保留为 stdio 开发工具 (不对外文档化)。

## 后端 API 速览

- `GET /auth/me`, `GET /auth/github[/callback]` (OAuth, 未配置时 dev 模式)
- 单人: `GET/POST /single/validate` (busy/progress/score/error; 全局并发上限
  `SINGLE_MAX_CONCURRENT` 默认按 CPU 核心数 (上限 32, 可用 env 覆盖), 超限 409"服务器繁忙"; 每用户限流预留:
  `SINGLE_SUBMIT_LIMIT_PER_MIN` 默认 0 不限流, 超限 429), `GET /single/history`,
  `GET /single/leaderboard` (无参数返回前 50 名 (登录用户带 me 标记);
  `?user=<用户名>` 查询个人最高分与全榜名次)
- 竞技: `GET /combat/state`, `POST /combat/upload` (清空胜败),
  `GET /combat/list`, `POST /combat/start {id}` → roomId,
  `GET /combat/room` (观战列表), `GET /combat/history`,
  `GET /combat/replay/:id` (仅对局双方), `WS /ws/combat/room/:roomId`

## 大版本迁移 (db.ts 的 applyV100Migrations)

- 每次大版本更新在 `getDb()` 首次初始化时执行一次 (meta 表记录, 幂等):
  1. 清空 `combat_codes` (所有人恢复"未上传代码"状态)
  2. 冻结当前排行榜为上一大版本快照 (`leaderboard_snapshots` 表,
     标签见 `PREV_LEADERBOARD_VERSION`), 之后以 Tab 展示
  3. 清空 `single_submissions` (旧成绩已冻结进快照, 新版本排行榜从空开始;
     注意快照必须先于清空执行)
- 当前大版本标签: `LEADERBOARD_VERSION` (db.ts), 改版本号时同步改这两个常量。
- 排行榜 (v1.0.2): Tab 按大版本展示前 50 名; 登录玩家排名经 `?user=` 查询
  (db.ts `userRank`) 固定吸附弹窗底端, 在前 50 名内则原位高亮。
- WS 协议: `match-start` / `replay-buffer` (迟到观众回放) / `turn {turn, events}` /
  `match-end {matchId, result}` / `error`。对局在服务器按 `TURN_INTERVAL_MS` 节奏推演。
- 对战推演用 `services/combat.ts` 的 runMatch: 编译双方代码 → 两个 NodeProgram →
  GameController 循环 → 广播 + 回放入库。房间 10 分钟后清理。

## 测试

- shared: `engine.test.ts` (回合语义/仲裁/偷菜/拦截), `maps.test.ts` (镜像对称),
  `compile.test.ts`, `game-controller.test.ts` (视图坐标/回合编排)。
- backend: `test/runner.test.ts` (沙箱: 执行/日志/超时/加载错误/Node 全局隔离)。
- vitest 配置了 30s 超时 (esbuild-wasm 初始化较慢)。
- 改引擎/注册表/地图后跑 `npm test`; 改前端后至少 `npm run build -w @robofarm/frontend`。

## Bug

所有 Bug 均会写入 agent/BUGS.md, 若用户要求，请检查该文件，修复后将对应行打钩, 并简述修复方式