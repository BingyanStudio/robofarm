// Game turn runner: wraps the full "compile -> start -> step/pause/speed -> end" loop
// shared by single-player farming and sim-combat.
// Screen-specific differences (code source / editor lock / end display) are injected via option callbacks to avoid duplicate implementation.
import {
  GameController,
  isCompilerInitialized,
  DEFAULT_MAX_TURNS,
  TURN_INTERVALS_MS,
  GameResult,
  WorldState,
  snapshotOf,
} from '@robofarm/shared';
import { BrowserProgram } from './browser-program';
import { createGameLayout, GameLayout, GameView } from './game-layout';
import { Renderer } from './renderer';
import { el, button } from '../ui/ui';

export interface BuiltGame {
  controller: GameController;
  /** Program instances to dispose with the match (disposed uniformly by the runner). */
  programs: BrowserProgram[];
}

export interface GameRunnerOptions {
  title: string;
  /** Map preview before start (single-player / combat initial world). */
  previewWorld: () => WorldState;
  /** Compile editor code and build the match; returning null means compile/load failed (log the reason yourself). */
  buildGame: (log: (line: string) => void) => Promise<BuiltGame | null>;
  /** Lock/unlock the code editor. */
  setEditorLocked: (locked: boolean) => void;
  /** Log message shown when a new match starts. */
  gameStartLog: string;
  /** Match-end display (finished / error). The runner already unlocked the editor and refreshed button state. */
  onEnd: (result: GameResult) => void;
}

export class GameRunner {
  /** Full game layout (screen mounts editor / lock bar etc. onto it). */
  readonly layout: GameLayout;
  /** Turn status text (screen logic such as end popups can read/rewrite it). */
  readonly statusText: HTMLElement;
  private readonly view: GameView;
  private readonly logBox: HTMLElement;
  private readonly SPEED_LABELS = ['速度: 正常', '速度: ×2', '速度: ×4', '速度: ×8'];
  private readonly btnStartStop: HTMLButtonElement;
  private readonly btnPause: HTMLButtonElement;
  private readonly btnStep: HTMLButtonElement;
  private readonly btnSpeed: HTMLButtonElement;

  private controller: GameController | null = null;
  private programs: BrowserProgram[] = [];
  private playing = false;
  private speedIdx = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** On first Start click esbuild is fetched remotely; disable start/step buttons until compile finishes. */
  private compiling = false;

  constructor(private opts: GameRunnerOptions) {
    this.layout = createGameLayout(opts.title);
    const renderer = new Renderer(this.layout.canvas);
    const logBox = el('div', { class: 'log-box' });
    this.layout.logHost.append(logBox);
    this.logBox = logBox;

    this.statusText = el('span', { class: 'status-text', text: `回合 0 / ${DEFAULT_MAX_TURNS}` });
    this.layout.statusHost.append(this.statusText);

    this.view = new GameView({
      renderer,
      onStatus: (t) => (this.statusText.textContent = t),
      onLog: (lines) => this.appendLog(lines),
      onEnd: (result) => this.handleEnd(result),
      moneyEl: this.layout.moneyHost,
    });

    // Show map preview before starting.
    this.view.apply([{ type: 'snapshot', state: snapshotOf(opts.previewWorld()) }]);
    this.statusText.textContent = `回合 0 / ${DEFAULT_MAX_TURNS}`;

    this.btnStartStop = button('开始', () => void this.onStartStop());
    this.btnPause = button('暂停', () => this.togglePause());
    this.btnStep = button('步进', () => void this.onStep());
    this.btnSpeed = button('速度: 正常', () => {
      this.speedIdx = (this.speedIdx + 1) % this.SPEED_LABELS.length;
      this.btnSpeed.textContent = this.SPEED_LABELS[this.speedIdx];
    });
    this.layout.controlsHost.append(this.btnStartStop, this.btnPause, this.btnStep, this.btnSpeed);
    this.updatePauseButton();
  }

  /** Append an extra button to the controls bar (e.g. the "提交" button in single-player mode). */
  addControl(btn: HTMLElement): void {
    this.layout.controlsHost.append(btn);
  }

  appendLog(lines: string[]): void {
    for (const line of lines) {
      this.logBox.append(el('div', { class: 'log-line', text: line }));
    }
    while (this.logBox.children.length > 300) this.logBox.firstElementChild?.remove();
    this.logBox.scrollTop = this.logBox.scrollHeight;
  }

  log(line: string): void {
    this.appendLog([line]);
  }

