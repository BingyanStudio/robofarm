# TODO

此处放置所有待办事项
- [x] Refactor: Tile 类型增加 "作物种下" / "作物浇水" / "作物收获" 三个回调,
  分别在对应时机执行; "沙漠化" 机制移动到土地的 "作物收获" 回调中, 不再单独实现
  改动:
  1. `types.ts` 新增 `TileCropEventContext` (world / pos / crop / events);
     `TileTypeConfig` 与 `BaseTile` 新增可选回调: `onCropPlanted` / `onCropWatered` /
     `onCropHarvested`, 与作物的 onGrow/onMature 同构, 引擎直接调用、不 if 硬编码。
  2. **触发时机**:
     - 种下: `tryPlantAt` (单格 + 行/列种植) 与香菇扩散 `spawnShiitake` 种下后;
     - 浇水: 单格 Water、行/列浇水 (LineWaterOp)、水仙自动浇水 (daffodil onGrow) 后;
     - 收获: 单格 Harvest 与行/列收割 (LineHarvestOp) 收获后 (此时该格作物已移除,
       tile.type 仍是原地块, 回调按原地块分发)。
  3. **沙漠化迁入土地**: 删除 ops/helpers.ts 的 `maybeDesertify`, 逻辑改写为
     tiles/soil.ts 的 `onCropHarvested` (收获后若上下左右有沙地则本格转沙地;
     土壤守卫由"回调只在土地自身触发时执行"天然满足); ops/harvest.ts 与
     ops/line.ts 改为调用 `TILES[tile.type].onCropHarvested?.(...)`。
  4. `orthNeighbors` 从 ops/helpers.ts 上移到 maps.ts (通用地图工具, 供 tiles 与 ops
     共用, 避免 tiles 依赖 ops 目录), 并从 shared 导出。
  5. 行为零变化: 沙漠化测试原样通过 (收获/行收割两条路径), 全部 100 个测试通过,
     shared/backend/frontend 构建通过。

- [x] Refactor: 将香菇扩散 (成熟后每回合扩散) 的逻辑整体移入 crops/shiitake.ts,
  作物基类增加成熟后每回合回调
  改动:
  1. `types.ts` 新增 `GrownEffectContext`; `CropTypeConfig` 与 `BaseCrop` 新增可选回调
     **`onGrown`** (作物处于 Grown 状态时每回合执行, 与 onGrow/onMature 同构)。
  2. engine.ts 的 Grown 分支改为通用分发 `cfg.onGrown?.(...)`, 删除 `spawnShiitake`
     函数与相关特判 (CropType/TileType/TILES 导入随之移除)。
  3. 香菇全部机制内聚到 crops/shiitake.ts: `onMature` 设 `spreadLeft=4`,
     `onGrown` 每回合按上右下左扩散 1 株 (spreadLeft 到 0 停止), 私有方法
     `spawnShiitake` 负责在邻格种下新香菇 (走本类重写的 growCycles 动态周期,
     并触发地块的 onCropPlanted 回调)。
  4. 行为零变化: 香菇扩散测试原样通过 (4 回合方向顺序 / 越界放弃 / 已有作物放弃 /
     场上数量动态周期), 全部 100 个测试通过, shared/backend/frontend 构建通过。
