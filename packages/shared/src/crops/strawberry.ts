// 草莓: 零成本的基础作物。
// 每种作物一个文件, 继承 BaseCrop; 生长周期用基类默认实现 (沙地 ×3)。
import { CropType, Tile, TileType } from '../types';
import { BaseCrop } from './base';

export class Strawberry extends BaseCrop {
  readonly type = CropType.Strawberry;
  readonly name = '草莓';
  readonly description = '零成本的基础作物, 味道很不错。';
  readonly plantCost = 0;
  readonly value = 5;
  readonly growCyclesBase = 5;
  readonly thirstCountBase = 0; // 无需浇水
  readonly color = '#ef5a6f';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Soil || tile.type === TileType.Sand;
  }
  /** 种植条件描述 */
  readonly canPlantDesc = '土地 / 沙地';
}
