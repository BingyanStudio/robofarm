# Bug 记录

修复后在对应行首打钩 (✓), 并简述修复方式。

- [x] **统计页饼图: 收益占比极小的作物会把饼图画成整圈并盖住其他扇区**
  现象: 某作物收益占比约等于 0 时, 饼图显示为一个纯色整环 (看似 100%),
  其他作物的扇区全部被盖住。
  原因: 每个扇区两侧各留 0.012 弧度间隙, 当扇区角度小于 0.024 弧度时
  `start+gap > end-gap`, canvas `arc()` 按顺时针从 start 绕到 end 会
  绕过整圈 → fill 把整个圆环涂成该作物的颜色。
  修复 (packages/frontend/src/core/stats.ts): 间隙按扇区角度自适应收缩
  (`Math.min(0.012, 角度/4)`), 保证 start+gap 永远小于 end-gap;
  已验证极小占比扇区不再反向绕圈。
- [x] **统计页饼图区域颜色与对应作物进度条颜色不一致**

  现象: 数据统计页面里, 收益饼图各扇区/图例的颜色与下方种植明细进度条
  的颜色对不上。
  排查: 饼图与进度条本就共用同一配色入口 `cropColor()`, 已知 9 种作物
  均按作物类型返回语义色, 二者一致; 唯一可能分叉的路径是**未收录作物**:
  旧实现按"排序位置"回退到调色板, 饼图与进度条的排序序号可能不同 →
  同一作物在不同位置拿到不同颜色。
  修复 (packages/frontend/src/core/stats.ts): `cropColor(type)` 改为按
  作物类型名哈希稳定回退到调色板 (与排序位置无关), 保证同一作物在
  饼图扇区/图例与进度条中永远同色; 已用真实渲染验证 (含未收录作物)。
- [x] **浏览器本地单人模式下载的回放 rounds 数组为空**

  现象: 本地跑完单人模式后点"保存回放", 下载的 JSON 里 rounds 是空数组。
  原因: 前端 single.ts 用 ReplayRecorder 包装了程序 (能捕获每回合操作),
  但从未调用 `recorder.afterStep()` 把操作落盘 → rounds 永远为空
  (后端 single/combat 服务都有调用)。
  修复 (packages/frontend/src/core/game-runner.ts): GameRunner 新增可选
  `onTurn(events, round)` 回调, 在每回合 `controller.step()` 后调用;
  single.ts 注册 `recorder.afterStep(events, round)`, 与后端一致,
  本地回放文件现在含完整 rounds。
- [x] **回合数显示 501 而不是 500 (状态栏 / 统计金钱曲线 / 回放末回合)**
  现象: 游戏结束后状态栏显示 "回合 501 / 500"; 统计图金钱曲线横轴到 501
  (超出 maxTurns); 回放最后一回合也是 501。
  原因: `GameController.step()` 在 `stepTurn` 之后先执行 `world.turn += 1`,
  再调用 `snapshotOf(this.world)` 生成快照; 而 `snapshotOf` 返回
  `turn: world.turn + 1` → 快照回合号 = 刚完成回合 + 1 (第 500 回合的快照
  显示 501)。turn 事件与玩家视图 (view.turn) 均正确, 只有快照错位。
  修复 (packages/shared/src/view.ts): `snapshotOf` 改为返回 `world.turn`
  (刚完成的回合号), 预览/初始快照 (turn=0) 相应显示 0; 状态栏、
  统计横轴 (1..maxTurns, 末点 = 最终金钱)、回放末回合全部归位。
  回归测试 (game-controller.test.ts): 断言快照回合序列 == turn 事件序列。
- [x] **植物缺水时右上角图标应为 💧 Emoji**
  现象: 作物 Thirsty 时右上角只是一个小圆点 (程序化绘制的色块), 不够直观。
  修复 (packages/frontend/src/core/renderer.ts): 新增 `drawThirstyMarker()`,
  Thirsty 状态在作物贴图右上角 (程序化绘制时在作物上方) 用 Canvas fillText
  绘制 💧 Emoji, 替代原来的小圆点。
