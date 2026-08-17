// 将 runner.worker.ts 打包为单文件 CJS, 供 worker_threads 加载。
// (该文件被排除在 tsc 编译之外, 由这里单独处理。)
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

await build({
  entryPoints: [join(root, 'src/runner/runner.worker.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: join(root, 'dist/runner/runner.worker.js'),
  logLevel: 'warning',
});

console.log('[build-worker] dist/runner/runner.worker.js');
