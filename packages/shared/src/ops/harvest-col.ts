// HarvestCol: 收割整列 (以无人机为中心的列 3 格, 竞技模式仅自己半场), 消耗 4 能量。
import { LineHarvestOp } from './line';

export class HarvestCol extends LineHarvestOp {
  readonly type = 'harvestCol';
  static readonly axis = 'col' as const;
}
