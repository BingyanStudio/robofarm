// 单人种植验证服务: 接收玩家代码, 在服务端连续执行完整对局,
// 正常结束记录分数进排行榜, 否则记录报错信息。
import { GameController, compilePlayerCode, DEFAULT_MAX_TURNS, ReplayRecorder } from '@robofarm/shared';
import { NodeProgram } from '../runner/node-program';
import { listSingleHistory, leaderboard, recordSingleSubmission, getSingleSubmission, ensureCwd, userRank, listLeaderboardSnapshots, LEADERBOARD_VERSION } from '../db';
import { availableParallelism } from 'node:os';

const stamp = () => new Date().toISOString();

export interface ValidationStatus {
  busy: boolean;
  progress: number;
  score: number | null;
  error: string | null;
}

const states = new Map<number, ValidationStatus>();

const IDLE: ValidationStatus = { busy: false, progress: 1, score: null, error: null };

/**
 * 全局并发验证上限 (env: SINGLE_MAX_CONCURRENT)。
 * 每个验证占一个 worker_thread (线程), 默认按 CPU 核心数自动选择 (感知容器 cgroup 限额),
 * 以 32 为上限防止小内存机器被并发拖垮。
 */
const MAX_CONCURRENT = (() => {
  const explicit = Number(process.env.SINGLE_MAX_CONCURRENT);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.min(32, Math.max(1, availableParallelism()));
})();
let activeValidations = 0;

function statusOf(userId: number): ValidationStatus {
  return states.get(userId) ?? IDLE;
}

/**
 * 启动一次验证。同一用户同时只能运行一次 (busy);
 * 全局并发超过上限时返回繁忙错误。
 */
export async function startValidation(
  userId: number,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const st = statusOf(userId);
  if (st.busy) return { ok: false, error: '已有程序正在运行, 请等待完成' };
  if (activeValidations >= MAX_CONCURRENT) {
    return { ok: false, error: '服务器繁忙, 请稍后重试' };
  }
  activeValidations += 1;
  states.set(userId, { busy: true, progress: 0, score: null, error: null });
  runValidation(userId, code)
    .catch(() => {
      // runValidation 内部已处理错误
    })
    .finally(() => {
      activeValidations -= 1;
    });
  return { ok: true };
}

async function runValidation(userId: number, code: string): Promise<void> {
  let score: number | null = null;
  let error: string | null = null;
  let program: NodeProgram | null = null;
  const recorder = new ReplayRecorder();
  try {
    ensureCwd(); // cwd 可能被外部删除, 运行前自愈
    const compiled = await compilePlayerCode(code);
    if (!compiled.ok) {
      const first = compiled.errors[0];
      error = `编译失败${first?.line ? ` (第 ${first.line} 行)` : ''}: ${first?.message ?? '未知错误'}`;
      console.log(`[${stamp()}] [single] user=${userId} 编译失败: ${error}`);
      return;
    }
    program = new NodeProgram(compiled.js);
    await program.load();
    const controller = new GameController({
      mode: 'single',
      players: [{ name: '玩家', frame: 'normal', program: recorder.wrap(program) }],
      maxTurns: DEFAULT_MAX_TURNS,
    });
    console.log(`[${stamp()}] [single] user=${userId} 开始验证 (${DEFAULT_MAX_TURNS} 回合)`);
    let endResult: { type: string; message?: string; money?: number[] } | null = null;
    while (!controller.over) {
      const events = await controller.step();
      recorder.afterStep(events, controller.world.turn);
      for (const e of events) {
        if (e.type === 'end') endResult = e.result as { type: string; message?: string; money?: number[] };
      }
      const st = states.get(userId);
      if (st) st.progress = Math.min(1, controller.world.turn / controller.world.maxTurns);
    }
    if (endResult && endResult.type === 'error') {
      error = endResult.message ?? '程序执行失败';
    } else {
      score = controller.world.players[0].money;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    program?.dispose();
    const st = states.get(userId);
    if (st) {
      st.busy = false;
      st.progress = 1;
      st.score = score;
      st.error = error;
    }
    // 生成回放文件 (JSON) 并入库
    let replayJson: string | null = null;
    try {
      const file = recorder.buildFile({
        mode: 'single',
        maxTurns: DEFAULT_MAX_TURNS,
        players: ['玩家'],
        result: error ? { type: 'error', message: error } : { type: 'finished', money: score != null ? [score] : undefined },
      });
      replayJson = JSON.stringify(file);
    } catch {
      replayJson = null; // 录制失败不阻塞入库
    }
    recordSingleSubmission(userId, code, score, error, replayJson);
    console.log(`[${stamp()}] [single] user=${userId} 验证完成 score=${score ?? '-'}${error ? ` error=${error}` : ''}`);
  }
}

/** 下载某条单人提交的回放文件 */
export function singleReplay(submissionId: number, userId: number): { file: unknown } | { error: string } {
  const row = getSingleSubmission(submissionId, userId);
  if (!row) return { error: '记录不存在' };
  if (!row.replay) return { error: '该记录没有回放' };
  try {
    return { file: JSON.parse(row.replay) };
  } catch {
    return { error: '回放数据损坏' };
  }
}

export function validationStatus(userId: number): ValidationStatus {
  return statusOf(userId);
}

export function singleHistory(userId: number) {
  return listSingleHistory(userId);
}

export function singleLeaderboard(userId: number | null) {
  // 历次大版本的冻结排行榜 + 当前版本的实时榜 (前端以 Tab 展示)
  const live = leaderboard(50).map((e) => ({
    name: e.name,
    score: e.score,
    me: e.user_id === userId,
  }));
  const tabs = listLeaderboardSnapshots().map((s) => ({
    version: s.version,
    entries: (JSON.parse(s.payload) as { name: string; score: number }[]).map((e) => ({ ...e, me: false })),
  }));
  tabs.push({ version: LEADERBOARD_VERSION, entries: live });
  return { tabs };
}

/** 指定玩家在当前版本的得分与全榜名次 */
export function singleUserRank(name: string) {
  return userRank(name);
}
