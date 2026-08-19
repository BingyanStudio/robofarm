// Canvas game renderer: draws tiles/crops/drones, supports zoom (wheel) and drag-to-pan.
// Rendering uses absolute coordinates; the mirror option renders from the opponent's view (combat mode P2).
import type { SnapshotState, CropInfo, Position } from '@robofarm/shared';
import { CropState, TileType, TILES, cropConfig } from '@robofarm/shared';
import { loadSprites, cropStageIndex, growCyclesOf } from './sprites';
import type { Sprites } from './sprites';
import { el } from '../ui/ui';
import { icon } from '../ui/icon';
import { theme } from './theme';

const TILE = 48;
/** Canvas render colors: shares the tokens.css single source of truth with the DOM (read via theme.ts). */
const COLORS = {
  soilGrid: theme.grid,
  waterBorder: theme.waterBorder,
  cropGrowing: theme.cropGrowing,
  cropThirsty: theme.cropThirsty,
  cropGrown: theme.cropGrown,
  p1: theme.p1,
  p2: theme.p2,
  bounty: theme.bounty,
  waterPip: theme.waterPip,
  intercept: theme.interceptMark,
};

/** Tile effect (color + initial opacity, fades out linearly over time). */
const FX = {
  water: { color: theme.fxWater, alpha: 0.45 }, // light blue: water
  harvest: { color: theme.fxHarvest, alpha: 0.7 }, // deep gold: harvest (starts more opaque)
  intercept: { color: theme.fxIntercept, alpha: 0.45 }, // light red: intercept
} as const;

/** Effect duration (milliseconds). */
const FX_DURATION = 200;

interface TileFx {
  type: keyof typeof FX;
  x: number;
  y: number;
  start: number;
}

