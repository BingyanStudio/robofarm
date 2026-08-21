// 荷花: 水生植物, 让水池也成为盈利点。
import { CropType, TileType } from '../types';
import type { CropTypeConfig } from '../registry';

export const lotus: CropTypeConfig = {
  type: CropType.Lotus,
  name: '荷花',
  description: '水生植物，让水池也成为盈利点。',
  habitats: [TileType.Water],
  plantCost: 30,
  value: 90,
  growCycles: 40,
  thirstInterval: null, // 无需浇水
  color: '#f48fb1',
};
