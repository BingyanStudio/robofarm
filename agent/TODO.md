# TODO

此处放置所有待办事项

- [x] Enhancement: 重新添加主菜单的 Tooltip
    - 实现: Renderer 新增 `allowZoom` 选项, 与 `interactive` 解耦: `allowZoom: false` 时只禁用滚轮缩放与拖拽平移, 保留 pointermove 悬停 → Tooltip 恢复。showcase 改为 `new Renderer(canvas, { allowZoom: false, fitFactor: 0.9 })`, 悬停画布显示地块/作物信息, 仍不可手动缩放/拖拽。

- [x] Enhancement: 主菜单 Logo, 高光 和 灰色描述 向上移动 32px
    - 实现: 在菜单入场动画 (gsap) 中把 logo 簇 (`.menu-logo-wrap`, 含其 `::before` 高光) 与 `.menu-tagline` 的 y 终点设为 -32 (其余行仍为 0)。用 gsap 而不是 CSS transform, 避免被 gsap 内联 transform 覆盖; 用 margin 则会被 flex 的 safe-center 重新吸收, 效果不稳定。动画结束后内联 transform 保留, 永久上移 32px。