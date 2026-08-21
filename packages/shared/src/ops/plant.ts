// Plant: 在当前位置种植作物。
import { CropType, InternalOperation } from '../types';
import { TILES, cropConfig, isCropType } from '../registry';
import { tileAt } from '../maps';
import { DroneOperation, OpContext, OpField, OpResult, TurnSession } from './base';
import { tryPlantAt } from './helpers';

export class Plant extends DroneOperation {
  static readonly fields: OpField[] = [{ name: 'crop', kind: 'string' }];
  readonly type = 'plant';
  constructor(public crop: CropType) {
    super();
    if (!isCropType(crop)) throw new Error(`Plant 的参数 crop 必须是作物类型 (如 CropType.Strawberry), 收到: ${String(crop)}`);
  }
  static apply(ctx: OpContext, op: InternalOperation, _session: TurnSession): OpResult {
    const { world, drone, events } = ctx;
    const crop = (op as { crop: CropType }).crop;
    const cfg = cropConfig(crop);
    const tile = tileAt(world, drone.position);
    if (!cfg.canPlant(tile)) {
      return { ok: false, message: `${cfg.name} 不能种植在 ${TILES[tile.type].name} 上` };
    }
    if (tile.crop) return { ok: false, message: '该地块已有作物' };
    const player = world.players[drone.player];
    if (player.money < cfg.plantCost) return { ok: false, message: '金钱不足' };
    tryPlantAt(world, drone, drone.position, crop, events);
    events.push({ type: 'plant', drone: drone.id, pos: [drone.position[0], drone.position[1]], crop });
    return { ok: true };
  }
}
