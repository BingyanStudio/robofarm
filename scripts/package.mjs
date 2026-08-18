// 打包脚本: 构建全部包, 并把后端 + 前端产物打包成一个可独立部署的发布目录。
//
//   npm run package  →  生成 ./release/
//
// release/ 结构 (完全自包含, 只需 Node >= 24):
//   server.cjs                后端单文件 (express + 全部服务 + 内嵌 esbuild-wasm 浏览器入口)
//   esbuild.wasm              玩家代码编译所需的 wasm (进程内加载, 无需 node_modules)
//   runner/runner.worker.js   玩家代码执行沙箱 (worker_threads)
//   public/                   前端构建产物 (由后端静态托管, 单端口访问)
//   start.sh / start.cmd      启动脚本 ("可执行文件")
//   .env.example              环境变量示例
//
// 启动:  ./release/start.sh   (默认端口 3001)
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(root, 'release');
const backend = join(root, 'packages/backend');
const frontend = join(root, 'packages/frontend');

console.log('==> 构建 shared / backend / frontend...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('==> 清理并创建 release/...');
rmSync(release, { recursive: true, force: true });
mkdirSync(join(release, 'runner'), { recursive: true });
mkdirSync(join(release, 'public'), { recursive: true });

console.log('==> 打包后端为单文件 server.cjs...');
await build({
  entryPoints: [join(backend, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  outfile: join(release, 'server.cjs'),
  // 用 esbuild-wasm 的浏览器入口替代 node 入口 (进程内编译玩家代码)
  alias: { 'esbuild-wasm': 'esbuild-wasm/lib/browser.js' },
  define: { 'process.env.ROBOFARM_EMBEDDED_WASM': '"1"' },
  logLevel: 'warning',
});

console.log('==> 复制运行依赖...');
cpSync(join(backend, 'dist/runner/runner.worker.js'), join(release, 'runner/runner.worker.js'));
cpSync(join(root, 'node_modules/esbuild-wasm/esbuild.wasm'), join(release, 'esbuild.wasm'));
// 前端产物整体复制到 public/
cpSync(join(frontend, 'dist'), join(release, 'public'), { recursive: true });

writeFileSync(join(release, '.env.example'), `# 端口 (默认 3001)
PORT=3001

# GitHub OAuth (不配置则进入开发模式, 自动登录 local-dev)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
# 部署在独立域名时设置以下两项 (默认按访问请求的 Host 自动推导, 无需配置):
# FRONTEND_ORIGIN=https://farm.example.com
# GITHUB_REDIRECT_URI=https://farm.example.com/auth/github/callback

# 数据库文件路径 (默认 data.db, 放在启动时所在目录 pwd 下, 即 pwd/data.db)
DB_PATH=data.db

# 竞技对战回合间隔 (毫秒)
TURN_INTERVAL_MS=800
`);

writeFileSync(
  join(release, 'start.sh'),
  `#!/usr/bin/env bash
# RoboFarm 服务启动脚本 (Linux / macOS)
# 用法: ./start.sh   (可在任意目录执行)
# .env 与 data.db 均基于当前工作目录 (pwd), 不随脚本位置变化。
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f ./.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
exec node "$DIR/server.cjs" "$@"
`
);
writeFileSync(
  join(release, 'start.cmd'),
  `@echo off
rem RoboFarm 服务启动脚本 (Windows)
rem 在任意目录执行; .env 与 data.db 基于当前工作目录
set "DIR=%~dp0"
if exist .env call .env
node "%DIR%server.cjs" %*
`
);
chmodSync(join(release, 'start.sh'), 0o755);
chmodSync(join(release, 'server.cjs'), 0o755);

const size = await dirSize(release);
console.log('==> 打包完成: ./release/ (' + (size / 1024 / 1024).toFixed(1) + ' MB)');
console.log('    启动: ./release/start.sh  (默认端口 3001, 可用 PORT/HOST 环境变量覆盖)');
console.log('    或:   node release/server.cjs');

async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(p);
    else if (entry.isFile()) total += (await stat(p)).size;
  }
  return total;
}
