// 玩家程序的执行沙箱 (worker_threads 内)。
// 此文件会被 esbuild 单独打包为 runner.worker.js, 由 NodeProgram 加载。
// 玩家代码通过 vm 上下文执行: 上下文只包含注入的 API / console / performance,
// 天然隔离 Node 的 require / process / 网络能力; 同步死循环由
// vm.runInContext 的 timeout 打断 (ERR_SCRIPT_EXECUTION_TIMEOUT)。
import { parentPort, workerData } from 'node:worker_threads';
import vm from 'node:vm';
import { playerApiFactory, normalizeOp, LOAD_TIMEOUT_MS, TIMEOUT_MS } from '@robofarm/shared/player';

const port = parentPort!;
const { compiledJs } = workerData as { compiledJs: string };

let currentView: unknown = null;
const { api, ops, console: safeConsole, drainLogs } = playerApiFactory(() => currentView as never);

const sandbox: Record<string, unknown> = {
  ...api,
  ...ops,
  console: safeConsole,
  performance,
  __ROBOFARM__: {},
};
vm.createContext(sandbox);

function post(msg: Record<string, unknown>): void {
  port.postMessage(msg);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 加载玩家代码 (编译产物), 从中取出 run 函数
try {
  vm.runInContext(compiledJs, sandbox, { timeout: LOAD_TIMEOUT_MS });
  const exported = sandbox.__ROBOFARM__ as { __robofarm_run?: unknown } | undefined;
  const run = typeof exported?.__robofarm_run === 'function' ? exported.__robofarm_run : null;
  if (!run) {
    post({ type: 'load-error', message: '未找到 run(droneId) 函数: 请定义 function run(droneId) { ... }' });
  } else {
    post({ type: 'loaded', ok: true });
  }
} catch (err) {
  post({ type: 'load-error', message: errorMessage(err) });
}

port.on('message', (msg: { type?: string; seq?: number; droneId?: number; view?: unknown }) => {
  if (msg.type !== 'turn') return;
  currentView = msg.view;
  const start = Date.now();
  try {
    const raw = vm.runInContext(`__ROBOFARM__.__robofarm_run(${Number(msg.droneId)})`, sandbox, {
      timeout: TIMEOUT_MS,
    });
    const durationMs = Date.now() - start;
    const logs = drainLogs();
    const normalized = normalizeOp(raw);
    if (normalized.ok) {
      post({ type: 'result', seq: msg.seq, operation: normalized.op ?? null, durationMs, logs });
    } else {
      post({ type: 'result-error', seq: msg.seq, message: normalized.error, logs });
    }
  } catch (err) {
    const logs = drainLogs();
    const message = errorMessage(err);
    // vm.runInContext 的 timeout 会抛出 "Script execution timed out after 400ms"
    if (/timed out|execution timeout|timeout/i.test(message)) {
      post({ type: 'timeout', seq: msg.seq });
    } else {
      post({ type: 'result-error', seq: msg.seq, message, logs });
    }
  }
});
