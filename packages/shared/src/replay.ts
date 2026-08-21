// 回放文件: 记录每一回合的回合数、各无人机操作与程序输出。
// - 录制: ReplayRecorder 包装玩家程序, 捕获每回合的操作 (本地坐标, 未转换),
//   配合控制器 step 返回的 log 事件, 生成 ReplayFile (JSON 可序列化)。
// - 播放: replayEvents 用记录的操作为脚本, 重新跑一遍引擎 (确定性),
//   再生出完整事件流 (含每回合 snapshot), 回放界面按快照播放。
import { GameController, PlayerProgram, PlayerTurnResult } from './game-controller';
import { normalizeOp } from './ops';
import { GameEvent, GameMode, InternalOperation } from './types';

/** 单回合内某架无人机的操作 */
export interface ReplayDroneOp {
  /** 玩家视角的本地无人机编号 (0..N-1) */
  id: number;
  /** 该回合返回的操作 (规范化后的纯对象, 本地坐标系) */
  op: InternalOperation | null;
}

/** 单回合记录 */
export interface ReplayRound {
  /** 回合数 (从 1 开始) */
  round: number;
  drones: ReplayDroneOp[];
  /** 该回合的程序输出 (日志行) */
  output: string[];
}

/** 回放文件 (JSON) */
export interface ReplayFile {
  mode: GameMode;
  maxTurns: number;
  players: string[];
  /**
   * 本局随机种子: 游戏开始时随机取得, 回放时用同一种子重推演,
   * 保证缺水时机等随机机制与游玩时完全一致。旧回放文件可能缺失。
   */
  seed?: number;
  result: { type: 'finished' | 'error'; money?: number[]; message?: string } | null;
  rounds: ReplayRound[];
}

export interface ReplayPlayerConfig {
  name: string;
  frame: 'normal' | 'mirror';
  program: PlayerProgram;
}

/**
 * 包装玩家程序, 捕获其每回合返回的操作 (本地坐标)。
 * @param onOp 每回合每架无人机回调一次
 */
export function wrapProgramForReplay(
  program: PlayerProgram,
  onOp: (droneId: number, op: InternalOperation | null) => void
): PlayerProgram {
  return {
    async runTurn(droneId: number, view: Parameters<PlayerProgram['runTurn']>[1]): Promise<PlayerTurnResult> {
      const r = await program.runTurn(droneId, view);
      if (!r.error) {
        const n = normalizeOp(r.operation);
        onOp(droneId, n.ok ? n.op : null);
      }
      return r;
    },
    dispose: () => program.dispose(),
  };
}

/** 录制会话: 收集各回合的操作与日志, 生成回放文件 */
export class ReplayRecorder {
  private readonly rounds: ReplayRound[] = [];
  private pending: ReplayDroneOp[] = [];
  /** 本局随机种子 (来自 controller.world.rngSeed, 随回放文件保存) */
  seed: number = 0;

  /** 包装玩家程序 (每个玩家各包装一次) */
  wrap(program: PlayerProgram): PlayerProgram {
    return wrapProgramForReplay(program, (id, op) => {
      this.pending.push({ id, op });
    });
  }

  /** 每回合 step() 完成后调用: 把该回合的操作与日志落盘 */
  afterStep(events: GameEvent[], round: number): void {
    const output: string[] = [];
    for (const e of events) {
      if (e.type === 'log') output.push(...e.lines);
    }
    this.rounds.push({ round, drones: this.pending, output });
    this.pending = [];
  }

  /** 生成回放文件 */
  buildFile(meta: { mode: GameMode; maxTurns: number; players: string[]; result: ReplayFile['result'] }): ReplayFile {
    return {
      mode: meta.mode,
      maxTurns: meta.maxTurns,
      players: meta.players,
      seed: this.seed,
      result: meta.result,
      rounds: this.rounds,
    };
  }
}

/** 从回放文件重新推演 (脚本化操作, 用回放文件里的随机种子, 确定性), 返回完整事件流 (含 snapshot / end) */
export async function replayEvents(file: ReplayFile): Promise<GameEvent[]> {
  const players = file.players.map((name, pi) => ({
    name,
    // 竞技模式 P2 为镜像坐标系, 与正式对局一致
    frame: (file.mode === 'combat' && pi === 1 ? 'mirror' : 'normal') as 'normal' | 'mirror',
    program: makeScriptedPlayer(file, pi),
  }));
  const controller = new GameController({
    mode: file.mode,
    players,
    maxTurns: file.maxTurns,
    // 旧回放文件可能没有 seed, 退化为随机 (新文件一定携带)
    seed: file.seed,
  });
  const all: GameEvent[] = [];
  while (!controller.over) {
    const events = await controller.step();
    const round = controller.world.turn;
    const rec = file.rounds.find((r) => r.round === round);
    if (rec && rec.output.length > 0) {
      // 注入该回合录制时产生的程序输出
      events.unshift({ type: 'log', player: 0, lines: rec.output });
    }
    all.push(...events);
  }
  return all;
}

/** 按回放文件每回合返回记录的操作 (本地坐标) 的脚本化程序 */
export function makeScriptedPlayer(file: ReplayFile, _playerIndex: number): PlayerProgram {
  return {
    async runTurn(droneId: number, view: { turn: number }): Promise<PlayerTurnResult> {
      const rec = file.rounds.find((r) => r.round === view.turn);
      const op = rec?.drones.find((d) => d.id === droneId)?.op ?? null;
      return { operation: op, durationMs: 10, logs: [] };
    },
    dispose: () => undefined,
  };
}
