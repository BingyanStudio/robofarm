// 回合编排器: 负责在每回合为每架无人机构建本地视图、调用玩家程序、
// 汇总操作交给引擎, 并产出完整事件流 (turn / 操作事件 / snapshot / end)。
// 前端本地模式与后端验证/对战模式共用同一个控制器, 保证行为一致。
import {
  InternalOperation,
  GameEvent,
  GameMode,
  PlayerView,
  WorldState,
  Frame,
} from './types';
import { createCombatWorld, createSingleWorld } from './maps';
import { buildPlayerView, snapshotOf, fromLocal } from './view';
import { stepTurn } from './engine';
import { normalizeOp } from './ops';

export interface PlayerTurnResult {
  operation: InternalOperation | null;
  durationMs: number;
  logs: string[];
  error?: string;
}

/**
 * 玩家程序的平台抽象。前端用 Web Worker 实现, 后端用 worker_threads + vm 实现。
 * 两种实现必须遵守相同的协议与超时语义 (见 TIMEOUT_MS)。
 */
export interface PlayerProgram {
  /** 为某架无人机执行一次 run(droneId) */
  runTurn(droneId: number, view: PlayerView): Promise<PlayerTurnResult>;
  /** 释放资源 (终止 worker 等) */
  dispose(): void;
}

export interface GamePlayer {
  name: string;
  /** 该玩家的坐标系: 竞技模式 P1 为 normal, P2 为 mirror */
  frame: 'normal' | 'mirror';
  program: PlayerProgram;
}

export interface GameControllerOptions {
  mode: GameMode;
  players: GamePlayer[];
  maxTurns: number;
  /** 本局随机种子 (缺省随机取得; 回放时从回放文件传入以保证一致) */
  seed?: number;
}

/**
 * 玩家在本地坐标系编程 (竞技模式 P2 为 mirror), 操作中的坐标
 * (移动目标/拦截目标) 需映射回绝对坐标后再交给引擎; normal 帧为恒等变换。
 */
function toAbsolute(op: InternalOperation | null, frame: Frame, width: number): InternalOperation | null {
  if (!op) return op;
  if (op.type === 'move') return { type: 'move', to: fromLocal(op.to, width, frame) };
  if (op.type === 'intercept') return { type: 'intercept', at: fromLocal(op.at, width, frame) };
  return op;
}

export class GameController {
  readonly world: WorldState;
  readonly mode: GameMode;
  readonly players: GamePlayer[];
  /** 每个玩家的全局无人机 id 列表 (按世界生成顺序) */
  private readonly droneIdsByPlayer: number[][];

  constructor(opts: GameControllerOptions) {
    this.mode = opts.mode;
    this.players = opts.players;
    this.world =
      opts.mode === 'single'
        ? createSingleWorld(opts.maxTurns, opts.seed)
        : createCombatWorld(opts.maxTurns, opts.seed);
    const byPlayer: number[][] = this.players.map(() => []);
    for (const d of this.world.drones) byPlayer[d.player].push(d.id);
    this.droneIdsByPlayer = byPlayer;
  }

  /** 游戏是否已结束 (回合耗尽或任意玩家程序死亡) */
  get over(): boolean {
    return this.world.turn >= this.world.maxTurns || !this.world.players.some((p) => p.alive);
  }

  /**
   * 执行一个回合, 返回该回合的完整事件流。
   * 若程序报错/超时, 游戏以 error 结果提前结束。
   */
  async step(): Promise<GameEvent[]> {
    const events: GameEvent[] = [{ type: 'turn', turn: this.world.turn + 1 }];
    const actions: Record<number, { op: InternalOperation | null; durationMs: number }> = {};

    for (let pi = 0; pi < this.players.length; pi++) {
      if (!this.world.players[pi].alive) continue;
      const player = this.players[pi];
      const ids = this.droneIdsByPlayer[pi];
      for (let di = 0; di < ids.length; di++) {
        const view = buildPlayerView(this.world, pi, di, player.frame);
        let result: PlayerTurnResult;
        try {
          result = await player.program.runTurn(di, view);
        } catch (err) {
          result = {
            operation: null,
            durationMs: 0,
            logs: [],
            error: `程序执行失败: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
        if (result.logs && result.logs.length > 0) {
          events.push({ type: 'log', player: pi, lines: result.logs });
        }
        if (result.error) {
          this.world.players[pi].alive = false;
          events.push({
            type: 'end',
            result: { type: 'error', player: pi, message: result.error },
          });
          this.world.turn += 1;
          return events;
        }
        // 统一规范化操作 (玩家 class 实例 → 纯对象), 保证引擎拿到一致结构
        const normalized = normalizeOp(result.operation);
        if (!normalized.ok) {
          this.world.players[pi].alive = false;
          events.push({
            type: 'end',
            result: { type: 'error', player: pi, message: normalized.error },
          });
          this.world.turn += 1;
          return events;
        }
        actions[ids[di]] = {
          op: toAbsolute(normalized.op, player.frame, this.world.map[0].length),
          durationMs: result.durationMs,
        };
      }
    }

    events.push(...stepTurn(this.world, actions));
    this.world.turn += 1;
    // 同步无人机列表: NewDrone 可能新增无人机, 下一回合开始执行代码
    for (let pi = 0; pi < this.players.length; pi++) {
      this.droneIdsByPlayer[pi] = this.world.drones.filter((d) => d.player === pi).map((d) => d.id);
    }
    events.push({ type: 'snapshot', state: snapshotOf(this.world) });

    if (this.world.turn >= this.world.maxTurns) {
      events.push({
        type: 'end',
        result: {
          type: 'finished',
          scores: this.world.players.map((p) => ({
            player: p.id,
            name: this.players[p.id].name,
            money: p.money,
          })),
        },
      });
    }
    return events;
  }

  dispose(): void {
    for (const p of this.players) {
      try {
        p.program.dispose();
      } catch {
        // 忽略销毁阶段的错误
      }
    }
  }
}
