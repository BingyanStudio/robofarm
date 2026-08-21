// CollectWater: 在池塘上取水 (一次取满, 上限 5 格)。
import { InternalOperation } from '../types';
import { TILES } from '../registry';
import { MAX_WATER } from '../config';
import { tileAt } from '../maps';
import { DroneOperation, OpContext, OpResult, TurnSession } from './base';

export class CollectWater extends DroneOperation {
  readonly type = 'collectWater';
  static apply(ctx: OpContext, _op: InternalOperation, _session: TurnSession): OpResult {
    const { world, drone, events } = ctx;
    const tile = tileAt(world, drone.position);
    if (!TILES[tile.type].canCollectWater) return { ok: false, message: '只能在池塘上取水' };
    if (drone.water >= MAX_WATER) return { ok: false, message: `水量已满 (最多 ${MAX_WATER} 格)` };
    drone.water = MAX_WATER;
    events.push({
      type: 'collect-water',
      drone: drone.id,
      pos: [drone.position[0], drone.position[1]],
      water: drone.water,
    });
    return { ok: true };
  }
}
