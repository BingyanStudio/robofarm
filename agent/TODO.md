# TODO

此处放置所有待办事项

- [x] Bug: 主菜单游戏界面的 Tooltip 与浅色圆角矩形容器没有对齐
    - 修复: `.render-tooltip` 共享样式是 `top:10px; right:12px`, 在游戏页 (无 padding 的 canvas 宿主) 里正好贴画布角; 但菜单 showcase 的宿主 `.menu-showcase` 有 20px padding, Tooltip 被定位到画布外。新增 `.menu-showcase .render-tooltip { top:30px; right:30px }` 让 Tooltip 进入画布内 10px, 与左上角回合/金钱状态条 (`top:30px; left:30px`) 两侧对称, 且与画布边缘保持一定距离 (非贴边)。