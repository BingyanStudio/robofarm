// InterceptRow: 拦截整行 (以无人机为中心的 3 格行范围, 回合结束时结算), 消耗 6 能量。
import { LineInterceptOp } from './line';

export class InterceptRow extends LineInterceptOp {
  readonly type = 'interceptRow';
  static readonly axis = 'row' as const;
}
