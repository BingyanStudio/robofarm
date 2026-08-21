// 对局统计: 金钱曲线 + 种植构成。
// 本地运行 (GameRunner 收集事件) 与服务器回放 (replayEvents 重建事件) 共用同一计算。
import { el, modal } from '../ui/ui';
import { replayEvents, ReplayFile, cropConfig, isCropType } from '@robofarm/shared';
import type { GameEvent, SnapshotState } from '@robofarm/shared';
import gsap from 'gsap';

export interface GameStats {
  /** 各玩家每回合金钱 (index 0 = 己方/单人) */
  moneySeries: number[][];
  /** 金钱曲线横轴 (回合号, 与 moneySeries 对齐) */
  turns: number[];
  /** 各玩家种植总数 */
  planted: number[];
  /** 各玩家最终存活无人机数 */
  droneCounts: number[];
  /** 各玩家按作物类型种植数 */
  cropsByType: Record<string, number>[];
  /** 各玩家按作物类型的收益贡献金额 (收获 value 之和) */
  moneyByCrop: Record<string, number>[];
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
  const moneyByCrop: Record<string, number>[] = [];
  const planted = new Array(n).fill(0) as number[];
  const droneCounts = new Array(n).fill(0) as number[];
  for (let i = 0; i < n; i++) {
    moneySeries.push([]);
    cropsByType.push({});
    moneyByCrop.push({});
  }
  // plant 事件只带全局无人机 id, 从快照收集 无人机→玩家 映射
  const dronePlayer = new Map<number, number>();
  /** 上一份快照: pos -> crop type (用于把 harvest 事件关联到作物类型) */
  let lastCrops = new Map<string, string>();
  const turns: number[] = [];
  let maxTurns = 0;
  for (const e of events) {
    if (e.type === 'snapshot') {
      maxTurns = e.state.maxTurns;
      droneCounts.fill(0);
      for (const d of e.state.drones) {
        dronePlayer.set(d.id, d.player);
        if (d.player >= 0 && d.player < n) droneCounts[d.player]++;
      }
      turns.push(e.state.turn);
      for (let i = 0; i < n; i++) {
        const p = e.state.players.find((pl) => pl.id === i);
        moneySeries[i].push(p ? p.money : 0);
      }
      // 记录每个格子的作物类型 (绝对坐标)
      const next = new Map<string, string>();
      for (let y = 0; y < e.state.map.length; y++) {
        const row = e.state.map[y];
        if (!row) continue;
        for (let x = 0; x < row.length; x++) {
          const c = row[x]?.crop;
          if (c) next.set(`${x},${y}`, c.type);
        }
      }
      lastCrops = next;
    } else if (e.type === 'plant') {
      const pi = Math.min(Math.max(dronePlayer.get(e.drone) ?? 0, 0), n - 1);
      planted[pi]++;
      cropsByType[pi][e.crop] = (cropsByType[pi][e.crop] ?? 0) + 1;
    } else if (e.type === 'harvest') {
      // 收获收益按作物类型累计 (用上一份快照里该格的作物类型)
      const pi = Math.min(Math.max(dronePlayer.get(e.drone) ?? 0, 0), n - 1);
      const crop = lastCrops.get(`${e.pos[0]},${e.pos[1]}`);
      if (crop) moneyByCrop[pi][crop] = (moneyByCrop[pi][crop] ?? 0) + e.value;
    }
  }
  return { moneySeries, turns, planted, droneCounts, cropsByType, moneyByCrop, playerNames, maxTurns };
}

/** 从回放文件计算统计 (服务器验证 / 历史记录用; 回放会确定性重放一遍引擎) */
export async function statsFromReplay(file: unknown): Promise<GameStats | null> {
  const d = file as Partial<ReplayFile> | null;
  if (!d || !d.mode || !Array.isArray(d.rounds)) return null;
  const players = Array.isArray(d.players) && d.players.length > 0 ? d.players : ['玩家'];
  const events = await replayEvents(d as ReplayFile);
  return statsFromEvents(events, players);
}

/** Find the snapshot with the most planted crops (used for share posters). */
export function richestSnapshot(events: GameEvent[]): SnapshotState | null {
  let best: SnapshotState | null = null;
  let bestCount = -1;
  for (const e of events) {
    if (e.type !== 'snapshot') continue;
    let count = 0;
    for (const row of e.state.map) for (const t of row) if (t.crop) count++;
    if (count > bestCount) {
      bestCount = count;
      best = e.state;
    }
  }
  return best;
}

