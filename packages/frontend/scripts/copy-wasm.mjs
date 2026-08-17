// 将 esbuild-wasm 的 wasm 文件复制到 public/, 供浏览器端编译玩家代码使用。
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const wasm = join(root, '..', '..', 'node_modules', 'esbuild-wasm', 'esbuild.wasm');
const targetDir = join(root, 'public');
mkdirSync(targetDir, { recursive: true });
copyFileSync(wasm, join(targetDir, 'esbuild.wasm'));
console.log('[copy-wasm] public/esbuild.wasm');
