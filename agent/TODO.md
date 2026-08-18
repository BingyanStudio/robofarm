# TODO

此处放置所有待办事项

## V1.0.0 Milestone

- [x] Feature: 大版本更新意味着平衡性调整，此时，老版本的数据需要迁移:
    1. 单人排行榜: 请给排行榜增加 Tab, 每个 Tab 都是历次大版本更新的最后一版排行榜。例如，当前更新 V1.0.0, 则 V0.x 的排行榜固定，成为一个 Tab
    2. 多人代码匹配池: 清空, 让所有玩家恢复 "未上传代码" 状态
    - 结果: `db.ts` 新增 `applyV100Migrations` (meta 表幂等, 首次启动执行): ①清空 `combat_codes`; ②冻结当前排行榜为 `v0.x` 快照 (`leaderboard_snapshots` 表)。`GET /single/leaderboard` 改为返回 `{ tabs: [{version, entries}] }` (历史快照 + 当前版本实时榜), 前端弹窗按 Tab 展示

- [x] Feature: 无人机增加操作:
    1. PlantRow(plants: []string): 一次种植一行, 从左到右按照 plants 数组顺序种植, 跳过无法种植的情况 (Tile 不适配，没钱等), 直到到达行末或 plants 数组耗尽, 消耗 3 能量
    2. PlantCol(plants: []string): 一次种植一列, 从上到下按照 plants 数组顺序种植, 跳过无法种植的情况 (Tile 不适配，没钱等), 直到到达行末或 plants 数组耗尽, 消耗 3 能量
    - 结果: 按操作三处注册 (player-api 类 `PlantRow`/`PlantCol` + ops.ts `OP_SCHEMAS` 新增 `crops` 数组字段校验 + engine.ts `plantLine` 处理器, config 新增 `PLANT_ROW_COL_COST=3`); 跳过格子不消耗 plants 数组, 成功才扣钱/扣能量; 竞技模式可整行种到对方半场; 已加单元测试

- [x] Adjustment: 香菇调整: 生长时间增加到 30cycles, 需要 1 次浇水; 成熟后不再一次性产生 4 个小香菇, 而是按照上右下左顺序，分 4 周期产生 4 个小香菇
    - 结果: registry 改 growCycles=30、thirstInterval=20 (恰好 1 次缺水); `CropData` 新增 `spreadLeft` 字段, 成熟时 onMature 置 4, 之后每回合在 Grown 分支按 上→右→下→左 扩散 1 株 (跳过被占/水池), 共 4 回合

- [x] Adjustment: 紫云英调整: 成本降低到 100, 收入降低到 120, 生长调整为 160 周期 效果修改为: 生长时, 每周期按上右下左顺序检查 Tile, 若有植物，且不缺水，且距离成熟剩余 >= 2 周期，则降低其生长时间 1 周期
    - 结果: registry 改 plantCost=100 / value=120 / growCycles=160, 特效从 onMature 移到 onGrow (`accelerateNeighbors` 重写为每周期给符合条件的邻格 -1 周期)

- [x] Adjustment: 西瓜调整: 成本提高到 1000, 收益提高到 1800, 生长周期降低到 100,
    - 结果: registry 改 plantCost=1000 / value=1800 / growCycles=100 (沙地免疫 growthOverride 不变, 缺水 6 次)

- [x] Enhancement: 主菜单布局修改:
    0. 使用 `packages/frontend/public/sprites/logo.svg` 作为 logo, 替换大标题和顶栏标题
    1. 单人模式 和 多人竞技 按钮放大，正中央是 Emoji (单人用 🌱, 多人用 ⚔️), 下方居中是 "单人模式" 和 "多人竞技" 字样，两个按钮布局在屏幕中央两侧
    2. 其他按钮平铺在两个大按钮下方，左侧与单人模式按钮对齐，右侧与多人竞技按钮对齐，中间均匀分布
    3. "模拟竞技" 按钮改到 "多人竞技" 页面中，放置在 "上传出战代码" 按钮左侧，二者在左侧边栏居中
    4. 所有的 "返回菜单" 按钮改用 Icon 按钮，Icon 使用 `packages/frontend/public/sprites/back.svg`; 按钮位置放在顶部栏 RoboFarm 左侧
    5. 将 `http://189.1.226.82:11451/#/menu` 改为根路由, 原根路由删除
    - 结果: 菜单/顶栏标题换为 logo.svg; 新增 `.menu-hero` (🌱/⚔️ 双大按钮居中) + `.menu-grid` (观战/回放/API 文档/更新日志 4 格平铺); 模拟竞技移入 match.ts 左侧边栏居中 ("上传出战代码" 左侧); ui.ts `topBar` 重做: back.svg 图标按钮在 logo 左侧 (各页面自动生效, api-docs 冗余按钮已删); main.ts 根路由 `#/` → 菜单, 删除 start 界面

