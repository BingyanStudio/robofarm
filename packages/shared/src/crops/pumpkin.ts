// 南瓜: 周期长、需浇水的重收益作物, 收获时消耗 2 点土地肥力。
import { CropType, Tile, TileType } from '../types';
import { BaseCrop } from './base';

export class Pumpkin extends BaseCrop {
  readonly type = CropType.Pumpkin;
  readonly name = '南瓜';
  readonly description = '生长周期和浇水条件都苛刻的植物，但收益率高。';
  readonly fertilityCost = 2; // 消耗土地肥力
  readonly plantCost = 100;
  readonly value = 500;
  readonly growCyclesBase = 100;
  readonly thirstInterval = 18; // 生长中缺水 5 次 (每 18 回合一次)
  readonly color = '#e89a3c';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Soil || tile.type === TileType.Sand;
  }
}
