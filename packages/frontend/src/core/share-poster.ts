// Share poster: render a single-player result into a downloadable PNG (avatar + ID + score + copy + link + richest crop frame).
import { el, button, toast } from '../ui/ui';
import gsap from 'gsap';
import { loadSprites, cropStageIndex, growCyclesOf } from './sprites';
import type { Sprites } from './sprites';
import { TILES, CropState } from '@robofarm/shared';
import type { SnapshotState, CropInfo } from '@robofarm/shared';

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Deterministic hue from a username (shared with ui/user-card). */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
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

/** Center-wrapped text. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number): void {
  ctx.textAlign = 'center';
  let line = '';
  let lines: string[] = [];
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

/** Circular avatar (image or initial-colored tile). */
async function drawAvatar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, name: string, avatarUrl?: string | null): Promise<void> {
  if (avatarUrl) {
    const img = await loadImage(avatarUrl);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
  }
  ctx.fillStyle = `hsl(${hueOf(name)} 42% 38%)`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(r * 0.9)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((name[0] ?? '?').toUpperCase(), cx, cy + 1);
  ctx.textBaseline = 'alphabetic';
}

/** Draw a crop sprite into a cell. */
function drawCrop(ctx: CanvasRenderingContext2D, sprites: Sprites, crop: CropInfo, px: number, py: number, s: number): void {
  const stages = sprites.crops[crop.type];
  if (stages && stages.length > 0) {
    const idx = cropStageIndex(crop.state, crop.cyclesToGrown, growCyclesOf(crop.type), stages.length);
    const img = stages[Math.min(idx, stages.length - 1)];
    if (img) {
      ctx.drawImage(img, px, py, s, s);
      return;
    }
  }
  const cx = px + s / 2;
  const cy = py + s / 2;
  ctx.fillStyle = crop.state === CropState.Grown ? '#e06838' : '#86c94a';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a snapshot (the richest-crop frame) into a bounded region. */
function drawSnapshot(ctx: CanvasRenderingContext2D, sprites: Sprites, snap: SnapshotState | null, bx: number, by: number, bw: number, bh: number): void {
  if (!snap || !snap.map.length) {
    ctx.fillStyle = cssVar('--text-faint', '#75867b');
    ctx.font = '500 14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('（本局没有作物画面）', bx + bw / 2, by + bh / 2);
    return;
  }
  const w = snap.map[0]?.length ?? 0;
  const h = snap.map.length;
  const cell = Math.min(bw / w, bh / h);
  const ox = bx + (bw - w * cell) / 2;
  const oy = by + (bh - h * cell) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = snap.map[y][x];
      const px = ox + x * cell;
      const py = oy + y * cell;
      const cfg = TILES[tile.type];
      const sprite = sprites.tiles[tile.crop ? cfg.spriteWithCrop : cfg.sprite];
      if (sprite) ctx.drawImage(sprite, px, py, cell, cell);
      else {
        ctx.fillStyle = cfg.color;
        ctx.fillRect(px, py, cell, cell);
      }
      if (tile.crop) drawCrop(ctx, sprites, tile.crop, px, py, cell);
    }
  }
}

export interface SharePosterOpts {
  name: string;
  avatar?: string | null;
  score: number;
  snapshot: SnapshotState | null;
}

const W = 600;
const H = 820;
const S = 2;

