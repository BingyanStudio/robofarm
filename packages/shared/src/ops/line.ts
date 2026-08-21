// 行/列范围操作的抽象基类。
// HarvestRow/HarvestCol/WaterRow/WaterCol/PlantRow/PlantCol/InterceptRow/InterceptCol
// 共享同一套逻辑, 具体类只声明 type 与 axis, 通过继承 + 重写 apply() 复用。
import { CropState, CropType, InternalOperation, TileType } from '../types';
import { TILES, cropConfig } from '../registry';
import {
  FERTILIZE_GAIN,
  FERTILIZE_ROW_COL_COST,
  HARVEST_ROW_COL_COST,
  INTERCEPT_ROW_COL_COST,
  PLANT_ROW_COL_COST,
  WATER_ROW_COL_COST,
} from '../config';
import { isOwnHalfAt } from '../maps';
import { DroneOperation, OpContext, OpResult, TurnSession } from './base';
import { intercroppingValue, lineRangePositions, tryPlantAt } from './helpers';

/**
 * 行/列范围收获: 一次性收获以无人机为中心的行/列 3 格内全部成熟作物, 消耗能量。
 * 竞技模式仅收割自己半场的作物 (对方半场的作物不能由此收割)。
 */
export abstract class LineHarvestOp extends DroneOperation {
  static readonly axis: 'row' | 'col';
  static apply(ctx: OpContext, op: InternalOperation, _session: TurnSession): OpResult {
    const axis = this.axis;
    const { world, drone, events } = ctx;
    if (drone.energy < HARVEST_ROW_COL_COST) {
      return { ok: false, message: `能量不足: ${op.type} 需要 ${HARVEST_ROW_COL_COST} 点能量` };
    }
    drone.energy -= HARVEST_ROW_COL_COST;
    let count = 0;
    for (const pos of lineRangePositions(drone.position, axis, world)) {
      const tile = world.map[pos[1]][pos[0]];
      const crop = tile.crop;
      if (!crop || crop.state !== CropState.Grown) continue;
      if (world.mode === 'combat' && !isOwnHalfAt(world, drone.player, pos)) continue;
      const cfg = cropConfig(crop.type);
      // 间作: 四方向至少 2 个不同种类作物 → 收益 +20%
      const value = intercroppingValue(world, pos, crop.type, cfg.value);
      tile.crop = null;
      // 地块的"作物收获"回调 (如土地: 周围有沙地则本格沙漠化)
      TILES[tile.type].onCropHarvested?.({ world, pos, crop, events });
      // 作物的"收获特效" (如仙人掌: 把脚下地块转为土地)
      cfg.onHarvested?.({ world, pos, crop, events });
      // 行/列收割只作用于自己半场, 收获直接入账 (不产生偷菜)
      world.players[drone.player].money += value;
      events.push({
        type: 'harvest',
        drone: drone.id,
        pos: [pos[0], pos[1]],
        value,
        stole: false,
      });
      count++;
    }
    return { ok: true, message: count === 0 ? '范围内没有可收获的作物' : undefined };
  }
}

/**
 * 行/列范围浇水: 以无人机为中心的行/列 3 格内给缺水作物浇水直到水耗尽,
 * 跳过不需要浇水的作物, 消耗能量。
 */
export abstract class LineWaterOp extends DroneOperation {
  static readonly axis: 'row' | 'col';
  static apply(ctx: OpContext, op: InternalOperation, _session: TurnSession): OpResult {
    const axis = this.axis;
    const { world, drone, events } = ctx;
    if (drone.energy < WATER_ROW_COL_COST) {
      return { ok: false, message: `能量不足: ${op.type} 需要 ${WATER_ROW_COL_COST} 点能量` };
    }
    drone.energy -= WATER_ROW_COL_COST;
    let count = 0;
    for (const pos of lineRangePositions(drone.position, axis, world)) {
      const tile = world.map[pos[1]][pos[0]];
      const crop = tile.crop;
      if (!crop || crop.state !== CropState.Thirsty) continue; // 跳过不需要浇水的作物
      if (drone.water < 1) break; // 水耗尽即停止
      drone.water -= 1;
      crop.state = CropState.Growing;
      // 地块的"作物浇水"回调
      TILES[tile.type].onCropWatered?.({ world, pos, crop, events });
      events.push({ type: 'water', drone: drone.id, pos: [pos[0], pos[1]] });
      count++;
    }
    return { ok: true, message: count === 0 ? '没有浇到任何作物 (水耗尽或范围内无缺水作物)' : undefined };
  }
}

