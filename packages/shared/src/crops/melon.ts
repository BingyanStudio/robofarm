// 西瓜: 高价值作物, 需要合理规划浇水。
import { CropType, TileType } from '../types';
import type { CropTypeConfig } from '../registry';

export const melon: CropTypeConfig = {
  type: CropType.Melon,
  name: '西瓜',
  description: '一种高价值作物, 需要合理规划浇水。',
  habitats: [TileType.Soil, TileType.Sand],
  plantCost: 1000,
  value: 1800,
  growCycles: 100,
  thirstInterval: 15, // 生长中缺水 6 次 (沙地 ×1.5 时 10 次)
  color: '#66bb6a',
};
