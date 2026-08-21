// 回合引擎: 接收各无人机本回合的操作, 完成语义校验、移动仲裁、
// 拦截/偷菜结算与作物生长, 输出事件流。
//
// 设计约定:
// - 所有操作效果视为"回合结束瞬间同时发生", 冲突 (同一格子多个无人机)
//   按"代码执行时间短者优先"仲裁。
// - 每种操作是一个 class (ops/<type>.ts), 继承 DroneOperation 并通过重写
//   静态方法 apply() 实现自己的语义; 引擎阶段 1 只按 type 查 OP_CLASSES
//   注册表 (ops/index.ts) 并调用 cls.apply(), 不再有 if-else / 处理器字典。
// - 移动/传送在 apply() 里登记移动候选, NewDrone 登记回合末延迟创建请求,
//   其余操作直接修改世界。
import {
  CropData,
  CropState,
  GameEvent,
  InternalOperation,
  Position,
  WorldState,
} from './types';
import { cropConfig } from './registry';
import { inBounds, isOwnHalf, samePos } from './maps';
import { opClassOf } from './ops';
import type { MoveCandidate, TurnSession } from './ops';

/** 某架无人机本回合的动作 */
export interface DroneAction {
  op: InternalOperation | null;
  /** run() 执行耗时 (毫秒), 用于冲突仲裁 */
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
  const session: TurnSession = { moveCandidates, newDroneRequests };

  // 阶段 1: 语义校验并执行非移动操作, 收集移动候选。
  // 每个操作类实现自己的 apply(): 移动/传送登记移动候选, NewDrone 登记延迟创建,
  // 其余直接修改世界。这里只做注册表分发, 无 if-else。
  for (const drone of world.drones) {
    const act = actions[drone.id];
    if (!act || !act.op) continue;
    const cls = opClassOf(act.op.type);
    if (!cls) {
      events.push({ type: 'invalid-op', drone: drone.id, message: `未知操作类型: ${String(act.op.type)}` });
      continue;
    }
    const result = cls.apply({ world, drone, events, durationMs: act.durationMs }, act.op, session);
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
      // 成熟特效: 作物成熟时执行其挂接的特效 (多数作物未声明, 无操作)。
      // 特效函数直接定义在作物自己的文件里 (crops/<type>.ts 的 onMature), 引擎直接调用。
      cfg.onMature?.({ world, pos, crop, events });
    } else {
      // 生长特效: 每个生长回合都会执行 (多数作物未声明, 无操作)。
      cfg.onGrow?.({ world, crop, pos, events });

      if (cfg.thirstInterval !== null) {
        // 缺水触发按种植时记录的"总缺水次数"动态计算, 缺水点在实际生长周期内均匀分布:
        // 第 (thirstsDone+1) 次缺水发生在剩余回合数降到 ceil((剩余次数)·实际周期/(总次数+1)) 时。
        const total = crop.thirstTotal ?? 0;
        const done = crop.thirstsDone ?? 0;
        const cycles = crop.plantCycles ?? cfg.growCyclesBase;
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
  } else if (crop.state === CropState.Grown) {
    // 成熟后每回合特效: 每个作物成熟后每个回合都会执行其挂接的特效
    // (多数作物不声明, 无操作)。特效函数直接定义在作物自己的文件里
    // (crops/<type>.ts 的 onGrown), 引擎直接调用。
    // 如香菇: 按上右下左顺序扩散 1 株小香菇 (CropData.spreadLeft, 到 0 停止)。
    cfg.onGrown?.({ world, pos, crop, events });
  }
}

