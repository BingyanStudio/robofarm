# Bug 记录

修复后在对应行首打钩 (✓), 并简述修复方式。

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