  stopGame(): void {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const p of this.programs) p.dispose();
    this.programs = [];
    this.controller = null;
    this.updateStartStop();
    this.updatePauseButton();
  }

  /** Stop the game and allow editing code (back to initial map preview). */
  stopForEdit(): void {
    this.stopGame();
    this.opts.setEditorLocked(false);
    this.view.apply([{ type: 'snapshot', state: snapshotOf(this.opts.previewWorld()) }]);
    this.statusText.textContent = `回合 0 / ${DEFAULT_MAX_TURNS}`;
    this.log('[系统] 游戏已停止, 可以修改代码');
  }

  /** Combined start/stop button: red "停止" while a match is running, otherwise green "开始"; disabled while compiling. */
  private updateStartStop(): void {
    const running = this.controller !== null && !this.controller.over;
    this.btnStartStop.disabled = this.compiling;
    this.btnStartStop.textContent = this.compiling ? '编译中…' : running ? '停止' : '开始';
    this.btnStartStop.classList.toggle('btn-stop', running && !this.compiling);
    this.btnStartStop.classList.toggle('btn-start', !running && !this.compiling);
  }

  /** Pause/resume button: shows "暂停" while playing, "继续" when paused/stepping; disabled when no match. */
  private updatePauseButton(): void {
    const active = this.controller !== null && !this.controller.over;
    this.btnPause.textContent = active ? (this.playing ? '暂停' : '继续') : '暂停';
    this.btnPause.disabled = !active;
  }

  /** Toggle play/pause mode (only for a running match). */
  private togglePause(): void {
    if (!this.controller || this.controller.over) return;
    this.playing = !this.playing;
    if (this.playing) {
      this.scheduleNext();
    } else if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.updatePauseButton();
  }

  /** Combined button: compile and start a new match when idle, otherwise stop and allow editing. */
  private async onStartStop(): Promise<void> {
    if (this.compiling) return; // Disallow re-click while compiling.
    if (this.controller && !this.controller.over) {
      this.stopForEdit();
      return;
    }
    this.compiling = true;
    this.updateStartStop();
    try {
      await this.newGame(true);
    } finally {
      this.compiling = false;
      this.updateStartStop();
    }
  }

  private async newGame(autoPlay: boolean): Promise<void> {
    this.stopGame();
    // First compile downloads the compiler (esbuild.wasm); log this event explicitly.
    this.log(
      isCompilerInitialized() ? '[系统] 正在编译代码…' : '[系统] 首次编译, 正在下载编译器…'
    );
    const built = await this.opts.buildGame((line) => this.log(line));
    if (!built) {
      this.opts.setEditorLocked(false);
      return;
    }
    this.programs = built.programs;
    this.controller = built.controller;
    // Immediately render the initial map (scene visible even without restart/step playback).
    this.view.apply([{ type: 'snapshot', state: snapshotOf(this.controller.world) }]);
    this.statusText.textContent = `回合 0 / ${DEFAULT_MAX_TURNS}`;
    this.log(this.opts.gameStartLog);
    this.opts.setEditorLocked(true);
    this.updateStartStop();
    if (autoPlay) {
      this.playing = true;
      this.scheduleNext();
    }
    this.updatePauseButton();
  }

  private async stepOnce(): Promise<void> {
    if (!this.controller || this.controller.over) {
      this.playing = false;
      return;
    }
    this.view.apply(await this.controller.step());
  }

  private scheduleNext(delay: number = TURN_INTERVALS_MS[this.speedIdx]): void {
    if (!this.playing) return;
    if (this.timer) clearTimeout(this.timer);
    // Wait until the current turn (including player code execution) fully finishes before the next turn, preventing overlap.
    this.timer = setTimeout(async () => {
      const t0 = performance.now();
      await this.stepOnce();
      const dur = performance.now() - t0;
      if (this.playing && this.controller && !this.controller.over) {
        const interval = TURN_INTERVALS_MS[this.speedIdx];
        // ×8: inter-turn delay is the max of 0.1s and actual program execution time (timed from this turn's start).
        const next = this.speedIdx >= 3 ? Math.max(interval - dur, 0) : interval;
        this.scheduleNext(next);
      }
    }, delay);
  }

  private handleEnd(result: GameResult): void {
    this.playing = false;
    // Game over, unlock code editing.
    this.opts.setEditorLocked(false);
    this.updateStartStop();
    this.updatePauseButton();
    this.opts.onEnd(result);
  }

  /** Step: compile and create a match first if none exists, then run 1 turn (paused after creation). */
  private async onStep(): Promise<void> {
    if (this.compiling) return; // Disallow while compiling.
    this.playing = false;
    if (!this.controller) {
      await this.newGame(false);
    }
    await this.stepOnce();
    this.updatePauseButton();
  }
}
