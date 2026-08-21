// PlantRow: 种植整行 (以无人机为中心的行 3 格, 按 plants 顺序,
// 跳过无法种植的格子, 直到行末或数组耗尽), 消耗 3 能量。
import { CropType } from '../types';
import { isCropType } from '../registry';
import type { OpField } from './base';
import { LinePlantOp } from './line';

export class PlantRow extends LinePlantOp {
  static readonly axis = 'row' as const;
  static readonly fields: OpField[] = [{ name: 'plants', kind: 'crops' }];
  readonly type = 'plantRow';
  constructor(public plants: CropType[]) {
    super();
    if (!Array.isArray(plants) || plants.length === 0 || !plants.every((c) => isCropType(c))) {
      throw new Error('PlantRow 的参数 plants 必须是非空作物类型数组 (如 [\'strawberry\', \'grape\'])');
    }
  }
}
