// 对局统计: 金钱曲线 + 种植构成。
// 本地运行 (GameRunner 收集事件) 与服务器回放 (replayEvents 重建事件) 共用同一计算。
import { el, modal } from '../ui/ui';
import { replayEvents, ReplayFile } from '@robofarm/shared';
import type { GameEvent } from '@robofarm/shared';

export interface GameStats {
  /** 各玩家每回合金钱 (index 0 = 己方/单人) */
  moneySeries: number[][];
  /** 金钱曲线横轴 (回合号, 与 moneySeries 对齐) */
  turns: number[];
  /** 各玩家种植总数 */
  planted: number[];
  /** 各玩家按作物类型种植数 */
  cropsByType: Record<string, number>[];
  /** 玩家名称 (图例) */
  playerNames: string[];
  /** 最大回合数 */
  maxTurns: number;
}

/** 从事件流计算统计 (本地运行或 replayEvents 产物) */
export function statsFromEvents(events: GameEvent[], playerNames: string[]): GameStats {
  const n = Math.max(playerNames.length, 1);
  const moneySeries: number[][] = [];
  const cropsByType: Record<string, number>[] = [];
  const planted = new Array(n).fill(0) as number[];
  for (let i = 0; i < n; i++) {
    moneySeries.push([]);
    cropsByType.push({});
  }
  // plant 事件只带全局无人机 id, 从快照收集 无人机→玩家 映射
  const dronePlayer = new Map<number, number>();
  const turns: number[] = [];
  let maxTurns = 0;
  for (const e of events) {
    if (e.type === 'snapshot') {
      maxTurns = e.state.maxTurns;
      for (const d of e.state.drones) dronePlayer.set(d.id, d.player);
      turns.push(e.state.turn);
      for (let i = 0; i < n; i++) {
        const p = e.state.players.find((pl) => pl.id === i);
        moneySeries[i].push(p ? p.money : 0);
      }
    } else if (e.type === 'plant') {
      const pi = Math.min(Math.max(dronePlayer.get(e.drone) ?? 0, 0), n - 1);
      planted[pi]++;
      cropsByType[pi][e.crop] = (cropsByType[pi][e.crop] ?? 0) + 1;
    }
  }
  return { moneySeries, turns, planted, cropsByType, playerNames, maxTurns };
}

/** 从回放文件计算统计 (服务器验证 / 历史记录用; 回放会确定性重放一遍引擎) */
export async function statsFromReplay(file: unknown): Promise<GameStats | null> {
  const d = file as Partial<ReplayFile> | null;
  if (!d || !d.mode || !Array.isArray(d.rounds)) return null;
  const players = Array.isArray(d.players) && d.players.length > 0 ? d.players : ['玩家'];
  const events = await replayEvents(d as ReplayFile);
  return statsFromEvents(events, players);
}

/** 作物代码名 → 中文名 */
const CROP_NAMES: Record<string, string> = {
  strawberry: '草莓',
  grape: '葡萄',
  wheat: '小麦',
  lotus: '荷花',
  pumpkin: '南瓜',
  melon: '西瓜',
  milk_vetch: '紫云英',
  shiitake: '香菇',
  daffodil: '水仙',
};

/** 己方 (index 0) 金色, 对方 (index 1) 红色 */
const SERIES_COLORS = ['#f2cf62', '#f3a18d'];

/** 弹出对局统计 */
export function showGameStats(stats: GameStats, title: string): void {
  const body = el('div', { class: 'stats-body' });

  // 0) 最终得分 (单人显示 最终金钱; 多人保留双方名称)
  const finalLine = el('div', { class: 'stats-final' });
  if (stats.playerNames.length <= 1) {
    const series = stats.moneySeries[0] ?? [];
    const last = series.length > 0 ? series[series.length - 1] : 0;
    finalLine.append(el('span', { class: 'stats-final-self', text: `最终金钱: ${last}` }));
  } else {
    stats.playerNames.forEach((name, i) => {
      const series = stats.moneySeries[i] ?? [];
      const last = series.length > 0 ? series[series.length - 1] : 0;
      finalLine.append(
        el('span', { class: i === 1 ? 'stats-final-enemy' : 'stats-final-self', text: `${name}: ${last}` })
      );
    });
  }
  body.append(finalLine);

  // 1) 金钱折线图
  body.append(el('div', { class: 'stats-chart' }, [drawMoneyChart(stats)]));

  // 2) 种植统计 (己方 = player 0)
  body.append(cropSection(stats));

  modal(title, body, { noClose: false });
}

/** 折线图 (Canvas): 金色 = 己方, 红色 = 对方 */
function drawMoneyChart(stats: GameStats): HTMLCanvasElement {
  const W = 560;
  const H = 210;
  const padL = 48;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const canvas = el('canvas', { width: W, height: H }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, W, H);

  const maxMoney = Math.max(100, ...stats.moneySeries.flat());
  const maxTurn = Math.max(1, stats.maxTurns);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const x = (t: number): number => padL + (t / maxTurn) * plotW;
  const y = (m: number): number => H - padB - (m / maxMoney) * plotH;

  // 网格与纵轴刻度 (5 档)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillStyle = '#75867b';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = (maxMoney / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y(v));
    ctx.lineTo(W - padR, y(v));
    ctx.stroke();
    ctx.fillText(String(Math.round(v)), padL - 6, y(v) + 4);
  }
  // 横向回合刻度
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const t = Math.round((maxTurn / 4) * i);
    ctx.fillText(String(t), x(t), H - 8);
  }
  // 折线 (Catmull-Rom 样条平滑)
  stats.playerNames.forEach((_, i) => {
    const series = stats.moneySeries[i];
    if (!series || series.length < 1) return;
    ctx.strokeStyle = SERIES_COLORS[i % SERIES_COLORS.length];
    ctx.lineWidth = 2;
    ctx.beginPath();
    traceSmooth(
      ctx,
      series.map((m, k) => ({ x: x(stats.turns[k] ?? 0), y: y(m) }))
    );
    ctx.stroke();
  });
  return canvas;
}

/** Catmull-Rom 样条 (转为三次贝塞尔) 绘制平滑曲线 */
function traceSmooth(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  const n = pts.length;
  if (n < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (n === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y
    );
  }
}

/** 种植统计: 总数 + 各作物占比 (条形) */
function cropSection(stats: GameStats): HTMLElement {
  const sec = el('div', { class: 'stats-crops' });
  const byType = stats.cropsByType[0] ?? {};
  const total = stats.planted[0] ?? 0;
  const who = stats.playerNames[0] ?? '我方';
  sec.append(el('div', { class: 'stats-crops-title', text: `种植统计 (${who}): 共 ${total} 株` }));
  if (total === 0) {
    sec.append(el('p', { class: 'hint', text: '本局未种植作物' }));
    return sec;
  }
  const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted) {
    const pct = Math.round((count / total) * 100);
    const row = el('div', { class: 'stats-crop-row' }, [
      el('span', { class: 'stats-crop-name', text: `${CROP_NAMES[type] ?? type}` }),
      el('span', { class: 'stats-crop-bar' }, [
        el('span', { class: 'stats-crop-fill', style: `width: ${pct}%` }),
      ]),
      el('span', { class: 'stats-crop-count', text: `${count} (${pct}%)` }),
    ]);
    sec.append(row);
  }
  return sec;
}
