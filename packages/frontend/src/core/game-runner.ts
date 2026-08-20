// Game turn runner: wraps the full "compile -> start -> step/pause/speed -> end" loop
// shared by single-player farming and sim-combat.
// Screen-specific differences (code source / editor lock / end display) are injected via option callbacks to avoid duplicate implementation.
import {
  GameController,
  compilerState,
  DEFAULT_MAX_TURNS,
  TURN_INTERVALS_MS,
  GameResult,
  WorldState,
  snapshotOf,
} from '@robofarm/shared';
import type { GameEvent } from '@robofarm/shared';
import { BrowserProgram } from './browser-program';
import { createGameLayout, GameLayout, GameView } from './game-layout';
import { Renderer } from './renderer';
import { el, button } from '../ui/ui';
import { icon } from '../ui/icon';
import { statsFromEvents, GameStats } from './stats';

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
  /** 对局统计回调 (本地运行结束时, 携带本局全部事件计算出的统计)。 */
  onStats?: (stats: GameStats) => void;
  /** 玩家名称 (统计图例用; 默认 ['玩家']) */
  playerNames?: string[];
  /** 每回合结束后回调 (回放录制等; round = 刚执行的回合号, 1..maxTurns) */
  onTurn?: (events: GameEvent[], round: number) => void;
  /** 一次性把全部回合模拟完成 (而不是随真实时间逐回合计算), 完成后进度条可拖拽到任意已模拟的回合。 */
  precompute?: boolean;
}

export class GameRunner {
  /** Full game layout (screen mounts editor / lock bar etc. onto it). */
  readonly layout: GameLayout;
  /** Turn status text (screen logic such as end popups can read/rewrite it). */
  readonly statusText: HTMLElement;
  private readonly view: GameView;
  private readonly renderer: Renderer;
  private readonly logBox: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressLabel: HTMLElement;
  /** Snapshots per turn (index 0 = initial preview), used by the progress scrubber. */
  private snapshots: import('@robofarm/shared').SnapshotState[] = [];
  /** Per-turn event group (index i = events for turn i+1), same shape controller.step() returns; only filled in precompute mode. */
  private turnEvents: GameEvent[][] = [];
  /** Currently displayed turn (0 = not started, N = N turns completed). */
  private curIndex = 0;
  /** Whether this runner simulates every turn up front instead of pacing them in real time. */
  private readonly precompute: boolean;
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
  /** 本局全部事件 (用于结束时计算统计) */
  private statsEvents: GameEvent[] = [];
  /**
   * Whether the current match's end has been shown to the user (handleEnd fired).
   * In precompute mode `controller.over` flips true as soon as simulation finishes, well before
   * playback/scrubbing reaches the final frame, so button/lock state must track this instead.
   */
  private finished = true;

  constructor(private opts: GameRunnerOptions) {
    this.precompute = !!opts.precompute;
    this.layout = createGameLayout(opts.title);
    const renderer = new Renderer(this.layout.canvas);
    this.renderer = renderer;
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
    const preview = snapshotOf(opts.previewWorld());
    this.snapshots = [preview];
    this.view.apply([{ type: 'snapshot', state: preview }]);
    this.statusText.textContent = `回合 0 / ${DEFAULT_MAX_TURNS}`;

    this.btnStartStop = button('开始', () => void this.onStartStop(), { class: 'btn btn-start' });
    this.btnPause = button('暂停', () => this.togglePause());
    this.btnStep = button('步进', () => void this.onStep());
    this.btnSpeed = button('速度: 正常', () => {
      this.speedIdx = (this.speedIdx + 1) % this.SPEED_LABELS.length;
      this.btnSpeed.textContent = this.SPEED_LABELS[this.speedIdx];
    });

    // Draggable turn scrubber (mirrors the replay player): pauses the sim and jumps to a past snapshot.
    this.progressFill = el('div', { class: 'game-progress-fill' });
    const progressTrack = el('div', { class: 'game-progress-track' }, [this.progressFill]);
    this.progressLabel = el('span', { class: 'game-progress-label', text: `0 / ${DEFAULT_MAX_TURNS}` });
    const progress = el('div', { class: 'game-progress' }, [progressTrack, this.progressLabel]);
    const seekFromEvent = (clientX: number): void => {
      const rect = progressTrack.getBoundingClientRect();
      const ratio = rect.width ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
      this.seek(Math.round(ratio * (this.snapshots.length - 1)));
    };
    progressTrack.addEventListener('click', (ev) => seekFromEvent(ev.clientX));
    progressTrack.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      seekFromEvent(ev.clientX);
      const move = (e: PointerEvent) => seekFromEvent(e.clientX);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    this.layout.controlsHost.append(this.btnStartStop, this.btnPause, this.btnStep, this.btnSpeed, progress);
    this.updatePauseButton();
    this.syncProgress();
  }