/** Replay-file variant of richestSnapshot. */
export async function richestSnapshotFromReplay(file: unknown): Promise<SnapshotState | null> {
  const d = file as Partial<ReplayFile> | null;
  if (!d || !d.mode || !Array.isArray(d.rounds)) return null;
  const events = await replayEvents(d as ReplayFile);
  return richestSnapshot(events);
}

/** 作物代码名 → 中文名 (数据来自作物注册表, 与 CROP.md 一致) */
function cropName(type: string): string {
  if (isCropType(type)) return cropConfig(type).name;
  return type;
}

/** 己方 (index 0) 金色, 对方 (index 1) 红色 */
const SERIES_COLORS = ['#f2cf62', '#f3a18d'];

/**
 * 取作物配色 (饼图扇区 / 图例 / 进度条共用的唯一入口)。
 * 已知作物返回语义色 (定义在各作物自己的 crops/<type>.ts 的 color 字段);
 * 未收录的作物按类型名哈希稳定回退到调色板 ——
 * 与排序位置无关, 保证同一作物在饼图与进度条中永远同色。
 */
function cropColor(type: string): string {
  if (isCropType(type)) return cropConfig(type).color;
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return CROP_BAR_PALETTE[h % CROP_BAR_PALETTE.length];
}

/** 弹出对局统计 */
export function showGameStats(stats: GameStats, title: string): void {
  const body = el('div', { class: 'stats-body' });

  // 0) 最终得分 (单人: 单张金钱卡; 多人: 双方对决卡, 胜方高亮)
  body.append(scoreSection(stats));

  // 1) 金钱折线图 + 收益仪表盘 (左右并排, 各自带标题卡片框)
  body.append(
    el('div', { class: 'stats-charts' }, [
      el('div', { class: 'stats-chart' }, [
        el('div', { class: 'stats-chart__head' }, [
          el('span', { class: 'stats-chart__title', text: '金钱走势' }),
          el('span', { class: 'stats-chart__hint', text: '悬停查看回合' }),
        ]),
        drawMoneyChart(stats),
      ]),
      el('div', { class: 'stats-pie' }, [
        el('div', { class: 'stats-pie__head' }, [
          el('span', { class: 'stats-pie__title', text: `${stats.playerNames[0] ?? '我方'} · 收益贡献` }),
          el('span', { class: 'stats-pie__hint', text: '按作物占比' }),
        ]),
        drawCropPie(stats),
      ]),
    ])
  );

  // 2) 种植明细 (己方 = player 0)
  body.append(cropSection(stats));

  modal(title, body, { noClose: false, modalClass: 'modal-wide' });
}

/** 最终得分: 单人单卡 / 多人双方对决卡 (胜方高亮, 负方降透明) */
function scoreSection(stats: GameStats): HTMLElement {
  const wrap = el('div', { class: 'stats-final' });
  const lastMoney = (i: number): number => {
    const s = stats.moneySeries[i] ?? [];
    return s.length > 0 ? s[s.length - 1] : 0;
  };

  if (stats.playerNames.length <= 1) {
    wrap.append(
      el('div', { class: 'stats-score stats-score--self' }, [
        el('span', { class: 'stats-score__label' }, [
          el('span', { class: 'stats-score__dot' }),
          el('span', { text: '最终金钱' }),
        ]),
        el('span', { class: 'stats-score__value', text: String(lastMoney(0)) }),
        el('span', { class: 'stats-score__sub', text: `共 ${stats.maxTurns} 回合` }),
        el('span', { class: 'stats-score__drones', text: `无人机 ${stats.droneCounts[0] ?? 0} 架` }),
      ])
    );
    return wrap;
  }

  // 多人: 己方(player 0) vs 对方(player 1)
  const selfMoney = lastMoney(0);
  const enemyMoney = lastMoney(1);
  const selfWin = selfMoney >= enemyMoney;
  wrap.append(
    scoreCard(stats.playerNames[0] ?? '我方', selfMoney, 'self', selfWin, stats.droneCounts[0] ?? 0),
    el('div', { class: 'stats-vs', text: 'VS' }),
    scoreCard(stats.playerNames[1] ?? '对手', enemyMoney, 'enemy', !selfWin, stats.droneCounts[1] ?? 0)
  );
  return wrap;
}