/** Render the full poster to an offscreen canvas. */
export async function renderSharePoster(opts: SharePosterOpts): Promise<HTMLCanvasElement> {
  const sprites = await loadSprites();
  const logo = await loadImage('/sprites/logo.svg');
  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);

  const bg = cssVar('--bg-surface', '#1a2420');
  const panel = cssVar('--bg-panel', '#141c18');
  const border = cssVar('--border', '#2a3a33');
  const borderStrong = cssVar('--border-strong', '#3d5348');
  const primary = cssVar('--text-primary', '#e7ece9');
  const muted = cssVar('--text-muted', '#a6b5ac');
  const faint = cssVar('--text-faint', '#75867b');
  const accent = cssVar('--accent', '#6fbf73');
  const link = cssVar('--link', '#8fd19a');
  const money = cssVar('--money', '#f2cf62');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = borderStrong;
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, W - 2, H - 2, 16);
  ctx.stroke();

  if (logo) {
    const logoH = 40;
    const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
    ctx.drawImage(logo, 24, 14, logoW, logoH);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.font = '700 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('RoboFarm', 24, 42);
  }

  const cx = W / 2;
  const avatarCy = 88;
  await drawAvatar(ctx, cx, avatarCy, 42, opts.name, opts.avatar);
  ctx.fillStyle = primary;
  ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(opts.name, cx, avatarCy + 42 + 24);

  ctx.fillStyle = money;
  ctx.font = '800 52px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(String(opts.score), cx, 224);
  ctx.fillStyle = muted;
  ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('总得分', cx, 248);

  ctx.fillStyle = primary;
  ctx.font = '500 17px "Segoe UI", system-ui, sans-serif';
  wrapText(ctx, `我在 RoboFarm 怒砍 ${opts.score} 分，你也快来试试吧！`, cx, 292, 500, 27);

  // Size the frame to the snapshot's aspect ratio (7×7 → square, 14×7 → 2:1) within the space
  // remaining above the fixed link/copy footer, so nothing overflows the 820px canvas.
  const mapCols = opts.snapshot?.map[0]?.length ?? 7;
  const mapRows = opts.snapshot?.map.length ?? 7;
  const maxW = 540;
  const maxH = 320;
  const cell = Math.min(maxW / mapCols, maxH / mapRows);
  const fw = mapCols * cell;
  const fh = mapRows * cell;
  const fx = (W - fw) / 2;
  const fy = 344;
  ctx.fillStyle = panel;
  roundRect(ctx, fx - 6, fy - 6, fw + 12, fh + 12, 14);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  roundRect(ctx, fx - 6, fy - 6, fw + 12, fh + 12, 14);
  ctx.stroke();
  drawSnapshot(ctx, sprites, opts.snapshot, fx, fy, fw, fh);

  const linkY = 768;
  const shareLink = location.origin;
  ctx.fillStyle = link;
  ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(shareLink, cx, linkY);
  ctx.fillStyle = faint;
  ctx.font = '500 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('复制链接，和好友一起挑战 RoboFarm', cx, linkY + 24);

  return canvas;
}

/** Open the share poster unboxed (no modal frame); actions overlay the poster, excluded from the download. */
export async function openSharePoster(opts: SharePosterOpts): Promise<void> {
  const canvas = await renderSharePoster(opts);
  canvas.className = 'share-poster-img';

  const overlay = el('div', { class: 'poster-overlay' });
  const actions = el('div', { class: 'poster-actions' }, [
    button('下载海报', () => downloadPoster(canvas), { class: 'btn btn-gold' }),
  ]);
  const shell = el('div', { class: 'poster-shell' }, [canvas, actions]);
  overlay.append(shell);
  document.body.append(overlay);

  gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.16, ease: 'power1.out' });
  gsap.fromTo(shell, { opacity: 0, scale: 0.96, y: 12 }, { opacity: 1, scale: 1, y: 0, duration: 0.26, ease: 'power3.out' });

  function closePoster(): void {
    gsap.to(overlay, { opacity: 0, duration: 0.15, ease: 'power1.in', onComplete: () => overlay.remove() });
    gsap.to(shell, { opacity: 0, scale: 0.97, y: 6, duration: 0.18, ease: 'power2.in' });
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePoster();
  });
}

function downloadPoster(canvas: HTMLCanvasElement): void {
  canvas.toBlob((blob) => {
    if (!blob) {
      toast('生成图片失败');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'robofarm-share.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}