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
  InternalOperation,
  DroneState,
  GameEvent,
  Position,
  WorldState,
} from './types';
import { TILES, cropConfig } from './registry';
import { MAX_WATER } from './config';
import { inBounds, isOwnHalf, samePos, tileAt } from './maps';

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
    if (world.mode === 'combat' && !isOwnHalf(world, drone)) {
      return { ok: false, message: '只能在己方半场种植' };
    }
    const player = world.players[drone.player];
    if (player.money < cfg.plantCost) return { ok: false, message: '金钱不足' };
    player.money -= cfg.plantCost;
    tile.crop = { type: op.crop, state: CropState.Growing, growthRemaining: cfg.growCycles };
    events.push({ type: 'plant', drone: drone.id, pos: [drone.position[0], drone.position[1]], crop: op.crop });
    return { ok: true };
  },

  collectWater(ctx, op) {
    if (op.type !== 'collectWater') return { ok: false };
    const { world, drone, events } = ctx;
    const tile = tileAt(world, drone.position);
    if (!TILES[tile.type].canCollectWater) return { ok: false, message: '只能在池塘上取水' };
    if (drone.water >= MAX_WATER) return { ok: false, message: `水量已满 (最多 ${MAX_WATER} 格)` };
    drone.water += 1;
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
    tile.crop = null;
    const stole = world.mode === 'combat' && !isOwnHalf(world, drone);
    if (stole) drone.bounty += cfg.value;
    else world.players[drone.player].money += cfg.value;
    events.push({
      type: 'harvest',
      drone: drone.id,
      pos: [drone.position[0], drone.position[1]],
      value: cfg.value,
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
};

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

  // 阶段 1: 语义校验并执行非移动操作, 收集移动候选
  for (const drone of world.drones) {
    const act = actions[drone.id];
    if (!act || !act.op) continue;
    const { op } = act;
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

  // 阶段 3: 回合结束结算 —— 拦截, 然后偷菜资金带回
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

  return events;
}

function tickCrops(world: WorldState, events: GameEvent[]): void {
  for (let y = 0; y < world.map.length; y++) {
    for (let x = 0; x < world.map[y].length; x++) {
      const crop = world.map[y][x].crop;
      if (!crop) continue;
      tickCrop(crop, [x, y], events);
    }
  }
}

function tickCrop(crop: CropData, pos: Position, events: GameEvent[]): void {
  const cfg = cropConfig(crop.type);
  if (crop.state === CropState.Growing) {
    crop.growthRemaining -= 1;
    if (crop.growthRemaining <= 0) {
      crop.state = CropState.Grown;
      crop.growthRemaining = 0;
      events.push({ type: 'crop-grow', pos, state: CropState.Grown, cyclesToGrown: 0 });
    } else if (cfg.thirstInterval !== null && crop.growthRemaining % cfg.thirstInterval === 0) {
      // 生长一段时间后进入缺水状态, 需要浇水
      crop.state = CropState.Thirsty;
      events.push({ type: 'crop-grow', pos, state: CropState.Thirsty, cyclesToGrown: 0 });
    } else {
      events.push({
        type: 'crop-grow',
        pos,
        state: CropState.Growing,
        cyclesToGrown: crop.growthRemaining,
      });
    }
  } else if (crop.state === CropState.Thirsty) {
    // 缺水: 长期保持 Thirsty, 不枯萎; 生长不推进, 等待浇水后恢复
    events.push({ type: 'crop-grow', pos, state: CropState.Thirsty, cyclesToGrown: 0 });
  }
}
