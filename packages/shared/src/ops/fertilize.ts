// Fertilize: 给脚下土地施肥 (肥力 +3), 消耗 3 能量; 不是土地则失败且不扣能量。
import { InternalOperation, TileType } from '../types';
import { FERTILIZE_COST, FERTILIZE_GAIN } from '../config';
import { tileAt } from '../maps';
import { DroneOperation, OpContext, OpResult, TurnSession } from './base';

export class Fertilize extends DroneOperation {
  readonly type = 'fertilize';
  static apply(ctx: OpContext, _op: InternalOperation, _session: TurnSession): OpResult {
    const { world, drone, events } = ctx;
    if (drone.energy < FERTILIZE_COST) {
      return { ok: false, message: `能量不足: Fertilize 需要 ${FERTILIZE_COST} 点能量` };
    }
    const tile = tileAt(world, drone.position);
    // 不是土地则失败 (返还能量: 不扣)
    if (tile.type !== TileType.Soil) return { ok: false, message: '只能在土地上施肥' };
    drone.energy -= FERTILIZE_COST;
    tile.fertility = (tile.fertility ?? 0) + FERTILIZE_GAIN;
    events.push({ type: 'fertilize', drone: drone.id, pos: [drone.position[0], drone.position[1]] });
    return { ok: true };
  }
}
