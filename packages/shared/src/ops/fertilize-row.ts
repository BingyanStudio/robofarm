// FertilizeRow: 施肥整行 (以无人机为中心的行 3 格, 土地肥力 +3, 非土地跳过), 消耗 8 能量。
import { LineFertilizeOp } from './line';

export class FertilizeRow extends LineFertilizeOp {
  readonly type = 'fertilizeRow';
  static readonly axis = 'row' as const;
}
