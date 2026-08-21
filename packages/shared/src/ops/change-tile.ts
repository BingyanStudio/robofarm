// ChangeTile: 转换脚下地块 — 消耗能量, 上下左右必须有至少一个与目标类型相同的地块
// (不允许凭空创造), 有作物的地块不可转换。
import { InternalOperation, TileType } from '../types';
import { TILES } from '../registry';
import { CHANGE_TILE_COST } from '../config';
import { tileAt } from '../maps';
import { DroneOperation, OpContext, OpField, OpResult, TurnSession } from './base';
import { orthNeighbors } from './helpers';

export class ChangeTile extends DroneOperation {
  static readonly fields: OpField[] = [{ name: 'tileType', kind: 'string' }];
  readonly type = 'changeTile';
  constructor(public tileType: TileType) {
    super();
    if (!(tileType in TILES)) {
      throw new Error(`ChangeTile 的目标类型必须是 soil / water / sand 之一, 收到: ${String(tileType)}`);
    }
  }
  static apply(ctx: OpContext, op: InternalOperation, _session: TurnSession): OpResult {
    const { world, drone, events } = ctx;
    if (drone.energy < CHANGE_TILE_COST) {
      return { ok: false, message: `能量不足: ChangeTile 需要 ${CHANGE_TILE_COST} 点能量` };
    }
    const target = (op as { tileType: TileType }).tileType;
    const tile = tileAt(world, drone.position);
    if (tile.type === target) return { ok: false, message: '目标类型与当前地块相同' };
    if (tile.crop) return { ok: false, message: '该地块有作物, 不能转换地块类型' };
    // 前提: 上下左右必须有至少一个与目标类型相同的地块, 不允许凭空创造
    const hasNeighbor = orthNeighbors(drone.position, world).some(
      ([nx, ny]) => world.map[ny][nx].type === target
    );
    if (!hasNeighbor) {
      return { ok: false, message: `周围没有 ${TILES[target].name} 地块, 不能凭空创造` };
    }
    drone.energy -= CHANGE_TILE_COST;
    world.map[drone.position[1]][drone.position[0]] = { type: target, crop: null };
    events.push({
      type: 'change-tile',
      drone: drone.id,
      pos: [drone.position[0], drone.position[1]],
      tileType: target,
    });
    return { ok: true };
  }
}
