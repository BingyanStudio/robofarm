import { defineConfig, loadEnv, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

// 将 @robofarm/shared 直接指向 TS 源码, 避免 CJS 产物的 Rollup 互操作问题,
// 同时前端开发时修改 shared 无需重新构建。
const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 开发代理的后端地址。默认本机 3001 端口 (开发约定后端同机运行),
// 部署到远程环境时用 VITE_BACKEND_TARGET 覆盖, 例如 http://192.168.1.10:3001。
const backendTarget = process.env.VITE_BACKEND_TARGET ?? 'http://localhost:3001';

// WEBSITE_EXTRA_HEADER: 构建时注入 <head> 的自定义内容 (如统计脚本/验证代码)。
// 未设置则 HTML 保持不变。同时支持环境变量与本目录 .env 文件 (loadEnv 读取)。
function extraHeaderPlugin(extra: string): Plugin {
  return {
    name: 'inject-extra-header',
    transformIndexHtml(html) {
      if (!extra) return html;
      return html.replace('</head>', `${extra}\n  </head>`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve('.'), '');
  const extraHeader = env.WEBSITE_EXTRA_HEADER ?? '';

  return {
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
    plugins: [extraHeaderPlugin(extraHeader)],
  };
});
