// 紫云英: 绿肥植物, 生长时加速周围作物的生长。
// 特殊效果 (growUpdate) 直接定义在本文件, 引擎直接调用。
import { CropState, CropType, Position, Tile, TileType, WorldState } from '../types';
import type { GrowthEffectContext } from '../types';
import { BaseCrop } from './base';

export class MilkVetch extends BaseCrop {
  readonly type = CropType.MilkVetch;
  readonly name = '紫云英';
  readonly description = '绿肥植物，生长时会加速周围作物的生长。';
  readonly fertilityCost = -4; // 绿肥: 收获时恢复土地肥力
  readonly plantCost = 100;
  readonly value = 120;
  readonly growCyclesBase = 30;
  readonly thirstCountBase = 2; // 生长中缺水 2 次
  readonly color = '#7e9be8';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Soil || tile.type === TileType.Sand;
  }
  /** 种植条件描述 */
  readonly canPlantDesc = '土地 / 沙地';

  /** 生长特效 (growUpdate): 生长中每回合按 上→右→下→左 加速邻格作物的生长 */
  growUpdate({ world, pos }: GrowthEffectContext): void {
    this.accelerateNeighbors(world, pos);
  }

  /**
   * 按 上→右→下→左 顺序检查周围 Tile, 若有作物且不缺水 (Growing)
   * 且距离成熟剩余 >= 2 周期, 则其生长时间 -1 周期。
   */
  private accelerateNeighbors(world: WorldState, pos: Position): void {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = pos[0] + dx;
      const ny = pos[1] + dy;
      if (nx < 0 || nx >= world.map[0].length || ny < 0 || ny >= world.map.length) continue;
      const nb = world.map[ny][nx].crop;
      if (!nb || nb.state !== CropState.Growing) continue; // 缺水 (Thirsty) 的作物不加速
      if (nb.growthRemaining < 2) continue; // 距成熟不足 2 周期不加速
      nb.growthRemaining -= 1;
      break;
    }
  }
}
