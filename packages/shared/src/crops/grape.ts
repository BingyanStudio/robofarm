// 葡萄: 生长周期稍长的中阶作物。
import { CropType, TileType } from '../types';
import { BaseCrop } from './base';

export class Grape extends BaseCrop {
  readonly type = CropType.Grape;
  readonly name = '葡萄';
  readonly description = '生长周期稍长，利率更高，味道也很不错。';
  readonly habitats = [TileType.Soil, TileType.Sand];
  readonly plantCost = 20;
  readonly value = 40;
  readonly growCyclesBase = 15;
  readonly thirstInterval = null; // 无需浇水
  readonly color = '#9b6dd7';
}
