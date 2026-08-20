// 后端 API 处理函数 —— 全局唯一实现, 由 HTTP 路由 (app.ts) 与 MCP (mcp/server.ts)
// 直接调用, 返回与 HTTP 语义一致的 { status, data }。改接口行为只改这一处。
import type { AuthUser } from '../auth';
import { getCombatCode, upsertCombatCode } from '../db';
import { checkRateLimit } from './ratelimit';
import * as single from './single';
import * as combat from './combat';

export interface ApiResult {
  status: number;
  data: unknown;
}

const ok = (data: unknown): ApiResult => ({ status: 200, data });
const bad = (status: number, error: string): ApiResult => ({ status, data: { error } });
const unauth = (): ApiResult => bad(401, 'unauthorized');

/** 从请求体取 code 字段 */
function codeOf(body: unknown): unknown {
  return (body as { code?: unknown } | undefined)?.code;
}

/** 从请求体取 id 字段 */
function idOf(body: unknown): unknown {
  return (body as { id?: unknown } | undefined)?.id;
}

// ---- 登录 ----
export function apiAuthMe(user: AuthUser | null): ApiResult {
  return user ? ok({ user }) : unauth();
}

// ---- 运行时配置 ----
export function apiConfig(): ApiResult {
  return ok({ esbuildWasmUrl: process.env.ESBUILD_WASM_URL?.trim() || null });
}

// ---- 单人种植 ----
/** 排行榜: 公开; ?user=<用户名> 时查询个人得分与名次 */
export function apiSingleLeaderboard(userId: number | null, userName = ''): ApiResult {
  const name = userName.trim();
  if (name) return ok({ user: single.singleUserRank(name) });
  return ok(single.singleLeaderboard(userId));
}

export function apiSingleValidateStatus(userId: number | null): ApiResult {
  if (userId == null) return unauth();
  return ok(single.validationStatus(userId));
}

export async function apiSingleValidateSubmit(userId: number | null, body: unknown): Promise<ApiResult> {
  if (userId == null) return unauth();
  const code = codeOf(body);
  if (typeof code !== 'string' || !code.trim()) return bad(400, '缺少代码');
  const limit = Number(process.env.SINGLE_SUBMIT_LIMIT_PER_MIN ?? 0);
  const rl = checkRateLimit(`single:${userId}`, limit);
  if (!rl.ok) {
    return bad(429, `提交过于频繁, 请 ${Math.ceil(rl.retryAfterMs / 1000)} 秒后再试`);
  }
  const result = await single.startValidation(userId, code);
  if (!result.ok) return bad(409, result.error);
  return ok({ ok: true });
}

export function apiSingleHistory(userId: number | null): ApiResult {
  if (userId == null) return unauth();
  return ok({ entries: single.singleHistory(userId) });
}

export function apiSingleReplay(userId: number | null, id: number): ApiResult {
  if (userId == null) return unauth();
  if (!Number.isInteger(id)) return bad(400, '缺少 id 参数');
  const result = single.singleReplay(id, userId);
  if ('error' in result) return bad(404, result.error);
  return ok(result.file);
}

// ---- 竞技模式 ----
export function apiCombatState(userId: number | null): ApiResult {
  if (userId == null) return unauth();
  const row = getCombatCode(userId);
  return ok(row ? { code: row.code, wins: row.wins, losses: row.losses } : null);
}

export function apiCombatUpload(userId: number | null, body: unknown): ApiResult {
  if (userId == null) return unauth();
  const code = codeOf(body);
  if (typeof code !== 'string' || !code.trim()) return bad(400, '缺少代码');
  upsertCombatCode(userId, code);
  return ok({ ok: true });
}

export function apiCombatList(userId: number | null): ApiResult {
  if (userId == null) return unauth();
  return ok({ entries: combat.combatList(userId) });
}

export function apiCombatStart(userId: number | null, body: unknown): ApiResult {
  if (userId == null) return unauth();
  const opponentId = Number(idOf(body));
  if (!Number.isInteger(opponentId)) return bad(400, '缺少对手 id');
  const result = combat.startMatch(userId, opponentId);
  if ('error' in result) return bad(400, result.error);
  return ok({ roomId: result.roomId });
}

/** 观战房间列表: 公开 */
export function apiCombatRoom(): ApiResult {
  return ok({ rooms: combat.listRooms() });
}

export function apiCombatHistory(userId: number | null): ApiResult {
  if (userId == null) return unauth();
  return ok({ entries: combat.matchHistory(userId) });
}

export function apiCombatReplay(userId: number | null, id: number): ApiResult {
  if (userId == null) return unauth();
  if (!Number.isInteger(id)) return bad(400, '缺少 id 参数');
  const result = combat.matchReplay(id, userId);
  if ('error' in result) return bad(404, result.error);
  return ok(result);
}

/** 未知接口 (MCP api_call 兜底; HTTP 路由不会走到这里) */
export function apiUnknown(method: string, path: string): ApiResult {
  return bad(404, `未知接口: ${method} ${path}`);
}
