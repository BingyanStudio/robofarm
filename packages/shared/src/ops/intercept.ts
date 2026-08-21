// Intercept: 拦截 — 指定一个格子, 偷菜无人机在该回合结束时进入则返还资金 (仅竞技模式)。
import { InternalOperation, Position } from '../types';
import { inBounds } from '../maps';
import { DroneOperation, OpContext, OpField, OpResult, TurnSession, isPosition } from './base';

export class Intercept extends DroneOperation {
  static readonly fields: OpField[] = [{ name: 'at', kind: 'position' }];
  readonly type = 'intercept';
  constructor(public at: Position) {
    super();
    if (!isPosition(at)) throw new Error('Intercept 的参数 at 必须是 [x, y] 坐标');
  }
  static apply(ctx: OpContext, op: InternalOperation, _session: TurnSession): OpResult {
    const { world, drone } = ctx;
    if (world.mode !== 'combat') return { ok: false, message: '拦截仅在竞技模式可用' };
    const at = (op as { at: Position }).at;
    if (!inBounds(world, at)) return { ok: false, message: '拦截目标越界' };
    drone.interceptTarget = [at[0], at[1]];
    return { ok: true };
  }
}