export interface RenderOptions {
  /** Render from a mirrored view (combat mode P2's local perspective). */
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
  /** Whether resize() has sized the bitmap with real layout dimensions (fit only computes in this state). */
  private sized = false;
  private resizeObserver: ResizeObserver | null = null;
  /** Drone movement animation (absolute coordinates from → to). */
  private animations = new Map<number, { from: Position; to: Position; start: number; duration: number }>();
  /** Tile effects (water/harvest/intercept, 0.2s fade), deduplicated by tile key. */
  private fx = new Map<string, TileFx>();
  /** Charge effect: drone id → start time (0.2s green tint). */
  private chargeFx = new Map<number, number>();
  private rafId: number | null = null;
  /** Loaded sprites (null before loading finishes, with procedural draw as fallback). */
  private sprites: Sprites | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    // Canvas size follows layout: it may not be mounted on the DOM yet at construction (size 0),
    // so ResizeObserver fills it in once layout is resolved, without waiting for window resize.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Load sprites asynchronously, falling back to procedural drawing until ready.
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
      // Zoom anchored at the cursor.
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
      // If layout was resolved and we have not auto-fit yet, do so here with real dimensions.
      if (!this.didFit) this.fit();
      this.draw();
    }
  }

  setOptions(opts: RenderOptions): void {
    this.opts = opts;
    this.draw();
  }

  /** Zoom/pan to fit the whole map into the canvas. */
  fit(): void {
    if (!this.state) return;
    // Skip when layout is not ready (resize has not sized the bitmap yet); fit again on resize.
    if (!this.sized) return;
    const w = this.state.map[0].length * TILE;
    const h = this.state.map.length * TILE;
    // On first render fill the canvas as much as possible (leave ~3% margin), no longer capped at 1.6x.
    this.scale = Math.min(this.canvas.width / w, this.canvas.height / h, 8) * 0.97;
    this.ox = (this.canvas.width - w * this.scale) / 2;
    this.oy = (this.canvas.height - h * this.scale) / 2;
    this.didFit = true; // Auto-fit only once, then preserve the user's zoom/pan.
    this.draw();
  }

  render(state: SnapshotState): void {
    this.state = state;
    if (!this.didFit) this.fit();
    this.draw();
    // Hover content may change after a snapshot update (drone water/crop growth, etc.); refresh the top-right panel.
    this.updateTooltip();
  }

  /** Clear the canvas. */
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

  /** Add a move transition animation for a drone (from → to, absolute coordinates). */
  animateDrone(id: number, from: Position, to: Position, duration = 250): void {
    if (from[0] === to[0] && from[1] === to[1]) return;
    this.animations.set(id, { from, to, start: performance.now(), duration });
    this.ensureLoop();
  }

  /** Tile effect: water (light blue) / harvest (light gold) / intercept (light red), covers the whole tile and fades over 0.2s. */
  tileFx(type: 'water' | 'harvest' | 'intercept', x: number, y: number): void {
    this.fx.set(`${x},${y}`, { type, x, y, start: performance.now() });
    this.ensureLoop();
  }

  /** Charge effect: tints the drone green, recovering within 0.2s. */
  chargeFxOn(id: number): void {
    this.chargeFx.set(id, performance.now());
    this.ensureLoop();
  }

  /** Ensure the rAF loop is running (kept alive while any animation/effect persists). */
  private ensureLoop(): void {
    if (this.rafId !== null) return;
    const step = (now: number) => {
      let alive = false;
      for (const [aid, a] of this.animations) {
        if (now - a.start >= a.duration) this.animations.delete(aid);
        else alive = true;
      }
      for (const [key, f] of this.fx) {
        if (now - f.start >= FX_DURATION) this.fx.delete(key);
        else alive = true;
      }
      for (const [cid, start] of this.chargeFx) {
        if (now - start >= FX_DURATION) this.chargeFx.delete(cid);
        else alive = true;
      }
      this.draw();
      this.rafId = alive ? requestAnimationFrame(step) : null;
    };
    this.rafId = requestAnimationFrame(step);
  }

  /** Drone current render position (animation interpolation first, otherwise snapshot position). */
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

  /** Update the top-right info panel: Tile / drone / crop three sections. */
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
        el('span', { class: 'tt-title', text: TILES[tile.type].name }),
        el('span', { class: 'muted', text: `  (${x}, ${y})` }),
      ])
    );

    // 2. Drone (if any): number/owner + water/energy unordered list.
    const drone = this.state.drones.find((d) => d.position[0] === dx && d.position[1] === y);
    if (drone) {
      const owner = drone.player === 0 ? '我方' : '对方';
      rows.push(
        el('div', { class: 'tt-row' }, [
          el('span', { class: 'tt-title', text: `无人机 #${drone.id} (${owner})` }),
        ])
      );
      rows.push(
        el('ul', { class: 'doc-list' }, [
          el('li', {}, [icon('drop', 12), document.createTextNode(` ${drone.water}`)]),
          el('li', {}, [icon('bolt', 12), document.createTextNode(` ${drone.energy}`)]),
        ])
      );
    }

    // 3. Crop (if any).
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
    ctx.fillStyle = theme.bgCanvas;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.state) return;
    const { map, drones } = this.state;

    // Tiles
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

    // Half-field divider (combat mode).
    if (this.state.mode === 'combat') {
      const half = map[0].length / 2;
      const px = this.ox + half * TILE * this.scale;
      ctx.strokeStyle = theme.halfLine;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, this.oy);
      ctx.lineTo(px, this.oy + map.length * TILE * this.scale);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Intercept markers.
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

    // Tile effects (water/harvest/intercept): cover the current tile, fading within 0.2s (drawn below drones).
    const fxNow = performance.now();
    for (const f of this.fx.values()) {
      const t = (fxNow - f.start) / FX_DURATION;
      if (t < 0 || t >= 1) continue;
      const fx = FX[f.type];
      const alpha = Math.round(fx.alpha * (1 - t) * 255).toString(16).padStart(2, '0');
      const px = this.ox + this.rx(f.x) * TILE * this.scale;
      const py = this.oy + f.y * TILE * this.scale;
      ctx.fillStyle = fx.color + alpha;
      ctx.fillRect(px, py, TILE * this.scale, TILE * this.scale);
    }

    // Drones (drawn last, on the top layer).
    for (const d of drones) {
      const pos = this.animatedPosition(d.id, d.position);
      this.drawDrone(d, this.rx(pos[0]), pos[1]);
    }

    // Hover highlight.
    if (this.hoverPos) {
      const { x, y } = this.hoverPos;
      const px = this.ox + x * TILE * this.scale;
      const py = this.oy + y * TILE * this.scale;
      ctx.strokeStyle = theme.hoverStroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE * this.scale - 2, TILE * this.scale - 2);
    }
  }

  /** Draw a single tile: prefer the sprite (from the TILES registry), otherwise draw procedurally. */
  private drawTile(
    tile: { type: TileType; crop: CropInfo | null },
    px: number,
    py: number,
    s: number
  ): void {
    const ctx = this.ctx;
    const cfg = TILES[tile.type];
    // Use the <type>_field variant sprite when a crop is present (e.g. sand_field.svg).
    const sprite = this.sprites?.tiles[tile.crop ? cfg.spriteWithCrop : cfg.sprite];
    if (sprite) {
      ctx.drawImage(sprite, px, py, s, s);
      return;
    }
    ctx.fillStyle = cfg.color;
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
    // Sprite: square covering one cell, selected by growth stage.
    const stages = this.sprites?.crops[crop.type];
    if (stages && stages.length > 0) {
      const idx = cropStageIndex(crop.state, crop.cyclesToGrown, growCyclesOf(crop.type), stages.length);
      const img = stages[Math.min(idx, stages.length - 1)];
      if (img) {
        ctx.drawImage(img, px, py, s, s);
        // Thirsty marker: a small water drop pip in the top-right corner.
        if (crop.state === CropState.Thirsty) {
          ctx.fillStyle = COLORS.waterPip;
          ctx.beginPath();
          ctx.arc(px + s * 0.78, py + s * 0.22, s * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
    }
    // Procedural draw fallback.
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
      // Thirsty marker: a small water drop pip offset above the crop.
      ctx.fillStyle = COLORS.waterPip;
      ctx.beginPath();
      ctx.arc(cx + s * 0.25, cy - s * 0.2, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else if (crop.state === CropState.Grown) {
      // Strawberry: red circle + green calyx.
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
      // Procedural fallback: body + number.
      ctx.fillStyle = d.player === 0 ? COLORS.p1 : COLORS.p2;
      roundRect(ctx, cx - r, cy - r, r * 2, r * 2, s * 0.12);
      ctx.fill();
      ctx.strokeStyle = theme.droneOutline;
      ctx.lineWidth = 2;
      roundRect(ctx, cx - r, cy - r, r * 2, r * 2, s * 0.12);
      ctx.stroke();
      ctx.fillStyle = theme.textOnDark;
      ctx.font = `bold ${Math.max(10, s * 0.3)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(d.id), cx, cy);
    }
    // Charge effect: tints the whole body green, recovering within 0.2s.
    const chargeStart = this.chargeFx.get(d.id);
    if (chargeStart !== undefined) {
      const t = (performance.now() - chargeStart) / FX_DURATION;
      if (t < 1) {
        ctx.fillStyle = `rgba(${theme.chargeTintRgb}, ${(0.45 * (1 - t)).toFixed(2)})`;
        roundRect(ctx, px, py, s, s, s * 0.08);
        ctx.fill();
      }
    }
    // Water storage (drawn along the lower edge of the scaled body).
    for (let i = 0; i < d.water; i++) {
      ctx.fillStyle = COLORS.waterPip;
      ctx.beginPath();
      ctx.arc(cx - s * 0.18 + i * s * 0.09, cy + s * 0.21, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    // Crop-stealing bounty pool (top-right of the body).
    if (d.bounty > 0) {
      ctx.fillStyle = COLORS.bounty;
      ctx.beginPath();
      ctx.arc(cx + s * 0.21, cy - s * 0.2, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.textOnBright;
      ctx.font = `bold ${Math.max(8, s * 0.12)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(d.bounty), cx + s * 0.21, cy - s * 0.2 + 1);
    }
  }

  /**
   * Draw a drone in sprite mode: body sprite + forehead number + eyes offset toward movement.
   * The body region of drone.svg is image coordinates (149,143)-(383,324), center (266,233.5);
   * the eyes sprite (89x68) is placed at the body center.
   */
  private drawDroneSprite(
    d: { id: number; player: number; water: number; bounty: number },
    body: HTMLImageElement,
    cx: number,
    cy: number,
    s: number
  ): void {
    const ctx = this.ctx;
    const BODY_H = 181; // body height (image coordinates)
    const BODY_CX = 266; // body center x (image coordinates)
    const BODY_CY = 233.5; // body center y
    const IMG_W = 532;
    const IMG_H = 370;
    // Body height is ~30% of the cell, and body center sits above the cell midline (drone leans upward).
    const k = (0.3 * s) / BODY_H;
    const bodyCy = cy - s * 0.15;
    ctx.drawImage(body, cx - BODY_CX * k, bodyCy - BODY_CY * k, IMG_W * k, IMG_H * k);

    // Number: upper half of the body (forehead).
    const foreheadY = bodyCy - BODY_CY * k + 143 * k + BODY_H * 0.26 * k;
    ctx.font = `bold ${Math.max(8, s * 0.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const idText = String(d.id);
    ctx.lineWidth = Math.max(1.5, s * 0.025);
    ctx.strokeStyle = theme.droneIdStroke;
    ctx.strokeText(idText, cx, foreheadY);
    ctx.fillStyle = theme.textOnDark;
    ctx.fillText(idText, cx, foreheadY);

    // Eyes: at the body center, offset toward movement while moving.
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
        const amp = Math.sin(t * Math.PI); // grows then returns to center during the animation
        ex = (dx / len) * s * 0.12 * amp;
        ey = (dy / len) * s * 0.1 * amp;
      }
      const kE = (s * 0.12) / 68; // eye height ~12% of the cell, slightly below the body center
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
