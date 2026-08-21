# TODO

此处放置所有待办事项

- [x] Refactor: 当前 **农作物** 统一放在 `CROPS` 字典中，**特殊效果** 额外储存在 `GROWTH_EFFECTS`, `MATURITY_EFFECTS` 字典中；希望拆分, 一个 ts 文件仅描述一个作物，其全部属性 (包括基本属性, 特殊效果, 前端的 `CROP_COLORS` 等) 全部写在一个文件内
  改动:
  1. 新增 `shared/src/crops/` 目录, 每种作物一个文件 (`strawberry.ts` / `grape.ts` /
     `wheat.ts` / `lotus.ts` / `pumpkin.ts` / `melon.ts` / `milk-vetch.ts` /
     `shiitake.ts` / `daffodil.ts`), 导出各自的 `CropTypeConfig`。
  2. registry.ts 只保留 `CropTypeConfig` 接口与地块 `TILES`, `CROPS` 注册表改为
     从 crops/ 汇总 (新增作物 = 新建文件 + 在这里登记)。
  3. **特殊效果内聚到作物文件**: `onMature` / `onGrow` 从"字符串效果 id"改为
     **直接挂在配置上的函数** (香菇 selfSpread、水仙 autoWater、紫云英
     accelerateNeighbors 全部迁入各自文件), 引擎 `tickCrop` 直接 `cfg.onMature?.(...)`
     调用, 删除 engine.ts 的 `MATURITY_EFFECTS` / `GROWTH_EFFECTS` 字典。
  4. 香菇动态周期也迁入作物文件: 新增 `CropTypeConfig.plantCycles(world)` 回调,
     engine.ts 的 `tryPlantAt` / `spawnShiitake` 改走该回调, 移除引擎里
     `CropType.Shiitake` 特判。
  5. **前端 CROP_COLORS 迁移**: 新增 `CropTypeConfig.color` 字段 (沿用原配色),
     `frontend/src/core/stats.ts` 的 `CROP_COLORS` / `CROP_NAMES` 字典删除,
     改为 `cropConfig(type).color` / `.name` (未收录作物保留哈希回退)。
  6. MCP `get_crop` 工具不再直接序列化函数, 改为输出 `specialMechanisms` 描述数组。
  7. 行为零变化: 全部 100 个测试通过, 前端构建通过。

- [x] Refactor: 当前 **无人机操作** 中，阶段1 含有较多 if-else, 而非移动操作是通过查字典确定效果的, 希望重构为: 利用 Typescript 继承 + 函数重写, 将无人机操作拆解为多个文件，每个文件按 class 描述无人机操作，继承自同一个基类，通过重写基类函数来实现不同功能; engine.ts 不使用 if else, 而是直接调用函数, 函数会根据不同 class 执行不同的功能
  改动:
  1. 新增 `shared/src/ops/` 目录 (原 ops.ts 删除):
     - `base.ts`: `DroneOperation` 抽象基类 + 共享类型 (`OpContext` 含 durationMs /
       `TurnSession` 收集移动候选与 NewDrone 请求 / `MoveCandidate` / `OpClass` /
       `OpField` / `isPosition`)。
     - 每个操作一个文件: `move.ts` / `teleport.ts` / `new-drone.ts` / `plant.ts` /
       `collect-water.ts` / `water.ts` / `harvest.ts` / `clear.ts` / `intercept.ts` /
       `charge.ts` / `change-tile.ts` / `harvest-row.ts` / `harvest-col.ts` /
       `water-row.ts` / `water-col.ts` / `plant-row.ts` / `plant-col.ts` /
       `intercept-row.ts` / `intercept-col.ts`。
     - `line.ts`: 行/列范围操作的 4 个抽象基类 (LineHarvestOp / LineWaterOp /
       LinePlantOp / LineInterceptOp), 具体类只声明 `type` 与 `axis` 即复用逻辑。
     - `helpers.ts`: 从 engine.ts 迁出的公共语义 (orthNeighbors / lineRangePositions /
       intercroppingValue / maybeDesertify / tryPlantAt)。
     - `index.ts`: `OP_CLASSES` 注册表 (type → 操作类, 新增操作在此登记) +
       `opClassOf()` + `normalizeOp()` (结构校验改读各操作类的静态 `fields`)。
  2. **engine.ts 去掉 if-else / OP_HANDLERS 字典**: 阶段 1 改为查 `OP_CLASSES`
     并调用 `cls.apply(ctx, op, session)`; 移动/传送的校验与登记移动候选、
     NewDrone 的校验/扣款/登记延迟创建全部下沉到各操作类自己的 `apply()`。
     引擎只保留通用的移动仲裁 / 拦截结算 / 作物生长 / 回合末建机流程。
  3. **玩家侧 API 不变**: player-api.ts 从 ./ops 二次导出全部操作类与 `OPS` 注入沙箱,
     normalizeOp 兼容 class 实例与 `{ type }` 纯对象, 类名被压缩 (constructor.name
     不可靠) 时仍按实例 `type` 字段识别 (ops.test.ts 回归覆盖)。
  4. 行为零变化: 全部 100 个测试通过, shared/backend/frontend 构建通过。