function scoreCard(name: string, money: number, side: 'self' | 'enemy', win: boolean, droneCount = 0): HTMLElement {
  return el('div', { class: `stats-score stats-score--${side} ${win ? 'stats-score--winner' : 'stats-score--loser'}` }, [
    el('span', { class: `stats-badge ${win ? 'stats-badge--win' : 'stats-badge--lose'}`, text: win ? '胜' : '负' }),
    el('span', { class: 'stats-score__label' }, [
      el('span', { class: 'stats-score__dot' }),
      el('span', { text: name }),
    ]),
    el('span', { class: 'stats-score__value', text: String(money) }),
    el('span', { class: 'stats-score__sub', text: '最终金钱' }),
    el('span', { class: 'stats-score__drones', text: `无人机 ${droneCount} 架` }),
  ]);
}

/** 金钱折线图: 只在画布内绘制数据, 悬停信息交由独立 DOM 浮层承载。 */
function drawMoneyChart(stats: GameStats): HTMLElement {
  const W = 560;
  const H = 240;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const wrap = el('div', { class: 'stats-chart__canvas-wrap' });
  const canvas = el('canvas', { width: W, height: H }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    wrap.append(canvas);
    return wrap;
  }
  const g: CanvasRenderingContext2D = ctx;
  // 高分屏拉满 DPR (上限 3) 提升曲线精细度, 消除毛躁/像素感
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  g.scale(dpr, dpr);

  const tooltip = el('div', { class: 'stats-chart-tooltip', role: 'status' });
  wrap.append(canvas, tooltip);

  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  const grid = token('--border-subtle', '#202d27');
  const muted = token('--text-faint', '#75867b');
  const surface = token('--bg-surface', '#1a2420');
  const border = token('--border-strong', '#3d5348');

  const maxMoney = Math.max(100, ...stats.moneySeries.flat());
  const maxTurn = Math.max(1, stats.maxTurns);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const x = (t: number): number => padL + (t / maxTurn) * plotW;
  const y = (m: number): number => H - padB - (m / maxMoney) * plotH;
  let hoverIndex: number | null = null;
  /** 生长动效进度 (0 → 1), 打开面板时驱动曲线从左向右逐渐长成 */
  let progress = 0;

  /** 平滑曲线的完整点位 (与系列对齐, 供生长裁剪) */
  const curves = stats.playerNames.map((_, i) => {
    const series = stats.moneySeries[i];
    if (!series?.length) return [] as { x: number; y: number }[];
    return smoothSeries(series).map((money, k) => ({ x: x(stats.turns[k] ?? 0), y: y(money) }));
  });

  function drawChart(): void {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = grid;
    g.fillStyle = muted;
    g.font = '500 11px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const value = (maxMoney / 4) * i;
      const py = y(value);
      g.beginPath();
      g.moveTo(padL, py);
      g.lineTo(W - padR, py);
      g.stroke();
      g.fillText(String(Math.round(value)), padL - 9, py);
    }
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    for (let i = 0; i <= 4; i++) {
      const turn = Math.round((maxTurn / 4) * i);
      g.fillText(String(turn), x(turn), H - 9);
    }

    stats.playerNames.forEach((_, i) => {
      const pts = curves[i];
      if (!pts.length) return;
      g.strokeStyle = SERIES_COLORS[i % SERIES_COLORS.length];
      g.lineWidth = 2.25;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const visible = Math.max(2, Math.round(pts.length * progress));
      g.beginPath();
      traceSmooth(g, pts.slice(0, visible));
      g.stroke();
    });

    if (hoverIndex == null) return;
    const turn = stats.turns[hoverIndex] ?? 0;
    const px = x(turn);
    g.strokeStyle = border;
    g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(px, padT);
    g.lineTo(px, H - padB);
    g.stroke();
    g.setLineDash([]);
    const index = hoverIndex;
    stats.playerNames.forEach((_, i) => {
      const money = stats.moneySeries[i]?.[index];
      if (money == null) return;
      g.fillStyle = surface;
      g.beginPath();
      g.arc(px, y(money), 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = SERIES_COLORS[i % SERIES_COLORS.length];
      g.beginPath();
      g.arc(px, y(money), 3, 0, Math.PI * 2);
      g.fill();
    });
  }

  function updateTooltip(index: number, pointerX: number): void {
    const turn = stats.turns[index] ?? 0;
    tooltip.replaceChildren(
      el('div', { class: 'stats-chart-tooltip__turn', text: `第 ${turn} 回合` }),
      ...stats.playerNames.map((name, i) =>
        el('div', { class: 'stats-chart-tooltip__row' }, [
          el('span', { class: 'stats-chart-tooltip__dot', style: `background: ${SERIES_COLORS[i % SERIES_COLORS.length]}` }),
          el('span', { class: 'stats-chart-tooltip__name', text: name }),
          el('strong', { text: String(stats.moneySeries[i]?.[index] ?? 0) }),
        ])
      )
    );
    const width = 130;
    const gap = 14;
    // 根据回合位置决定浮层在竖线左/右侧: 指针靠近右侧时反转到左侧, 避免溢出画布
    const left = pointerX + width + gap <= W - 8
      ? pointerX + gap
      : Math.max(8, pointerX - gap - width);
    tooltip.style.left = `${left}px`;
    tooltip.classList.add('stats-chart-tooltip--visible');
  }

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const px = ((event.clientX - rect.left) / rect.width) * W;
    if (px < padL || px > W - padR || stats.turns.length === 0) {
      hoverIndex = null;
      tooltip.classList.remove('stats-chart-tooltip--visible');
      drawChart();
      return;
    }
    const desired = ((px - padL) / plotW) * maxTurn;
    let nearest = 0;
    for (let i = 1; i < stats.turns.length; i++) {
      if (Math.abs((stats.turns[i] ?? 0) - desired) < Math.abs((stats.turns[nearest] ?? 0) - desired)) nearest = i;
    }
    hoverIndex = nearest;
    updateTooltip(nearest, px);
    drawChart();
  });
  canvas.addEventListener('mouseleave', () => {
    hoverIndex = null;
    tooltip.classList.remove('stats-chart-tooltip--visible');
    drawChart();
  });

  // 生长动效: 打开面板时各系列曲线从左向右逐渐长成; 由 GSAP 驱动 (平滑无卡顿), 尊重 reduce-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    progress = 1;
    drawChart();
  } else {
    const state = { p: 0 };
    gsap.to(state, {
      p: 1,
      duration: 1.0,
      ease: 'power3.inOut',
      onUpdate: () => {
        progress = state.p;
        drawChart();
      },
      onComplete: () => {
        progress = 1;
        drawChart();
      },
    });
  }

  drawChart();
  return wrap;
}

