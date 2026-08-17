# Bugs

此处放置所有 Bug, 请将其修复后, 在本文档中打 x 并描述修复方式

- [x] Bug: 观战视图很宽，但是内部列表仅用了左侧一小部分, 看起来很挤
  - 修复: spectate.ts 的房间卡片改用 `.card-list` 网格容器, 随窗口宽度自适应列数;
    styles.css 去掉 `.spectate-page .card` 的 max-width: 420px 限制。
- [x] Bug: 对战时，对手执行 Move 的坐标系没有转换，导致一直判定为距离太远无法移动
  - 修复: GameController 此前只做了视图坐标系转换 (buildPlayerView), 从未把玩家操作中的
    坐标映射回绝对坐标。现在 step() 中经 `toAbsolute()` 对 Move/Intercept 目标调用
    `fromLocal()` (normal 帧为恒等), 竞技 P2 的移动/拦截恢复正常; 新增回归测试
    (P2 mirror 帧 Move 映射回绝对坐标且相邻)。
- [x] Bug: 已经结束的对战不能被观战，应当从观战列表删除
  - 修复: combat.ts `listRooms()` 只返回 compiling/running 的房间, finished/error 不再出现在观战列表
    (房间本身仍保留 10 分钟供对局双方重连, 回放已存库不受影响)。
- [x] Bug: 主菜单的 "API 手册" 按钮仍然没有移除 (位于 "观战" 按钮下方)
  - 已确认源码 (screens/menu.ts) 与构建产物 (dist 打包的 JS) 中均无此按钮, 上一轮已移除;
    若界面仍显示, 属浏览器缓存/旧 dev server, 刷新或重启 vite 即可。