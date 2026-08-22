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

- [x] Bug: 主界面 Logo 没有居中
    - 修复: Logo 容器原来是 `width: fit-content` + 图片 `width: min(350px, 100%)`, 百分比相对 fit-content 父级时存在循环解析, 导致图片在过宽的容器内靠左, 与下方按钮不对齐。现改为容器与其余子元素共用同一列宽 (`min(380px, 100%)`), 图片 `width: 100%; max-width: 350px; margin: 0 auto` 精确居中, 与下方按钮中轴对齐。

- [x] Bug: 主界面的游戏画布播放速度应该为正常，目前为 8 倍速
    - 修复: 播放间隔从 70ms 改为共享常量 `TURN_INTERVAL_MS` (800ms, 与游戏内默认速度一致), 500 回合约 6.7 分钟循环一次。

- [x] Bug: 游戏画布播放 淡出-复位-进入 动画时，复位的瞬间会把画布重新显示出来，导致淡出后闪现一帧
    - 修复: 退出动画结束时 Renderer 把 `sceneAnim` 置空后会在同一帧以全不透明重绘一次, 造成闪现。新增 `sceneFade` 状态: 动画完成后保留最终淡出 (alpha=0) 或淡入 (alpha=1) 的持久状态, 淡出后地图保持不可见, 直到下一次进入动画开始 (`playSceneEnter`/`playSceneExit`/`clear` 时重置)。另新增 `holdSceneFadeOut()` 在首次加载时也先保持不可见, 避免进入动画前的全量画面闪现一帧 (GameRunner 与 showcase 均接入)。

- [x] Enhance: 暂时移除主界面的 MCP Card (注释掉，不要删除)
    - 实现: menu.ts 中 MCP Card 的使用与 `mcpCollapse` 导入均已注释, 附注说明, 代码保留。

- [x] Enhance: 主界面的游戏画布的初始缩放需要比目前缩小 10% , 且不允许用户手动缩放
    - 实现: Renderer 新增构造选项 `fitFactor` (自动 fit 时乘的缩放系数) 与 `interactive` (为 false 时不绑定滚轮缩放/拖拽平移/悬停事件)。showcase 以 `new Renderer(canvas, { interactive: false, fitFactor: 0.9 })` 创建: 初始缩放比原来小 10%, 且用户无法缩放/拖拽。

- [x] Enhance: 主界面的游戏画布需要删除 Tooltips 和背景的浅色圆角矩形
    - 实现: showcase 画布 `interactive: false` 后不再产生悬停 Tooltip (`updateTooltip` 直接跳过, 连空节点都不创建); `.menu-showcase-canvas` 移除 `border` 与 `border-radius`, 画布边缘不再有浅色圆角描边。

- [x] Enhance: 游戏画布淡入时, Tile 增加缩放动画: 从 scale=0 缩放到 1; 淡出则从 1 缩放到 0
    - 实现: draw() 中场景动画的 Tile 变换在 旋转+透明度 之外叠加 `ctx.scale(scale, scale)` (绕格心缩放): 进入 scale 0→1, 退出 1→0, 与旋转/淡入淡出同用 Cubic 缓动、同时进行。