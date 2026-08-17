// 模拟浏览器沙箱的验证脚本 (Node 环境): new Function + 词法遮蔽 + 注入 API。
const { compilePlayerCode, setWasmUrl, playerApiFactory } = require('../packages/shared/dist/index.js');
const { pathToFileURL } = require('node:url');
setWasmUrl(pathToFileURL(require.resolve('esbuild-wasm/esbuild.wasm')).href);

const SHADOWED = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'setTimeout', 'setInterval',
  'importScripts', 'process', 'require', 'module', 'global', 'navigator',
  'location', 'postMessage', 'queueMicrotask', 'Worker', 'indexedDB', 'caches',
];

(async () => {
  const playerCode = [
    'function run(droneId) {',
    '  const info = [];',
    "  info.push('fetch=' + typeof fetch);",
    "  info.push('setTimeout=' + typeof setTimeout);",
    "  info.push('require=' + typeof require);",
    "  info.push('process=' + typeof process);",
    "  info.push('Math=' + typeof Math);",
    "  info.push('JSON=' + typeof JSON);",
    "  info.push('console=' + (typeof console));",
    '  console.log(\'hello\', 42);',
    "  info.push('tile=' + JSON.stringify(getTile([3, 3])));",
    "  info.push('self=' + JSON.stringify(getSelf().position));",
    "  info.push('game=' + JSON.stringify(getGame()));",
    "  info.push('opType=' + (new Move([1, 1]) instanceof DroneOperation));",
    "  info.push('opCtor=' + new Plant(\'strawberry\').constructor.name);",
    "  return new Move([1, 1]); // 玩家操作类",
    '}',
  ].join('\n');

  const compiled = await compilePlayerCode(playerCode);
  if (!compiled.ok) {
    console.log('compile failed', JSON.stringify(compiled.errors));
    process.exit(1);
  }

  const tiles = Array.from({ length: 7 }, (_, y) =>
    Array.from({ length: 7 }, (_, x) => ({ type: 'soil', hasCrop: false, crop: null }))
  );
  const view = {
    mode: 'single', turn: 1, maxTurns: 300,
    map: { width: 7, height: 7, tiles },
    drones: [{ id: 0, position: [3, 3], water: 0, isOpponent: false, bounty: 0 }],
    self: { id: 0, position: [3, 3], water: 0, isOpponent: false, bounty: 0 },
    money: 100,
  };
  const { api, ops, console: pconsole, drainLogs } = playerApiFactory(() => view);

  const paramNames = [...Object.keys(api), ...Object.keys(ops), 'console', ...SHADOWED];
  const body = compiled.js + '\n;return typeof __ROBOFARM__ !== "undefined" && __ROBOFARM__ ? __ROBOFARM__.__robofarm_run : null;';
  const fn = new Function(...paramNames, body);
  const run = fn(...Object.values(api), ...Object.values(ops), pconsole, ...SHADOWED.map(() => undefined));
  if (typeof run !== 'function') {
    console.log('FAIL: run 函数未找到');
    process.exit(1);
  }
  const result = run(0);
  console.log('op:', JSON.stringify(result));
  console.log('logs:', JSON.stringify(drainLogs()));

  // 越界 API 返回 null
  console.log('oob getTile:', JSON.stringify(api.getTile([99, 99])));
  console.log('oob getDrone:', JSON.stringify(api.getDrone([99, 99])));

  // 危险全局确实被遮蔽
  const danger = new Function('fetch', 'setTimeout', 'process', 'return [typeof fetch, typeof setTimeout, typeof process].join(",")');
  console.log('shadowed:', danger(undefined, undefined, undefined));
  console.log('OK');
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
