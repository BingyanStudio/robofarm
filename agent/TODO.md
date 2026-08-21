# TODO

此处放置所有待办事项

- [x] Balance: 沙地的生长周期惩罚调整为 x3
  改动: tiles/sand.ts 的 growthFactor 1.5 → 3; 缺水次数随实际周期同步变化
  (沙地草莓 5→15 周期, 西瓜缺水 20 次); 相关沙地测试与注释同步更新。

- [x] Feature: 增加机制 "土地肥力"
    1. "土地" 地块运行时增加 "肥力" 属性, 初始为 5, 最大值为 10; 仅土地有此选项; 可通过无人机 API 在游戏内查询
       → `Tile.fertility` (仅土地持有), 常量 INITIAL_TILE_FERTILITY=5 / MAX_TILE_FERTILITY=10
       (config.ts); 地图与 ChangeTile 转土地时写入初始值; `getTile().fertility` 可查
       (TileInfo.fertility, view.ts 透传), 快照也携带 (Tooltip 用)。
    2. 所有作物去除 "habitats" 属性, 改为 "canPlant" 回调，传入种植所在 Tile, 返回 boolean 表示是否可以种植
       → CropTypeConfig.canPlant(tile), 基类不判断 (abstract), 9 种作物各自实现;
       tryPlantAt 与 Plant 校验改走 canPlant; docs/MCP 用 registry.plantableTiles()
       由 canPlant 探测可种地块展示。
    3. 所有作物增加 "肥力消耗" 属性, 基类数值为 0, 在收获时若脚下为土地则扣除 "肥力消耗" 的肥力值
       → CropTypeConfig.fertilityCost (BaseCrop 默认 0); 土地 onCropHarvested 回调内
       扣除 (收割/行收割均触发); 数值: 小麦 +1 / 南瓜 +2 / 西瓜 +3 / 紫云英 -2 (恢复),
       其余 0; API 手册与 MCP 展示时区分 消耗/恢复。
    4. "沙漠化" 机制修改: 若土地肥力被扣除到 < 0, 则土地转化为沙地
       → tiles/soil.ts onCropHarvested: 肥力 < 0 → 沙地 (原"邻格有沙地"规则移除)。
    5. 增加地块 "盐碱地": 一种新地形, 英文id为 "salt" (据此找贴图); 在上方种植植物, 生长周期 x1.5, 浇水次数 x2 (作物的浇水次数获取代码需要按照生长周期类似的方式重构)
       → tiles/salt.ts (TileType.Salt), growthFactor=1.5 / thirstFactor=2;
       作物基类新增 thirstCount(tile, world) (与 growCycles 同构: 默认
       floor(周期/thirstInterval) × 地块浇水倍率), 种植/扩散都走它。
    5. 增加机制 "盐碱化": 若土地肥力被增加到 > 上限(当前是10), 则土地转化为盐碱地
       → tiles/soil.ts onCropHarvested: 肥力 > MAX_TILE_FERTILITY → 盐碱地。

- [x] Balance: 作物的浇水时机改为非均匀分布, 在种植时随机选取
    1. 先计算生长周期和浇水次数, 然后随机选择 n(n=浇水次数) 个位置, 当生长到该周期时缺水
       → 新增 shared/src/rng.ts: mulberry32 PRNG + plantingSeed (由玩家/位置/作物/回合
       FNV-1a 派生种子) + pickThirstPoints (从 [1, 周期-1] 洗牌取 n 个点, 降序);
       tryPlantAt 与香菇扩散种植时生成 CropData.thirstAt。
    2. 随机仅改变缺水时机, 不改变缺水次数
       → 次数仍由 thirstCount(tile, world) 决定, 随机只洗牌选点; 触发点用完即不再缺水。
    3. 该属性对玩家隐藏，无法通过无人机 API 获取
       → thirstAt 只在 CropData (引擎内部), CropInfo/TileInfo/快照均不暴露。
    4. 游戏 Tooltip 删除 "作物还有多少周期缺水" 的显示
       → 当前 Tooltip 本就未显示该信息 (仅有 需定期浇水 提示), 无需改动; 后续不得新增。
    5. 游戏回放需要保存每个作物的缺水时机, 以保证回放与游玩的过程和结果相同
       → **游戏开始时随机取得种子** (WorldState.rngSeed, 对玩家不可预测, 避免把
       随机机制硬编码进玩家代码), 种植时由该种子叠加 (玩家, 位置, 作物, 回合)
       派生各次种植的缺水时机; 种子计入回放文件 (ReplayFile.seed, 由
       ReplayRecorder.seed 从 controller.world.rngSeed 采集, 单人前后端与竞技
       共 3 处录制点), 回放 (replayEvents) 用同一种子重推演, 结果与游玩一致。
       engine.test.ts 增加: 同种子重跑时机一致 / 不同种子时机不同 断言。
    6. CropData 移除 thirstTotal / plantCycles (旧均匀公式用), 新增 thirstAt;
       engine tickCrop 改为 growthRemaining === thirstAt[thirstsDone] 触发。