/** 对序列做滑动平均 (窗口默认 11), 把"平台 + 跳变"的阶梯形数据抹平成连续曲线;
 *  仅用于绘制, 悬停仍显示真实值 */
function smoothSeries(values: number[], window = 11): number[] {
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

/** 收益饼图: 完整圆环、居中总收益与外侧清晰图例, 悬停仅轻推当前扇区。 */
function drawCropPie(stats: GameStats): HTMLCanvasElement {
  const W = 340;
  const H = 240;
  const canvas = el('canvas', { width: W, height: H }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const g: CanvasRenderingContext2D = ctx;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  g.scale(dpr, dpr);

  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  const moneyByCrop = stats.moneyByCrop[0] ?? {};
  const cx = 105;
  const cy = 121;
  const rOuter = 85;
  const rInner = 55;
  const legendX = 214;
  const legendW = W - legendX - 12;
  const start = -Math.PI / 2;
  const track = token('--bg-panel', '#141c18');
  const border = token('--border', '#2a3a33');
  const muted = token('--text-muted', '#a6b5ac');
  const faint = token('--text-faint', '#75867b');
  const money = token('--money', '#f2cf62');

  type Slice = { name: string; value: number; pct: number; color: string; start: number; end: number; mid: number };
  const total = Object.values(moneyByCrop).reduce((sum, value) => sum + value, 0);
  const slices: Slice[] = [];
  if (total) {
    let angle = start;
    Object.entries(moneyByCrop)
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, value]) => {
        const end = angle + (value / total) * Math.PI * 2;
        slices.push({
          name: cropName(type),
          value,
          pct: Math.round((value / total) * 100),
          color: cropColor(type),
          start: angle,
          end,
          mid: (angle + end) / 2,
        });
        angle = end;
      });
  }
  let hoverIndex: number | null = null;
  /** 生长动效进度 (0 → 1), 打开面板时圆环从 12 点方向顺时针长满一圈 */
  let progress = 0;

  function drawRing(startAngle: number, endAngle: number, offset = 0): void {
    const dx = Math.cos((startAngle + endAngle) / 2) * offset;
    const dy = Math.sin((startAngle + endAngle) / 2) * offset;
    g.beginPath();
    g.arc(cx + dx, cy + dy, rOuter, startAngle, endAngle);
    g.arc(cx + dx, cy + dy, rInner, endAngle, startAngle, true);
    g.closePath();
  }

  function drawPie(): void {
    g.clearRect(0, 0, W, H);
    // 背景轨道: 外/内两条完整圆弧分别描边, 不用 closePath, 避免右端出现径向接缝线
    drawRing(0, Math.PI * 2);
    g.fillStyle = track;
    g.fill();
    g.strokeStyle = border;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, rOuter, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, rInner, 0, Math.PI * 2);
    g.stroke();

    if (!total) {
      g.fillStyle = faint;
      g.font = '500 12px "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('本局无收益', cx, cy);
      return;
    }

    // 生长: 用旋转楔形 clip 逐角揭示。完整饼图预先画好, 边界是平滑径向线, 无扇区边界跳变/顿挫。
    if (progress < 1) {
      g.save();
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, rOuter + 8, start, start + Math.PI * 2 * progress);
      g.closePath();
      g.clip();
    }
    const single = slices.length === 1;
    slices.forEach((slice, index) => {
      // 扇区间隙按角度自适应收缩: 占比过小的扇区若仍用固定 0.012 间隙,
      // start+gap 会超过 end-gap, arc() 将反向绕满整圈并盖住其他扇区。
      const gap = single ? 0 : Math.min(0.012, (slice.end - slice.start) / 4);
      // 单一作物时画出封闭整环, 不做扇区间隙也不做悬停外推 (会整体偏移)
      drawRing(slice.start + gap, slice.end - gap, (!single && index === hoverIndex) ? 5 : 0);
      g.fillStyle = slice.color;
      g.fill();
    });
    if (progress < 1) g.restore();

    // 中心读数三行固定位置 + 固定字号, hover 只换内容/颜色, 不改变整体高度
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const labelY = cy - 15;
    const valueY = cy + 8;
    const subY = cy + 26;
    if (hoverIndex != null) {
      const slice = slices[hoverIndex];
      g.fillStyle = muted;
      g.font = '500 11px "Segoe UI", system-ui, sans-serif';
      g.fillText(slice.name, cx, labelY);
      g.fillStyle = slice.color;
      g.font = '700 24px "Segoe UI", system-ui, sans-serif';
      g.fillText(String(slice.value), cx, valueY);
      g.fillStyle = faint;
      g.font = '500 10px "Segoe UI", system-ui, sans-serif';
      g.fillText(`占比 ${slice.pct}%`, cx, subY);
    } else {
      g.fillStyle = muted;
      g.font = '500 11px "Segoe UI", system-ui, sans-serif';
      g.fillText('总收益', cx, labelY);
      g.fillStyle = money;
      g.font = '700 24px "Segoe UI", system-ui, sans-serif';
      g.fillText(String(total), cx, valueY);
      g.fillStyle = faint;
      g.font = '500 10px "Segoe UI", system-ui, sans-serif';
      g.fillText('按作物贡献', cx, subY);
    }

    const rowH = 27;
    const startY = 43;
    slices.forEach((slice, index) => {
      const y = startY + index * rowH;
      if (y > H - 14) return;
      g.beginPath();
      g.arc(legendX, y - 3, 4.5, 0, Math.PI * 2);
      g.fillStyle = slice.color;
      g.fill();
      g.fillStyle = muted;
      g.font = '500 12px "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillText(slice.name, legendX + 11, y);
      g.fillStyle = faint;
      g.font = '500 11px "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'right';
      g.fillText(`${slice.value} · ${slice.pct}%`, legendX + legendW, y);
    });
  }

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const py = ((event.clientY - rect.top) / rect.height) * H;
    let next: number | null = null;
    const rowH = 27;
    const startY = 43;
    if (px >= legendX - 8 && px <= W) {
      const index = Math.floor((py - (startY - 16)) / rowH);
      if (index >= 0 && index < slices.length) next = index;
    } else {
      const distance = Math.hypot(px - cx, py - cy);
      if (distance >= rInner - 2 && distance <= rOuter + 7) {
        let angle = Math.atan2(py - cy, px - cx);
        if (angle < start) angle += Math.PI * 2;
        next = slices.findIndex((slice) => angle >= slice.start && angle <= slice.end);
        if (next < 0) next = null;
      }
    }
    if (next !== hoverIndex) {
      hoverIndex = next;
      drawPie();
    }
  });
  canvas.addEventListener('mouseleave', () => {
    if (hoverIndex != null) {
      hoverIndex = null;
      drawPie();
    }
  });

  // 生长动效: 打开面板时圆环从 12 点方向顺时针长满一圈; 由 GSAP 驱动, 尊重 reduce-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    progress = 1;
    drawPie();
  } else {
    const state = { p: 0 };
    gsap.to(state, {
      p: 1,
      duration: 1.2,
      ease: 'power3.inOut',
      onUpdate: () => {
        progress = state.p;
        drawPie();
      },
      onComplete: () => {
        progress = 1;
        drawPie();
      },
    });
  }

  drawPie();
  return canvas;
}

