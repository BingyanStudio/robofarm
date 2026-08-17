// GitHub OAuth2 登录。
// 未配置 GITHUB_CLIENT_ID 时进入开发模式: 自动创建并登录一个本地演示账号。
import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { createSession, getUserBySession, upsertUserByLogin } from './db';

const SESSION_COOKIE = 'robofarm_session';
const STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthState {
  state: string;
  createdAt: number;
}

const pendingStates = new Map<string, OAuthState>();

export interface AuthUser {
  id: number;
  name: string;
  dev: boolean;
}

const clientId = () => process.env.GITHUB_CLIENT_ID ?? '';
const clientSecret = () => process.env.GITHUB_CLIENT_SECRET ?? '';

/** 请求来源协议, 兼容直连与常见反向代理 (X-Forwarded-Proto) */
function requestProto(req: Request): string {
  const fwd = req.get('x-forwarded-proto');
  return fwd ? fwd.split(',')[0]!.trim() : req.protocol;
}

/** 后端对外地址: 优先 BACKEND_ORIGIN, 否则由请求 Host 推导 (不硬编码 localhost) */
function backendOrigin(req: Request): string {
  const explicit = process.env.BACKEND_ORIGIN?.trim();
  return explicit ? explicit : `${requestProto(req)}://${req.get('host')}`;
}

/** 登录后跳转的前端地址: 优先 FRONTEND_ORIGIN, 否则与请求同源 (发布版前后端同端口) */
function frontendOrigin(req: Request): string {
  const explicit = process.env.FRONTEND_ORIGIN?.trim();
  return explicit ? explicit : `${requestProto(req)}://${req.get('host')}`;
}

/** GitHub 回调地址: 优先显式配置, 否则按请求推导 (需与 GitHub OAuth 应用注册值一致) */
function redirectUri(req: Request): string {
  const explicit = process.env.GITHUB_REDIRECT_URI?.trim();
  return explicit ? explicit : `${backendOrigin(req)}/auth/github/callback`;
}

export function devMode(): boolean {
  return !process.env.GITHUB_CLIENT_ID;
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key) out[key] = decodeURIComponent(value);
    }
  }
  return out;
}

/** 认证中间件: 未登录返回 401 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  (req as Request & { user?: AuthUser }).user = user;
  next();
}

export function currentUser(req: Request): AuthUser | null {
  const cookies = parseCookies(req);
  if (devMode()) {
    const u = upsertUserByLogin('local-dev');
    return { id: u.id, name: u.github_login, dev: true };
  }
  const row = getUserBySession(cookies[SESSION_COOKIE] ?? null);
  if (!row) return null;
  return { id: row.id, name: row.github_login, dev: false };
}

export function createAuthRouter(): Router {
  const router = Router();

  router.get('/github', (req, res) => {
    if (devMode()) {
      res.redirect('/#/menu');
      return;
    }
    const state = randomBytes(16).toString('hex');
    pendingStates.set(state, { state, createdAt: Date.now() });
    const url =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId())}` +
      `&redirect_uri=${encodeURIComponent(redirectUri(req))}` +
      `&scope=read:user&state=${state}`;
    res.redirect(url);
  });

  router.get('/github/callback', async (req, res) => {
    const { code, state } = req.query;
    const stored = typeof state === 'string' ? pendingStates.get(state) : undefined;
    if (typeof code !== 'string' || !stored || Date.now() - stored.createdAt > STATE_TTL_MS) {
      res.status(400).send('OAuth 状态无效或已过期, 请重新登录');
      return;
    }
    pendingStates.delete(state as string);
    try {
      const login = await fetchGithubLogin(code, req);
      const user = upsertUserByLogin(login);
      const token = createSession(user.id);
      res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, token));
      res.redirect(`${frontendOrigin(req)}/#/menu`);
    } catch (err) {
      res.status(500).send(`GitHub 登录失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  router.get('/me', (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json({ user });
  });

  return router;
}

async function fetchGithubLogin(code: string, req: Request): Promise<string> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: redirectUri(req),
    }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    throw new Error(tokenData.error ?? '无法获取 access_token');
  }
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
  });
  const userData = (await userRes.json()) as { login?: string };
  if (!userData.login) throw new Error('无法获取 GitHub 用户信息');
  return userData.login;
}

function cookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}
