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
import * as single from './services/single';
import * as combat from './services/combat';
import { checkRateLimit } from './services/ratelimit';
import { getCombatCode, upsertCombatCode } from './db';
import { createMcpServer } from './mcp/server';

/** requireUser 中间件之后可用: 当前登录用户 */
function userOf(req: Request): AuthUser {
  return (req as Request & { user: AuthUser }).user;
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
    // 请求实际到达的本地端口 (容器内监听端口, 与 PORT 环境变量/宿主机映射无关)
    const localPort = req.socket?.localPort ?? Number(process.env.PORT ?? 3001);
    const server = createMcpServer({
      // 对外地址: 授权回调兜底 / 文档链接 (经反向代理时由请求推导)
      baseUrl: requestBaseUrl(req),
      // 回环直连地址: api_call 代理目标, 绕过公网/反代/CDN (其可能剥掉
      // 服务器自身请求的 Cookie, 导致已登录会话的 api_call 仍返回 401)
      apiBaseUrl: `http://127.0.0.1:${localPort}`,
    });
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
    const result = single.singleReplay(Number(req.params.id), userOf(req).id);
    if ('error' in result) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json(result.file);
  });

  app.get('/single/history', requireUser, (req: Request, res: Response) => {
    res.json({ entries: single.singleHistory(userOf(req).id) });
  });

  app.post('/single/validate', requireUser, async (req: Request, res: Response) => {
    const code = req.body?.code;
    if (typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: '缺少代码' });
      return;
    }
    // 预留限流: 每用户每分钟提交次数上限 (env SINGLE_SUBMIT_LIMIT_PER_MIN, 0 = 不限流)
    const limit = Number(process.env.SINGLE_SUBMIT_LIMIT_PER_MIN ?? 0);
    const rl = checkRateLimit(`single:${userOf(req).id}`, limit);
    if (!rl.ok) {
      res.status(429).json({ error: `提交过于频繁, 请 ${Math.ceil(rl.retryAfterMs / 1000)} 秒后再试` });
      return;
    }
    const result = await single.startValidation(userOf(req).id, code);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/single/validate', requireUser, (req: Request, res: Response) => {
    res.json(single.validationStatus(userOf(req).id));
  });

  app.get('/single/leaderboard', (req: Request, res: Response) => {
    // 携带 ?user=<用户名> 时查询指定玩家的得分与全榜名次; 否则返回按大版本分 Tab 的前 50 名
    const name = typeof req.query.user === 'string' ? req.query.user.trim() : '';
    if (name) {
      res.json({ user: single.singleUserRank(name) });
      return;
    }
    const user = currentUser(req);
    res.json(single.singleLeaderboard(user?.id ?? null));
  });

  // ---- 竞技模式 ----
  app.get('/combat/state', requireUser, (req: Request, res: Response) => {
    const row = getCombatCode(userOf(req).id);
    res.json(row ? { code: row.code, wins: row.wins, losses: row.losses } : null);
  });

  app.post('/combat/upload', requireUser, (req: Request, res: Response) => {
    const code = req.body?.code;
    if (typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: '缺少代码' });
      return;
    }
    upsertCombatCode(userOf(req).id, code);
    res.json({ ok: true });
  });

  app.get('/combat/list', requireUser, (req: Request, res: Response) => {
    res.json({ entries: combat.combatList(userOf(req).id) });
  });

  app.post('/combat/start', requireUser, (req: Request, res: Response) => {
    const opponentId = Number(req.body?.id);
    if (!Number.isInteger(opponentId)) {
      res.status(400).json({ error: '缺少对手 id' });
      return;
    }
    const result = combat.startMatch(userOf(req).id, opponentId);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ roomId: result.roomId });
  });

  app.get('/combat/room', (_req: Request, res: Response) => {
    // 观战列表无需登录 (与 /ws 观战通道一致)
    res.json({ rooms: combat.listRooms() });
  });

  app.get('/combat/history', requireUser, (req: Request, res: Response) => {
    res.json({ entries: combat.matchHistory(userOf(req).id) });
  });

  app.get('/combat/replay/:id', requireUser, (req: Request, res: Response) => {
    const result = combat.matchReplay(Number(req.params.id), userOf(req).id);
    if ('error' in result) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  // MCP over HTTP: 向任意 Agent 提供游戏 API 文档
  mountMcp(app);

  // 运行时配置 (前端启动时拉取): esbuild.wasm 可能单独部署在其他服务器
  app.get('/config', (_req: Request, res: Response) => {
    res.json({ esbuildWasmUrl: process.env.ESBUILD_WASM_URL?.trim() || null });
  });

  // LLM 友好文档: 全部文档按章节拼接 (Base URL 按实际请求动态生成)
  app.get('/llm.txt', (req: Request, res: Response) => {
    res.type('text/plain; charset=utf-8').send(llmTxt(requestBaseUrl(req)));
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