- [x] Enhancement: 在游戏界面中，如果代码过长，会导致页面出现整体的下拉滚动条，请修改布局，使页面整体不会下拉
    - 结果: `#app` 加 `overflow: hidden`, 编辑区/日志/画布等面板内部自行滚动 (CodeMirror 自带滚动), 页面整体不再出现滚动条

- [x] Enhancement: 排行榜弹窗优化: 当前榜上的第1, 2, 3 名使用 Emoji 奖牌标注
    - 结果: single.ts `showLeaderboard` 前三名显示 🥇🥈🥉 (各版本 Tab 均生效)

- [x] Enhancement: 回放界面布局修改: 若没有选择回放，则将 "选择回放" 按钮居中放在屏幕中间醒目位置; 已有右上角的按钮不变
    - 结果: replay.ts 无回放时显示 `.replay-empty` (居中大按钮"选择回放" + 提示), 右上角"导入回放记录"保留

- [x] Feature: 无人机再增加操作: Teleport: 传送到指定位置。在多人竞技模式中，只能 **从我方场地** 传送 **到我方场地**, 能量消耗 = 欧氏距离向上取整
    - 结果: 新增 `Teleport(to)` 操作类 (types + ops schema + player-api + engine): 任意距离传送, 能量 = ceil(欧氏距离), 竞技模式限制起点与终点都在己方半场 (单人不限); 与移动同走目标占位仲裁 (尝试时扣能量, 仲裁失败不退还); 已加单元测试 + 沙箱端到端验证

- [x] Adjustment: 香菇再次调整: 基础生长时间恢复 20 cycles, 但总生长时间在种植时(包括玩家种植和老香菇生成)动态计算生长时间: 总生长周期 = 20 + 5 * 场上香菇总数
    - 结果: registry growCycles 恢复 20 (thirstInterval 20 保留); engine 新增 `shiitakeGrowCycles` (统计场上香菇数), 玩家种植 (`tryPlantAt`) 与扩散 (`spawnShiitake`) 均按 20 + 5×数量 动态计算实际周期与缺水次数 (plantCycles 同步记录); 已加单元测试

- [x] Bug: 顶栏的返回图标显示为图片丢失的裂图
    - 结果: 根因是 `public/sprites/back.svg` 为 0 字节空文件, 已补充简洁的左箭头 SVG (白色描边, 无字体依赖), 构建产物 dist/sprites/back.svg 已验证非空
- [x] Enhancement: 顶部排行榜的王冠 Emoji 可以删掉
    - 结果: single.ts 排行榜按钮文案 "👑 排行榜" → "排行榜" (gold 样式保留)
- [x] Enhancement: 开始菜单: 
    1. 给背景加一点浅色动态发光
    2. 把 "单人模式" 改成 "单人种植", 代码和文档里所有 "单人模式" 都要换
    - 结果: ① `.menu-box::before` 加径向渐变发光 + `menu-glow` 呼吸动画 (浅色、6s 循环、缩放缓动), 内容层 z-index 置顶; ② 全仓 "单人模式" → "单人种植": 前端 (菜单 hero/单人页标题/注释)、MCP server 描述、后端注释、shared api-docs/maps 注释、测试 describe、README/GAME/FRONTEND/BACKEND 文档; 更新日志同步记录

- [x] Bug: 高光引入了一个滚动条，希望没有; 同时希望高光向上移动一点
    - 结果: 高光 `.menu-box::before` 由 `position: absolute` 改为 `position: fixed` (相对视口定位, 不参与盒子滚动溢出, 不再产生滚动条), 位置从 6% 上移到 3%、尺寸 620px → 560px, 发光中心落在 logo 附近
- [x] Adjustment: 香菇第三次调整: 总生长周期 = 20 + 2 * 场上香菇总数
    - 结果: `shiitakeGrowCycles` 系数 5 → 2 (引擎注释/注册表描述/规则文档/更新日志同步), 测试断言更新 (2 株 → 24 周期, 3 株 → 26 周期)

