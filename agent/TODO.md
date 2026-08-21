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
