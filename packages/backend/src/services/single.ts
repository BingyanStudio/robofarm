// 单人种植验证服务: 接收玩家代码, 在服务端连续执行完整对局,
// 正常结束记录分数进排行榜, 否则记录报错信息。
import { GameController, compilePlayerCode, DEFAULT_MAX_TURNS, ReplayRecorder, ReplayFile } from '@robofarm/shared';
import { NodeProgram } from '../runner/node-program';
import { listSingleHistory, leaderboard, recordSingleSubmission, getSingleSubmission, ensureCwd, userRank, listLeaderboardSnapshots, LEADERBOARD_VERSION } from '../db';
import { availableParallelism } from 'node:os';

const stamp = () => new Date().toISOString();

export interface ValidationStatus {
  busy: boolean;
  progress: number;
  score: number | null;
  error: string | null;
  /** 各局 (固定种子) 的单独得分, 与 VALIDATION_SEEDS 对齐 */
  runs: number[];
}

const states = new Map<number, ValidationStatus>();

const IDLE: ValidationStatus = { busy: false, progress: 1, score: null, error: null, runs: [] };

/**
 * 单人验证的固定随机种子: 服务器对每个种子各完整执行一局, 取平均分 (向上取整)
 * 作为最终成绩。种子固定 → 服务器验证结果确定可复现 (与本地随机种子试玩的结果可能不同)。
 */
const VALIDATION_SEEDS: number[] = [0x11d4a1f2, 0x22b8e3c7, 0x339c0b4d, 0x447f5a9e, 0x5563d8c1];

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
  states.set(userId, { busy: true, progress: 0, score: null, error: null, runs: [] });
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
  const runScores: number[] = [];
  const runReplays: (ReplayFile | null)[] = [];
  try {
    ensureCwd(); // cwd 可能被外部删除, 运行前自愈
    const compiled = await compilePlayerCode(code);
    if (!compiled.ok) {
      const first = compiled.errors[0];
      error = `编译失败${first?.line ? ` (第 ${first.line} 行)` : ''}: ${first?.message ?? '未知错误'}`;
      console.log(`[${stamp()}] [single] user=${userId} 编译失败: ${error}`);
      return;
    }
    // 固定 5 个随机种子各完整执行一局, 平均分 (向上取整) 作为最终成绩
    const total = VALIDATION_SEEDS.length;
    for (let i = 0; i < total; i++) {
      const seed = VALIDATION_SEEDS[i];
      // 每局独立 worker: 玩家代码的模块级状态不跨局残留
      program = new NodeProgram(compiled.js);
      await program.load();
      const recorder = new ReplayRecorder();
      const controller = new GameController({
        mode: 'single',
        players: [{ name: '玩家', frame: 'normal', program: recorder.wrap(program) }],
        maxTurns: DEFAULT_MAX_TURNS,
        seed,
      });
      recorder.seed = controller.world.rngSeed;
      console.log(`[${stamp()}] [single] user=${userId} 开始第 ${i + 1}/${total} 局验证 (seed=${seed}, ${DEFAULT_MAX_TURNS} 回合)`);
      let endResult: { type: string; message?: string; money?: number[] } | null = null;
      while (!controller.over) {
        const events = await controller.step();
        recorder.afterStep(events, controller.world.turn);
        for (const e of events) {
          if (e.type === 'end') endResult = e.result as { type: string; message?: string; money?: number[] };
        }
        const st = states.get(userId);
        if (st) st.progress = Math.min(1, (i + controller.world.turn / controller.world.maxTurns) / total);
      }
      program.dispose();
      program = null;
      if (endResult && endResult.type === 'error') {
        error = endResult.message ?? '程序执行失败';
        break;
      }
      const runScore = controller.world.players[0].money;
      runScores.push(runScore);
      try {
        const file = recorder.buildFile({
          mode: 'single',
          maxTurns: DEFAULT_MAX_TURNS,
          players: ['玩家'],
          result: { type: 'finished', money: [runScore] },
        });
        runReplays.push(file);
      } catch {
        runReplays.push(null); // 该局录制失败不阻塞其他局
      }
    }
    if (!error) {
      // 平均分向上取整作为最终成绩
      score = Math.ceil(runScores.reduce((a, b) => a + b, 0) / runScores.length);
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
      st.runs = runScores;
    }
    // 多局回放 (含各局得分) 一起入库; 旧记录为单个 ReplayFile, 读取时兼容
    let replayJson: string | null = null;
    try {
      replayJson = JSON.stringify({ scores: runScores, replays: runReplays });
    } catch {
      replayJson = null; // 录制失败不阻塞入库
    }
    recordSingleSubmission(userId, code, score, error, replayJson);
    console.log(`[${stamp()}] [single] user=${userId} 验证完成 score=${score ?? '-'} runs=[${runScores.join(', ')}]${error ? ` error=${error}` : ''}`);
  }
}

/** 下载某条单人提交的回放文件; run 指定取第几局 (0 起), 旧记录 (单局) 忽略该参数 */
export function singleReplay(submissionId: number, userId: number, run = 0): { file: unknown } | { error: string } {
  const row = getSingleSubmission(submissionId, userId);
  if (!row) return { error: '记录不存在' };
  if (!row.replay) return { error: '该记录没有回放' };
  try {
    const parsed = JSON.parse(row.replay) as Record<string, unknown>;
    if (Array.isArray(parsed.replays)) {
      const files = parsed.replays as unknown[];
      const idx = Number.isInteger(run) && run >= 0 && run < files.length ? run : 0;
      const file = files[idx];
      return file ? { file } : { error: '该局没有回放' };
    }
    return { file: parsed };
  } catch {
    return { error: '回放数据损坏' };
  }
}

/** 各局得分 (解析多局回放载荷; 旧记录返回 null) */
function runsOf(row: { replay: string | null }): number[] | null {
  if (!row.replay) return null;
  try {
    const parsed = JSON.parse(row.replay) as Record<string, unknown>;
    return Array.isArray(parsed.scores) ? (parsed.scores as number[]) : null;
  } catch {
    return null;
  }
}

export function validationStatus(userId: number): ValidationStatus {
  return statusOf(userId);
}

export function singleHistory(userId: number) {
  // 列表不携带完整回放 (体积大), 只返回各局得分与"是否有回放可下载"
  return listSingleHistory(userId).map((r) => ({
    id: r.id,
    score: r.score,
    error: r.error,
    runs: runsOf(r),
    has_replay: !!r.replay,
    created_at: r.created_at,
  }));
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
