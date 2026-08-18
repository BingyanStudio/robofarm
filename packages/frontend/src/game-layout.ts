// 游戏页面的通用布局与事件应用器 (单人 / 模拟竞技 / 多人对战共用)。
import { el, button } from './ui';
import type { GameEvent, GameResult, SnapshotState } from '@robofarm/shared';
import { Renderer } from './renderer';

export const DEFAULT_CODE = `// RoboFarm 玩家程序
// 每回合, run(droneId) 会被调用一次 (droneId 为你的无人机编号),
// 返回一个操作类实例即可控制无人机:
//   new Move([x, y])                    移动 (仅限周围 8 格)
//   new Plant('strawberry')             种植 (当前格)
//   new CollectWater()                  取水 (需在池塘上)
//   new Water()                         浇水 (当前格作物缺水时)
//   new Harvest()                       收获 (当前格作物成熟时)
//   new Clear()                         铲除 (当前格作物)
//   new Intercept([x, y])               拦截 (竞技模式)
// 可用的 API: getSelf() / getGame() / getMap() / getTile(p) /
//             getCrop(p) / getDrone(p)
function run(droneId: number) {
  const g = getGame();
  // 示例: 先移动到旁边的格子, 再返回原地
  if (g.turn === 1) return new Move([2, 2]);
  if (g.turn === 2) return new Move([3, 3]);
  return null;
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
  /** 左上角的金钱显示 (由 GameView 随快照更新) */
  moneyHost: HTMLElement;
}

/** 构建标准游戏布局: 左侧编辑区 (35%) / 右侧画布 / 底部日志 (高度可拖拽调节) */
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
  // 代码区 / 游戏区之间的竖向拖拽手柄
  const vSplitter = el('div', { class: 'game-splitter-v', title: '拖拽调整代码区宽度' });
  root.append(
    editorHost,
    vSplitter,
    el('div', { class: 'game-main' }, [canvasHost, controlsHost, splitter, logHost])
  );

  // 代码区宽度可拖拽调节, 并记住上次的值 (持久化为 px, 加载时也按 px 应用)
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

  // 日志高度可拖拽调节, 并记住上次的值
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
  /** 左上角金钱显示元素 (随快照更新; 竞技模式同时显示双方金钱) */
  moneyEl?: HTMLElement;
}

/** 将事件流应用到 UI (渲染快照 / 回合计数 / 日志 / 结束) */
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
            this.cb.moneyEl.textContent =
              e.state.mode === 'combat' && ps.length >= 2
                ? `💰 我方 ${ps[0].money} · 对方 ${ps[1].money}`
                : `💰 ${ps[0]?.money ?? 0}`;
          }
          break;
        case 'log':
          this.cb.onLog(e.lines);
          break;
        case 'move':
          // 无人机移动过渡动画
          this.cb.renderer.animateDrone(e.drone, e.from, e.to);
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