- [x] Bug: "我的成绩" 中文字没有竖直居中
    - 结果: `.btn` 增加 `display: inline-flex; align-items: center; justify-content: center; line-height: 1.2`, 解决中文/Emoji 混排时的基线偏移 (所有按钮受益)

- [x] Feature: 增加机制 "沙漠化": 无人机收获作物时, 如果该作物相邻 Tile 存在沙子, 则当前 Tile 也转化为沙子
    - 结果: engine.ts 新增 `maybeDesertify` (仅蚕食 soil 地块, 不影响水池), 单格 Harvest 与行/列 HarvestLine 收获后都会触发; 已加单元测试 (含水池不转化)

- [x] Feature: 增加机制 "间作": 若一个作物四个方向上至少有 2 个不同于自己种类的作物, 则自身收获时收益+20%
    - 结果: engine.ts 新增 `intercroppingValue` (四方向统计异类邻格, ≥2 时收益 ×1.2 向下取整), 单格 Harvest 与行/列 HarvestLine 均生效; 已加单元测试

- [x] Adjustment: 将所有 Row/Col 的无人机操作范围缩短至 3 格 (对于 Plant, Harvest 和 Water, 以无人机为中心; 对于 Intercept, 以施法点为中心)
    - 结果: 新增 `lineRangePositions` (以中心 ±1 的 3 格, 越界跳过) 用于 plantLine/harvestLine/waterLine; interceptZone 类型改为 `{ axis, center }` (施法点 = 无人机释放时位置), 回合结束按中心 ±1 结算; 相关测试全部更新

- [x] Adjustment: 移除西瓜在沙地上不受 1.5 倍周期影响的特性，同步删掉"描述"中的相关事项
    - 结果: registry 移除 Melon 的 `growthOverride`, 描述/规则文档/CROP.md/AGENTS.md/MCP prompt 同步删除沙地免疫相关文案; 测试改为沙地 ×1.5 (150 周期, 缺水 10 次)

- [x] Adjustment: ChangeTile 能量消耗提升到 6
    - 结果: config `CHANGE_TILE_COST` 3 → 6, 规则文档/MCP prompt 同步; 测试断言更新

- [x] Feature: 无人机增加操作 "NewDrone": 
    1. 效果是: 花费 4000 金钱, 在指定位置创建一个新的无人机, 该无人机编号为己方编号顺延
    2. 前提条件: 
        1. 金钱足够
        2. 无人机数量未达上限(单人模式为 2, 多人模式为 3)
        3. 指定位置没有无人机
    3. 无人机上限可以由 GameInfo 查到
    4. 该无人机在下一回合开始执行代码
    - 结果: 新增 `NewDrone(at)` 操作类 (types/ops/player-api/engine 四处注册): config 新增 `NEW_DRONE_COST=4000` / `DRONE_LIMIT` (单人 2 / 竞技 3); GameInfo 增加 `droneLimit`; engine 阶段 1 校验 (金钱/上限/越界/占位), 阶段 5 回合结束创建 (目标格被最终位置占据则失败, 金钱已扣); GameController 每回合重同步 droneIdsByPlayer → 新无人机下一回合开始执行代码; 敌方无人机 id 显示真实全局 id (竞技 P2 为 2,3); 已加单元测试 + 沙箱端到端验证   

- [x] Bug: 第一次点击 "开始" 时, 会远程拉取 esbuild, 此时 "开始" 按钮可以再次点击; 希望暂时禁用, 直到编译完成
    - 结果: single.ts / simulate.ts 新增 `compiling` 标志: onStartStop/onStep 编译中直接返回; 编译期间按钮禁用并显示"编译中…" (try/finally 保证恢复), updateStartStop 同步处理 disabled 与绿/红样式
- [x] Enhancement: 回放界面中的 "开始" 和 "暂停" 添加绿色和红色 accent
    - 结果: replay.ts 播放按钮初始为绿色 (`btn-start`), 播放中切为红色 (`btn-stop`), 暂停恢复绿色

- [x] Enhancement: 在主菜单的 Logo 下方，用灰色字体写当前版本号
    - 结果: menu.ts 在 logo 下新增 `.menu-version` (`v${VERSION}`), 灰色小字 (复用顶栏版本号同色 #6b7f76), 上边距 -10px 与 logo 紧凑衔接