// 小麦: 需要浇水的作物, 收获时消耗 1 点土地肥力。
import { CropType, Tile, TileType } from '../types';
import { BaseCrop } from './base';

export class Wheat extends BaseCrop {
  readonly type = CropType.Wheat;
  readonly name = '小麦';
  readonly description = '需要浇水的作物，但收益较高。';
  readonly fertilityCost = 1; // 消耗土地肥力
  readonly plantCost = 30;
  readonly value = 180;
  readonly growCyclesBase = 30;
  readonly thirstCountBase = 2; // 总缺水 2 次
  readonly color = '#e0c068';

  canPlant(tile: Tile): boolean {
    return tile.type !== TileType.Water;
  }
  /** 种植条件描述 */
  readonly canPlantDesc = '土地 / 沙地 / 盐碱地';
}
