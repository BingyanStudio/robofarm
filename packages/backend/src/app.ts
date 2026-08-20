// Express 应用与路由。
import express, { Request, Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createAuthRouter, requireUser, currentUser, AuthUser, requestProto } from './auth';
import { llmTxt, apiDocsMarkdown } from './api-docs';
import * as api from './services/api';
import * as combat from './services/combat';
import { createMcpServer } from './mcp/server';

/** requireUser 中间件之后可用: 当前登录用户 */
function userOf(req: Request): AuthUser {
  return (req as Request & { user: AuthUser }).user;
}

/** 共享处理函数 (services/api.ts) 的结果 → HTTP 响应 */
function send(res: Response, result: api.ApiResult): void {
  if (result.status >= 400) res.status(result.status);
  res.json(result.data);
}

/** MCP 会话: sessionId → (server, transport) */
const mcpSessions = new Map<string, { server: ReturnType<typeof createMcpServer>; transport: StreamableHTTPServerTransport }>();

/** 挂载 MCP over HTTP 路由 (/mcp): 任何 Agent 可通过 HTTP 接入文档 */
export function mountMcp(app: express.Express): void {
  const cors = (req: Request, res: Response, next: () => void) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Protocol-Version, MCP-Session-Id, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };

  app.post('/mcp', cors, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId) {
      const existing = mcpSessions.get(sessionId);
      if (existing) {
        await existing.transport.handleRequest(req, res, req.body);
        return;
      }
    }
    const id = randomUUID();
    const server = createMcpServer({ baseUrl: requestBaseUrl(req) });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
      // initialize 完成 (会话确立) 后注册, 此时 transport.sessionId 已可用
      onsessioninitialized: () => {
        mcpSessions.set(id, { server, transport });
      },
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', cors, (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Method not allowed. 使用 POST 建立 MCP over HTTP 会话 (MCP-Protocol-Version 头)。' });
  });

  app.delete('/mcp', cors, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId) {
      const s = mcpSessions.get(sessionId);
      if (s) {
        mcpSessions.delete(sessionId);
        await s.transport.handleRequest(req, res);
      }
    }
    res.status(204).end();
  });
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  // 生产部署通常位于反向代理 (nginx/caddy/网关) 之后, 信任代理头以正确识别
  // https 与来源 (X-Forwarded-Proto / X-Forwarded-For), OAuth 回调地址依赖此判断
  app.set('trust proxy', true);

  // 生产部署: 直接托管前端构建产物 (发布版为 public/, 开发为 frontend/dist/)
  const frontendDist = resolveFrontendDist();
  const hasFrontend = frontendDist !== null;
  if (hasFrontend) app.use(express.static(frontendDist as string, { index: false }));

  app.use('/auth', createAuthRouter());

  // ---- 单人种植 ----
  app.get('/single/replay/:id', requireUser, (req: Request, res: Response) => {
    send(res, api.apiSingleReplay(userOf(req).id, Number(req.params.id)));
  });

  app.get('/single/history', requireUser, (req: Request, res: Response) => {
    send(res, api.apiSingleHistory(userOf(req).id));
  });

  app.post('/single/validate', requireUser, async (req: Request, res: Response) => {
    send(res, await api.apiSingleValidateSubmit(userOf(req).id, req.body));
  });

  app.get('/single/validate', requireUser, (req: Request, res: Response) => {
    send(res, api.apiSingleValidateStatus(userOf(req).id));
  });

  app.get('/single/leaderboard', (req: Request, res: Response) => {
    const name = typeof req.query.user === 'string' ? req.query.user.trim() : '';
    send(res, api.apiSingleLeaderboard(currentUser(req)?.id ?? null, name));
  });

  // ---- 竞技模式 ----
  app.get('/combat/state', requireUser, (req: Request, res: Response) => {
    send(res, api.apiCombatState(userOf(req).id));
  });

  app.post('/combat/upload', requireUser, (req: Request, res: Response) => {
    send(res, api.apiCombatUpload(userOf(req).id, req.body));
  });

  app.get('/combat/list', requireUser, (req: Request, res: Response) => {
    send(res, api.apiCombatList(userOf(req).id));
  });

  app.post('/combat/start', requireUser, (req: Request, res: Response) => {
    send(res, api.apiCombatStart(userOf(req).id, req.body));
  });

  app.get('/combat/room', (_req: Request, res: Response) => {
    // 观战列表无需登录 (与 /ws 观战通道一致)
    send(res, api.apiCombatRoom());
  });

  app.get('/combat/history', requireUser, (req: Request, res: Response) => {
    send(res, api.apiCombatHistory(userOf(req).id));
  });

  app.get('/combat/replay/:id', requireUser, (req: Request, res: Response) => {
    send(res, api.apiCombatReplay(userOf(req).id, Number(req.params.id)));
  });

  // MCP over HTTP: 向任意 Agent 提供游戏 API 文档
  mountMcp(app);

  // 运行时配置 (前端启动时拉取): esbuild.wasm 可能单独部署在其他服务器
  app.get('/config', (_req: Request, res: Response) => {
    send(res, api.apiConfig());
  });

  // LLM 友好文档: 全部文档按章节拼接 (Base URL 按实际请求动态生成)
  app.get('/llms.txt', (req: Request, res: Response) => {
    res.type('text/plain; charset=utf-8').send(llmTxt(requestBaseUrl(req)));
  });
  // 旧路径兼容: /llm.txt → /llms.txt
  app.get('/llm.txt', (_req: Request, res: Response) => {
    res.redirect(301, '/llms.txt');
  });

  // 后端 API 文档 (Markdown)
  app.get('/api-docs', (req: Request, res: Response) => {
    res.type('text/markdown; charset=utf-8').send(apiDocsMarkdown(requestBaseUrl(req)));
  });

  // SPA 回退 (仅在生产模式挂载前端时)
  if (hasFrontend) {
    const indexHtmlPath = join(frontendDist as string, 'index.html');
    const indexTemplate = readFileSync(indexHtmlPath, 'utf-8');
    const extraHeader = process.env.WEBSITE_EXTRA_HEADER ?? '';
    const indexFinal = extraHeader
      ? indexTemplate.replace('</head>', `${extraHeader}\n  </head>`)
      : indexTemplate;
    app.get('*', (_req, res) => {
      res.type('html').send(indexFinal);
    });
  }

  return app;
}

/** 按实际请求推导部署地址 (兼容反向代理的 X-Forwarded-Proto) */
function requestBaseUrl(req: Request): string {
  return `${requestProto(req)}://${req.get('host')}`;
}

/** 定位前端静态目录: 优先 FRONTEND_DIST 环境变量, 其次发布版 public/, 再次开发版 frontend/dist */
function resolveFrontendDist(): string | null {
  const candidates = process.env.FRONTEND_DIST
    ? [process.env.FRONTEND_DIST]
    : [join(__dirname, 'public'), join(__dirname, '..', '..', 'frontend', 'dist')];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

/** 挂载 WebSocket 服务: /ws/combat/room/<roomId> */
export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws: WebSocket, req) => {
    const m = (req.url ?? '').replace(/\?.*$/, '').match(/^\/ws\/combat\/room\/([^/]+)$/);
    if (!m) {
      ws.close(1008, 'invalid path');
      return;
    }
    if (!combat.subscribeRoom(m[1], ws)) {
      ws.send(JSON.stringify({ type: 'error', message: '房间不存在或已过期' }));
      ws.close();
    }
  });
}
