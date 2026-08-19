// 数据库层。使用 Node 内置的 node:sqlite (DatabaseSync), 无需原生编译。
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export interface UserRow {
  id: number;
  github_login: string;
  created_at: number;
}

export interface SessionRow {
  token: string;
  user_id: number;
  created_at: number;
}

export interface SingleSubmissionRow {
  id: number;
  user_id: number;
  code: string;
  score: number | null;
  error: string | null;
  replay: string | null;
  created_at: number;
}

export interface CombatCodeRow {
  user_id: number;
  code: string;
  wins: number;
  losses: number;
  updated_at: number;
}

export interface MatchRow {
  id: number;
  room_id: string;
  player1_id: number;
  player2_id: number;
  winner_id: number | null;
  result: string | null;
  replay: string;
  created_at: number;
}

export interface LeaderboardSnapshotRow {
  version: string;
  payload: string;
  created_at: number;
}

/** 当前大版本的排行榜版本号 (每版冻结一次旧排行榜; 显示为 v1.x 系列标签) */
export const LEADERBOARD_VERSION = 'v1.x';
/** 上一个大版本的排行榜标签 (V1.0.0 发布时冻结整个 V0.x 时代) */
export const PREV_LEADERBOARD_VERSION = 'v0.x';

let db: DatabaseSync | null = null;

/** 进程启动时的工作目录: start.sh 不再 cd 到脚本目录, .env 与相对路径都基于它 */
const startCwd = process.cwd();

/** 数据库文件路径: 优先 DB_PATH, 默认 data.db; 均相对启动目录 (pwd) 解析 */
export function getDbPath(): string {
  return process.env.DB_PATH
    ? resolve(startCwd, process.env.DB_PATH)
    : resolve(startCwd, 'data.db');
}

/** 稳定工作目录: 作为 cwd 兜底, 避免启动目录被删除导致 worker/子进程 "uv_cwd ENOENT" 崩溃 */
export function workDir(): string {
  return join(tmpdir(), 'robofarm-work');
}

/**
 * 确保进程 cwd 有效。注意: 目录被删除后 process.cwd() 仍返回缓存不抛错,
 * 必须用 statSync 实际校验; 无效时切到 (并创建) 稳定工作目录。
 */