/** 种植明细: 各作物的种植数 + 收益贡献 (按收益降序条形展示) */
function cropSection(stats: GameStats): HTMLElement {
  const sec = el('div', { class: 'stats-crops' });
  const byType = stats.cropsByType[0] ?? {};
  const moneyByCrop = stats.moneyByCrop[0] ?? {};
  const total = stats.planted[0] ?? 0;
  const who = stats.playerNames[0] ?? '我方';
  sec.append(
    el('div', { class: 'stats-crops-title' }, [
      el('span', { text: `种植明细 (${who})` }),
      el('small', { text: `共 ${total} 株` }),
    ])
  );
  if (total === 0) {
    sec.append(el('p', { class: 'hint', text: '本局未种植作物' }));
    return sec;
  }
  // 合并种植数与收益, 按收益降序排列
  const allTypes = new Set([...Object.keys(byType), ...Object.keys(moneyByCrop)]);
  const rows = [...allTypes].map((type) => ({
    type,
    count: byType[type] ?? 0,
    money: moneyByCrop[type] ?? 0,
  }));
  rows.sort((a, b) => b.money - a.money);
  const maxMoney = Math.max(1, ...rows.map((r) => r.money));
  rows.forEach((r) => {
    const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
    const moneyPct = Math.round((r.money / maxMoney) * 100);
    const color = cropColor(r.type);
    const row = el('div', { class: 'stats-crop-row' }, [
      el('span', { class: 'stats-crop-name' }, [
        el('span', { class: 'stats-crop-dot', style: `background: ${color}` }),
        el('span', { class: 'stats-crop-name__text', text: cropName(r.type) }),
      ]),
      el('span', { class: 'stats-crop-bar' }, [
        el('span', { class: 'stats-crop-fill', style: `width: ${moneyPct}%; background: ${color}` }),
      ]),
      el('span', { class: 'stats-crop-count' }, [
        el('span', { class: 'stats-crop-tag', title: `${r.count} 株`, html: `<b>${formatStatNumber(r.count)}</b>株` }),
        el('span', { class: 'stats-crop-tag', title: `${r.money} 金`, html: `<b>${formatStatNumber(r.money)}</b>金` }),
        el('span', { class: 'stats-crop-tag', title: `${pct}%`, html: `<b>${pct}</b>%` }),
      ]),
    ]);
    sec.append(row);
  });
  return sec;
}

/** 紧凑统计数字: 宽度受限时以万/亿缩略, 完整值保留在 title。 */
function formatStatNumber(value: number): string {
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, '')}亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  return String(value);
}

/** 进度条调色板: 绿-蓝-黄色系 */
const CROP_BAR_PALETTE = [
  '#66bb6a', '#4fc3f7', '#ffee58',
  '#26a69a', '#42a5f5', '#ffd54f',
  '#43a047', '#aed581', '#fff176',
];
