// 回合引擎: 接收各无人机本回合的操作, 完成语义校验、移动仲裁、
// 拦截/偷菜结算与作物生长, 输出事件流。
//
// 设计约定:
// - 所有操作效果视为"回合结束瞬间同时发生", 冲突 (同一格子多个无人机)
//   按"代码执行时间短者优先"仲裁。
// - 操作处理器按类型注册在 OP_HANDLERS 表 (而非 if 链), 新增操作类型时
//   只需新增 handler + ops.ts schema + types.ts 联合类型。
import {
  CropData,
  CropState,
  CropType,
  InternalOperation,
  DroneState,
  GameEvent,
  Position,
  TileType,
  WorldState,
} from './types';
import { TILES, cropConfig } from './registry';
import {
  CHANGE_TILE_COST,
  CHARGE_GAIN,
  DRONE_LIMIT,
  HARVEST_ROW_COL_COST,
  INTERCEPT_ROW_COL_COST,
  MAX_ENERGY,
  MAX_WATER,
  NEW_DRONE_COST,
  PLANT_ROW_COL_COST,
  WATER_ROW_COL_COST,
} from './config';
import { inBounds, isOwnHalf, isOwnHalfAt, samePos, tileAt } from './maps';

/** 某架无人机本回合的动作 */
export interface DroneAction {
  op: InternalOperation | null;
  /** run() 执行耗时 (毫秒), 用于冲突仲裁 */
  durationMs: number;
}

interface OpContext {
  world: WorldState;
  drone: DroneState;
  events: GameEvent[];
}

type OpHandler = (ctx: OpContext, op: InternalOperation) => { ok: boolean; message?: string };

const OP_HANDLERS: Record<string, OpHandler> = {
  plant(ctx, op) {
    const { world, drone, events } = ctx;
    if (op.type !== 'plant') return { ok: false };
    const cfg = cropConfig(op.crop);
    const tile = tileAt(world, drone.position);
    if (!cfg.habitats.includes(tile.type)) {
      return { ok: false, message: `${cfg.name} 不能种植在 ${TILES[tile.type].name} 上` };
    }
    if (tile.crop) return { ok: false, message: '该地块已有作物' };
    const player = world.players[drone.player];
    if (player.money < cfg.plantCost) return { ok: false, message: '金钱不足' };
    tryPlantAt(world, drone, drone.position, op.crop);
    events.push({ type: 'plant', drone: drone.id, pos: [drone.position[0], drone.position[1]], crop: op.crop });
    return { ok: true };
  },

  collectWater(ctx, op) {
    if (op.type !== 'collectWater') return { ok: false };
    const { world, drone, events } = ctx;
    const tile = tileAt(world, drone.position);
    if (!TILES[tile.type].canCollectWater) return { ok: false, message: '只能在池塘上取水' };
    if (drone.water >= MAX_WATER) return { ok: false, message: `水量已满 (最多 ${MAX_WATER} 格)` };
    // 一次取满 (上限 5 格)
    drone.water = MAX_WATER;
    events.push({
      type: 'collect-water',
      drone: drone.id,
      pos: [drone.position[0], drone.position[1]],
      water: drone.water,
    });
    return { ok: true };
  },

  water(ctx, op) {
    if (op.type !== 'water') return { ok: false };
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
  },

  harvest(ctx, op) {
    if (op.type !== 'harvest') return { ok: false };
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
  },

  clear(ctx, op) {
    if (op.type !== 'clear') return { ok: false };
    const { world, drone, events } = ctx;
    const tile = tileAt(world, drone.position);
    if (!tile.crop) return { ok: false, message: '当前地块没有作物' };
    if (world.mode === 'combat' && !isOwnHalf(world, drone)) {
      return { ok: false, message: '只能在己方半场铲除' };
    }
    tile.crop = null;
    events.push({ type: 'clear', drone: drone.id, pos: [drone.position[0], drone.position[1]] });
    return { ok: true };
  },

  intercept(ctx, op) {
    if (op.type !== 'intercept') return { ok: false };
    const { world, drone } = ctx;
    if (world.mode !== 'combat') return { ok: false, message: '拦截仅在竞技模式可用' };
    if (!inBounds(world, op.at)) return { ok: false, message: '拦截目标越界' };
    drone.interceptTarget = [op.at[0], op.at[1]];
    return { ok: true };
  },

  charge(ctx, op) {
    if (op.type !== 'charge') return { ok: false };
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
  },

  harvestRow: (ctx, op) => harvestLine(ctx, op, 'row'),
  harvestCol: (ctx, op) => harvestLine(ctx, op, 'col'),
  waterRow: (ctx, op) => waterLine(ctx, op, 'row'),
  waterCol: (ctx, op) => waterLine(ctx, op, 'col'),
  plantRow: (ctx, op) => plantLine(ctx, op, 'row'),
  plantCol: (ctx, op) => plantLine(ctx, op, 'col'),

  interceptRow(ctx, op) {
    if (op.type !== 'interceptRow') return { ok: false };
    return setInterceptZone(ctx, 'row');
  },
  interceptCol(ctx, op) {
    if (op.type !== 'interceptCol') return { ok: false };
    return setInterceptZone(ctx, 'col');
  },

  changeTile(ctx, op) {
    if (op.type !== 'changeTile') return { ok: false };
    const { world, drone, events } = ctx;
    if (drone.energy < CHANGE_TILE_COST) {
      return { ok: false, message: `能量不足: ChangeTile 需要 ${CHANGE_TILE_COST} 点能量` };
    }
    const target = op.tileType;
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
  },
};

