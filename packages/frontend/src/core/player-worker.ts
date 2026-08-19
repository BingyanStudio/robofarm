// Browser-side player code sandbox (Web Worker).
// Player code (esbuild bundler output) runs via new Function:
// - The function parameter list declares both the injected API and the dangerous globals to
//   shadow, lexically shadowing fetch / setTimeout / XMLHttpRequest / WebSocket etc. (set to
//   undefined, throwing TypeError on call), so player code cannot escape via network/async.
// - Timeouts are handled by a host-side (BrowserProgram) watchdog that terminates the whole
//   worker, hence the program is judged dead.
import { playerApiFactory, normalizeOp } from '@robofarm/shared/player';
import type { PlayerView } from '@robofarm/shared/player';

// Globals to shadow (set to undefined). globalThis / self are not shadowed (esbuild output may reference them).
const SHADOWED_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
  'indexedDB', 'caches', 'navigator', 'location', 'document', 'window',
  'postMessage', 'close', 'onmessage',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate',
  'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
  'Worker', 'SharedWorker', 'BroadcastChannel', 'MessageChannel', 'MessagePort',
  'process', 'require', 'module', 'global', 'Buffer',
];

let currentView: PlayerView | null = null;
const { api, ops, console: safeConsole, drainLogs } = playerApiFactory(() => currentView);
let runFn: ((droneId: number) => unknown) | null = null;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type: string; seq?: number; js?: string; droneId?: number; view?: PlayerView };
  if (msg.type === 'load') {
    try {
      const paramNames = [...Object.keys(api), ...Object.keys(ops), 'console', ...SHADOWED_GLOBALS];
      const body =
        (msg.js ?? '') +
        '\n;return typeof __ROBOFARM__ !== "undefined" && __ROBOFARM__ ? __ROBOFARM__.__robofarm_run : null;';
      const fn = new Function(...paramNames, body);
      const args = [...Object.values(api), ...Object.values(ops), safeConsole, ...SHADOWED_GLOBALS.map(() => undefined)];
      const loaded = fn(...args);
      runFn = typeof loaded === 'function' ? (loaded as (id: number) => unknown) : null;
      self.postMessage({ type: 'loaded', ok: runFn !== null });
      if (!runFn) {
        self.postMessage({ type: 'load-error', message: '未找到 run(droneId) 函数: 请定义 function run(droneId) { ... }' });
      }
    } catch (err) {
      runFn = null;
      self.postMessage({ type: 'load-error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (msg.type === 'turn') {
    currentView = msg.view ?? null;
    const start = performance.now();
    try {
      const raw = runFn ? runFn(Number(msg.droneId)) : null;
      const durationMs = performance.now() - start;
      const logs = drainLogs();
      const normalized = normalizeOp(raw);
      if (normalized.ok) {
        self.postMessage({ type: 'result', seq: msg.seq, operation: normalized.op ?? null, durationMs, logs });
      } else {
        self.postMessage({ type: 'result-error', seq: msg.seq, message: normalized.error, logs });
      }
    } catch (err) {
      const duration = performance.now() - start;
      self.postMessage({
        type: 'result-error',
        seq: msg.seq,
        message: err instanceof Error ? err.message : String(err),
        logs: drainLogs(),
        durationMs: duration,
      });
    }
  }
};
