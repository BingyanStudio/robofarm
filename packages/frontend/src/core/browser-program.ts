// Browser-side PlayerProgram: one Web Worker per player program.
// Execution timeouts are handled by a host-side watchdog: exceeding TIMEOUT_MS + grace
// terminates the worker and reports an error (consistent with backend behavior: kill on timeout).
import { PlayerProgram, PlayerTurnResult, PlayerView, TIMEOUT_MS } from '@robofarm/shared';

interface Pending {
  resolve: (r: PlayerTurnResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class BrowserProgram implements PlayerProgram {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private disposed = false;

  static create(js: string): Promise<BrowserProgram> {
    return new Promise((resolve, reject) => {
      const program = new BrowserProgram(js);
      const timer = setTimeout(() => {
        program.dispose();
        reject(new Error('程序加载超时'));
      }, TIMEOUT_MS + 3000);
      program.onLoaded = (err?: string) => {
        clearTimeout(timer);
        if (err) reject(new Error(err));
        else resolve(program);
      };
    });
  }

  private onLoaded: ((err?: string) => void) | null = null;

  private constructor(js: string) {
    this.worker = new Worker(new URL('./player-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => this.onMessage(e.data);
    this.worker.onerror = (e) => {
      this.onLoaded?.(`程序加载失败: ${e.message}`);
      this.onLoaded = null;
      this.failAll(new Error(`程序崩溃: ${e.message}`));
    };
    this.worker.postMessage({ type: 'load', js });
  }

  private onMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'loaded') {
      this.onLoaded?.();
      this.onLoaded = null;
      return;
    }
    if (msg.type === 'load-error') {
      this.onLoaded?.(String(msg.message ?? '程序加载失败'));
      this.onLoaded = null;
      return;
    }
    const seq = msg.seq as number;
    const pending = this.pending.get(seq);
    if (!pending) return;
    this.pending.delete(seq);
    clearTimeout(pending.timer);
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
    }
  }

  private failAll(e: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }

  runTurn(droneId: number, view: PlayerView): Promise<PlayerTurnResult> {
    if (this.disposed) return Promise.reject(new Error('程序已终止'));
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Watchdog: execution timed out, terminate the worker (player program state lost, game counts as loss).
        this.worker.terminate();
        this.pending.delete(seq);
        reject(new Error(`程序执行超时 (超过 ${TIMEOUT_MS}ms), 已终止`));
      }, TIMEOUT_MS + 100);
      this.pending.set(seq, { resolve, reject, timer });
      this.worker.postMessage({ type: 'turn', seq, droneId, view });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.failAll(new Error('程序已终止'));
    this.worker.terminate();
  }
}
