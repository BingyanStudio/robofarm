// 轻量入口: 仅包含玩家沙箱 (worker / vm) 需要的最小集合, 不含 esbuild-wasm。
// 注意: 使用具名 re-export (而非 export *), 保证 tsc 产物为静态可分析的
// 属性导出, 便于 Vite/Rollup 打包。
export { TIMEOUT_MS, LOAD_TIMEOUT_MS, MAX_WATER, MAX_LOG_LINES, MAX_LOGS_PER_TURN } from './config';
export type { Position, InternalOperation, TileInfo, CropInfo, DroneInfo, GameInfo, PlayerView, SnapshotState } from './types';
export { TileType, CropType, CropState } from './types';
export type { CropData, Tile, DroneState, WorldState, GameEvent, GameResult, GameMode, Frame } from './types';
export { normalizeOp } from './ops';
export type { NormalizeResult } from './ops';
export { TILES, CROPS, isCropType, cropConfig, cropInfo } from './registry';
export type { TileTypeConfig, CropTypeConfig } from './registry';
export { mirrorPosition, createSingleWorld, createCombatWorld, isOwnHalf, isOwnHalfAt, inBounds, tileAt, samePos, placeCrop, isWater } from './maps';
export { toLocal, fromLocal, buildPlayerView, snapshotOf, findDroneAt } from './view';
export { playerApiFactory, DroneOperation, Move, Teleport, NewDrone, Plant, CollectWater, Water, Harvest, Clear, Intercept, Charge, HarvestRow, HarvestCol, WaterRow, WaterCol, InterceptRow, InterceptCol, PlantRow, PlantCol, ChangeTile, Fertilize, FertilizeRow, FertilizeCol, OPS } from './player-api';
export type { PlayerApi, PlayerConsole } from './player-api';
