// 小麦: 需要浇水的作物。
import { CropType, TileType } from '../types';
import type { CropTypeConfig } from '../registry';

export const wheat: CropTypeConfig = {
  type: CropType.Wheat,
  name: '小麦',
  description: '需要浇水的作物，但收益较高。',
  habitats: [TileType.Soil],
  plantCost: 30,
  value: 120,
  growCycles: 30,
  thirstInterval: 15, // 生长中缺水 2 次 (剩余 20、10 回合时)
  color: '#e0c068',
};