  /** Jump the scrubber to an already-played turn, re-rendering that snapshot without advancing the game. */
  private seek(index: number): void {
    if (!this.controller || index < 0 || index >= this.snapshots.length) return;
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.curIndex = index;
    const snap = this.snapshots[index];
    this.renderer.render(snap);
    this.statusText.textContent = `回合 ${snap.turn} / ${snap.maxTurns}`;
    this.layout.moneyHost.replaceChildren(icon('coin', 14), el('span', { text: ` ${snap.players[0]?.money ?? 0}` }));
    this.updatePauseButton();
    this.syncProgress();
  }

  private syncProgress(): void {
    const maxTurns = this.controller?.world.maxTurns ?? this.opts.previewWorld().maxTurns;
    const ratio = maxTurns ? this.curIndex / maxTurns : 0;
    this.progressFill.style.width = `${Math.min(1, ratio) * 100}%`;
    this.progressLabel.textContent = `${this.curIndex} / ${maxTurns}`;
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
    this.finished = true;
    this.updateStartStop();
    this.updatePauseButton();
  }

  /** Stop the game and allow editing code (back to initial map preview). */
  stopForEdit(): void {
    this.stopGame();
    this.opts.setEditorLocked(false);
    const preview = snapshotOf(this.opts.previewWorld());
    this.snapshots = [preview];
    this.turnEvents = [];
    this.curIndex = 0;
    this.view.apply([{ type: 'snapshot', state: preview }]);
    this.statusText.textContent = `回合 0 / ${DEFAULT_MAX_TURNS}`;
    this.syncProgress();
    this.log('[系统] 游戏已停止, 可以修改代码');
  }

  /** Combined start/stop button: red "停止" while a match is running, otherwise green "开始"; disabled while compiling. */
  private updateStartStop(): void {
    const running = this.controller !== null && !this.finished;
    this.btnStartStop.disabled = this.compiling;
    this.btnStartStop.textContent = this.compiling ? '编译中…' : running ? '停止' : '开始';
    this.btnStartStop.classList.toggle('btn-stop', running && !this.compiling);
    this.btnStartStop.classList.toggle('btn-start', !running && !this.compiling);
  }

  /** Pause/resume button: shows "暂停" while playing, "继续" when paused/stepping; disabled when no match. */
  private updatePauseButton(): void {
    const active = this.controller !== null && !this.finished;
    this.btnPause.textContent = active ? (this.playing ? '暂停' : '继续') : '暂停';
    this.btnPause.disabled = !active;
  }

