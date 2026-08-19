# Bug 记录

修复后在对应行首打钩 (✓), 并简述修复方式。

- [x] **植物缺水时右上角图标应为 💧 Emoji**
  现象: 作物 Thirsty 时右上角只是一个小圆点 (程序化绘制的色块), 不够直观。
  修复 (packages/frontend/src/core/renderer.ts): 新增 `drawThirstyMarker()`,
  Thirsty 状态在作物贴图右上角 (程序化绘制时在作物上方) 用 Canvas fillText
  绘制 💧 Emoji, 替代原来的小圆点。
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
