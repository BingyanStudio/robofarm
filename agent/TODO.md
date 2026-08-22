# TODO

此处放置所有待办事项

- [x] Bug: 主菜单游戏界面的 Tooltip 与浅色圆角矩形容器没有对齐
    - 修复: `.render-tooltip` 共享样式是 `top:10px; right:12px`, 在游戏页 (无 padding 的 canvas 宿主) 里正好贴画布角; 但菜单 showcase 的宿主 `.menu-showcase` 有 20px padding, Tooltip 被定位到画布外。新增 `.menu-showcase .render-tooltip { top:20px; right:20px }` 与宿主 padding 一致, 使 Tooltip 与画布 (容器) 的右上角对齐; 顺带把左上角回合/金钱状态条也改为同样的 20px 内缩, 两侧对称。

- [x] Enhancement: 将左侧占比增加到 35%, 注意 Logo 按钮等同步居中
    - 实现: `.menu-box` 从 `flex: 0 0 30%` 改为 `35%`, showcase 相应 `65%`。左列内部仍按同一列宽 (`min(380px, 100%)`) + `align-items: center` 布局, Logo / 按钮 / MCP 与列宽同步自动居中, 无需额外调整。

- [x] Enhancement: 无人机当前水量会通过蓝色圆圈绘制在无人机贴图下方, 请给这些蓝色圆圈增加黑色描边
    - 实现: drawDrone 的水量蓝点绘制时在 fill 之后用 `theme.droneIdStroke` (黑色描边) + `lineWidth = max(1, s*0.02)` stroke 圆圈, 缩放时描边粗细同步。

- [x] Enhancement: 在蓝色圆圈下方，用黄色菱形代表无人机的能量，0-10, 居中对齐
    - 实现: drawDrone 在水量蓝点下方 (cy + 0.31·s) 按 `d.energy` (0..MAX_ENERGY=10) 绘制黄色菱形, 菱形绕中心旋转 45° 的方点路径 (半径 0.045·s), 间距与蓝点一致 (0.09·s) 并按数量整体居中对齐 (起始 x = cx - (n-1)·spacing/2)。颜色取自新 token `--color-energy: #e8c34a` (tokens.css + theme.ts 同步新增)。