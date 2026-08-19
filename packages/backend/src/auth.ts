// GitHub OAuth2 登录。
// 未配置 GITHUB_CLIENT_ID 时进入开发模式: 自动创建并登录一个本地演示账号。
import { Router, Request, Response, NextFunction } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createSession, getUserBySession, upsertUserByLogin } from './db';

const SESSION_COOKIE = 'robofarm_session';
const STATE_TTL_MS = 10 * 60 * 1000;

/** 已提示过一次 http 回调诊断信息 (避免刷屏) */
let authHttpWarningLogged = false;

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
  avatar: string | null;
}

/** GitHub 用户头像 URL (按用户 id 稳定寻址; 兼容老数据用登录名兜底) */
function githubAvatarUrl(githubId: number | null, login: string): string | null {
  return githubId != null
    ? `https://avatars.githubusercontent.com/u/${githubId}?v=4`
    : `https://github.com/${encodeURIComponent(login)}.png`;
}

const clientId = () => process.env.GITHUB_CLIENT_ID ?? '';
const clientSecret = () => process.env.GITHUB_CLIENT_SECRET ?? '';

/** 请求来源协议: 优先 X-Forwarded-Proto (反向代理), 否则按连接 TLS 判断 (需 app 开启 trust proxy) */
export function requestProto(req: Request): string {
  const fwd = req.get('x-forwarded-proto');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.secure ? 'https' : 'http';
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

/** GitHub 回调地址: 优先显式配置 (GITHUB_REDIRECT_URI / BACKEND_ORIGIN),
 *  否则以传入的 baseUrl 推导。Web 登录与 MCP 登录共用, 保证两处生成的
 *  redirect_uri 与 GitHub OAuth 应用注册值一致 (MCP 客户端常从本机/内网
 *  直连, 请求 Host 推导出的地址可能与注册值不符 → redirect_uri_mismatch)。 */
function resolveCallbackUrl(fallbackBase: string): string {
  const explicit = process.env.GITHUB_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const origin = process.env.BACKEND_ORIGIN?.trim();
  if (origin) return `${origin}/auth/github/callback`;
  const base = fallbackBase || 'http://127.0.0.1:3001';
  return `${base}/auth/github/callback`;
}

/** GitHub 回调地址: 优先显式配置, 否则按请求推导 (需与 GitHub OAuth 应用注册值一致) */
function redirectUri(req: Request): string {
  return resolveCallbackUrl(backendOrigin(req));
}

/** MCP 登录第一步: 返回 GitHub 授权地址 (含 state); 开发模式直接返回 dev 标记 */
export function mcpLoginStart(baseUrl: string): { authorizeUrl?: string; state?: string; dev: boolean } {
  if (devMode()) return { dev: true };
  const state = randomBytes(16).toString('hex');
  pendingStates.set(state, { state, createdAt: Date.now() });
  const callback = resolveCallbackUrl(baseUrl);
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
    return { id: u.id, name: u.github_login, dev: true, avatar: null };
  }
  const row = getUserBySession(cookies[SESSION_COOKIE] ?? null);
  if (!row) return null;
  return {
    id: row.id,
    name: row.github_login,
    dev: false,
    avatar: githubAvatarUrl(row.github_id, row.github_login),
  };
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
    const callbackUri = redirectUri(req);
    if (!callbackUri.startsWith('https') && !authHttpWarningLogged) {
      // 诊断提示: https 站点经反向代理时, 若代理未转发 X-Forwarded-Proto,
      // 这里会推导出 http 回调 → GitHub 报 redirect_uri_mismatch
      authHttpWarningLogged = true;
      console.warn(
        `[auth] OAuth 回调地址为 ${callbackUri} (http)。` +
          `若站点通过 https 访问, 请在 .env 设置 GITHUB_REDIRECT_URI / BACKEND_ORIGIN (https), ` +
          `并确认反向代理转发 X-Forwarded-Proto`
      );
    }
    const url =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId())}` +
      `&redirect_uri=${encodeURIComponent(callbackUri)}` +
      `&state=${state}`;
    res.redirect(url);
  });

  router.get('/github/callback', async (req, res) => {
    const { code, state } = req.query;
    if (typeof state === 'string' && req.query.error !== undefined) {
      // GitHub 带错误跳回 (如用户取消授权 access_denied、回调地址不匹配
      // redirect_uri_mismatch): 携带原因回前端展示, 便于定位配置问题
      const reason = typeof req.query.error === 'string' ? req.query.error : 'github_error';
      const desc = typeof req.query.error_description === 'string' ? req.query.error_description : '';
      console.warn(`[auth] GitHub OAuth 回调携带错误: ${reason} ${desc}`);
      res.redirect(`${frontendOrigin(req)}/#/menu?login_error=${encodeURIComponent(reason)}`);
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
      // 状态已消费 (刷新页面)、已过期或服务器重启: 跳转前端, 由前端提示重新登录
      console.warn(`[auth] 校验失败 (code=${typeof code !== 'string' ? '缺失' : '有'}, stateOk=${stateOk}), 302 → login_error=state`);
      res.redirect(`${frontendOrigin(req)}/#/menu?login_error=${encodeURIComponent('state')}`);
      return;
    }
    pendingStates.delete(state as string);
    try {
      const gh = await fetchGithubLogin(code, req);
      const user = upsertUserByLogin(gh.login, gh.id);
      const token = createSession(user.id);
      res.setHeader('Set-Cookie', [
        cookie(SESSION_COOKIE, token),
        cookie(OAUTH_STATE_COOKIE, '', 0),
      ]);
      // 供 MCP 客户端领取 (浏览器登录后, MCP 用 state 换取令牌)
      pendingLoginTokens.set(state as string, { token, createdAt: Date.now() });
      res.redirect(`${frontendOrigin(req)}/#/menu`);
    } catch (err) {
      // 登录失败 (如 code 已过期/重复使用): 跳转前端, 由前端提示重试
      console.warn(`[auth] GitHub 登录失败: ${err instanceof Error ? err.message : String(err)}`);
      res.redirect(`${frontendOrigin(req)}/#/menu?login_error=${encodeURIComponent('exchange')}`);
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

async function fetchGithubLogin(code: string, req: Request): Promise<{ login: string; id: number }> {
  let tokenRes: Awaited<ReturnType<typeof fetch>>;
  try {
    tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId(),
        client_secret: clientSecret(),
        code,
        redirect_uri: redirectUri(req),
      }),
    });
  } catch (err) {
    console.warn(`[auth] GitHub OAuth 令牌交换网络错误: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenData.access_token) {
    console.warn(`[auth] GitHub OAuth 令牌交换失败: error=${tokenData.error ?? '(无)'} desc=${tokenData.error_description ?? '(无)'}`);
    throw new Error(tokenData.error ?? '无法获取 access_token');
  }
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
  });
  const userData = (await userRes.json()) as { login?: string; id?: number; message?: string };
  if (!userData.login || !userData.id) {
    console.warn(`[auth] GitHub 用户信息获取失败: ${userData.message ?? '(无 message)'}`);
    throw new Error('无法获取 GitHub 用户信息');
  }
  return { login: userData.login, id: userData.id };
}

function cookie(name: string, value: string, maxAgeSec = 60 * 60 * 24 * 30): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}