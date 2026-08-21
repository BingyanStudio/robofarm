// Clear: 铲除当前地块的作物 (竞技模式仅限己方半场)。
import { InternalOperation } from '../types';
import { isOwnHalf, tileAt } from '../maps';
import { DroneOperation, OpContext, OpResult, TurnSession } from './base';

export class Clear extends DroneOperation {
  readonly type = 'clear';
  static apply(ctx: OpContext, _op: InternalOperation, _session: TurnSession): OpResult {
    const { world, drone, events } = ctx;
    const tile = tileAt(world, drone.position);
    if (!tile.crop) return { ok: false, message: '当前地块没有作物' };
    if (world.mode === 'combat' && !isOwnHalf(world, drone)) {
      return { ok: false, message: '只能在己方半场铲除' };
    }
    tile.crop = null;
    events.push({ type: 'clear', drone: drone.id, pos: [drone.position[0], drone.position[1]] });
    return { ok: true };
  }
}
