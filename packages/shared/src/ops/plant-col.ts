// PlantCol: 种植整列 (以无人机为中心的列 3 格, 按 plants 顺序,
// 跳过无法种植的格子, 直到列末或数组耗尽), 消耗 3 能量。
import { CropType } from '../types';
import { isCropType } from '../registry';
import type { OpField } from './base';
import { LinePlantOp } from './line';

export class PlantCol extends LinePlantOp {
  static readonly axis = 'col' as const;
  static readonly fields: OpField[] = [{ name: 'plants', kind: 'crops' }];
  readonly type = 'plantCol';
  constructor(public plants: CropType[]) {
    super();
    if (!Array.isArray(plants) || plants.length === 0 || !plants.every((c) => isCropType(c))) {
      throw new Error('PlantCol 的参数 plants 必须是非空作物类型数组 (如 [\'strawberry\', \'grape\'])');
    }
  }
}
