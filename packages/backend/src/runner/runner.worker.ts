// 玩家程序的执行沙箱 (worker_threads 内)。
// 此文件会被 esbuild 单独打包为 runner.worker.js, 由 NodeProgram 加载。
//
// 安全模型 (纵深防御):
// 1. vm 上下文禁用代码生成 (codeGeneration.strings/wasm = false): 玩家在上下文
//    内无法再通过 eval / Function / WebAssembly 动态生成代码。
// 2. 不向沙箱直接注入宿主函数/对象 —— 那会通过 `泄漏对象.constructor.constructor`
//    取得主 realm 的 Function 构造器 (进而 process.mainModule / getBuiltinModule →
//    RCE)。改为在上下文内用 bootstrap 脚本自行定义 API / 操作类 / console /
//    performance (上下文 realm 对象); 宿主实现只通过闭包持有, 玩家不可达;
//    API 返回值深拷贝为上下文对象, 宿主异常统一转换为上下文 Error。
// 3. microtaskMode = 'afterEvaluate': Promise 回调等微任务在 runInContext 返回前
//    排空, 并计入 timeout, 因此异步函数 / Promise 死循环同样会被打断。
// 4. 兜底: 宿主侧 NodeProgram 另有一个每回合看门狗, 超时即 terminate worker。
import { parentPort, workerData } from 'node:worker_threads';
import vm from 'node:vm';
import {
  playerApiFactory,
  normalizeOp,
  OP_CLASSES,
  OPS,
  TILES,
  CROPS,
  LOAD_TIMEOUT_MS,
  TIMEOUT_MS,
} from '@robofarm/shared/player';

const port = parentPort!;
const { compiledJs } = workerData as { compiledJs: string };

let currentView: unknown = null;
const { api: hostApi, console: hostConsole, drainLogs } = playerApiFactory(() => currentView as never);

interface OpParamSpec {
  name: string;
  kind: 'position' | 'string' | 'crops';
  /** 沙箱内校验方式 (crop/tile 为特殊字符串字段, string 为普通字符串) */
  validate: 'position' | 'crops' | 'crop' | 'tile' | 'string';
  /** 校验失败时的完整错误信息 (与宿主操作类保持一致); 含值占位时拼在末尾 */
  message: string;
  /** 错误信息末尾是否追加接收到的值 */
  withValue: boolean;
}

interface OpSpec {
  name: string;
  type: string;
  params: OpParamSpec[];
}

/** 由共享注册表推导沙箱内需要定义的操作类 (name / type / 构造参数校验) */
function opSpecs(): OpSpec[] {
  const nameByCtor = new Map<unknown, string>(Object.entries(OPS).map(([n, c]) => [c, n]));
  return Object.entries(OP_CLASSES).map(([type, cls]) => {
    const name = nameByCtor.get(cls) ?? cls.name;
    const params: OpParamSpec[] = cls.fields.map((f) => {
      if (f.kind === 'position') {
        return { name: f.name, kind: f.kind, validate: 'position', message: `${name} 的参数 ${f.name} 必须是 [x, y] 坐标`, withValue: false };
      }
      if (f.kind === 'crops') {
        return { name: f.name, kind: f.kind, validate: 'crops', message: `${name} 的参数 ${f.name} 必须是非空作物类型数组 (如 ['strawberry', 'grape'])`, withValue: false };
      }
      if (type === 'plant') {
        return { name: f.name, kind: f.kind, validate: 'crop', message: `${name} 的参数 ${f.name} 必须是作物类型 (如 CropType.Strawberry), 收到: `, withValue: true };
      }
      if (type === 'changeTile') {
        return { name: f.name, kind: f.kind, validate: 'tile', message: `${name} 的目标类型必须是 soil / water / sand 之一, 收到: `, withValue: true };
      }
      return { name: f.name, kind: f.kind, validate: 'string', message: `${name} 的参数 ${f.name} 必须是字符串`, withValue: false };
    });
    return { name, type, params };
  });
}

