# TODO

此处放置所有待办事项

- [x] Enhancement: 游戏画布添加动画
    1. 进入动画: 无人机从出生点上方 0.5 Tile 处下落至出生点位置, 且该过程淡入; Tile 从左上角到右下角, 依次顺时针旋转 90 度淡入(初始为 -90度，动画结束为 0 度，恰好摆正); 上述动画同时进行, 使用 Cubic 曲线, 持续时间为 0.2s
    2. 退出动画: 无人机从当前位置移动到上方 0.5 Tile 处, 且该过程淡出; Tile 从左上角到右下角, 依次顺时针旋转 90 度淡出 (初始为 0 度，动画结束为 90 度); 上述动画同时进行, 使用 Cubic 曲线, 持续时间为 0.2s
    3. 当游戏画面第一次加载时, 播放进入动画
    4. 当玩家在游戏界面点击 "停止" 按钮时，播放退出动画, 将游戏复位, 再播放进入动画
    - 实现: Renderer 新增 `playSceneEnter()` / `playSceneExit()` (Promise, 动画结束 resolve)。单格时长 200ms + 按 (x+y) 对角线顺序 120ms 错峰, Cubic ease-in-out; Tile 绕格心旋转 + 整体 alpha, 无人机上移 0.5 格 + alpha, 统一接入 rAF 循环。GameRunner 构造后双 rAF 等待画布就绪再播进入动画; `stopForEdit()` 先停回合时钟 → 播退出动画 → 复位到初始预览 → 播进入动画 (single/simulate 的"停止"按钮均走此路径)。

- [x] Enhancement: 主菜单 UI 调整: 
    1. Logo, 所有按钮, MCP Card 移动到左侧 30% 位置
        1. Logo 还是位于最上方
        2. 灰色描述 "基于 TypeScript 编程的回合制农场经营游戏" 向上移动，位于 Logo 中文字部分下方 (当前由于 Logo 下方含有透明区域，所以灰色描述没有挨着 Logo 的文字部分)
        3. 两个 Hero 按钮变为正方形, 并排放置在 Logo 下方
        4. "观战" 等 4 个按钮现在一行 1 个，放置在 Hero 下方, 左右均与 Hero 左右对齐
        5. MCP Card 放在最下方, 左右均与 Hero 对齐
    2. 右侧 70% 位置放置一个游戏画布, 用于展示游戏玩法:
        1. 页面刚加载时，播放进入动画并等待,
        2. 使用 packages/frontend/public/showcase.json 作为回放文件，在进入动画结束后开始播放这个文件
        3. 当文件播放完毕后，延迟 2 秒，播放退出动画，复位，播放进入动画，重新播放 showcase.json
    - 实现: 菜单改为左右两栏 (`.menu-root`: 左 30% `.menu-box` / 右 70% `.menu-showcase`)。左侧所有元素共享同一列宽 (max 380px) 天然互相对齐; tagline 用负 margin (-38px) 上移贴近 Logo 文字底; Hero 按钮改为 aspect-ratio 正方形; 导航按钮 1 行 1 个; MCP 卡片贴底。右侧新增 `core/menu-showcase.ts`: 用 `replayEvents` 预推演 showcase.json (500 回合约 34ms), 循环执行 进入动画 → 逐回合播放 (70ms/回合, 左上角显示回合/金钱) → 播完停 2s → 退出动画 → 复位到初始世界 → 进入动画 → 重新播放; 画布断开 (离开菜单页) 时自动停止。