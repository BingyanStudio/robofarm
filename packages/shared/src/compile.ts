// 玩家 TypeScript 代码的编译。前后端共用 (esbuild-wasm), 保证
// 编译产物完全一致, 从而保证玩家代码在前端与后端的执行结果一致。
//
// 编译策略: 将玩家代码与一个导出桩拼成单个模块, 用 esbuild 打包成
// IIFE 并挂到全局名 __ROBOFARM__ 上, 产物再交给平台沙箱执行。
// 这样玩家代码既可以写普通的 `function run(...)`, 也可以写带 import/export 的模块。
//
// 注意: 本模块不引用任何 Node 专属 API (browser 与 node 通用)。
// 各平台在启动时通过 setWasmUrl 指定 esbuild.wasm 的位置:
// - 前端: public/esbuild.wasm (由 scripts/copy-wasm.mjs 复制)
// - 后端: node_modules/esbuild-wasm/esbuild.wasm (file:// URL)
// - 测试: 同后端
import { build, initialize } from 'esbuild-wasm';

const STUB = '\n;export const __robofarm_run = typeof run !== "undefined" ? run : null;\n';

let wasmUrl: string | null = null;
let wasmModule: WebAssembly.Module | null = null;
let initPromise: Promise<void> | null = null;

const isBrowser = typeof (globalThis as { location?: unknown }).location !== 'undefined';

/** 设置 esbuild.wasm 的 URL, 必须在首次编译前调用 (仅浏览器环境生效) */
export function setWasmUrl(url: string): void {
  wasmUrl = url;
}

/**
 * 设置 esbuild.wasm 的 WebAssembly.Module (Node 环境, 内存加载)。
 * 打包发布版 (server.cjs) 使用 esbuild-wasm 的浏览器入口在进程内编译,
 * 通过该函数注入 wasm, 无需磁盘上的 node_modules。
 */
export function setWasmModule(mod: WebAssembly.Module): void {
  wasmModule = mod;
}

function ensureInit(): Promise<void> {
  if (!initPromise) {
    let options: Record<string, unknown>;
    if (isBrowser) {
      // 浏览器: 必须通过 wasmURL 加载 esbuild.wasm (public/esbuild.wasm)
      options = { wasmURL: wasmUrl ?? '/esbuild.wasm' };
    } else if (wasmModule) {
      // 打包发布版: 进程内加载 wasm (worker: false 避免使用 Web Worker)
      options = { wasmModule, worker: false };
    } else {
      // 常规 Node: esbuild-wasm 自行使用包内磁盘上的 wasm 文件
      options = {};
    }
    initPromise = initialize(options as never).catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/** 编译器是否已初始化过 (首次编译会下载 esbuild.wasm, 之后复用) */
export function isCompilerInitialized(): boolean {
  return initPromise !== null;
}

export interface CompileError {
  message: string;
  line?: number;
  column?: number;
}

export type CompileResult = { ok: true; js: string } | { ok: false; errors: CompileError[] };

function fmtErrors(
  errors: { text: string; location?: { line?: number; column?: number } | null }[]
): CompileError[] {
  return errors.map((e) => ({
    message: e.text,
    line: e.location?.line,
    column: e.location?.column,
  }));
}

/**
 * 将玩家 TypeScript 源码编译为可在沙箱中执行的 IIFE。
 * 玩家代码中必须定义一个 `run(droneId)` 函数 (或导出它)。
 */
export async function compilePlayerCode(source: string): Promise<CompileResult> {
  await ensureInit();
  try {
    const result = await build({
      stdin: {
        contents: source + STUB,
        resolveDir: '.',
        sourcefile: 'player.ts',
        loader: 'ts',
      },
      bundle: true,
      write: false,
      outfile: 'out.js',
      format: 'iife',
      globalName: '__ROBOFARM__',
      platform: 'browser',
      target: ['es2020'],
      minify: false,
      sourcemap: false,
      legalComments: 'none',
      logLevel: 'silent',
    });
    if (result.errors && result.errors.length > 0) {
      return { ok: false, errors: fmtErrors(result.errors) };
    }
    const output = result.outputFiles?.[0];
    if (!output) return { ok: false, errors: [{ message: '编译失败: 无输出' }] };
    return { ok: true, js: output.text };
  } catch (err) {
    return {
      ok: false,
      errors: [{ message: err instanceof Error ? err.message : String(err) }],
    };
  }
}
