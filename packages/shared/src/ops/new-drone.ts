// NewDrone: 花费 4000 金钱在指定位置创建一架新的无人机 (上限: 单人 2 / 竞技 3)。
// 金钱在阶段 1 扣除, 实际创建延迟到回合末 (避免遍历中修改无人机列表)。
import { InternalOperation, Position } from '../types';
import { DRONE_LIMIT, NEW_DRONE_COST } from '../config';
import { inBounds, samePos } from '../maps';
import { DroneOperation, OpContext, OpField, OpResult, TurnSession, isPosition } from './base';

export class NewDrone extends DroneOperation {
  static readonly fields: OpField[] = [{ name: 'at', kind: 'position' }];
  readonly type = 'newDrone';
  constructor(public at: Position) {
    super();
    if (!isPosition(at)) throw new Error('NewDrone 的参数 at 必须是 [x, y] 坐标');
  }
  static apply(ctx: OpContext, op: InternalOperation, session: TurnSession): OpResult {
    const { world, drone } = ctx;
    const at = (op as { at: Position }).at;
    const limit = DRONE_LIMIT[world.mode];
    const ownCount = world.drones.filter((d) => d.player === drone.player).length;
    const player = world.players[drone.player];
    if (player.money < NEW_DRONE_COST) {
      return { ok: false, message: `金钱不足: NewDrone 需要 ${NEW_DRONE_COST} 金钱` };
    }
    if (ownCount >= limit) {
      return { ok: false, message: `无人机数量已达上限 (${limit} 架)` };
    }
    if (!inBounds(world, at)) {
      return { ok: false, message: `NewDrone 目标位置 ${JSON.stringify(at)} 越界` };
    }
    if (world.drones.some((d) => samePos(d.position, at))) {
      return { ok: false, message: '该位置已有无人机' };
    }
    player.money -= NEW_DRONE_COST;
    session.newDroneRequests.push({ player: drone.player, pos: at });
    return { ok: true };
  }
}
