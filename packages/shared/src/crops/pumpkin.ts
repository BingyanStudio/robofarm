// 南瓜: 周期长、需浇水的重收益作物。
import { CropType, TileType } from '../types';
import { BaseCrop } from './base';

export class Pumpkin extends BaseCrop {
  readonly type = CropType.Pumpkin;
  readonly name = '南瓜';
  readonly description = '生长周期和浇水条件都苛刻的植物，但收益率高。';
  readonly habitats = [TileType.Soil, TileType.Sand];
  readonly plantCost = 100;
  readonly value = 500;
  readonly growCyclesBase = 100;
  readonly thirstInterval = 18; // 生长中缺水 5 次 (每 18 回合一次)
  readonly color = '#e89a3c';
}
