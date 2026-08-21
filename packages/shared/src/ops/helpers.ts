// 操作语义共用的辅助函数 (从 engine.ts 迁出, 供各操作类使用)。
import { CropState, CropType, DroneState, GameEvent, Position, WorldState } from '../types';
import { TILES, cropConfig } from '../registry';
import { inBounds, orthNeighbors } from '../maps';
import { pickThirstPoints, plantingSeed } from '../rng';

/** 以无人机为中心的行/列 3 格范围 (越界跳过) */
export function lineRangePositions(center: Position, axis: 'row' | 'col', world: WorldState): Position[] {
  const out: Position[] = [];
  const c = center[axis === 'row' ? 0 : 1];
  for (let i = c - 1; i <= c + 1; i++) {
    const pos: Position = axis === 'row' ? [i, center[1]] : [center[0], i];
    if (inBounds(world, pos)) out.push(pos);
  }
  return out;
}

/**
 * 间作: 若作物的四方向邻格至少有 2 个不同于自己种类的作物, 收获收益 +20% (向下取整)。
 */
export function intercroppingValue(world: WorldState, pos: Position, cropType: CropType, base: number): number {
  let diff = 0;
  for (const [nx, ny] of orthNeighbors(pos, world)) {
    const nb = world.map[ny][nx].crop;
    if (nb && nb.type !== cropType) diff++;
  }
  return diff >= 2 ? Math.floor(base * 1.2) : base;
}

/**
 * 尝试在指定格种植作物 (与单格 Plant 相同的判定: 地块适配 / 无作物 / 金钱足够)。
 * 成功时扣除成本并写入作物数据, 返回 true; 任一条件不满足则不改动任何状态, 返回 false。
 * 实际生长周期由作物自己的 growCycles(tile, world) 计算 (基类默认按地块倍率,
 * 特殊作物重写, 如香菇按场上数量)。
 * 种下后触发该地块的 onCropPlanted 回调。
 */
export function tryPlantAt(
  world: WorldState,
  drone: DroneState,
  pos: Position,
  crop: CropType,
  events: GameEvent[]
): boolean {
  const cfg = cropConfig(crop);
  const tile = world.map[pos[1]][pos[0]];
  if (!cfg.canPlant(tile)) return false;
  if (tile.crop) return false;
  const player = world.players[drone.player];
  if (player.money < cfg.plantCost) return false;
  player.money -= cfg.plantCost;
  // 实际周期 = 作物 growCycles(tile, world) (基类默认按地块倍率 (沙地 ×3) 向下取整);
  // 缺水次数 = 作物 thirstCount(tile, world) (基类默认按周期/间隔 × 地块浇水倍率);
  // 缺水时机 = 种植时确定性随机选取 (thirstAt, 保证回放一致)
  const adjusted = cfg.growCycles(tile, world);
  tile.crop = {
    type: crop,
    state: CropState.Growing,
    growthRemaining: adjusted,
    thirstAt: pickThirstPoints(
      plantingSeed(world, pos, crop, drone.player),
      adjusted,
      cfg.thirstCount(tile, world)
    ),
    thirstsDone: 0,
  };
  // 地块的"作物种下"回调
  TILES[tile.type].onCropPlanted?.({ world, pos, crop: tile.crop, events });
  return true;
}
