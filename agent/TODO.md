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

- [ ] Balance: 作物的浇水时机改为非均匀分布, 在种植时随机选取
    1. 先计算生长周期和浇水次数, 然后随机选择 n(n=浇水次数) 个位置, 当生长到该周期时缺水
    2. 随机仅改变缺水时机, 不改变缺水次数
    3. 该属性对玩家隐藏，无法通过无人机 API 获取
    4. 游戏 Tooltip 删除 "作物还有多少周期缺水" 的显示
    5. 游戏回放需要保存每个作物的缺水时机, 以保证回放与游玩的过程和结果相同

- [ ] Enhancement: 游戏界面 Tooltip 展示 Tile 信息时, 若是土地，则带上肥力信息

- [ ] Enhancement: 多人竞技游戏界面 Tooltip 展示 Tile 信息时, 带上 己方/对方半场 信息