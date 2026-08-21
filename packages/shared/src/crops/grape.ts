// 葡萄: 生长周期稍长的中阶作物。
import { CropType, TileType } from '../types';
import type { CropTypeConfig } from '../registry';

export const grape: CropTypeConfig = {
  type: CropType.Grape,
  name: '葡萄',
  description: '生长周期稍长，利率更高，味道也很不错。',
  habitats: [TileType.Soil, TileType.Sand],
  plantCost: 20,
  value: 40,
  growCycles: 15,
  thirstInterval: null, // 无需浇水
  color: '#9b6dd7',
};
