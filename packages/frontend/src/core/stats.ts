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

/** 折线图 (Canvas): 金色 = 己方, 红色 = 对方; 鼠标悬停显示垂直线 + 回合/金钱图例 */
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
  const g: CanvasRenderingContext2D = ctx;

  // 高清渲染: 按设备像素比放大位图, 绘制时等比缩放 (最多 2 倍), 避免高分屏发虚
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  g.scale(dpr, dpr);

  const maxMoney = Math.max(100, ...stats.moneySeries.flat());
  const maxTurn = Math.max(1, stats.maxTurns);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const x = (t: number): number => padL + (t / maxTurn) * plotW;
  const y = (m: number): number => H - padB - (m / maxMoney) * plotH;

  /** 悬停回合 (null = 未悬停) */
  let hoverTurn: number | null = null;

  function drawChart(): void {
    g.clearRect(0, 0, W, H);

    // 网格与纵轴刻度 (5 档)
    g.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    g.fillStyle = '#75867b';
    g.font = '11px sans-serif';
    g.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = (maxMoney / 4) * i;
      g.beginPath();
      g.moveTo(padL, y(v));
      g.lineTo(W - padR, y(v));
      g.stroke();
      g.fillText(String(Math.round(v)), padL - 6, y(v) + 4);
    }
    // 横向回合刻度
    g.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const t = Math.round((maxTurn / 4) * i);
      g.fillText(String(t), x(t), H - 8);
    }
    // 折线: 滑动平均消平阶梯 + Catmull-Rom 样条 → 呈现为平滑曲线
    stats.playerNames.forEach((_, i) => {
      const series = stats.moneySeries[i];
      if (!series || series.length < 1) return;
      const smoothed = smoothSeries(series);
      g.strokeStyle = SERIES_COLORS[i % SERIES_COLORS.length];
      g.lineWidth = 2;
      g.beginPath();
      traceSmooth(
        g,
        smoothed.map((m, k) => ({ x: x(stats.turns[k] ?? 0), y: y(m) }))
      );
      g.stroke();
    });

    // 悬停: 垂直线 + 交点 + 图例
    if (hoverTurn != null) {
      const px = x(hoverTurn);
      g.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(px, padT);
      g.lineTo(px, H - padB);
      g.stroke();
      g.setLineDash([]);

      const first = stats.turns[0] ?? 0;
      const idx = Math.min(Math.max(hoverTurn - first, 0), Math.max(stats.turns.length - 1, 0));

      // 交点圆点
      stats.playerNames.forEach((_, i) => {
        const m = stats.moneySeries[i][idx];
        if (m == null) return;
        g.fillStyle = SERIES_COLORS[i % SERIES_COLORS.length];
        g.beginPath();
        g.arc(px, y(m), 3.5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        g.lineWidth = 1;
        g.stroke();
      });

      // 图例框 (图内左上): "回合 xx: <金钱>"
      const parts: { text: string; color: string }[] = [{ text: `回合 ${hoverTurn}:`, color: '#a6b5ac' }];
      if (stats.playerNames.length <= 1) {
        const m = stats.moneySeries[0][idx];
        if (m != null) parts.push({ text: ` ${m}`, color: SERIES_COLORS[0] });
      } else {
        stats.playerNames.forEach((name, i) => {
          const m = stats.moneySeries[i][idx];
          if (m != null) parts.push({ text: ` ${name} ${m}`, color: SERIES_COLORS[i % SERIES_COLORS.length] });
        });
      }
      g.font = 'bold 12px sans-serif';
      g.textAlign = 'left';
      let tw = 12;
      for (const p of parts) tw += g.measureText(p.text).width;
      const boxW = tw + 16;
      const boxH = 26;
      const margin = 8;
      // 图例自动选择不与折线相交的角落 (采样各段线段检查重叠, 取重叠最少的角)
      const corners: [number, number][] = [
        [padL + margin, padT + margin], // 左上
        [W - padR - boxW - margin, padT + margin], // 右上
        [padL + margin, H - padB - boxH - margin], // 左下
        [W - padR - boxW - margin, H - padB - boxH - margin], // 右下
      ];
      const overlapScore = (bx: number, by: number): number => {
        let n = 0;
        for (const series of stats.moneySeries) {
          for (let k = 0; k + 1 < series.length; k++) {
            const x1 = x(stats.turns[k] ?? 0);
            const y1 = y(series[k]);
            const x2 = x(stats.turns[k + 1] ?? 0);
            const y2 = y(series[k + 1]);
            for (let s = 0; s <= 4; s++) {
              const px2 = x1 + ((x2 - x1) * s) / 4;
              const py2 = y1 + ((y2 - y1) * s) / 4;
              if (px2 >= bx && px2 <= bx + boxW && py2 >= by && py2 <= by + boxH) n++;
            }
          }
        }
        return n;
      };
      let bx = corners[0][0];
      let by = corners[0][1];
      let bestScore = overlapScore(bx, by);
      for (const [cx2, cy2] of corners) {
        const s = overlapScore(cx2, cy2);
        if (s < bestScore) {
          bestScore = s;
          bx = cx2;
          by = cy2;
        }
      }
      g.fillStyle = 'rgba(11, 16, 14, 0.85)';
      g.beginPath();
      g.roundRect(bx, by, boxW, boxH, 4);
      g.fill();
      g.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      g.stroke();
      let cx = bx + 8;
      g.textBaseline = 'middle';
      for (const p of parts) {
        g.fillStyle = p.color;
        g.fillText(p.text, cx, by + boxH / 2);
        cx += g.measureText(p.text).width;
      }
      g.textBaseline = 'alphabetic';
    }
  }

  // 鼠标交互: x 坐标 → 回合 → 重绘
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = Math.round(((px - padL) / plotW) * maxTurn);
    const first = stats.turns[0] ?? 0;
    hoverTurn = t < first || t > maxTurn ? null : Math.min(Math.max(t, 0), maxTurn);
    drawChart();
  });
  canvas.addEventListener('mouseleave', () => {
    hoverTurn = null;
    drawChart();
  });

  drawChart();
  return canvas;
}

