// 小麦: 需要浇水的作物。
import { CropType, TileType } from '../types';
import { BaseCrop } from './base';

export class Wheat extends BaseCrop {
  readonly type = CropType.Wheat;
  readonly name = '小麦';
  readonly description = '需要浇水的作物，但收益较高。';
  readonly habitats = [TileType.Soil];
  readonly plantCost = 30;
  readonly value = 120;
  readonly growCyclesBase = 30;
  readonly thirstInterval = 15; // 生长中缺水 2 次 (剩余 20、10 回合时)
  readonly color = '#e0c068';
}
