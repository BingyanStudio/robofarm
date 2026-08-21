// Teleport: 传送到指定位置 (任意距离), 消耗 ceil(欧氏距离) 能量;
// 竞技模式只能在我方半场内传送 (起点与终点都必须在自己半场)。
import { InternalOperation, Position } from '../types';
import { inBounds, isOwnHalfAt } from '../maps';
import { DroneOperation, OpContext, OpField, OpResult, TurnSession, isPosition } from './base';

export class Teleport extends DroneOperation {
  static readonly fields: OpField[] = [{ name: 'to', kind: 'position' }];
  readonly type = 'teleport';
  constructor(public to: Position) {
    super();
    if (!isPosition(to)) throw new Error('Teleport 的参数 to 必须是 [x, y] 坐标');
  }
  static apply(ctx: OpContext, op: InternalOperation, session: TurnSession): OpResult {
    const { world, drone } = ctx;
    const to = (op as { to: Position }).to;
    if (!inBounds(world, to)) {
      return { ok: false, message: `传送目标 ${JSON.stringify(to)} 越界` };
    }
    if (
      world.mode === 'combat' &&
      (!isOwnHalfAt(world, drone.player, drone.position) || !isOwnHalfAt(world, drone.player, to))
    ) {
      return { ok: false, message: '传送仅限竞技模式在我方半场内进行 (起点与终点都必须在己方半场)' };
    }
    const dx = to[0] - drone.position[0];
    const dy = to[1] - drone.position[1];
    const cost = Math.ceil(Math.sqrt(dx * dx + dy * dy));
    if (cost === 0) {
      return { ok: false, message: '传送目标与当前位置相同' };
    }
    if (drone.energy < cost) {
      return { ok: false, message: `能量不足: Teleport 需要 ${cost} 点能量` };
    }
    drone.energy -= cost;
    // 与移动同走仲裁: 目标格被最终位置占据则失败 (能量已消耗)
    session.moveCandidates.push({ drone, to, durationMs: ctx.durationMs });
    return { ok: true };
  }
}
