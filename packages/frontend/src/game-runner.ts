// 游戏回合运行器: 封装单人种植 / 模拟竞技共用的
// "编译 → 开始 → 步进/暂停/调速 → 结束" 完整循环。
// 屏幕差异 (代码来源/编辑器锁定/结束展示) 通过选项回调注入, 避免两处重复实现。
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
import { el, button } from './ui';

export interface BuiltGame {
  controller: GameController;
  /** 需随对局释放的程序实例 (由运行器统一 dispose) */
  programs: BrowserProgram[];
}

export interface GameRunnerOptions {
  title: string;
  /** 未开始时的地图预览 (单人 / 竞技初始世界) */
  previewWorld: () => WorldState;
  /** 编译编辑器代码并构建对局; 返回 null 表示编译/加载失败 (需自行用 log 输出原因) */
  buildGame: (log: (line: string) => void) => Promise<BuiltGame | null>;
  /** 锁定/解锁代码编辑器 */
  setEditorLocked: (locked: boolean) => void;
  /** 新对局开始时的日志文案 */
  gameStartLog: string;
  /** 对局结束展示 (finished / error)。运行器已解锁编辑器并刷新按钮状态 */
  onEnd: (result: GameResult) => void;
}

export class GameRunner {
  /** 完整游戏布局 (屏幕据此挂载编辑器 / 锁定条等) */
  readonly layout: GameLayout;
  /** 回合状态文本 (结束弹窗等屏幕逻辑可读取/改写) */
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
  /** 首次点击开始时会远程拉取 esbuild, 编译完成前禁用开始/步进按钮 */
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

    // 未开始前先展示地图预览
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

  /** 在控制条追加额外按钮 (如单人模式的"提交") */
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

  /** 停止游戏并允许修改代码 (回到初始地图预览) */
  stopForEdit(): void {
    this.stopGame();
    this.opts.setEditorLocked(false);
    this.view.apply([{ type: 'snapshot', state: snapshotOf(this.opts.previewWorld()) }]);
    this.statusText.textContent = `回合 0 / ${DEFAULT_MAX_TURNS}`;
    this.log('[系统] 游戏已停止, 可以修改代码');
  }

  /** 开始/停止合并按钮: 有进行中的对局显示红色"停止", 否则显示绿色"开始"; 编译中禁用 */
  private updateStartStop(): void {
    const running = this.controller !== null && !this.controller.over;
    this.btnStartStop.disabled = this.compiling;
    this.btnStartStop.textContent = this.compiling ? '编译中…' : running ? '停止' : '开始';
    this.btnStartStop.classList.toggle('btn-stop', running && !this.compiling);
    this.btnStartStop.classList.toggle('btn-start', !running && !this.compiling);
  }

  /** 暂停/继续按钮: 播放中显示"暂停", 暂停/步进模式显示"继续"; 无对局时禁用 */
  private updatePauseButton(): void {
    const active = this.controller !== null && !this.controller.over;
    this.btnPause.textContent = active ? (this.playing ? '暂停' : '继续') : '暂停';
    this.btnPause.disabled = !active;
  }

  /** 切换播放/暂停模式 (仅对进行中的对局有效) */
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

  /** 合并按钮: 未开始时编译并开始新对局, 进行中则停止并允许修改代码 */
  private async onStartStop(): Promise<void> {
    if (this.compiling) return; // 编译中禁止再次点击
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
    // 首次编译会下载编译器 (esbuild.wasm), 在日志中明确打出该事件
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
    // 立即渲染初始地图 (重启/步进未播放时也能看到场景)
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
    // 先等当前回合 (含玩家代码执行) 彻底结束后再进入下一回合, 防止回合重叠
    this.timer = setTimeout(async () => {
      const t0 = performance.now();
      await this.stepOnce();
      const dur = performance.now() - t0;
      if (this.playing && this.controller && !this.controller.over) {
        const interval = TURN_INTERVALS_MS[this.speedIdx];
        // ×8: 回合间延迟取 0.1s 与程序实际执行时间的最大值 (自本回合开始计时)
        const next = this.speedIdx >= 3 ? Math.max(interval - dur, 0) : interval;
        this.scheduleNext(next);
      }
    }, delay);
  }

  private handleEnd(result: GameResult): void {
    this.playing = false;
    // 游戏结束, 解锁代码编辑
    this.opts.setEditorLocked(false);
    this.updateStartStop();
    this.updatePauseButton();
    this.opts.onEnd(result);
  }

  /** 步进: 没有对局时先编译并创建, 再运行 1 回合 (创建后为暂停模式) */
  private async onStep(): Promise<void> {
    if (this.compiling) return; // 编译中禁止
    this.playing = false;
    if (!this.controller) {
      await this.newGame(false);
    }
    await this.stepOnce();
    this.updatePauseButton();
  }
}