- [x] **GitHub 登录在 https 部署下仍无法登录 (回调地址 http/https 不匹配)**
  现象: 站点经反向代理 (nginx 等) 以 https 对外, 但代理未转发
  `X-Forwarded-Proto` 时, 后端推导出 `http://...` 回调地址; GitHub 会跳回
  **注册的回调 URL** 并携带 `error=redirect_uri_mismatch`, 前端此前静默丢弃
  该错误 → 用户看似"无法登录"。
  修复:
  - auth.ts: `requestProto` 优先 X-Forwarded-Proto, 回退 `req.secure`
    (需要 trust proxy); `/auth/github` 推导出 http 回调时输出一次性诊断日志。
  - app.ts: `app.set('trust proxy', true)`, MCP/文档 baseUrl 复用同一协议判断。
  - 错误不再静默: 回调携带 GitHub error / state 无效 / code 交换失败时,
    302 到 `/#/menu?login_error=<原因>`; 前端 (main.ts) 弹出对应提示
    (redirect_uri_mismatch → 提示检查 .env 与 GitHub OAuth 应用回调 URL)。
  部署检查清单: .env 设置 `GITHUB_REDIRECT_URI=https://域名/auth/github/callback`
  (或 `BACKEND_ORIGIN=https://域名`), 并确认 GitHub OAuth 应用的回调 URL 与之一致;
  反向代理需转发 `X-Forwarded-Proto`。
- [x] **GitHub 登录后头像应显示 GitHub 头像, 而非首字母色块**
  修复:
  - 后端 (db.ts / auth.ts): users 表新增 `github_id` 列 (登录时从 GET /user 捕获,
    老库 ALTER TABLE 迁移, 老用户补全), `/auth/me` 返回 `avatar`
    (https://avatars.githubusercontent.com/u/<id>?v=4, 老数据无 id 时用
    https://github.com/<login>.png 兜底); 开发模式 (local-dev) 仍为 null。
  - 前端 (net.ts / user-card.ts / topbar.css): 有 avatar 时渲染 `<img>` 圆形
    头像 (referrerpolicy=no-referrer), 无头像/加载失败回退首字母色块。
- [x] **排行榜前三名前缀应为 🥇🥈🥉**
  现象: 排行榜前三名都显示同一个奖杯图标, 无法区分名次。
  修复 (packages/frontend/src/screens/single.ts): 前三名分别显示 🥇🥈🥉
  Emoji, 其余名次保持数字前缀。
- [x] **OAuth 登录回调报 "OAuth 状态无效或已过期, 请重新登录"**
  现象: GitHub 授权后回调被判定 state 无效, 每次登录都失败。
  原因: OAuth state 只存在进程内存 Map 中, 服务器重启或多实例部署时
  `/auth/github` 与回调落在不同进程 → state 丢失; 且打包产物 (release/、
  robofarm.tgz) 仍为旧代码, 直接返回 400 报错。
  修复 (packages/backend/src/auth.ts): state 改为「内存注册表 + 带 HMAC 签名
  Cookie (robofarm_oauth_state, 密钥由 GITHUB_CLIENT_SECRET 派生)」双通道校验,
  重启/多实例仍可登录; 回调带 GitHub error 参数 (用户取消授权等) 时静默跳回
  前端而非误报状态无效; 失败路径统一 302 到 /#/menu 由 /auth/me 判定登录态
  (不再返回 400 错误页)。已重新打包 release/ 与 robofarm.tgz。
- [x] **MCP login_start 生成的 OAuth callback url 未遵循环境变量配置**
  现象: 配置了 `GITHUB_REDIRECT_URI` / `BACKEND_ORIGIN` 的部署下, MCP
  `login_start` 返回的 GitHub 授权地址仍按**请求 Host** 推导回调地址
  (MCP 客户端常从本机/内网直连后端, Host 与公网域名不同) → 与 GitHub
  OAuth 应用注册值不一致 → 授权时 `redirect_uri_mismatch`, MCP 登录失败。
  修复 (packages/backend/src/auth.ts): 抽取共用 `resolveCallbackUrl()`,
  Web 登录 (`redirectUri`) 与 MCP 登录 (`mcpLoginStart`) 统一按
  `GITHUB_REDIRECT_URI` → `BACKEND_ORIGIN` → 请求推导 的优先级解析回调
  地址, 两处生成的 redirect_uri 始终一致, 并与 `/auth/github/callback`
  令牌交换使用的地址匹配。已重新打包 release/。
- [x] **回放界面右上角悬浮信息面板与顶栏重合**
  现象: 回放页鼠标悬停时, 地块/无人机信息面板出现在页面右上角 (顶栏
  位置), 而非画布右上角。
  修复 (packages/frontend/src/core/renderer.ts): 信息面板原在 Renderer
  构造时即挂到 canvas.parentElement; 回放页此时 canvas 尚未挂载
  (parentElement 为 null) → 面板落到 document.body, 按页面定位。改为
  `ensureTooltip()` 惰性创建并在首次使用时挂载到 canvas 的当前父容器
  (已为 position:relative 的画布宿主)。已重新打包 release/。
