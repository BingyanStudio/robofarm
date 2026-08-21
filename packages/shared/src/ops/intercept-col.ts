// InterceptCol: 拦截整列 (以无人机为中心的 3 格列范围, 回合结束时结算), 消耗 6 能量。
import { LineInterceptOp } from './line';

export class InterceptCol extends LineInterceptOp {
  readonly type = 'interceptCol';
  static readonly axis = 'col' as const;
}
