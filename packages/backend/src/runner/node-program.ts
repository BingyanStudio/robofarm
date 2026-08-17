// 后端玩家程序运行器: 每个玩家程序一个 worker_threads。
// - 内存限制: worker 的 resourceLimits (超出即 worker 报错 → 程序判负)
// - 时间限制: worker 内用 vm.runInContext 的 timeout 打断同步死循环
// - 隔离: vm.createContext 只暴露注入的 API + console + performance,
//   玩家代码无法访问 Node 的 require / process / 网络等
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { PlayerProgram, PlayerTurnResult, PlayerView } from '@robofarm/shared';
import { TIMEOUT_MS } from '@robofarm/shared';

interface PendingRequest {
  resolve: (r: PlayerTurnResult) => void;
  reject: (e: Error) => void;
}

/**
 * worker 文件路径: 因打包产物位于 dist/runner/, 而 vitest / tsx / 发布版
 * 的 __dirname 各不相同, 因此同时探测多个候选路径。
 */
function resolveWorkerPath(): string {
  const candidates = [
    join(__dirname, 'runner.worker.js'), // 生产: dist/runner/
    join(__dirname, 'runner', 'runner.worker.js'), // 发布版: release/runner/
    join(__dirname, '..', 'dist', 'runner', 'runner.worker.js'), // vitest: test/
    join(__dirname, '..', '..', 'dist', 'runner', 'runner.worker.js'), // tsx: src/runner/
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

export class NodeProgram implements PlayerProgram {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, PendingRequest>();
  private disposed = false;

  static workerPath(): string {
    return resolveWorkerPath();
  }

  constructor(compiledJs: string) {
    this.worker = new Worker(NodeProgram.workerPath(), {
      workerData: { compiledJs },
      resourceLimits: {
        maxOldGenerationSizeMb: 96,
        maxYoungGenerationSizeMb: 32,
      },
    });
    this.worker.on('message', (msg) => this.onMessage(msg));
    this.worker.on('error', (err) => this.onWorkerError(err));
    this.worker.on('exit', (code) => this.onExit(code));
  }

  /** 等待 worker 加载完成, 抛错则说明玩家代码无法加载 */
  load(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.dispose();
        reject(new Error('程序加载超时'));
      }, TIMEOUT_MS + 3000);
      this.waitLoaded = () => {
        clearTimeout(timer);
        if (this.loadError) reject(new Error(this.loadError));
        else resolve();
      };
      this.failLoaded = reject;
    });
  }

  private waitLoaded: (() => void) | null = null;
  private failLoaded: ((e: Error) => void) | null = null;
  private loadError: string | null = null;

  private failLoad(e: Error): void {
    this.loadError = e.message;
    this.waitLoaded?.();
    this.waitLoaded = null;
    this.failLoaded?.(e);
    this.failLoaded = null;
  }

  private onMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'loaded') {
      this.waitLoaded?.();
      this.waitLoaded = null;
      return;
    }
    if (msg.type === 'load-error') {
      this.loadError = String(msg.message ?? '程序加载失败');
      this.waitLoaded?.();
      this.waitLoaded = null;
      return;
    }
    const seq = msg.seq as number;
    const pending = this.pending.get(seq);
    if (!pending) return;
    this.pending.delete(seq);
    if (msg.type === 'result') {
      pending.resolve({
        operation: (msg.operation as PlayerTurnResult['operation']) ?? null,
        durationMs: msg.durationMs as number,
        logs: (msg.logs as string[]) ?? [],
      });
    } else if (msg.type === 'result-error') {
      pending.resolve({
        operation: null,
        durationMs: 0,
        logs: (msg.logs as string[]) ?? [],
        error: `程序报错: ${String(msg.message ?? '未知错误')}`,
      });
    } else if (msg.type === 'timeout') {
      // 超时 → 程序被判死 (与浏览器端行为一致: 立即 kill 并报错)
      this.dispose();
      pending.reject(new Error(`程序执行超时 (超过 ${TIMEOUT_MS}ms), 已终止`));
    }
  }

  private onWorkerError(err: Error): void {
    const message = /memory|heap/i.test(err.message)
      ? `内存超限, 程序已终止`
      : `程序崩溃: ${err.message}`;
    this.failAll(new Error(message));
    this.failLoad(new Error(message));
  }

  private onExit(code: number): void {
    if (!this.disposed) {
      this.failAll(new Error(`程序意外退出 (code ${code})`));
      this.failLoad(new Error(`程序意外退出 (code ${code})`));
    }
  }

  private failAll(e: Error): void {
    for (const [, p] of this.pending) p.reject(e);
    this.pending.clear();
  }

  runTurn(droneId: number, view: PlayerView): Promise<PlayerTurnResult> {
    if (this.disposed) return Promise.reject(new Error('程序已终止'));
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(seq, { resolve, reject });
      this.worker.postMessage({ type: 'turn', seq, droneId, view });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.failAll(new Error('程序已终止'));
    try {
      this.worker.terminate();
    } catch {
      // 忽略
    }
  }
}
