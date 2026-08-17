import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 将 @robofarm/shared 直接指向 TS 源码, 避免 CJS 产物的 Rollup 互操作问题,
// 同时前端开发时修改 shared 无需重新构建。
const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 开发代理的后端地址。默认本机 3001 端口 (开发约定后端同机运行),
// 部署到远程环境时用 VITE_BACKEND_TARGET 覆盖, 例如 http://192.168.1.10:3001。
const backendTarget = process.env.VITE_BACKEND_TARGET ?? 'http://localhost:3001';

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
      '/auth': backendTarget,
      '/single': backendTarget,
      '/combat': backendTarget,
      '/mcp': backendTarget,
      '/ws': { target: backendTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    target: 'es2020',
  },
});
