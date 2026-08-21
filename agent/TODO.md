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

- [ ] Refactor: 当前 **无人机操作** 中，阶段1 含有较多 if-else, 而非移动操作是通过查字典确定效果的, 希望重构为: 利用 Typescript 继承 + 函数重写, 将无人机操作拆解为多个文件，每个文件按 class 描述无人机操作，继承自同一个基类，通过重写基类函数来实现不同功能; engine.ts 不使用 if else, 而是直接调用函数, 函数会根据不同 class 执行不同的功能