/**
 * 生成 bootstrap 源码: 在 vm 上下文内定义与宿主 API 同形的对象。
 * 宿主实现 (hostApi / hostConsole / hostPerf) 通过参数传入并被闭包捕获,
 * 玩家代码无法从上下文中取到它们。
 */
function bootstrapSource(specs: OpSpec[], cropTypes: string[], tileTypes: string[]): string {
  return `(function (hostApi, hostConsole, hostPerf) {
  'use strict';
  const cropSet = new Set(${JSON.stringify(cropTypes)});
  const tileSet = new Set(${JSON.stringify(tileTypes)});
  const isPos = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number' && Number.isFinite(v[0]) && Number.isFinite(v[1]);
  const isCrop = (v) => typeof v === 'string' && cropSet.has(v);
  const isCrops = (v) => Array.isArray(v) && v.length > 0 && v.every(isCrop);
  const msgOf = (e) => { try { return e && e.message !== undefined ? String(e.message) : String(e); } catch (_) { return '操作失败'; } };
  // 深拷贝宿主返回值为上下文对象 (数组/普通对象), 避免宿主 realm 的原型泄漏。
  const clone = (v) => {
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (Array.isArray(v)) { const a = []; for (let i = 0; i < v.length; i++) a.push(clone(v[i])); return a; }
    const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k]); return o;
  };
  const wrapApi = (fn) => function () {
    try { return clone(fn.apply(null, arguments)); }
    catch (e) { throw new Error(msgOf(e)); }
  };
  for (const name of Object.keys(hostApi)) globalThis[name] = wrapApi(hostApi[name]);

  class DroneOperation {}
  globalThis.DroneOperation = DroneOperation;
  const specs = ${JSON.stringify(specs)};
  const check = {
    position: (v) => isPos(v),
    crops: (v) => isCrops(v),
    crop: (v) => isCrop(v),
    tile: (v) => typeof v === 'string' && tileSet.has(v),
    string: (v) => typeof v === 'string',
  };
  for (const spec of specs) {
    const params = spec.params;
    const cls = class extends DroneOperation {
      constructor() {
        super();
        const args = arguments;
        for (let i = 0; i < params.length; i++) {
          const p = params[i];
          if (!check[p.validate](args[i])) {
            throw new Error(p.withValue ? p.message + String(args[i]) : p.message);
          }
          this[p.name] = args[i];
        }
        this.type = spec.type;
      }
    };
    Object.defineProperty(cls, 'name', { value: spec.name });
    Object.defineProperty(cls, 'fields', { value: params.map((p) => ({ name: p.name, kind: p.kind })) });
    globalThis[spec.name] = cls;
  }

  globalThis.console = {
    log: function () { hostConsole.log.apply(null, arguments); },
    info: function () { hostConsole.info.apply(null, arguments); },
    warn: function () { hostConsole.warn.apply(null, arguments); },
    error: function () { hostConsole.error.apply(null, arguments); },
  };
  globalThis.performance = { now: function () { return hostPerf.now(); } };
  globalThis.__ROBOFARM__ = {};
})`;
}

/** 上下文全局对象的原型置空, 否则 globalThis.constructor.constructor 会拿到主 realm 的 Function */
const sandbox: Record<string, unknown> = {};
Object.setPrototypeOf(sandbox, null);
vm.createContext(sandbox, {
  codeGeneration: { strings: false, wasm: false },
  microtaskMode: 'afterEvaluate',
});

function post(msg: Record<string, unknown>): void {
  port.postMessage(msg);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 在上下文内构建 API (上下文 realm 对象, 不泄漏宿主函数)
try {
  const boot = vm.runInContext(
    bootstrapSource(opSpecs(), Object.keys(CROPS), Object.keys(TILES)),
    sandbox,
    { timeout: LOAD_TIMEOUT_MS }
  ) as (api: unknown, con: unknown, perf: unknown) => void;
  boot(hostApi, hostConsole, performance);
} catch (err) {
  post({ type: 'load-error', message: errorMessage(err) });
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
