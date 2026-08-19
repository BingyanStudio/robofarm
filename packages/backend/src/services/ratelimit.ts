// 固定窗口限流 (进程内存实现, 单实例有效)。
// 默认不限流 (perMinute <= 0), 通过环境变量开启后按 key 统计。
// 预留接口: 单人种植提交等场景可按用户限流 (见 app.ts /single/validate)。
export interface RateLimitResult {
  ok: boolean;
  /** 本窗口内剩余可用次数 (不限流时为 Infinity) */
  remaining: number;
  /** 需要等待的毫秒数 (ok=false 时) */
  retryAfterMs: number;
}

const windows = new Map<string, { start: number; count: number }>();

/** 按 key 检查限流: 每个 key 每分钟最多 perMinute 次 (<= 0 表示不限流) */
export function checkRateLimit(key: string, perMinute: number): RateLimitResult {
  if (perMinute <= 0) return { ok: true, remaining: Infinity, retryAfterMs: 0 };
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= 60_000) {
    // 新窗口
    windows.set(key, { start: now, count: 1 });
    return { ok: true, remaining: perMinute - 1, retryAfterMs: 0 };
  }
  if (w.count >= perMinute) {
    return { ok: false, remaining: 0, retryAfterMs: 60_000 - (now - w.start) };
  }
  w.count += 1;
  return { ok: true, remaining: perMinute - w.count, retryAfterMs: 0 };
}

/** 清理过期窗口, 防止 Map 无限增长 (可定时调用) */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [key, w] of windows) {
    if (now - w.start >= 60_000) windows.delete(key);
  }
}