/**
 * 行/列范围收获: 一次性收获以无人机为中心的行/列 3 格内全部成熟作物, 消耗能量。
 * 竞技模式仅收割自己半场的作物 (对方半场的作物不能由此收割)。
 */
function harvestLine(
  ctx: OpContext,
  op: InternalOperation,
  axis: 'row' | 'col'
): { ok: boolean; message?: string } {
  if (op.type !== 'harvestRow' && op.type !== 'harvestCol') return { ok: false };
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
    // 沙漠化: 收获的格子周围存在沙地 → 该格转化为沙地
    maybeDesertify(world, pos);
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

/**
 * 行/列范围浇水: 以无人机为中心的行/列 3 格内给缺水作物浇水直到水耗尽,
 * 跳过不需要浇水的作物, 消耗能量。
 */
function waterLine(
  ctx: OpContext,
  op: InternalOperation,
  axis: 'row' | 'col'
): { ok: boolean; message?: string } {
  if (op.type !== 'waterRow' && op.type !== 'waterCol') return { ok: false };
  const { world, drone, events } = ctx;
  if (drone.energy < WATER_ROW_COL_COST) {
    return { ok: false, message: `能量不足: ${op.type} 需要 ${WATER_ROW_COL_COST} 点能量` };
  }
  drone.energy -= WATER_ROW_COL_COST;
  let count = 0;
  for (const pos of lineRangePositions(drone.position, axis, world)) {
    const crop = world.map[pos[1]][pos[0]].crop;
    if (!crop || crop.state !== CropState.Thirsty) continue; // 跳过不需要浇水的作物
    if (drone.water < 1) break; // 水耗尽即停止
    drone.water -= 1;
    crop.state = CropState.Growing;
    events.push({ type: 'water', drone: drone.id, pos: [pos[0], pos[1]] });
    count++;
  }
  return { ok: true, message: count === 0 ? '没有浇到任何作物 (水耗尽或范围内无缺水作物)' : undefined };
}

/** 以无人机为中心的行/列 3 格范围 (越界跳过) */
function lineRangePositions(center: Position, axis: 'row' | 'col', world: WorldState): Position[] {
  const out: Position[] = [];
  const c = center[axis === 'row' ? 0 : 1];
  for (let i = c - 1; i <= c + 1; i++) {
    const pos: Position = axis === 'row' ? [i, center[1]] : [center[0], i];
    if (inBounds(world, pos)) out.push(pos);
  }
  return out;
}

/**
 * 间作: 若作物的四方向邻格至少有 2 个不同于自己种类的作物, 收获收益 +20% (向下取整)。
 */
function intercroppingValue(world: WorldState, pos: Position, cropType: CropType, base: number): number {
  let diff = 0;
  for (const [nx, ny] of orthNeighbors(pos, world)) {
    const nb = world.map[ny][nx].crop;
    if (nb && nb.type !== cropType) diff++;
  }
  return diff >= 2 ? Math.floor(base * 1.2) : base;
}

/**
 * 沙漠化: 收获作物时, 若该格的上下左右存在沙地, 则该格也转化为沙地。
 * 仅蚕食土地 (soil) 地块, 不影响水 (water) 等地块。
 * (调用前该格作物已移除)
 */
function maybeDesertify(world: WorldState, pos: Position): void {
  if (world.map[pos[1]][pos[0]].type !== TileType.Soil) return;
  for (const [nx, ny] of orthNeighbors(pos, world)) {
    if (world.map[ny][nx].type === TileType.Sand) {
      world.map[pos[1]][pos[0]] = { type: TileType.Sand, crop: null };
      return;
    }
  }
}

/**
 * 尝试在指定格种植作物 (与单格 Plant 相同的判定: 地块适配 / 无作物 / 金钱足够)。
 * 成功时扣除成本并写入作物数据, 返回 true; 任一条件不满足则不改动任何状态, 返回 false。
 */
function tryPlantAt(world: WorldState, drone: DroneState, pos: Position, crop: CropType): boolean {
  const cfg = cropConfig(crop);
  const tile = world.map[pos[1]][pos[0]];
  if (!cfg.habitats.includes(tile.type)) return false;
  if (tile.crop) return false;
  const player = world.players[drone.player];
  if (player.money < cfg.plantCost) return false;
  player.money -= cfg.plantCost;
  // 生长周期受地块类型影响 (如沙地 ×1.5, 数据在 TILES 注册表);
  // 作物可用 growthOverride 覆盖地块倍率 (特殊机制);
  // 香菇按场上香菇总数动态计算 (20 + 2 × 场上香菇总数);
  // 总缺水次数按该次种植的实际周期动态计算 (不依赖固定的剩余取模)
  const adjusted = crop === CropType.Shiitake
    ? shiitakeGrowCycles(world)
    : Math.floor(cfg.growCycles * (cfg.growthOverride ?? TILES[tile.type].growthFactor));
  tile.crop = {
    type: crop,
    state: CropState.Growing,
    growthRemaining: adjusted,
    thirstTotal: cfg.thirstInterval === null ? 0 : Math.floor(adjusted / cfg.thirstInterval),
    thirstsDone: 0,
    plantCycles: adjusted,
  };
  return true;
}

/** 香菇实际生长周期: 基础 20 + 2 × 场上香菇总数 (种植/扩散时按当时场上数量动态计算) */
function shiitakeGrowCycles(world: WorldState): number {
  let count = 0;
  for (const row of world.map) {
    for (const t of row) {
      if (t.crop?.type === CropType.Shiitake) count++;
    }
  }
  return 20 + 2 * count;
}

/**
 * 行/列范围种植: 以无人机为中心的行/列 3 格内按 plants 数组顺序种植,
 * 跳过无法种植的格子 (地块不适配 / 已有作物 / 金钱不足), 消耗能量。
 */
function plantLine(
  ctx: OpContext,
  op: InternalOperation,
  axis: 'row' | 'col'
): { ok: boolean; message?: string } {
  if (op.type !== 'plantRow' && op.type !== 'plantCol') return { ok: false };
  const { world, drone, events } = ctx;
  if (drone.energy < PLANT_ROW_COL_COST) {
    return { ok: false, message: `能量不足: ${op.type} 需要 ${PLANT_ROW_COL_COST} 点能量` };
  }
  drone.energy -= PLANT_ROW_COL_COST;
  let count = 0;
  let plantIdx = 0;
  for (const pos of lineRangePositions(drone.position, axis, world)) {
    if (plantIdx >= op.plants.length) break;
    if (!tryPlantAt(world, drone, pos, op.plants[plantIdx])) continue;
    events.push({ type: 'plant', drone: drone.id, pos: [pos[0], pos[1]], crop: op.plants[plantIdx] });
    plantIdx++;
    count++;
  }
  return { ok: true, message: count === 0 ? '范围内没有可种植的位置 (或已全部种下)' : undefined };
}

/** 行/列范围拦截: 以施法点 (无人机释放时的位置) 为中心的行/列 3 格范围, 回合结束时结算 */
function setInterceptZone(ctx: OpContext, axis: 'row' | 'col'): { ok: boolean; message?: string } {
  const { world, drone } = ctx;
  if (world.mode !== 'combat') return { ok: false, message: '拦截仅在竞技模式可用' };
  if (drone.energy < INTERCEPT_ROW_COL_COST) {
    return { ok: false, message: `能量不足: 范围拦截需要 ${INTERCEPT_ROW_COL_COST} 点能量` };
  }
  drone.energy -= INTERCEPT_ROW_COL_COST;
  drone.interceptZone = { axis, center: [drone.position[0], drone.position[1]] };
  return { ok: true };
}

interface MoveCandidate {
  drone: DroneState;
  to: Position;
  durationMs: number;
}

/**
 * 执行一个回合。
 * @param actions 全局无人机 id → 动作
 * @returns 本回合产生的事件 (不含 turn/snapshot/end, 由 GameController 补充)
 */
export function stepTurn(world: WorldState, actions: Record<number, DroneAction>): GameEvent[] {
  const events: GameEvent[] = [];
  const moveCandidates: MoveCandidate[] = [];
  /** NewDrone 待创建请求 (回合结束统一创建, 避免遍历中修改无人机列表) */
  const newDroneRequests: { player: number; pos: Position }[] = [];

  // 阶段 1: 语义校验并执行非移动操作, 收集移动候选
  for (const drone of world.drones) {
    const act = actions[drone.id];
    if (!act || !act.op) continue;
    const { op } = act;
    if (op.type === 'newDrone') {
      // 创建新无人机: 花费 4000 金钱, 指定位置必须为空; 数量受模式上限约束
      const limit = DRONE_LIMIT[world.mode];
      const ownCount = world.drones.filter((d) => d.player === drone.player).length;
      const player = world.players[drone.player];
      if (player.money < NEW_DRONE_COST) {
        events.push({ type: 'invalid-op', drone: drone.id, message: `金钱不足: NewDrone 需要 ${NEW_DRONE_COST} 金钱` });
        continue;
      }
      if (ownCount >= limit) {
        events.push({ type: 'invalid-op', drone: drone.id, message: `无人机数量已达上限 (${limit} 架)` });
        continue;
      }
      if (!inBounds(world, op.at)) {
        events.push({ type: 'invalid-op', drone: drone.id, message: `NewDrone 目标位置 ${JSON.stringify(op.at)} 越界` });
        continue;
      }
      if (world.drones.some((d) => samePos(d.position, op.at))) {
        events.push({ type: 'invalid-op', drone: drone.id, message: '该位置已有无人机' });
        continue;
      }
      player.money -= NEW_DRONE_COST;
      newDroneRequests.push({ player: drone.player, pos: op.at });
      continue;
    }
    if (op.type === 'teleport') {
      // 传送: 任意距离, 能量 = ceil(欧氏距离); 竞技模式只能从我方半场传送到我方半场
      if (!inBounds(world, op.to)) {
        events.push({ type: 'invalid-op', drone: drone.id, message: `传送目标 ${JSON.stringify(op.to)} 越界` });
        continue;
      }
      if (world.mode === 'combat' && (!isOwnHalfAt(world, drone.player, drone.position) || !isOwnHalfAt(world, drone.player, op.to))) {
        events.push({ type: 'invalid-op', drone: drone.id, message: '传送仅限竞技模式在我方半场内进行 (起点与终点都必须在己方半场)' });
        continue;
      }
      const dx = op.to[0] - drone.position[0];
      const dy = op.to[1] - drone.position[1];
      const cost = Math.ceil(Math.sqrt(dx * dx + dy * dy));
      if (cost === 0) {
        events.push({ type: 'invalid-op', drone: drone.id, message: '传送目标与当前位置相同' });
        continue;
      }
      if (drone.energy < cost) {
        events.push({ type: 'invalid-op', drone: drone.id, message: `能量不足: Teleport 需要 ${cost} 点能量` });
        continue;
      }
      drone.energy -= cost;
      // 与移动同走仲裁: 目标格被最终位置占据则失败 (能量已消耗)
      moveCandidates.push({ drone, to: op.to, durationMs: act.durationMs });
      continue;
    }
    if (op.type === 'move') {
      // 移动限制: 只能移动到周围 8 格 (相邻格), 超出则操作无效并给出错误信息
      const dx = Math.abs(op.to[0] - drone.position[0]);
      const dy = Math.abs(op.to[1] - drone.position[1]);
      if (dx > 1 || dy > 1) {
        events.push({
          type: 'invalid-op',
          drone: drone.id,
          message: `移动目标 ${JSON.stringify(op.to)} 超出周围 8 格范围, 只能移动到相邻格`,
        });
        continue;
      }
      if (dx === 0 && dy === 0) {
        events.push({ type: 'invalid-op', drone: drone.id, message: '移动目标与当前位置相同' });
        continue;
      }
      moveCandidates.push({ drone, to: op.to, durationMs: act.durationMs });
      continue;
    }
    const handler = OP_HANDLERS[op.type];
    if (!handler) {
      events.push({ type: 'invalid-op', drone: drone.id, message: `未知操作类型: ${String(op.type)}` });
      continue;
    }
    const result = handler({ world, drone, events }, op);
    if (!result.ok) {
      events.push({ type: 'invalid-op', drone: drone.id, message: result.message ?? '操作无效' });
    }
  }

  // 阶段 2: 移动仲裁。先按 (耗时, 全局id) 排序, 依次"认领"目标格;
  // 目标格被任何无人机最终位置占据则移动失败 (本回合原地不动)。
  const finalPositions = new Map<number, Position>();
  for (const d of world.drones) finalPositions.set(d.id, d.position);

  moveCandidates.sort((a, b) => a.durationMs - b.durationMs || a.drone.id - b.drone.id);
  const accepted = new Set<number>();
  for (const m of moveCandidates) {
    if (!inBounds(world, m.to)) {
      events.push({ type: 'move-blocked', drone: m.drone.id, to: m.to, reason: 'out-of-bounds' });
      continue;
    }
    let conflict = false;
    for (const [id, pos] of finalPositions) {
      if (id !== m.drone.id && samePos(pos, m.to)) {
        conflict = true;
        break;
      }
    }
    if (conflict) {
      events.push({ type: 'move-blocked', drone: m.drone.id, to: m.to, reason: 'occupied' });
      continue;
    }
    finalPositions.set(m.drone.id, m.to);
    accepted.add(m.drone.id);
  }
  for (const m of moveCandidates) {
    if (!accepted.has(m.drone.id)) continue;
    const from: Position = [m.drone.position[0], m.drone.position[1]];
    m.drone.position = m.to;
    events.push({ type: 'move', drone: m.drone.id, from, to: m.to });
  }

  // 阶段 3: 回合结束结算 —— 拦截 (单格 / 行 / 列), 然后偷菜资金带回
  for (const drone of world.drones) {
    const target = drone.interceptTarget;
    if (!target) continue;
    drone.interceptTarget = null;
    for (const other of world.drones) {
      if (other.player === drone.player || other.bounty <= 0) continue;
      if (!samePos(other.position, target)) continue;
      const bounty = other.bounty;
      other.bounty = 0;
      world.players[drone.player].money += bounty;
      events.push({
        type: 'intercept',
        drone: drone.id,
        pos: [target[0], target[1]],
        thief: other.id,
        bounty,
      });
    }
  }
  for (const drone of world.drones) {
    const zone = drone.interceptZone;
    if (!zone) continue;
    drone.interceptZone = null;
    // 以施法点为中心的行/列 3 格范围
    for (const other of world.drones) {
      if (other.player === drone.player || other.bounty <= 0) continue;
      const dist = zone.axis === 'row'
        ? Math.abs(other.position[1] - zone.center[1])
        : Math.abs(other.position[0] - zone.center[0]);
      if (dist > 1) continue;
      const bounty = other.bounty;
      other.bounty = 0;
      world.players[drone.player].money += bounty;
      events.push({
        type: 'intercept',
        drone: drone.id,
        pos: [other.position[0], other.position[1]],
        thief: other.id,
        bounty,
      });
    }
  }
  for (const drone of world.drones) {
    if (drone.bounty > 0 && isOwnHalf(world, drone)) {
      const bounty = drone.bounty;
      drone.bounty = 0;
      world.players[drone.player].money += bounty;
      events.push({
        type: 'stash',
        drone: drone.id,
        pos: [drone.position[0], drone.position[1]],
        bounty,
      });
    }
  }

  // 阶段 4: 作物生长
  tickCrops(world, events);

  // 阶段 5: 创建新无人机 (NewDrone, 下一回合开始执行代码)。
  // 目标格被任何无人机的最终位置占据则创建失败 (金钱已在阶段 1 扣除)。
  for (const req of newDroneRequests) {
    if (world.drones.some((d) => samePos(d.position, req.pos))) {
      events.push({ type: 'invalid-op', drone: -1, message: 'NewDrone 失败: 目标位置已被占据' });
      continue;
    }
    const id = world.drones.reduce((m, d) => Math.max(m, d.id), -1) + 1;
    world.drones.push({
      id,
      player: req.player,
      position: [req.pos[0], req.pos[1]],
      water: 0,
      energy: 0,
      bounty: 0,
      interceptTarget: null,
      interceptZone: null,
    });
    events.push({ type: 'new-drone', drone: id, pos: [req.pos[0], req.pos[1]] });
  }

  return events;
}

function tickCrops(world: WorldState, events: GameEvent[]): void {
  for (let y = 0; y < world.map.length; y++) {
    for (let x = 0; x < world.map[y].length; x++) {
      const crop = world.map[y][x].crop;
      if (!crop) continue;
      tickCrop(world, crop, [x, y], events);
    }
  }
}

function tickCrop(world: WorldState, crop: CropData, pos: Position, events: GameEvent[]): void {
  const cfg = cropConfig(crop.type);
  if (crop.state === CropState.Growing) {
    crop.growthRemaining -= 1;
    if (crop.growthRemaining <= 0) {
      crop.state = CropState.Grown;
      crop.growthRemaining = 0;
      events.push({ type: 'crop-grow', pos, state: CropState.Grown, cyclesToGrown: 0 });
      // 成熟特效: 每种作物成熟时都会执行其挂接的特效 (多数作物未声明, 无操作)
      const effect = cfg.onMature;
      if (effect) MATURITY_EFFECTS[effect]?.({ world, pos, crop, events });
    } else {
      // 生长特效: 每个生长回合都会执行 (多数作物未声明, 无操作)
      const growEffect = cfg.onGrow;
      if (growEffect && crop.state === CropState.Growing) {
        GROWTH_EFFECTS[growEffect]?.({ world, crop, pos, events });
      }

      if (cfg.thirstInterval !== null) {
        // 缺水触发按种植时记录的"总缺水次数"动态计算, 缺水点在实际生长周期内均匀分布:
        // 第 (thirstsDone+1) 次缺水发生在剩余回合数降到 ceil((剩余次数)·实际周期/(总次数+1)) 时。
        const total = crop.thirstTotal ?? 0;
        const done = crop.thirstsDone ?? 0;
        const cycles = crop.plantCycles ?? cfg.growCycles;
        if (
          total > 0 &&
          done < total &&
          crop.growthRemaining === Math.ceil(((total - done) * cycles) / (total + 1))
        ) {
          crop.state = CropState.Thirsty;
          crop.thirstsDone = done + 1;
          events.push({ type: 'crop-grow', pos, state: CropState.Thirsty, cyclesToGrown: 0 });
        } else {
          events.push({
            type: 'crop-grow',
            pos,
            state: CropState.Growing,
            cyclesToGrown: crop.growthRemaining,
          });
        }
      } else {
        events.push({
          type: 'crop-grow',
          pos,
          state: CropState.Growing,
          cyclesToGrown: crop.growthRemaining,
        });
      }
    }
  } else if (crop.state === CropState.Thirsty) {
    // 缺水: 长期保持 Thirsty, 不枯萎; 生长不推进, 等待浇水后恢复
    events.push({ type: 'crop-grow', pos, state: CropState.Thirsty, cyclesToGrown: 0 });
  } else if (crop.state === CropState.Grown && crop.spreadLeft && crop.spreadLeft > 0) {
    // 香菇: 成熟后每回合按 上→右→下→左 顺序扩散 1 个小香菇 (成熟当回合后共 4 回合)
    spawnShiitake(world, pos, 4 - crop.spreadLeft, events);
    crop.spreadLeft -= 1;
  }
}

/** 上下左右四个正交邻格 (越界跳过) */
function orthNeighbors(pos: Position, world: WorldState): Position[] {
  const out: Position[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = pos[0] + dx;
    const ny = pos[1] + dy;
    if (nx >= 0 && nx < world.map[0].length && ny >= 0 && ny < world.map.length) {
      out.push([nx, ny]);
    }
  }
  return out;
}

/**
 * 香菇扩散: 按方向序号 (0=上, 1=右, 2=下, 3=左) 在邻格种下一株新的香菇
 * (地块需为空且为土地; 越界或不可种植则放弃该方向)。
 */
function spawnShiitake(world: WorldState, pos: Position, dirIndex: number, events: GameEvent[]): void {
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const [dx, dy] = dirs[dirIndex] ?? [0, 0];
  const nx = pos[0] + dx;
  const ny = pos[1] + dy;
  if (nx < 0 || nx >= world.map[0].length || ny < 0 || ny >= world.map.length) return;
  const tile = world.map[ny][nx];
  if (tile.crop || tile.type !== TileType.Soil) return;
  // 扩散出的香菇同样按场上香菇总数动态计算生长周期
  const cycles = shiitakeGrowCycles(world);
  tile.crop = {
    type: CropType.Shiitake,
    state: CropState.Growing,
    growthRemaining: cycles,
    thirstTotal: cropConfig(CropType.Shiitake).thirstInterval === null ? 0 : Math.floor(cycles / 20),
    thirstsDone: 0,
    plantCycles: cycles,
  };
  events.push({ type: 'plant', drone: -1, pos: [nx, ny], crop: CropType.Shiitake });
}

/**
 * 成熟特效处理器 (按作物注册表声明的效果 id 注册, 可扩展)。
 * 新增效果 = 在这里加一个处理器 + 在 CROPS 注册表中声明。
 */
const MATURITY_EFFECTS: Record<string, (ctx: { world: WorldState; pos: Position; crop: CropData; events: GameEvent[] }) => void> = {
  /** 香菇: 成熟后进入扩散期, 之后每回合按上右下左顺序扩散 1 个小香菇 (共 4 次) */
  selfSpread({ crop }) {
    crop.spreadLeft = 4;
  },
};

/**
 * 生长中特效处理器 (按作物注册表声明的效果 id 注册, 可扩展)。
 * 每种作物在生长中的每个回合都会执行其挂接的特效; 多数作物不声明 (无操作)。
 * 新增特效 = 在这里加一个处理器 + 在 CROPS 注册表中声明。
 */
const GROWTH_EFFECTS: Record<string, (ctx: { world: WorldState; crop: CropData; pos: Position; events: GameEvent[] }) => void> = {
  /**
   * 水仙: 生长中每回合按 上→右→下→左 顺序检查周围 Tile,
   * 若存在缺水作物则自动浇水 (每回合仅浇水一次), 成熟后无此效果。
   * 浇水效果与普通 Water 一致 (前端渲染淡蓝色特效)。
   */
  autoWater({ world, pos, events }) {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = pos[0] + dx;
      const ny = pos[1] + dy;
      if (nx < 0 || nx >= world.map[0].length || ny < 0 || ny >= world.map.length) continue;
      const nb = world.map[ny][nx].crop;
      if (!nb || nb.state !== CropState.Thirsty) continue;
      nb.state = CropState.Growing;
      events.push({ type: 'water', drone: -1, pos: [nx, ny] });
      return; // 每回合仅浇水一次
    }
  },
  /**
   * 紫云英: 生长中每回合按 上→右→下→左 顺序检查周围 Tile,
   * 若有作物且不缺水 (Growing) 且距离成熟剩余 >= 2 周期, 则其生长时间 -1 周期。
   */
  accelerateNeighbors({ world, pos }) {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = pos[0] + dx;
      const ny = pos[1] + dy;
      if (nx < 0 || nx >= world.map[0].length || ny < 0 || ny >= world.map.length) continue;
      const nb = world.map[ny][nx].crop;
      if (!nb || nb.state !== CropState.Growing) continue; // 缺水 (Thirsty) 的作物不加速
      if (nb.growthRemaining < 2) continue; // 距成熟不足 2 周期不加速
      nb.growthRemaining -= 1;
    }
  },
};