- [x] Enhancement: 游戏界面 Tooltip 展示 Tile 信息时, 若是土地，则带上肥力信息
  改动: renderer.ts updateTooltip — 地块行追加 `肥力 X/10` (仅土地有 fertility,
  上限常量 MAX_TILE_FERTILITY, 快照已携带该字段)。

- [x] Enhancement: 多人竞技游戏界面 Tooltip 展示 Tile 信息时, 带上 己方/对方半场 信息
  改动: renderer.ts updateTooltip — 竞技模式下地块行追加 `己方半场 / 对方半场`
  (屏幕左半即当前视角 (含镜像) 的己方半场, 与半场分割线一致)。

- [x] Balance: 无人机 ChangeTile 操作能耗降低为 4; 改地块为土地时，土地的肥力为 0
  改动: config.ts CHANGE_TILE_COST 6→4; ops/change-tile.ts 转土地时 fertility 写 0
  (不再用初始肥力 5); docs.ts / MCP prompt / AGENTS.md 同步; engine.test.ts 更新
  能量断言并新增"转土地肥力为 0"断言。

- [x] Balance: 香菇浇水次数固定为 1
  改动: crops/shiitake.ts 删除 thirstCount 重写 (原随动态周期增减), 仅保留
  thirstCountBase = 1, 使用基类 thirstCount (1 × 地块浇水倍率)。
- [x] Refactor: `thirstInterval` 重构为 `thirstCountBase`, 作物属性均按总缺水次数记录
  改动:
  1. CropTypeConfig / BaseCrop: `thirstInterval: number | null` → **`thirstCountBase:
     number`** (基准总缺水次数, 0 = 无需浇水, 不再有 null)。
  2. 作物数值换算 (土地基准): 草莓/葡萄/荷花/水仙 0, 小麦 2 (30/15), 南瓜 5
     (100/18), 西瓜 6 (100/15), 紫云英 4 (160/40), 香菇 1 + 重写 thirstCount。
  3. `BaseCrop.thirstCount(tile, world)` 改为 `thirstCountBase × 地块浇水倍率`
     (盐碱地 ×2), **次数不再随实际周期缩放** (沙地只加生长周期、不加缺水次数);
     香菇重写 thirstCount = floor(growCycles / growCyclesBase) × 倍率, 保留
     "缺水次数随场上香菇数增减" 的原机制。
  4. 消费方适配: renderer Tooltip (thirstCountBase > 0), MCP get_crop
     (thirstCountBase), docs.ts (需水: N 次 / 无需浇水)。
  5. 紫云英同步调整 (由你修改): 移除 growUpdate 加速邻格机制, 属性改为
     收获 140 / 40 周期 / 恢复肥力 4; 移除两个对应的加速测试, 沙地南瓜/西瓜
     缺水次数测试改为固定基准值 (5 / 6 次)。
  6. 全部 94 个测试通过, shared/backend/frontend 构建通过。

- [x] Refactor: 所有作物增加 `canPlantDesc: string` 属性 (种植条件的人类可读描述),
  API 手册用它拼接作物的可种描述
  改动:
  1. CropTypeConfig / BaseCrop 新增必填 `canPlantDesc: string`; 9 种作物各自填写
     (与 canPlant 一致): 草莓/葡萄 "土地 / 沙地", 小麦 "除水池外的地块
     (土地 / 沙地 / 盐碱地)", 荷花/水仙 "水池", 南瓜/西瓜 "土地 / 盐碱地",
     紫云英 "土地 (肥力 < 6) / 沙地", 香菇 "仅土地"。
  2. docs.ts cropDocEntries 的 "可种在" 标签改为直接使用 `cfg.canPlantDesc`
     (不再用 plantableTiles 探测推导); MCP get_crop 同步输出 canPlantDesc。
  3. 顺带适配你调整后的作物参数 (以代码为准): 小麦可种非水池 + 收获 180;
     南瓜 300 成本/50 周期/700 收益/可种盐碱地; 西瓜 80 周期/2000 收益/
     fertilityCost 6/可种盐碱地; 紫云英恢复加速 (每回合仅加速 1 株) + 收获 120/
     30 周期/肥力 < 6 可种; CHANGE_TILE_COST 3。受影响测试同步更新
     (沙地测试改为小麦, 西瓜改测盐碱地 ×1.5 且浇水 ×2, ChangeTile 能量断言,
     收获肥力测试改用小麦)。
  4. 全部 94 个测试通过, shared/backend/frontend 构建通过。