- [x] Refactor: 作物删除 `growthOverride`; `growCycles` 与 `plantCycles()` 合并为
  `growCycles(tile, world)` 函数, 由作物基类提供默认实现 (沙地 ×1.5), 子类按需重写
  改动:
  1. 新增 `crops/base.ts` 抽象基类 `BaseCrop` (implements CropTypeConfig): 声明
     全部属性字段, 并提供 `growCycles(tile, world)` 默认实现 —— 按种植地块的
     `TILES[tile.type].growthFactor` 计算 (沙地 1.5 → ×1.5 向下取整)。
  2. 9 个作物文件从"配置对象"改为 **class** (继承 BaseCrop, 只填属性),
     registry.ts 的 `CROPS` 统一 `new Xxx()` 实例化。
  3. 删除 `CropTypeConfig.growthOverride` 与 `plantCycles`; 新增
     `growCyclesBase` (基准周期, 土地上的回合数, 前端贴图进度也用它) 与
     `growCycles(tile, world)`。西瓜/南瓜等不再有"沙地免疫"字段, 沙地一律 ×1.5
     (与原先实际行为一致, 西瓜沙地减速测试保留)。
  4. 香菇重写 `growCycles(_tile, world) = growCyclesBase + 2×场上香菇数`
     (原 plantCycles 逻辑迁移); `tryPlantAt` 与香菇扩散 (spawnShiitake) 统一走
     `cfg.growCycles(tile, world)`, 引擎删除 shiitakeGrowCycles 辅助函数。
  5. 消费方适配: `sprites.ts` / `docs.ts` / MCP `get_crop` 改用 `growCyclesBase`;
     MCP 的"动态生长周期"检测改为 `cfg.growCycles !== BaseCrop.prototype.growCycles`;
     `BaseCrop` 从 shared 导出。
  6. 注意: `CropData.plantCycles` (种植时记录的实际周期, 缺水触发用) 是**数据字段**,
     与配置函数无关, 保留不动。
  7. 行为零变化: 全部 100 个测试通过, shared/backend/frontend 构建通过。

- [x] Refactor: 对 **地块 (Tile)** 做与作物同构的重构 —— 每种地块一个文件、继承基类,
  通用字段带默认值, 特殊地块重写
  改动:
  1. 新增 `shared/src/tiles/` 目录: 抽象基类 `BaseTile` (implements TileTypeConfig)
     + `soil.ts` / `water.ts` / `sand.ts` 三个地块 class。
  2. **默认值下沉到基类**: `canCollectWater = false` (水池重写为 true)、
     `growthFactor = 1` (沙地重写为 1.5); 其余字段 (type/name/sprite/
     spriteWithCrop/color) 为抽象属性由各地块填写。
  3. registry.ts 的 `TILES` 改为统一 `new Soil()/new Water()/new Sand()` 实例化
     (新增地块 = 新建 tiles/ 文件 + registry 登记, 与作物一致)。
  4. `TileTypeConfig` 接口保留 (仍由 `TILES` 导出给消费方), `BaseTile` 从 shared
     导出; 所有消费方 (`renderer` / `sprites` / `docs` / ops 校验与提示语 /
     `BaseCrop.growCycles`) 读的都是实例属性, 零改动。
  5. 行为零变化: 全部 100 个测试通过, shared/backend/frontend 构建通过。
