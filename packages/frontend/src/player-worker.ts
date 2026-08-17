// 浏览器端玩家代码执行沙箱 (Web Worker)。
// 玩家代码 (esbuild 编译产物) 通过 new Function 执行:
// - 函数参数表同时列出注入的 API 与需要屏蔽的危险全局, 从而在词法层面
//   遮蔽 fetch / setTimeout / XMLHttpRequest / WebSocket 等 (取值为 undefined,
//   调用时抛 TypeError), 玩家代码无法发起网络/异步逃逸。
// - 超时由宿主 (BrowserProgram) 侧看门狗终止整个 worker, 程序因此被判死。
import { playerApiFactory, normalizeOp } from '@robofarm/shared/player';
import type { PlayerView } from '@robofarm/shared/player';

// 需要屏蔽的全局 (置为 undefined)。globalThis / self 不屏蔽 (esbuild 产物可能引用)。
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