  /** Toggle play/pause mode (only for a running match). */
  private togglePause(): void {
    if (!this.controller || this.finished) return;
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
    if (this.controller && !this.finished) {
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
    this.statsEvents = [];
    this.turnEvents = [];
    // Compiler downloads in the background since page load (prewarm); log the actual state.
    const st = compilerState();
    this.log(
      st === 'ready'
        ? '[系统] 正在编译代码…'
        : st === 'loading'
          ? '[系统] 正在下载编译器…'
          : '[系统] 首次编译, 正在下载编译器…'
    );
    const built = await this.opts.buildGame((line) => this.log(line));
    if (!built) {
      this.opts.setEditorLocked(false);
      return;
    }
    this.programs = built.programs;
    this.controller = built.controller;
    this.finished = false;
    // Immediately reflect the initial map (scene visible even without restart/step playback).
    const initial = snapshotOf(this.controller.world);
    this.snapshots = [initial];
    this.curIndex = 0;
    this.view.apply([{ type: 'snapshot', state: initial }]);
    this.statusText.textContent = `回合 0 / ${DEFAULT_MAX_TURNS}`;
    this.log(this.opts.gameStartLog);
    this.opts.setEditorLocked(true);
    this.updateStartStop();
    if (this.precompute) {
      // Run every turn to completion up front (no per-turn pacing), so the scrubber can jump to any
      // already-simulated turn immediately instead of only turns played so far in real time.
      this.log('[系统] 正在模拟全部回合…');
      await this.runFullSimulation();
      this.log(`[系统] 模拟完成, 共 ${this.turnEvents.length} 回合, 可拖拽进度条查看任意回合`);
      this.syncProgress();
    }
    if (autoPlay) {
      this.playing = true;
      this.scheduleNext();
    }
    this.updatePauseButton();
    this.syncProgress();
  }

  /** Precompute mode: step the controller to completion silently, collecting every turn's snapshot + events. */
  private async runFullSimulation(): Promise<void> {
    const controller = this.controller;
    if (!controller) return;
    while (!controller.over) {
      const events = await controller.step();
      this.statsEvents.push(...events);
      this.turnEvents.push(events);
      for (const e of events) if (e.type === 'snapshot') this.snapshots.push(e.state);
    }
  }

  private async stepOnce(): Promise<void> {
    if (!this.controller || this.controller.over) {
      this.playing = false;
      return;
    }
    const events = await this.controller.step();
    this.statsEvents.push(...events);
    this.opts.onTurn?.(events, this.controller.world.turn);
    for (const e of events) if (e.type === 'snapshot') this.snapshots.push(e.state);
    this.curIndex = this.snapshots.length - 1;
    this.view.apply(events);
    this.syncProgress();
  }

  /** Precompute mode: advance the display by one already-simulated turn (no computation, just replays that turn's events). */
  private advanceDisplay(): boolean {
    if (this.curIndex >= this.snapshots.length - 1) return false;
    this.curIndex++;
    const events = this.turnEvents[this.curIndex - 1];
    if (events) this.view.apply(events);
    this.syncProgress();
    return true;
  }

  private scheduleNext(delay: number = TURN_INTERVALS_MS[this.speedIdx]): void {
    if (!this.playing) return;
    if (this.timer) clearTimeout(this.timer);
    if (this.precompute) {
      // Everything is already simulated; playback just paces through the precomputed timeline.
      this.timer = setTimeout(() => {
        const moved = this.advanceDisplay();
        if (!moved) {
          this.playing = false;
          this.updatePauseButton();
          return;
        }
        if (this.playing) this.scheduleNext();
      }, delay);
      return;
    }
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
    this.finished = true;
    // Game over, unlock code editing.
    this.opts.setEditorLocked(false);
    this.updateStartStop();
    this.updatePauseButton();
    this.opts.onEnd(result);
    // 统计弹窗 (在结算弹窗之上)
    this.opts.onStats?.(
      statsFromEvents(this.statsEvents, this.opts.playerNames ?? ['玩家'])
    );
  }

  /** Step: compile and create a match first if none exists, then advance 1 turn (paused after creation). */
  private async onStep(): Promise<void> {
    if (this.compiling) return; // Disallow while compiling.
    this.playing = false;
    const hadController = !!this.controller;
    if (!hadController) {
      await this.newGame(false);
    }
    if (this.precompute) {
      // First step after a fresh compile already lands on turn 0 (newGame's initial render); advance to turn 1.
      this.advanceDisplay();
    } else {
      await this.stepOnce();
    }
    this.updatePauseButton();
  }
}
