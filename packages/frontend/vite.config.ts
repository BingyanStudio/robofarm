import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 将 @robofarm/shared 直接指向 TS 源码, 避免 CJS 产物的 Rollup 互操作问题,
// 同时前端开发时修改 shared 无需重新构建。
const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // 注意顺序: 更长的前缀在前, 否则 @robofarm/shared 会吞掉 /player
      { find: '@robofarm/shared/player', replacement: resolve('../../packages/shared/src/player.ts') },
      { find: '@robofarm/shared', replacement: resolve('../../packages/shared/src/index.ts') },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3001',
      '/single': 'http://localhost:3001',
      '/combat': 'http://localhost:3001',
      '/mcp': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: {
    target: 'es2020',
  },
});
