// GitHub OAuth2 登录。
// 未配置 GITHUB_CLIENT_ID 时进入开发模式: 自动创建并登录一个本地演示账号。
import { Router, Request, Response, NextFunction } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createSession, getUserBySession, upsertUserByLogin } from './db';

const SESSION_COOKIE = 'robofarm_session';
const STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthState {
  state: string;
  createdAt: number;
}

const pendingStates = new Map<string, OAuthState>();

/** OAuth 回调成功后暂存的会话令牌 (按 state), 供 MCP 等无 Cookie 客户端领取 */
const pendingLoginTokens = new Map<string, { token: string; createdAt: number }>();

/** OAuth state 随 Cookie 下发, 回调时无需依赖进程内状态 (重启/多实例仍可登录) */
const OAUTH_STATE_COOKIE = 'robofarm_oauth_state';

/** state 签名密钥: 由 GITHUB_CLIENT_SECRET 派生, 保证跨进程/重启稳定 */
function stateSignKey(): Buffer {
  const secret = process.env.GITHUB_CLIENT_SECRET ?? 'robofarm-oauth-state-dev';
  return createHmac('sha256', 'robofarm-oauth-state').update(secret).digest();
}

/** 生成带签名的一次性 state (格式 state:exp:sig, 过期时间内置) */
function makeSignedState(): { state: string; cookieValue: string } {
  const state = randomBytes(16).toString('hex');
  const exp = Date.now() + STATE_TTL_MS;
  const payload = `${state}:${exp}`;
  const sig = createHmac('sha256', stateSignKey()).update(payload).digest('hex');
  return { state, cookieValue: `${payload}:${sig}` };
}

/** 校验回调携带的 state 与 Cookie 中的签名是否匹配 */
function stateValid(cookieValue: string | undefined, queryState: string): boolean {
  if (!cookieValue || !queryState) return false;
  const [state, expStr, sig] = cookieValue.split(':');
  if (!state || !expStr || !sig || state !== queryState) return false;
  if (Number(expStr) < Date.now()) return false;
  const expected = createHmac('sha256', stateSignKey()).update(`${state}:${expStr}`).digest('hex');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

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

/** MCP 登录第一步: 返回 GitHub 授权地址 (含 state); 开发模式直接返回 dev 标记 */
export function mcpLoginStart(baseUrl: string): { authorizeUrl?: string; state?: string; dev: boolean } {
  if (devMode()) return { dev: true };
  const state = randomBytes(16).toString('hex');
  pendingStates.set(state, { state, createdAt: Date.now() });
  const callback = `${baseUrl}/auth/github/callback`;
  // 最小权限: 不申请任何 scope —— 只用 GET /user 取用户名 (login), 零 scope 的令牌即可
  const url =
    `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId())}` +
    `&redirect_uri=${encodeURIComponent(callback)}` +
    `&state=${state}`;
  return { authorizeUrl: url, state, dev: false };
}

/** MCP 登录第二步: 用 OAuth state 换取会话令牌 (一次性, 10 分钟内有效) */
export function mcpLoginFinish(state: string): { token: string } | { error: string } {
  const entry = pendingLoginTokens.get(state);
  if (!entry || Date.now() - entry.createdAt > STATE_TTL_MS) {
    return { error: 'state 无效或已过期 (请先完成浏览器登录)' };
  }
  pendingLoginTokens.delete(state);
  return { token: entry.token };
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
    const { state, cookieValue } = makeSignedState();
    pendingStates.set(state, { state, createdAt: Date.now() });
    res.setHeader('Set-Cookie', cookie(OAUTH_STATE_COOKIE, cookieValue, STATE_TTL_MS / 1000));
    // 最小权限: 不申请任何 scope (只用 GET /user 取用户名)
    const url =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId())}` +
      `&redirect_uri=${encodeURIComponent(redirectUri(req))}` +
      `&state=${state}`;
    res.redirect(url);
  });

  router.get('/github/callback', async (req, res) => {
    const { code, state } = req.query;
    if (typeof state === 'string' && req.query.error !== undefined) {
      // GitHub 带错误跳回 (如用户取消授权 access_denied): 非状态失效, 静默回前端
      res.redirect(`${frontendOrigin(req)}/#/menu`);
      return;
    }
    const stored = typeof state === 'string' ? pendingStates.get(state) : undefined;
    const cookies = parseCookies(req);
    const stateStr = typeof state === 'string' ? state : '';
    const stateOk =
      (stateStr !== '' &&
        stored !== undefined &&
        Date.now() - stored.createdAt <= STATE_TTL_MS) ||
      stateValid(cookies[OAUTH_STATE_COOKIE], stateStr);
    if (typeof code !== 'string' || !stateOk) {
      // 状态已消费 (刷新页面)、已过期或服务器重启: 跳转前端而非报错,
      // 让前端检查 /auth/me 决定是否已登录。
      res.redirect(`${frontendOrigin(req)}/#/menu`);
      return;
    }
    pendingStates.delete(state as string);
    try {
      const login = await fetchGithubLogin(code, req);
      const user = upsertUserByLogin(login);
      const token = createSession(user.id);
      res.setHeader('Set-Cookie', [
        cookie(SESSION_COOKIE, token),
        cookie(OAUTH_STATE_COOKIE, '', 0),
      ]);
      // 供 MCP 客户端领取 (浏览器登录后, MCP 用 state 换取令牌)
      pendingLoginTokens.set(state as string, { token, createdAt: Date.now() });
      res.redirect(`${frontendOrigin(req)}/#/menu`);
    } catch (err) {
      // 登录失败 (如 code 已过期/重复使用): 跳转前端, 不展示原始错误
      res.redirect(`${frontendOrigin(req)}/#/menu`);
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

function cookie(name: string, value: string, maxAgeSec = 60 * 60 * 24 * 30): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}
