// 南瓜: 周期长、需浇水的重收益作物。
import { CropType, TileType } from '../types';
import type { CropTypeConfig } from '../registry';

export const pumpkin: CropTypeConfig = {
  type: CropType.Pumpkin,
  name: '南瓜',
  description: '生长周期和浇水条件都苛刻的植物，但收益率高。',
  habitats: [TileType.Soil, TileType.Sand],
  plantCost: 100,
  value: 500,
  growCycles: 100,
  thirstInterval: 18, // 生长中缺水 5 次 (每 18 回合一次)
  color: '#e89a3c',
};
