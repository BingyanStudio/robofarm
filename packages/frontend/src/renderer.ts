// Canvas 游戏渲染器: 地块/作物/无人机绘制, 支持缩放 (滚轮) 与拖拽平移。
// 渲染使用绝对坐标; mirror 选项用于以对方视角观察 (竞技模式 P2)。
import type { SnapshotState, CropInfo, Position } from '@robofarm/shared';
import { CropState, TileType, cropConfig } from '@robofarm/shared';
import { loadSprites, cropStageIndex, growCyclesOf } from './sprites';
import type { Sprites } from './sprites';
import { el } from './ui';

const TILE = 48;
const COLORS = {
  soil: '#b08d57',
  soilGrid: 'rgba(0,0,0,0.12)',
  water: '#6fb7dd',
  waterBorder: '#4a9cc9',
  cropGrowing: '#4caf50',
  cropThirsty: '#ff9800',
  cropGrown: '#e53935',
  p1: '#22c55e',
  p2: '#ef4444',
  bounty: '#fbbf24',
  waterPip: '#38bdf8',
  intercept: '#fde047',
};

export interface RenderOptions {
  /** 以镜像视角渲染 (竞技模式 P2 的本地视角) */
  mirror?: boolean;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private tooltip: HTMLDivElement;
  private opts: RenderOptions = {};
  private state: SnapshotState | null = null;
  private hoverPos: { x: number; y: number } | null = null;
  private didFit = false;
  /** resize() 是否已用真实布局尺寸设置过位图 (fit 只在该状态下计算) */
  private sized = false;
  private resizeObserver: ResizeObserver | null = null;
  /** 无人机移动动画 (绝对坐标 from → to) */
  private animations = new Map<number, { from: Position; to: Position; start: number; duration: number }>();
  private rafId: number | null = null;
  /** 已加载的贴图 (加载完成前为 null, 使用程序化绘制兜底) */
  private sprites: Sprites | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    // 画布尺寸跟随布局: 构造时可能尚未挂载到 DOM (尺寸为 0),
    // 用 ResizeObserver 在布局确定后自动补齐, 无需等 window resize
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // 异步加载贴图, 加载完成前用程序化绘制兜底
    void loadSprites().then((s) => {
      this.sprites = s;
      this.draw();
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0012);
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.scale = Math.min(6, Math.max(0.2, this.scale * factor));
      // 以光标为锚点缩放
      const wx = (mx - this.ox) / this.scale;
      const wy = (my - this.oy) / this.scale;
      this.ox = mx - wx * this.scale;
      this.oy = my - wy * this.scale;
      this.draw();
    });
    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (this.dragging) {
        this.ox += e.clientX - this.lastX;
        this.oy += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.draw();
      } else {
        this.hoverPos = this.screenToTile(mx, my);
        this.draw();
        this.updateTooltip();
      }
    });
    canvas.addEventListener('pointerup', () => (this.dragging = false));
    canvas.addEventListener('pointerleave', () => {
      this.hoverPos = null;
      this.tooltip.style.display = 'none';
      this.draw();
    });
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'render-tooltip';
    this.tooltip.style.display = 'none';
    (canvas.parentElement ?? document.body).append(this.tooltip);
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w > 0 && h > 0) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.sized = true;
      // 布局确定后若还没自动 fit 过, 在这里用真实尺寸补齐
      if (!this.didFit) this.fit();
      this.draw();
    }
  }

  setOptions(opts: RenderOptions): void {
    this.opts = opts;
    this.draw();
  }

  /** 缩放/平移使整个地图适配画布 */
  fit(): void {
    if (!this.state) return;
    // 布局未就绪 (resize 尚未用真实尺寸设置位图) 时不计算, 等 resize 再 fit
    if (!this.sized) return;
    const w = this.state.map[0].length * TILE;
    const h = this.state.map.length * TILE;
    // 首次渲染时尽量充满画布 (留 ~3% 边距), 不再被 1.6x 上限限制
    this.scale = Math.min(this.canvas.width / w, this.canvas.height / h, 8) * 0.97;
    this.ox = (this.canvas.width - w * this.scale) / 2;
    this.oy = (this.canvas.height - h * this.scale) / 2;
    this.didFit = true; // 只自动 fit 一次, 之后保留用户的缩放/平移
    this.draw();
  }

  render(state: SnapshotState): void {
    this.state = state;
    if (!this.didFit) this.fit();
    this.draw();
    // 快照更新后悬停内容可能变化 (无人机储水/作物生长等), 同步刷新右上角面板
    this.updateTooltip();
  }

  /** 清空画布 */
  clear(): void {
    this.state = null;
    this.didFit = false;
    this.animations.clear();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.draw();
  }

  /** 为某架无人机添加移动过渡动画 (from → to, 绝对坐标) */
  animateDrone(id: number, from: Position, to: Position, duration = 250): void {
    if (from[0] === to[0] && from[1] === to[1]) return;
    this.animations.set(id, { from, to, start: performance.now(), duration });
    if (this.rafId === null) {
      const step = (now: number) => {
        let alive = false;
        for (const [aid, a] of this.animations) {
          if (now - a.start >= a.duration) {
            this.animations.delete(aid);
          } else {
            alive = true;
          }
        }
        this.draw();
        this.rafId = alive ? requestAnimationFrame(step) : null;
      };
      this.rafId = requestAnimationFrame(step);
    }
  }

  /** 无人机当前渲染位置 (动画插值优先, 否则快照位置) */
  private animatedPosition(id: number, fallback: Position): Position {
    const a = this.animations.get(id);
    if (!a) return fallback;
    const t = Math.min(1, (performance.now() - a.start) / a.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    return [
      a.from[0] + (a.to[0] - a.from[0]) * eased,
      a.from[1] + (a.to[1] - a.from[1]) * eased,
    ];
  }

  private rx(x: number): number {
    if (!this.opts.mirror || !this.state) return x;
    return this.state.map[0].length - 1 - x;
  }

  private screenToTile(mx: number, my: number): { x: number; y: number } | null {
    if (!this.state) return null;
    const tx = Math.floor((mx - this.ox) / this.scale / TILE);
    const ty = Math.floor((my - this.oy) / this.scale / TILE);
    const w = this.state.map[0].length;
    const h = this.state.map.length;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
    return { x: tx, y: ty };
  }

  /** 更新右上角信息面板: Tile / 无人机 / 作物 三个分区 */
  private updateTooltip(): void {
    const tip = this.tooltip;
    if (!this.state || !this.hoverPos) {
      tip.style.display = 'none';
      return;
    }
    const { x, y } = this.hoverPos;
    const dx = this.rx(x);
    const tile = this.state.map[y][dx];
    const rows: HTMLElement[] = [];

    // 1. Tile
    rows.push(
      el('div', { class: 'tt-row' }, [
        el('span', { class: 'tt-title', text: tile.type === TileType.Water ? '水池' : '土地' }),
        el('span', { class: 'muted', text: `  (${x}, ${y})` }),
      ])
    );

    // 2. 无人机 (如有)
    const drone = this.state.drones.find((d) => d.position[0] === dx && d.position[1] === y);
    if (drone) {
      const owner = drone.player === 0 ? '我方' : '对方';
      rows.push(
        el('div', { class: 'tt-row' }, [
          el('span', { class: 'tt-title', text: `无人机 #${drone.id} (${owner})` }),
          el('span', { text: ` · 水 ${drone.water}/5` }),
          ...(drone.bounty > 0 ? [el('span', { class: 'muted', text: ` · 偷菜 ${drone.bounty}` })] : []),
        ])
      );
    }

    // 3. 作物 (如有)
    if (tile.crop) {
      const c = tile.crop;
      const cfg = cropConfig(c.type);
      let info: string;
      if (c.state === CropState.Growing) {
        info =
          `生长中, ${c.cyclesToGrown} 回合后成熟` +
          (cfg.thirstInterval !== null ? ' · 需定期浇水' : ' · 无需浇水');
      } else if (c.state === CropState.Thirsty) {
        info =
          c.cyclesToGrown > 0
            ? `缺水, 浇水后 ${c.cyclesToGrown} 回合成熟`
            : '缺水, 需要浇水';
      } else {
        info = '已成熟, 可收获';
      }
      rows.push(
        el('div', { class: 'tt-row' }, [
          el('span', { class: 'tt-title', text: cfg.name }),
          el('span', { text: ` · ${info}` }),
        ])
      );
    }

    tip.replaceChildren(...rows);
    tip.style.display = 'block';
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#17201c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.state) return;
    const { map, drones } = this.state;

    // 地块
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        const dx = this.rx(x);
        const tile = map[y][dx];
        const px = this.ox + x * TILE * this.scale;
        const py = this.oy + y * TILE * this.scale;
        const s = TILE * this.scale;
        this.drawTile(tile, px, py, s);
        if (tile.crop) this.drawCrop(tile.crop, px, py, s);
      }
    }

    // 半场分界线 (竞技模式)
    if (this.state.mode === 'combat') {
      const half = map[0].length / 2;
      const px = this.ox + half * TILE * this.scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, this.oy);
      ctx.lineTo(px, this.oy + map.length * TILE * this.scale);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 拦截标记
    for (const d of drones) {
      if (d.interceptTarget) {
        const tx = d.interceptTarget[0];
        const ty = d.interceptTarget[1];
        const px = this.ox + this.rx(tx) * TILE * this.scale;
        const py = this.oy + ty * TILE * this.scale;
        ctx.strokeStyle = COLORS.intercept;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px + (TILE * this.scale) / 2, py + (TILE * this.scale) / 2, TILE * this.scale * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 无人机 (后绘制, 位于上层)
    for (const d of drones) {
      const pos = this.animatedPosition(d.id, d.position);
      this.drawDrone(d, this.rx(pos[0]), pos[1]);
    }

    // 悬停高亮
    if (this.hoverPos) {
      const { x, y } = this.hoverPos;
      const px = this.ox + x * TILE * this.scale;
      const py = this.oy + y * TILE * this.scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE * this.scale - 2, TILE * this.scale - 2);
    }
  }

  /** 绘制单个地块: 优先贴图 (grass/field/water), 否则程序化绘制 */
  private drawTile(
    tile: { type: TileType; crop: CropInfo | null },
    px: number,
    py: number,
    s: number
  ): void {
    const ctx = this.ctx;
    const sprite =
      tile.type === TileType.Water
        ? this.sprites?.water
        : tile.crop
          ? this.sprites?.field
          : this.sprites?.grass;
    if (sprite) {
      ctx.drawImage(sprite, px, py, s, s);
      return;
    }
    ctx.fillStyle = tile.type === TileType.Water ? COLORS.water : COLORS.soil;
    ctx.fillRect(px, py, s, s);
    if (tile.type === TileType.Water) {
      ctx.strokeStyle = COLORS.waterBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
    } else {
      ctx.strokeStyle = COLORS.soilGrid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
    }
  }

  private drawCrop(crop: CropInfo, px: number, py: number, s: number): void {
    const ctx = this.ctx;
    // 贴图: 正方形铺满一格, 按生长阶段取图
    const stages = this.sprites?.crops[crop.type];
    if (stages && stages.length > 0) {
      const idx = cropStageIndex(crop.state, crop.cyclesToGrown, growCyclesOf(crop.type), stages.length);
      const img = stages[Math.min(idx, stages.length - 1)];
      if (img) {
        ctx.drawImage(img, px, py, s, s);
        // 缺水标记
        if (crop.state === CropState.Thirsty) {
          ctx.fillStyle = COLORS.waterPip;
          ctx.font = `${Math.max(10, s * 0.3)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('💧', px + s * 0.78, py + s * 0.22);
        }
        return;
      }
    }
    // 程序化绘制兜底
    const cx = px + s / 2;
    const cy = py + s / 2;
    if (crop.state === CropState.Growing) {
      ctx.fillStyle = COLORS.cropGrowing;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (crop.state === CropState.Thirsty) {
      ctx.fillStyle = COLORS.cropThirsty;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.waterPip;
      ctx.font = `${Math.max(10, s * 0.32)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('💧', cx + s * 0.25, cy - s * 0.2);
    } else if (crop.state === CropState.Grown) {
      // 草莓: 红色圆 + 绿色果蒂
      ctx.fillStyle = COLORS.cropGrown;
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.05, s * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.cropGrowing;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18, cy - s * 0.08);
      ctx.lineTo(cx + s * 0.18, cy - s * 0.08);
      ctx.lineTo(cx, cy - s * 0.32);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawDrone(
    d: { id: number; player: number; water: number; bounty: number },
    x: number,
    y: number
  ): void {
    const ctx = this.ctx;
    const px = this.ox + x * TILE * this.scale;
    const py = this.oy + y * TILE * this.scale;
    const s = TILE * this.scale;
    const cx = px + s / 2;
    const cy = py + s / 2;
    const r = s * 0.4;

    const bodySprite = d.player === 0 ? this.sprites?.drone : this.sprites?.droneEnemy;
    if (bodySprite) {
      this.drawDroneSprite(d, bodySprite, cx, cy, s);
    } else {
      // 程序化兜底: 机体 + 编号
      ctx.fillStyle = d.player === 0 ? COLORS.p1 : COLORS.p2;
      roundRect(ctx, cx - r, cy - r, r * 2, r * 2, s * 0.12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      roundRect(ctx, cx - r, cy - r, r * 2, r * 2, s * 0.12);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(10, s * 0.3)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(d.id), cx, cy);
    }
    // 储水 (画在缩小后机身的下缘)
    for (let i = 0; i < d.water; i++) {
      ctx.fillStyle = COLORS.waterPip;
      ctx.beginPath();
      ctx.arc(cx - s * 0.18 + i * s * 0.09, cy + s * 0.21, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    // 偷菜资金池 (机身右上角)
    if (d.bounty > 0) {
      ctx.fillStyle = COLORS.bounty;
      ctx.beginPath();
      ctx.arc(cx + s * 0.21, cy - s * 0.2, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.max(8, s * 0.12)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(d.bounty), cx + s * 0.21, cy - s * 0.2 + 1);
    }
  }

  /**
   * 贴图模式绘制无人机: 机身贴图 + 额头编号 + 移动方向偏移的眼睛。
   * drone.svg 的机身区域为图片坐标 (149,143)-(383,324), 中心 (266,233.5),
   * 眼睛贴图 (89x68) 铺在机身中心。
   */
  private drawDroneSprite(
    d: { id: number; player: number; water: number; bounty: number },
    body: HTMLImageElement,
    cx: number,
    cy: number,
    s: number
  ): void {
    const ctx = this.ctx;
    const BODY_H = 181; // 机身高度 (图片坐标)
    const BODY_CX = 266; // 机身中心 x (图片坐标)
    const BODY_CY = 233.5; // 机身中心 y
    const IMG_W = 532;
    const IMG_H = 370;
    // 机身高度约占格子的 30%, 且机身中心位于格子中线上方 (无人机偏上)
    const k = (0.3 * s) / BODY_H;
    const bodyCy = cy - s * 0.15;
    ctx.drawImage(body, cx - BODY_CX * k, bodyCy - BODY_CY * k, IMG_W * k, IMG_H * k);

    // 编号: 机身上半部 (额头)
    const foreheadY = bodyCy - BODY_CY * k + 143 * k + BODY_H * 0.26 * k;
    ctx.font = `bold ${Math.max(8, s * 0.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const idText = String(d.id);
    ctx.lineWidth = Math.max(1.5, s * 0.025);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(idText, cx, foreheadY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(idText, cx, foreheadY);

    // 眼睛: 机身中心, 移动时向移动方向偏移
    const eyes = this.sprites?.droneEyes;
    if (eyes) {
      const anim = this.animations.get(d.id);
      let ex = 0;
      let ey = 0;
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.start) / anim.duration);
        const dx = anim.to[0] - anim.from[0];
        const dy = anim.to[1] - anim.from[1];
        const len = Math.hypot(dx, dy) || 1;
        const amp = Math.sin(t * Math.PI); // 动画期间先增大后回中
        ex = (dx / len) * s * 0.12 * amp;
        ey = (dy / len) * s * 0.1 * amp;
      }
      const kE = (s * 0.12) / 68; // 眼睛高度约占格子 12%, 位置略低于机身中心
      ctx.drawImage(eyes, cx + ex - (89 * kE) / 2, bodyCy + s * 0.03 + ey - (68 * kE) / 2, 89 * kE, 68 * kE);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
