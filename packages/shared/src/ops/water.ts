// Water: 给当前地块的缺水作物浇水 (恢复生长, 从缺水时剩余进度继续)。
import { CropState, InternalOperation } from '../types';
import { tileAt } from '../maps';
import { DroneOperation, OpContext, OpResult, TurnSession } from './base';

export class Water extends DroneOperation {
  readonly type = 'water';
  static apply(ctx: OpContext, _op: InternalOperation, _session: TurnSession): OpResult {
    const { world, drone, events } = ctx;
    const crop = tileAt(world, drone.position).crop;
    if (!crop || crop.state !== CropState.Thirsty) {
      return { ok: false, message: '当前地块没有需要浇水的作物' };
    }
    if (drone.water < 1) return { ok: false, message: '没有水了, 请先到池塘取水' };
    drone.water -= 1;
    crop.state = CropState.Growing; // 恢复生长, 从缺水时剩余的生长进度继续
    events.push({ type: 'water', drone: drone.id, pos: [drone.position[0], drone.position[1]] });
    return { ok: true };
  }
}
