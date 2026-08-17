import { describe, expect, it, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { compilePlayerCode, setWasmUrl } from './compile';

const require = createRequire(import.meta.url);

beforeAll(() => {
  setWasmUrl(pathToFileURL(require.resolve('esbuild-wasm/esbuild.wasm')).href);
}, 20000);

describe('compilePlayerCode', () => {
  it('编译普通函数声明形式的玩家代码', async () => {
    const code = `
      function run(droneId: number) {
        return { type: "move", to: [1, 1] };
      }
    `;
    const result = await compilePlayerCode(code);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.js).toContain('__ROBOFARM__');
      expect(result.js).toContain('__robofarm_run');
    }
  }, 30000);

  it('编译带 export 的玩家代码', async () => {
    const code = `
      export function run(droneId: number) {
        return { type: "harvest" };
      }
    `;
    const result = await compilePlayerCode(code);
    expect(result.ok).toBe(true);
  }, 30000);

  it('语法错误返回编译错误', async () => {
    const result = await compilePlayerCode('function run(droneId) { return ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  }, 30000);

  it('esbuild 不做类型检查: 类型标注被剥离, 编译成功', async () => {
    const result = await compilePlayerCode('function run(droneId: number) { const x: number = "s"; return null; }');
    expect(result.ok).toBe(true);
  }, 30000);

  it('import 无法解析的相对模块时报错', async () => {
    const result = await compilePlayerCode('import x from "./helper"; function run() { return x; }');
    expect(result.ok).toBe(false);
  }, 30000);
});
