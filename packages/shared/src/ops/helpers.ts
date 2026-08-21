// 操作语义共用的辅助函数 (从 engine.ts 迁出, 供各操作类使用)。
import { CropState, CropType, DroneState, Position, TileType, WorldState } from '../types';
import { TILES, cropConfig } from '../registry';
import { inBounds } from '../maps';

/** 上下左右四个正交邻格 (越界跳过) */
export function orthNeighbors(pos: Position, world: WorldState): Position[] {
  const out: Position[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = pos[0] + dx;
    const ny = pos[1] + dy;
    if (nx >= 0 && nx < world.map[0].length && ny >= 0 && ny < world.map.length) {
      out.push([nx, ny]);
    }
  }
  return out;
}

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
 * 沙漠化: 收获作物时, 若该格的上下左右存在沙地, 则该格也转化为沙地。
 * 仅蚕食土地 (soil) 地块, 不影响水 (water) 等地块。
 * (调用前该格作物已移除)
 */
export function maybeDesertify(world: WorldState, pos: Position): void {
  if (world.map[pos[1]][pos[0]].type !== TileType.Soil) return;
  for (const [nx, ny] of orthNeighbors(pos, world)) {
    if (world.map[ny][nx].type === TileType.Sand) {
      world.map[pos[1]][pos[0]] = { type: TileType.Sand, crop: null };
      return;
    }
  }
}

/**
 * 尝试在指定格种植作物 (与单格 Plant 相同的判定: 地块适配 / 无作物 / 金钱足够)。
 * 成功时扣除成本并写入作物数据, 返回 true; 任一条件不满足则不改动任何状态, 返回 false。
 * 生长周期按地块类型倍率 / 作物 growthOverride / 作物 plantCycles 动态计算。
 */
export function tryPlantAt(world: WorldState, drone: DroneState, pos: Position, crop: CropType): boolean {
  const cfg = cropConfig(crop);
  const tile = world.map[pos[1]][pos[0]];
  if (!cfg.habitats.includes(tile.type)) return false;
  if (tile.crop) return false;
  const player = world.players[drone.player];
  if (player.money < cfg.plantCost) return false;
  player.money -= cfg.plantCost;
  // 生长周期受地块类型影响 (如沙地 ×1.5, 数据在 TILES 注册表);
  // 作物可用 growthOverride 覆盖地块倍率 (特殊机制);
  // 作物可用 plantCycles 自定义动态周期 (如香菇: 20 + 2 × 场上香菇总数);
  // 总缺水次数按该次种植的实际周期动态计算 (不依赖固定的剩余取模)
  const adjusted = cfg.plantCycles
    ? cfg.plantCycles(world)
    : Math.floor(cfg.growCycles * (cfg.growthOverride ?? TILES[tile.type].growthFactor));
  tile.crop = {
    type: crop,
    state: CropState.Growing,
    growthRemaining: adjusted,
    thirstTotal: cfg.thirstInterval === null ? 0 : Math.floor(adjusted / cfg.thirstInterval),
    thirstsDone: 0,
    plantCycles: adjusted,
  };
  return true;
}