- [x] Feature: 增加无人机操作 "Fertilize" "FertilizeRow" "FertilizeCol"
    1. Fertilize: 消耗 3 能量, 给脚下土地施肥, 土地肥力 + 3, 若不是土地则失败 (返还能量)
       → ops/fertilize.ts (能量不足/非土地均失败, 非土地不扣能量; 常量 FERTILIZE_COST=3 /
       FERTILIZE_GAIN=3)。
    2. FertilizeRow/Col: 消耗 8 能量, 给以自己为中心的 3 格行 / 列施肥, 土地肥力 + 3,
       若不是土地则跳过 (不返还能量)
       → ops/line.ts 新增 LineFertilizeOp 抽象基类 + ops/fertilize-row.ts / fertilize-col.ts
       (常量 FERTILIZE_ROW_COL_COST=8)。引擎只按 OP_CLASSES 分发, 零特判。
    3. 注册: types.ts InternalOperation + GameEvent 新增 'fertilize' 事件; ops/index.ts
       OP_CLASSES; player-api/index/player 导出; 前端 editor 补全、renderer 施肥绿色特效
       (fxFertilize) 与 game-layout 事件处理; docs.ts DOC_OPERATIONS + MCP prompt。
    4. engine.test.ts 新增 Fertilize 单格 (成功/非土地失败/能量不足) 与行/列 (跳过沙地、
       水池) 测试。

- [x] Feature: 增加作物 "仙人掌"
        id: `cactus`
        生长周期: 15 cycles (固定, 不受环境 debuff 影响)
        浇水: 无需
        可种植: 沙地, 盐碱地
        肥力: 0
        成本: 80
        收益: 100
        特性: 收获时, 将脚下的地块转变为土地, 肥力为 2
       → crops/cactus.ts: growCyclesBase 15 / 重写 growCycles 固定 15 (忽略沙地 ×3、
       盐碱地 ×1.5) / thirstCountBase 0 / canPlant 沙地·盐碱地 / plantCost 80 /
       value 100 / fertilityCost 0; 作物基类新增收获特效回调 `onHarvested`
       (types.ts HarvestEffectContext), 收获 (单格 + 行/列) 后调用, 仙人掌把脚下
       地块转为土地 (肥力 2); registry 注册 + CROP.md + MCP specialMechanisms 输出
       "收获特效"; engine.test.ts 沙地与盐碱地两条收获转土地测试 (均固定 15 周期)。
        描述: 环境植物, 能将不适宜生长的地块转为土地

- [x] Feature: 回放文件携带产生时的游戏版本号, 播放时版本不匹配则弹出警告
  改动:
  1. shared/replay.ts: ReplayFile 新增 `version` 字段 (录制时的 GAME_VERSION),
     ReplayRecorder.buildFile 写入; 新增 `replayVersionMismatch(file)` 判断
     (文件有版本号且与当前版本不同 → 不匹配; 旧文件无版本号 → 不警告)。
  2. frontend core/stats.ts 新增 `warnReplayVersion(file)`: 不匹配时弹出
     "版本警告" modal (显示录制版本与当前版本)。
  3. 播放入口接入: 回放页 normalizeReplay (本地导入 + 竞技历史回放), 单人
     "我的成绩 → 统计" (重放前检查)。
  4. replay.test.ts 断言 buildFile 携带版本号、replayVersionMismatch 三种情况。

- [x] Feature: 登录后端查询 GitHub 出错时输出日志说明
  改动: auth.ts `fetchGithubLogin` 增强错误日志:
  1. 令牌交换 (access_token): 网络错误 / 非 2xx (含 HTTP 状态码与响应体前 200 字符) /
     响应缺 access_token 均 console.warn;
  2. 用户信息接口 (api.github.com/user): 新增网络错误 try/catch 日志, 非 2xx
     (401 token 失效 / 403 限流 / 5xx) 输出 HTTP 状态码与响应体;
  3. 回调侧原有日志保留 (回调带 error / state 校验失败 / 登录失败兜底)。
