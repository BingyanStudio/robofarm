// 南瓜: 周期长、需浇水的重收益作物, 收获时消耗 2 点土地肥力。
import { CropType, Tile, TileType } from '../types';
import { BaseCrop } from './base';

export class Pumpkin extends BaseCrop {
  readonly type = CropType.Pumpkin;
  readonly name = '南瓜';
  readonly description = '经济价值较高的作物, 需要浇水并消耗部分肥力';
  readonly fertilityCost = 3; // 消耗土地肥力
  readonly plantCost = 300;
  readonly value = 700;
  readonly growCyclesBase = 50;
  readonly thirstCountBase = 5; // 总缺水 5 次
  readonly color = '#e89a3c';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Soil || tile.type === TileType.Salt;
  }
  /** 种植条件描述 */
  readonly canPlantDesc = '土地 / 盐碱地';
}
