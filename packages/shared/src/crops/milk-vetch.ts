// 紫云英: 绿肥植物, 生长时加速周围作物的生长。
// 特殊效果 (growUpdate) 直接定义在本文件, 引擎直接调用。
import { CropType, Tile, TileType } from '../types';
import { BaseCrop } from './base';

export class MilkVetch extends BaseCrop {
  readonly type = CropType.MilkVetch;
  readonly name = '紫云英';
  readonly description = '绿肥植物，生长时会加速周围作物的生长。';
  readonly fertilityCost = -4; // 绿肥: 收获时恢复土地肥力
  readonly plantCost = 100;
  readonly value = 140;
  readonly growCyclesBase = 40;
  readonly thirstCountBase = 4; // 总缺水 4 次
  readonly color = '#7e9be8';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Soil || tile.type === TileType.Sand;
  }

  // 加速生长效果已经移除
}
