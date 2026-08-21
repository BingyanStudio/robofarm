// 仙人掌: 环境植物, 能在沙地 / 盐碱地生长, 收获后把脚下地块转为土地 (肥力 2)。
// 生长固定 15 周期 (不受环境 debuff 影响); 特殊效果 (onHarvested) 定义在本文件。
import { CropType, Tile, TileType } from '../types';
import type { HarvestEffectContext, WorldState } from '../types';
import { BaseCrop } from './base';

export class Cactus extends BaseCrop {
  readonly type = CropType.Cactus;
  readonly name = '仙人掌';
  readonly description = '环境植物, 能将不适宜生长的地块转为土地; 不受环境 debuff 影响';
  readonly plantCost = 80;
  readonly value = 100;
  readonly growCyclesBase = 15;
  readonly thirstCountBase = 0; // 无需浇水
  readonly color = '#7cb342';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Sand || tile.type === TileType.Salt;
  }

  readonly canPlantDesc = '沙地 / 盐碱地';

  /** 生长固定 15 周期: 忽略地块 growthFactor (沙地 ×3 / 盐碱地 ×1.5 均不生效) */
  growCycles(_tile: Tile, _world: WorldState): number {
    return this.growCyclesBase;
  }

  /** 收获特效: 将脚下的地块转变为土地, 肥力为 2 */
  onHarvested({ world, pos }: HarvestEffectContext): void {
    world.map[pos[1]][pos[0]] = { type: TileType.Soil, crop: null, fertility: 2 };
  }
}
