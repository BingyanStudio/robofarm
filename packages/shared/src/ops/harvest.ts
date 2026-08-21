// Harvest: 收获当前地块的成熟作物。
// 竞技模式在对方半场收获 → 进入无人机 bounty (偷菜, 回己方半场入账 / 被拦截清零);
// 收获伴随间作加成; 收获后触发该地块的 onCropHarvested 回调 (如土地的沙漠化)。
import { CropState, InternalOperation, Position } from '../types';
import { TILES, cropConfig } from '../registry';
import { isOwnHalf, tileAt } from '../maps';
import { DroneOperation, OpContext, OpResult, TurnSession } from './base';
import { intercroppingValue } from './helpers';

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
    // 地块的"作物收获"回调 (如土地: 周围有沙地则本格沙漠化)
    TILES[tile.type].onCropHarvested?.({ world, pos, crop, events });
    // 作物的"收获特效" (如仙人掌: 把脚下地块转为土地)
    cfg.onHarvested?.({ world, pos, crop, events });
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
