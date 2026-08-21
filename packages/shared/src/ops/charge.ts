// Charge: 充能 — 原地不动, 能量 +5 (上限 10)。
import { InternalOperation } from '../types';
import { CHARGE_GAIN, MAX_ENERGY } from '../config';
import { DroneOperation, OpContext, OpResult, TurnSession } from './base';

export class Charge extends DroneOperation {
  readonly type = 'charge';
  static apply(ctx: OpContext, _op: InternalOperation, _session: TurnSession): OpResult {
    const { drone, events } = ctx;
    const gained = Math.min(MAX_ENERGY - drone.energy, CHARGE_GAIN);
    drone.energy += gained;
    events.push({
      type: 'charge',
      drone: drone.id,
      pos: [drone.position[0], drone.position[1]],
      energy: drone.energy,
    });
    return { ok: true };
  }
}
