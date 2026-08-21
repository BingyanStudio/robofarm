// Move: 移动到周围 8 格之一 (只能到相邻格), 参与移动仲裁。
import { InternalOperation, Position } from '../types';
import { DroneOperation, OpContext, OpField, OpResult, TurnSession, isPosition } from './base';

export class Move extends DroneOperation {
  static readonly fields: OpField[] = [{ name: 'to', kind: 'position' }];
  readonly type = 'move';
  constructor(public to: Position) {
    super();
    if (!isPosition(to)) throw new Error('Move 的参数 to 必须是 [x, y] 坐标');
  }
  static apply(ctx: OpContext, op: InternalOperation, session: TurnSession): OpResult {
    const { drone } = ctx;
    const to = (op as { to: Position }).to;
    const dx = Math.abs(to[0] - drone.position[0]);
    const dy = Math.abs(to[1] - drone.position[1]);
    if (dx > 1 || dy > 1) {
      return { ok: false, message: `移动目标 ${JSON.stringify(to)} 超出周围 8 格范围, 只能移动到相邻格` };
    }
    if (dx === 0 && dy === 0) {
      return { ok: false, message: '移动目标与当前位置相同' };
    }
    // 登记移动候选, 由引擎阶段 2 统一仲裁
    session.moveCandidates.push({ drone, to, durationMs: ctx.durationMs });
    return { ok: true };
  }
}
