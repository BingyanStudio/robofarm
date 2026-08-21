// Shared layout and event applier for game screens (single-player / sim-combat / multiplayer).
import { el, button } from '../ui/ui';
import { icon } from '../ui/icon';
import type { GameEvent, GameResult, SnapshotState } from '@robofarm/shared';
import { Renderer } from './renderer';

export const DEFAULT_CODE = `/**
 *  示例程序, 无人机会在 4 格内种植草莓, 直到游戏结束
 *  详细 API 参考请见右侧边栏 (📖 图标)
 */

var state: number = 0

// ---------- 每回合入口 ----------
function run(droneId: number): DroneOperation | null {
  const self = getSelf();  // 获取自身信息
  const crop = getCrop(self.position)  // 当前 Tile 的作物

  if(crop && crop.state == 'grown') {
    return new Harvest();  // 作物成熟, 则收获
  }

  if(!crop) {
    return new Plant('strawberry');  // 没有作物, 则种植草莓
  }

  // 根据当前状态，决定下一步去哪里
  if (state == 0) {
    state = 1;
    return new Move([3, 2]);
  } else if (state == 1) {
    state = 2;
    return new Move([4, 2]);
  } else if (state == 2) {
    state = 3;
    return new Move([4, 3]);
  } else if (state == 3) {
    state = 0;
    return new Move([3, 3]);
  }
}
`;

export interface GameLayout {
  root: HTMLElement;
  editorHost: HTMLElement;
  canvas: HTMLCanvasElement;
  canvasHost: HTMLElement;
  controlsHost: HTMLElement;
  logHost: HTMLElement;
  statusHost: HTMLElement;
  /** Top-left money display (updated by GameView on each snapshot). */
  moneyHost: HTMLElement;
}

