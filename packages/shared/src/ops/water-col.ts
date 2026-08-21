// WaterCol: 浇灌整列 (以无人机为中心的列 3 格, 给缺水作物浇水直到水耗尽), 消耗 3 能量。
import { LineWaterOp } from './line';

export class WaterCol extends LineWaterOp {
  readonly type = 'waterCol';
  static readonly axis = 'col' as const;
}
