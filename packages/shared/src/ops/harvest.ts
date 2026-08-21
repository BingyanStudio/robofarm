// Harvest: 收获当前地块的成熟作物。
// 竞技模式在对方半场收获 → 进入无人机 bounty (偷菜, 回己方半场入账 / 被拦截清零);
// 收获伴随间作加成与沙漠化判定 (helpers.ts)。
import { CropState, InternalOperation, Position } from '../types';
import { cropConfig } from '../registry';
import { isOwnHalf, tileAt } from '../maps';
import { DroneOperation, OpContext, OpResult, TurnSession } from './base';
import { intercroppingValue, maybeDesertify } from './helpers';

export class Harvest extends DroneOperation {
  readonly type = 'harvest';
  static apply(ctx: OpContext, _op: InternalOperation, _session: TurnSession): OpResult {
    const { world, drone, events } = ctx;
    const tile = tileAt(world, drone.position);
    const crop = tile.crop;
    if (!crop || crop.state !== CropState.Grown) return { ok: false, message: '作物尚未成熟' };
    const cfg = cropConfig(crop.type);
    const pos: Position = [drone.position[0], drone.position[1]];
    // 间作: 四方向至少 2 个不同种类作物 → 收益 +20%
    const value = intercroppingValue(world, pos, crop.type, cfg.value);
    tile.crop = null;
    const stole = world.mode === 'combat' && !isOwnHalf(world, drone);
    if (stole) drone.bounty += value;
    else world.players[drone.player].money += value;
    // 沙漠化: 收获的格子周围存在沙地 → 该格转化为沙地
    maybeDesertify(world, pos);
    events.push({
      type: 'harvest',
      drone: drone.id,
      pos,
      value,
      stole,
    });
    return { ok: true };
  }
}
