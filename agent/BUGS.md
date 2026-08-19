# Bug 记录

修复后在对应行首打钩 (✓), 并简述修复方式。

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
