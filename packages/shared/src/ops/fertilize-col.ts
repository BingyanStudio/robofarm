// FertilizeCol: 施肥整列 (以无人机为中心的列 3 格, 土地肥力 +3, 非土地跳过), 消耗 8 能量。
import { LineFertilizeOp } from './line';

export class FertilizeCol extends LineFertilizeOp {
  readonly type = 'fertilizeCol';
  static readonly axis = 'col' as const;
}
