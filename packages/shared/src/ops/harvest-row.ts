// HarvestRow: 收割整行 (以无人机为中心的行 3 格, 竞技模式仅自己半场), 消耗 4 能量。
import { LineHarvestOp } from './line';

export class HarvestRow extends LineHarvestOp {
  readonly type = 'harvestRow';
  static readonly axis = 'row' as const;
}
