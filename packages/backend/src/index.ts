// 后端入口。
import { setWasmModule, setWasmUrl } from '@robofarm/shared';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp, attachWebSocket } from './app';
import { workDir } from './db';

// 加载 .env (若存在): 简单键值解析, 支持 KEY=VALUE 与引号
tryLoadDotEnv();

// 无条件把 cwd 切到稳定工作目录 (tmp/robofarm-work):
// 启动目录可能在运行中被删除 (如重新打包 release/), 导致 worker_threads /
// esbuild 子进程以 "uv_cwd ENOENT" 崩溃; 在 esbuild-wasm 首次加载前
// 切换 cwd, 使其捕获到有效的 defaultWD。
{
  const dir = workDir();
  mkdirSync(dir, { recursive: true });
  try {
    process.chdir(dir);
  } catch {
    // 忽略
  }
}

// 编译玩家代码使用 esbuild-wasm, 按运行形态选择加载方式:
// - 打包发布版 (server.cjs, ROBOFARM_EMBEDDED_WASM=1 由打包脚本注入):
//   用 esbuild-wasm 的浏览器入口在进程内编译, wasm 从旁边的 esbuild.wasm 文件读取
// - 常规运行: esbuild-wasm 自动使用 node_modules 内磁盘上的 wasm 文件
if (process.env.ROBOFARM_EMBEDDED_WASM === '1') {
  // browser 入口需要 self 全局 (Node 无 window/self)
  (globalThis as unknown as Record<string, unknown>).self = globalThis;
  const wasmPath = join(__dirname, 'esbuild.wasm');
  if (!existsSync(wasmPath)) {
    console.error(`[robofarm] 缺少 ${wasmPath}, 请使用打包脚本生成发布版`);
    process.exit(1);
  }
  setWasmModule(new WebAssembly.Module(readFileSync(wasmPath)));
} else {
  setWasmUrl(pathToFileURL(require.resolve('esbuild-wasm/esbuild.wasm')).href);
}

const port = Number(process.env.PORT ?? 3001);
const server = createApp().listen(port, () => {
  console.log(`[robofarm-backend] listening on http://localhost:${port}`);
  if (!process.env.GITHUB_CLIENT_ID) {
    console.log('[robofarm-backend] 未配置 GITHUB_CLIENT_ID, 已启用开发模式 (自动登录 local-dev)');
  }
});
attachWebSocket(server);

function tryLoadDotEnv(): void {
  const file = join(process.cwd(), '.env');
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