/**
 * 行/列范围种植: 以无人机为中心的行/列 3 格内按 plants 数组顺序种植,
 * 跳过无法种植的格子 (地块不适配 / 已有作物 / 金钱不足), 消耗能量。
 */
export abstract class LinePlantOp extends DroneOperation {
  static readonly axis: 'row' | 'col';
  static apply(ctx: OpContext, op: InternalOperation, _session: TurnSession): OpResult {
    const axis = this.axis;
    const { world, drone, events } = ctx;
    const plants = (op as { plants: CropType[] }).plants;
    if (drone.energy < PLANT_ROW_COL_COST) {
      return { ok: false, message: `能量不足: ${op.type} 需要 ${PLANT_ROW_COL_COST} 点能量` };
    }
    drone.energy -= PLANT_ROW_COL_COST;
    let count = 0;
    let plantIdx = 0;
    for (const pos of lineRangePositions(drone.position, axis, world)) {
      if (plantIdx >= plants.length) break;
      if (!tryPlantAt(world, drone, pos, plants[plantIdx], events)) continue;
      events.push({ type: 'plant', drone: drone.id, pos: [pos[0], pos[1]], crop: plants[plantIdx] });
      plantIdx++;
      count++;
    }
    return { ok: true, message: count === 0 ? '范围内没有可种植的位置 (或已全部种下)' : undefined };
  }
}

/**
 * 行/列范围拦截: 以施法点 (无人机释放时的位置) 为中心的行/列 3 格范围,
 * 回合结束时拦截其中携带偷菜资金的对方无人机, 消耗能量。
 */
export abstract class LineInterceptOp extends DroneOperation {
  static readonly axis: 'row' | 'col';
  static apply(ctx: OpContext, _op: InternalOperation, _session: TurnSession): OpResult {
    const axis = this.axis;
    const { world, drone } = ctx;
    if (world.mode !== 'combat') return { ok: false, message: '拦截仅在竞技模式可用' };
    if (drone.energy < INTERCEPT_ROW_COL_COST) {
      return { ok: false, message: `能量不足: 范围拦截需要 ${INTERCEPT_ROW_COL_COST} 点能量` };
    }
    drone.energy -= INTERCEPT_ROW_COL_COST;
    drone.interceptZone = { axis, center: [drone.position[0], drone.position[1]] };
    return { ok: true };
  }
}

/**
 * 行/列范围施肥: 以无人机为中心的行/列 3 格内给土地施肥 (肥力 +3),
 * 非土地格子跳过 (不返还能量), 消耗能量。
 */
export abstract class LineFertilizeOp extends DroneOperation {
  static readonly axis: 'row' | 'col';
  static apply(ctx: OpContext, op: InternalOperation, _session: TurnSession): OpResult {
    const axis = this.axis;
    const { world, drone, events } = ctx;
    if (drone.energy < FERTILIZE_ROW_COL_COST) {
      return { ok: false, message: `能量不足: ${op.type} 需要 ${FERTILIZE_ROW_COL_COST} 点能量` };
    }
    drone.energy -= FERTILIZE_ROW_COL_COST;
    let count = 0;
    for (const pos of lineRangePositions(drone.position, axis, world)) {
      const tile = world.map[pos[1]][pos[0]];
      if (tile.type !== TileType.Soil) continue; // 非土地跳过 (不返还能量)
      tile.fertility = (tile.fertility ?? 0) + FERTILIZE_GAIN;
      events.push({ type: 'fertilize', drone: drone.id, pos: [pos[0], pos[1]] });
      count++;
    }
    return { ok: true, message: count === 0 ? '范围内没有土地' : undefined };
  }
}