/** 对序列做滑动平均 (窗口默认 7), 把"平台 + 跳变"的阶梯形数据抹平成连续曲线;
 *  仅用于绘制, 悬停仍显示真实值 */
function smoothSeries(values: number[], window = 7): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      const v = values[j];
      if (v == null) continue;
      sum += v;
      n++;
    }
    return n > 0 ? sum / n : values[i];
  });
}

/** Catmull-Rom 样条 (转为三次贝塞尔) 绘制平滑曲线 */
function traceSmooth(g: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  const n = pts.length;
  if (n < 2) return;
  g.moveTo(pts[0].x, pts[0].y);
  if (n === 2) {
    g.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    g.bezierCurveTo(
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
  sorted.forEach(([type, count], i) => {
    const pct = Math.round((count / total) * 100);
    // 绿-蓝-黄色系调色板, 按占比从大到小排列
    const color = CROP_BAR_PALETTE[i % CROP_BAR_PALETTE.length];
    const row = el('div', { class: 'stats-crop-row' }, [
      el('span', { class: 'stats-crop-name', text: `${CROP_NAMES[type] ?? type}` }),
      el('span', { class: 'stats-crop-bar' }, [
        el('span', { class: 'stats-crop-fill', style: `width: ${pct}%; background: ${color}` }),
      ]),
      el('span', { class: 'stats-crop-count', text: `${count} (${pct}%)` }),
    ]);
    sec.append(row);
  });
  return sec;
}

/** 进度条调色板: 绿-蓝-黄色系 */
const CROP_BAR_PALETTE = [
  '#66bb6a', '#4fc3f7', '#ffee58',
  '#26a69a', '#42a5f5', '#ffd54f',
  '#43a047', '#aed581', '#fff176',
];
