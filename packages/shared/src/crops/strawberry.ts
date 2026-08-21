// 草莓: 零成本的基础作物。
// 每个作物的全部属性 (基本属性 / 特殊效果 / 统计配色) 都写在自己这一个文件里,
// 由 ../registry.ts 汇总进 CROPS 注册表。
import { CropType, TileType } from '../types';
import type { CropTypeConfig } from '../registry';

export const strawberry: CropTypeConfig = {
  type: CropType.Strawberry,
  name: '草莓',
  description: '零成本的基础作物, 味道很不错。',
  habitats: [TileType.Soil, TileType.Sand],
  plantCost: 0,
  value: 5,
  growCycles: 5,
  thirstInterval: null, // 无需浇水
  color: '#ef5a6f',
};
