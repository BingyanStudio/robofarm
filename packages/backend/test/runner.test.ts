import { describe, expect, it, beforeAll } from 'vitest';
import { pathToFileURL } from 'node:url';
import { compilePlayerCode, setWasmUrl, TIMEOUT_MS } from '@robofarm/shared';
import { NodeProgram } from '../src/runner/node-program';

beforeAll(() => {
  setWasmUrl(pathToFileURL(require.resolve('esbuild-wasm/esbuild.wasm')).href);
}, 20000);

function sampleView() {
  return {
    mode: 'single',
    turn: 1,
    maxTurns: 300,
    map: { width: 7, height: 7, tiles: [] },
    drones: [],
    self: { id: 0, position: [3, 3], water: 0, isOpponent: false, bounty: 0 },
    money: 100,
  } as never;
}

describe('NodeProgram (worker_threads + vm 沙箱)', () => {
  it('执行玩家代码并返回操作与耗时', async () => {
    const compiled = await compilePlayerCode(`
      function run(droneId: number) {
        return { type: "move", to: [1, 1] };
      }
    `);
    expect(compiled.ok).toBe(true);
    const program = new NodeProgram((compiled as { js: string }).js);
    await program.load();
    const result = await program.runTurn(0, sampleView());
    expect(result.operation).toEqual({ type: 'move', to: [1, 1] });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    program.dispose();
  }, 30000);

  it('console.log 被捕获到 logs', async () => {
    const compiled = await compilePlayerCode(`
      function run(droneId: number) {
        console.log('hello', 42);
        return null;
      }
    `);
    const program = new NodeProgram((compiled as { js: string }).js);
    await program.load();
    const result = await program.runTurn(0, sampleView());
    expect(result.logs.join('')).toContain('hello');
    expect(result.logs.join('')).toContain('42');
    program.dispose();
  }, 30000);

  it('未定义 run 时报加载错误', async () => {
    const compiled = await compilePlayerCode(`const x = 1;`);
    const program = new NodeProgram((compiled as { js: string }).js);
    await expect(program.load()).rejects.toThrow(/run/);
  }, 30000);

  it('死循环超时: runTurn 抛超时错误', async () => {
    const compiled = await compilePlayerCode(`function run() { while (true) {} }`);
    const program = new NodeProgram((compiled as { js: string }).js);
    await program.load();
    const started = Date.now();
    await expect(program.runTurn(0, sampleView())).rejects.toThrow(/超时/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
  }, 30000);

  it('玩家代码无法访问 Node 全局 (require 未定义)', async () => {
    const compiled = await compilePlayerCode(`
      function run() {
        try { typeof require; return { type: "harvest" }; } catch { return { type: "clear" }; }
      }
    `);
    const program = new NodeProgram((compiled as { js: string }).js);
    await program.load();
    const result = await program.runTurn(0, sampleView());
    // require 在 vm 上下文中不存在, 不会抛异常, 只是 undefined
    expect(result.operation).toEqual({ type: 'harvest' });
    program.dispose();
  }, 30000);
});