export function ensureCwd(): void {
  try {
    statSync(process.cwd());
  } catch {
    const dir = workDir();
    mkdirSync(dir, { recursive: true });
    process.chdir(dir);
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = getDbPath();
  mkdirSync(dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  migrate(db);
  return db;
}

function migrate(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_login TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS single_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      code TEXT NOT NULL,
      score INTEGER,
      error TEXT,
      replay TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS combat_codes (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      code TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL UNIQUE,
      player1_id INTEGER NOT NULL,
      player2_id INTEGER NOT NULL,
      winner_id INTEGER,
      result TEXT,
      replay TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
      version TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  // 老库迁移: single_submissions 增加回放列 (已存在则忽略)
  try {
    d.exec('ALTER TABLE single_submissions ADD COLUMN replay TEXT');
  } catch {
    // 列已存在
  }
  applyV100Migrations(d);
}

/**
 * V1.0.0 一次性数据迁移 (用 meta 表记录, 幂等):
 * 1. 清空多人代码匹配池 (所有玩家恢复"未上传代码"状态)
 * 2. 冻结旧版本排行榜 (V0.x 时代的最后一版排行榜成为快照 Tab)
 * 3. 清空单人提交: 旧成绩已冻结进快照, 新版本的排行榜从空开始
 */
function applyV100Migrations(d: DatabaseSync): void {
  const applied = (key: string): boolean =>
    d.prepare('SELECT 1 FROM meta WHERE key = ?').get(key) !== undefined;
  const mark = (key: string): void => {
    d.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run(key, String(Date.now()));
  };

  if (!applied('v1.0.0.clear-combat-codes')) {
    d.exec('DELETE FROM combat_codes');
    mark('v1.0.0.clear-combat-codes');
  }
  // 快照必须先于清空执行, 否则 V0.x 冻结榜会变成空榜
  if (!applied('v1.0.0.leaderboard-snapshot')) {
    takeLeaderboardSnapshot(d, PREV_LEADERBOARD_VERSION);
    mark('v1.0.0.leaderboard-snapshot');
  }
  if (!applied('v1.0.0.clear-single-submissions')) {
    d.exec('DELETE FROM single_submissions');
    mark('v1.0.0.clear-single-submissions');
  }
}

/** 冻结当前排行榜为指定版本快照 (V0.x → 固定 Tab) */
export function takeLeaderboardSnapshot(d: DatabaseSync, version: string): void {
  const rows = d
    .prepare(
      `SELECT u.github_login AS name, MAX(s.score) AS score
       FROM single_submissions s JOIN users u ON u.id = s.user_id
       WHERE s.score IS NOT NULL
       GROUP BY s.user_id
       ORDER BY score DESC LIMIT 50`
    )
    .all() as unknown as { name: string; score: number }[];
  d.prepare('INSERT OR REPLACE INTO leaderboard_snapshots (version, payload, created_at) VALUES (?, ?, ?)')
    .run(version, JSON.stringify(rows), Date.now());
}

export function listLeaderboardSnapshots(): LeaderboardSnapshotRow[] {
  return getDb()
    .prepare('SELECT * FROM leaderboard_snapshots ORDER BY version')
    .all() as unknown as LeaderboardSnapshotRow[];
}

/** 指定用户的最高分及其在整个榜单上的名次 (1-based), 无成绩返回 null */
export function userRank(login: string): { name: string; score: number; rank: number } | null {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT u.github_login AS name, MAX(s.score) AS score
       FROM single_submissions s JOIN users u ON u.id = s.user_id
       WHERE u.github_login = ? AND s.score IS NOT NULL
       GROUP BY s.user_id`
    )
    .get(login) as unknown as { name: string; score: number } | undefined;
  if (!row) return null;
  const better = d
    .prepare(
      `SELECT COUNT(DISTINCT s.user_id) AS cnt
       FROM single_submissions s JOIN users u ON u.id = s.user_id
       WHERE s.score IS NOT NULL AND s.score > ?`
    )
    .get(row.score) as unknown as { cnt: number };
  return { name: row.name, score: row.score, rank: better.cnt + 1 };
}

export function upsertUserByLogin(login: string): UserRow {
  const d = getDb();
  const existing = d.prepare('SELECT * FROM users WHERE github_login = ?').get(login) as unknown as UserRow | undefined;
  if (existing) return existing;
  const info = d.prepare('INSERT INTO users (github_login, created_at) VALUES (?, ?)').run(login, Date.now());
  return { id: Number(info.lastInsertRowid), github_login: login, created_at: Date.now() };
}

export function getUserById(id: number): UserRow | null {
  return (getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined) ?? null;
}

export function createSession(userId: number): string {
  const d = getDb();
  const token = randomToken();
  d.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, Date.now());
  return token;
}

export function getUserBySession(token: string | null): UserRow | null {
  if (!token) return null;
  const row = getDb().prepare('SELECT * FROM sessions WHERE token = ?').get(token) as unknown as SessionRow | undefined;
  if (!row) return null;
  return getUserById(row.user_id);
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function recordSingleSubmission(userId: number, code: string, score: number | null, error: string | null, replay: string | null = null): void {
  getDb()
    .prepare('INSERT INTO single_submissions (user_id, code, score, error, replay, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, code, score, error, replay, Date.now());
}

/** 取某条单人提交记录 (仅本人可见) */
export function getSingleSubmission(id: number, userId: number): SingleSubmissionRow | null {
  const row = getDb()
    .prepare('SELECT * FROM single_submissions WHERE id = ? AND user_id = ?')
    .get(id, userId) as unknown as SingleSubmissionRow | undefined;
  return row ?? null;
}

export function listSingleHistory(userId: number, limit = 50): SingleSubmissionRow[] {
  return getDb()
    .prepare('SELECT * FROM single_submissions WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit) as unknown as SingleSubmissionRow[];
}

export function leaderboard(limit = 50): { user_id: number; name: string; score: number }[] {
  return getDb()
    .prepare(
      `SELECT u.id AS user_id, u.github_login AS name, MAX(s.score) AS score
       FROM single_submissions s JOIN users u ON u.id = s.user_id
       WHERE s.score IS NOT NULL
       GROUP BY s.user_id
       ORDER BY score DESC LIMIT ?`
    )
    .all(limit) as unknown as { user_id: number; name: string; score: number }[];
}

export function getCombatCode(userId: number): CombatCodeRow | null {
  return (getDb().prepare('SELECT * FROM combat_codes WHERE user_id = ?').get(userId) as unknown as CombatCodeRow | undefined) ?? null;
}

export function upsertCombatCode(userId: number, code: string): void {
  getDb()
    .prepare(
      `INSERT INTO combat_codes (user_id, code, wins, losses, updated_at)
       VALUES (?, ?, 0, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET code = excluded.code, wins = 0, losses = 0, updated_at = excluded.updated_at`
    )
    .run(userId, code, Date.now());
}

export function recordCombatResult(winnerUserId: number | null, loserUserId: number): void {
  const d = getDb();
  if (winnerUserId !== null) {
    d.prepare('UPDATE combat_codes SET wins = wins + 1 WHERE user_id = ?').run(winnerUserId);
    d.prepare('UPDATE combat_codes SET losses = losses + 1 WHERE user_id = ?').run(loserUserId);
  } else {
    d.prepare('UPDATE combat_codes SET losses = losses + 1 WHERE user_id = ?').run(loserUserId);
  }
}

export function listCombatCodesExcluding(userId: number): { id: number; name: string; wins: number; losses: number }[] {
  return getDb()
    .prepare(
      `SELECT u.id, u.github_login AS name, c.wins, c.losses
       FROM combat_codes c JOIN users u ON u.id = c.user_id
       WHERE c.user_id != ? ORDER BY (c.wins * 1.0 / MAX(c.wins + c.losses, 1)) DESC, c.wins DESC`
    )
    .all(userId) as unknown as { id: number; name: string; wins: number; losses: number }[];
}

export function insertMatch(
  roomId: string,
  player1Id: number,
  player2Id: number,
  winnerId: number | null,
  result: string | null,
  replay: string
): number {
  const info = getDb()
    .prepare('INSERT INTO matches (room_id, player1_id, player2_id, winner_id, result, replay, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(roomId, player1Id, player2Id, winnerId, result, replay, Date.now());
  return Number(info.lastInsertRowid);
}

export function getMatch(id: number): MatchRow | null {
  return (getDb().prepare('SELECT * FROM matches WHERE id = ?').get(id) as unknown as MatchRow | undefined) ?? null;
}

export function listMatchesForUser(userId: number, limit = 50): {
  id: number;
  opponent: string;
  opponentId: number;
  result: 'win' | 'loss' | 'draw' | 'error';
  created_at: number;
}[] {
  return getDb()
    .prepare(
      `SELECT m.id,
              CASE WHEN m.player1_id = ? THEN u2.github_login ELSE u1.github_login END AS opponent,
              CASE WHEN m.player1_id = ? THEN m.player2_id ELSE m.player1_id END AS opponentId,
              CASE
                WHEN m.winner_id = ? THEN 'win'
                WHEN m.winner_id IS NULL AND m.result = 'draw' THEN 'draw'
                WHEN m.winner_id IS NULL THEN 'error'
                ELSE 'loss'
              END AS result,
              m.created_at
       FROM matches m
       JOIN users u1 ON u1.id = m.player1_id
       JOIN users u2 ON u2.id = m.player2_id
       WHERE m.player1_id = ? OR m.player2_id = ?
       ORDER BY m.id DESC LIMIT ?`
    )
    .all(userId, userId, userId, userId, userId, limit) as unknown as {
    id: number;
    opponent: string;
    opponentId: number;
    result: 'win' | 'loss' | 'draw' | 'error';
    created_at: number;
  }[];
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