/** Build standard game layout: left editor (35%) / right canvas / bottom log (height drag-resizable). */
export function createGameLayout(title: string): GameLayout {
  const root = el('div', { class: 'game-layout' });
  const editorHost = el('div', { class: 'game-editor' }, [
    el('div', { class: 'game-title', text: title }),
  ]);
  const canvasHost = el('div', { class: 'game-canvas-host' });
  const canvas = el('canvas', { class: 'game-canvas' }) as HTMLCanvasElement;
  const statusHost = el('div', { class: 'game-status' });
  const moneyHost = el('div', { class: 'money-line' });
  const controlsHost = el('div', { class: 'game-controls' });
  canvasHost.append(statusHost, canvas);
  statusHost.append(moneyHost);
  const logHost = el('div', { class: 'game-log' });
  logHost.append(el('div', { class: 'game-log-title', text: '日志' }));
  const splitter = el('div', { class: 'game-splitter', title: '拖拽调整日志高度' });
  // Vertical drag handle between the editor and game area.
  const vSplitter = el('div', { class: 'game-splitter-v', title: '拖拽调整代码区宽度' });
  root.append(
    editorHost,
    vSplitter,
    el('div', { class: 'game-main' }, [canvasHost, controlsHost, splitter, logHost])
  );

  // Editor width is drag-resizable and persisted (stored as px, applied as px on load).
  const EDITOR_WIDTH_KEY = 'robofarm.editor-width';
  const savedW = Number(localStorage.getItem(EDITOR_WIDTH_KEY));
  editorHost.style.flexBasis = Number.isFinite(savedW) && savedW > 0 ? savedW + 'px' : '35%';
  let vDragging = false;
  let startX = 0;
  let startW = 0;
  vSplitter.addEventListener('pointerdown', (e) => {
    vDragging = true;
    startX = e.clientX;
    startW = editorHost.offsetWidth;
    vSplitter.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  vSplitter.addEventListener('pointermove', (e) => {
    if (!vDragging) return;
    const w = Math.min(900, Math.max(240, startW + (e.clientX - startX)));
    editorHost.style.flexBasis = w + 'px';
  });
  const endVDrag = () => {
    if (!vDragging) return;
    vDragging = false;
    localStorage.setItem(EDITOR_WIDTH_KEY, String(editorHost.offsetWidth));
  };
  vSplitter.addEventListener('pointerup', endVDrag);
  vSplitter.addEventListener('pointercancel', endVDrag);

  // Log height is drag-resizable and persisted.
  const LOG_HEIGHT_KEY = 'robofarm.log-height';
  const saved = Number(localStorage.getItem(LOG_HEIGHT_KEY));
  logHost.style.height = (Number.isFinite(saved) && saved > 0 ? saved : 130) + 'px';
  let dragging = false;
  let startY = 0;
  let startH = 0;
  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    startY = e.clientY;
    startH = logHost.offsetHeight;
    splitter.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const h = Math.min(600, Math.max(80, startH - (e.clientY - startY)));
    logHost.style.height = h + 'px';
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    localStorage.setItem(LOG_HEIGHT_KEY, String(logHost.offsetHeight));
  };
  splitter.addEventListener('pointerup', endDrag);
  splitter.addEventListener('pointercancel', endDrag);

  return { root, editorHost, canvas, canvasHost, controlsHost, logHost, statusHost, moneyHost };
}

export interface GameViewCallbacks {
  renderer: Renderer;
  onStatus: (text: string) => void;
  onLog: (lines: string[]) => void;
  onEnd: (result: GameResult) => void;
  /** Top-left money display element (updated per snapshot; combat mode shows both players' money). */
  moneyEl?: HTMLElement;
}

/** Apply the event stream to the UI (render snapshots / turn count / log / end). */
export class GameView {
  private snapshot: SnapshotState | null = null;

  constructor(private cb: GameViewCallbacks) {}

  reset(): void {
    this.snapshot = null;
    this.cb.renderer.clear();
  }

  get lastSnapshot(): SnapshotState | null {
    return this.snapshot;
  }

  apply(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'turn':
          this.cb.onStatus(`回合 ${e.turn}`);
          break;
        case 'snapshot':
          this.snapshot = e.state;
          this.cb.renderer.render(e.state);
          this.cb.onStatus(`${e.state.turn} / ${e.state.maxTurns}`);
          if (this.cb.moneyEl) {
            const ps = e.state.players;
            if (e.state.mode === 'combat' && ps.length >= 2) {
              // Combat mode: own money in default gold, opponent's money in light red ("对方: xxx").
              this.cb.moneyEl.replaceChildren(
                icon('coin', 14),
                el('span', { class: 'money-own', text: ' 我方 ' }),
                el('span', { text: String(ps[0].money) }),
                el('span', { text: ' · ' }),
                el('span', { class: 'money-enemy', text: `对方: ${ps[1].money}` })
              );
            } else {
              this.cb.moneyEl.replaceChildren(icon('coin', 14), el('span', { text: ` ${ps[0]?.money ?? 0}` }));
            }
          }
          break;
        case 'log':
          this.cb.onLog(e.lines);
          break;
        case 'move':
          // Drone move transition animation.
          this.cb.renderer.animateDrone(e.drone, e.from, e.to);
          break;
        case 'water':
          this.cb.renderer.tileFx('water', e.pos[0], e.pos[1]);
          break;
        case 'harvest':
          this.cb.renderer.tileFx('harvest', e.pos[0], e.pos[1]);
          break;
        case 'intercept':
          this.cb.renderer.tileFx('intercept', e.pos[0], e.pos[1]);
          break;
        case 'charge':
          this.cb.renderer.chargeFxOn(e.drone);
          break;
        case 'fertilize':
          this.cb.renderer.tileFx('fertilize', e.pos[0], e.pos[1]);
          break;
        case 'invalid-op':
          this.cb.onLog([`[警告] 无人机 #${e.drone} 操作无效: ${e.message}`]);
          break;
        case 'move-blocked':
          this.cb.onLog([
            `[警告] 无人机 #${e.drone} 移动失败 (目标 ${JSON.stringify(e.to)}): ${e.reason === 'occupied' ? '目标格已被占据' : '目标越界'}`,
          ]);
          break;
        case 'end':
          this.cb.onEnd(e.result);
          break;
      }
    }
  }
}

export function controlButton(label: string, onClick: () => void, opts: Record<string, unknown> = {}): HTMLButtonElement {
  return button(label, onClick, { class: 'btn', ...opts });
}
