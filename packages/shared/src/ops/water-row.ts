// WaterRow: 浇灌整行 (以无人机为中心的行 3 格, 给缺水作物浇水直到水耗尽), 消耗 3 能量。
import { LineWaterOp } from './line';

export class WaterRow extends LineWaterOp {
  readonly type = 'waterRow';
  static readonly axis = 'row' as const;
}
