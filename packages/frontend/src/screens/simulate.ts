// 模拟竞技: 本机同时运行敌我双方代码 (双方各自坐标系), 模拟对战。
import { BrowserProgram } from '../browser-program';
import { GameController, compilePlayerCode, createCombatWorld, snapshotOf, DEFAULT_MAX_TURNS, TURN_INTERVALS_MS, GameResult } from '@robofarm/shared';
import { createGameLayout, DEFAULT_CODE, GameView } from '../game-layout';
import { createEditor } from '../editor';
import { Renderer } from '../renderer';
import { el, button, modal, topBar } from '../ui';
import type { EditorHandle } from '../editor';

const KEY_ME = 'robofarm.simulate.me';
const KEY_ENEMY = 'robofarm.simulate.enemy';

export function simulateScreen(root: HTMLElement): void {
  root.replaceChildren();
  const layout = createGameLayout('模拟竞技 · 敌我双方代码在本机对战');
  const renderer = new Renderer(layout.canvas);
  const logBox = el('div', { class: 'log-box' });
  layout.logHost.append(logBox);

  root.append(topBar(), layout.root);

  // 双 Tab 编辑器
  const tabs = el('div', { class: 'tabs' });
  const tabMe = el('button', { class: 'tab active', text: '我方无人机' });
  const tabEnemy = el('button', { class: 'tab', text: '对方无人机' });
  tabs.append(tabMe, tabEnemy);
  layout.editorHost.append(tabs);

  const editorHost = el('div', { class: 'editor-host' });
  layout.editorHost.append(editorHost);
  const editors: Partial<Record<'me' | 'enemy', EditorHandle>> = {};

  // 游戏进行中的代码锁定提示条 + 停止按钮
  const lockBar = el('div', { class: 'editor-lock-bar', style: 'display:none' }, [
    el('span', { text: '🔒 游戏进行中, 代码已锁定' }),
    button('停止游戏', () => stopForEdit(), { class: 'btn btn-small' }),
  ]);
  layout.editorHost.append(lockBar);

  function ensureEditor(tab: 'me' | 'enemy'): void {
    if (editors[tab]) return;
    const key = tab === 'me' ? KEY_ME : KEY_ENEMY;
    editors[tab] = createEditor(editorHost, {
      initial: localStorage.getItem(key) ?? DEFAULT_CODE,
      onChange: (v) => localStorage.setItem(key, v),
    });
  }
  function showTab(tab: 'me' | 'enemy'): void {
    tabMe.classList.toggle('active', tab === 'me');
    tabEnemy.classList.toggle('active', tab === 'enemy');
    editorHost.replaceChildren();
    ensureEditor(tab);
    editorHost.append(editors[tab]!.dom);
  }
  tabMe.onclick = () => showTab('me');
  tabEnemy.onclick = () => showTab('enemy');
  showTab('me');

  let controller: GameController | null = null;
  let programs: BrowserProgram[] = [];
  let playing = false;
  let speedIdx = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // 速度档位标签, 与 TURN_INTERVALS_MS 对齐 (0 正常 / 1 两倍 / 2 四倍 / 3 八倍)
  const SPEED_LABELS = ['速度: 正常', '速度: ×2', '速度: ×4', '速度: ×8'];

  const statusText = el('span', { class: 'status-text', text: '回合 0 / 300' });
  layout.statusHost.append(statusText);

  const view = new GameView({
    renderer,
    onStatus: (t) => (statusText.textContent = t),
    onLog: (lines) => appendLog(lines),
    onEnd: (result) => handleEnd(result),
    moneyEl: layout.moneyHost,
  });

  // 未开始前也先展示地图 (竞技地图: 双方无人机在各自出生点)
  view.apply([{ type: 'snapshot', state: snapshotOf(createCombatWorld(DEFAULT_MAX_TURNS)) }]);
  statusText.textContent = '回合 0 / 300';

  function appendLog(lines: string[]): void {
    for (const line of lines) {
      logBox.append(el('div', { class: 'log-line', text: line }));
    }
    while (logBox.children.length > 300) logBox.firstElementChild?.remove();
    logBox.scrollTop = logBox.scrollHeight;
  }

  function stopGame(): void {
    playing = false;
    if (timer) clearTimeout(timer);
    timer = null;
    for (const p of programs) p.dispose();
    programs = [];
    controller = null;
    updateStartStop();
    updatePauseButton();
  }

  /** 开始/停止合并按钮: 有进行中的对局显示红色"停止", 否则显示绿色"开始" */
  function updateStartStop(): void {
    const running = controller !== null && !controller.over;
    btnStartStop.textContent = running ? '停止' : '开始';
    btnStartStop.classList.toggle('btn-stop', running);
    btnStartStop.classList.toggle('btn-start', !running);
  }

  /** 暂停/继续按钮: 播放中显示"暂停", 暂停/步进模式显示"继续"; 无对局时禁用 */
  function updatePauseButton(): void {
    const active = controller !== null && !controller.over;
    btnPause.textContent = active ? (playing ? '暂停' : '继续') : '暂停';
    btnPause.disabled = !active;
  }

  /** 切换播放/暂停模式 (仅对进行中的对局有效) */
  function togglePause(): void {
    if (!controller || controller.over) return;
    playing = !playing;
    if (playing) {
      scheduleNext();
    } else if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    updatePauseButton();
  }

  /** 合并按钮: 未开始时编译并开始新对局, 进行中则停止并允许修改代码 */
  async function onStartStop(): Promise<void> {
    if (controller && !controller.over) {
      stopForEdit();
      return;
    }
    await newGame(true);
  }

  /** 锁定/解锁代码编辑器 (游戏进行中锁定) */
  function setEditorLocked(locked: boolean): void {
    for (const key of ['me', 'enemy'] as const) {
      editors[key]?.setReadOnly(locked);
    }
    lockBar.style.display = locked ? 'flex' : 'none';
  }

  /** 停止游戏并允许修改代码 (回到初始地图预览) */
  function stopForEdit(): void {
    stopGame();
    setEditorLocked(false);
    view.apply([{ type: 'snapshot', state: snapshotOf(createCombatWorld(DEFAULT_MAX_TURNS)) }]);
    statusText.textContent = '回合 0 / 300';
    appendLog(['[系统] 游戏已停止, 可以修改代码']);
  }

  async function newGame(autoPlay: boolean): Promise<void> {
    stopGame();
    ensureEditor('me');
    ensureEditor('enemy');
    const codeA = editors.me!.getValue();
    const codeB = editors.enemy!.getValue();
    const [a, b] = await Promise.all([compilePlayerCode(codeA), compilePlayerCode(codeB)]);
    if (!a.ok) {
      setEditorLocked(false);
      return reportCompileError('我方', a.errors);
    }
    if (!b.ok) {
      setEditorLocked(false);
      return reportCompileError('对方', b.errors);
    }
    try {
      const programA = await BrowserProgram.create(a.js);
      const programB = await BrowserProgram.create(b.js);
      programs = [programA, programB];
      controller = new GameController({
        mode: 'combat',
        players: [
          { name: '我方', frame: 'normal', program: programA },
          { name: '对方', frame: 'mirror', program: programB },
        ],
        maxTurns: DEFAULT_MAX_TURNS,
      });
    } catch (err) {
      setEditorLocked(false);
      appendLog([`[错误] ${err instanceof Error ? err.message : String(err)}`]);
      return;
    }
    // 立即渲染初始地图 (重启/步进未播放时也能看到场景)
    view.apply([{ type: 'snapshot', state: snapshotOf(controller.world) }]);
    statusText.textContent = '回合 0 / 300';
    appendLog(['[系统] 新对局开始 (我方为左侧, 对方为镜像视角)']);
    setEditorLocked(true);
    updateStartStop();
    if (autoPlay) {
      playing = true;
      scheduleNext();
    }
    updatePauseButton();
  }

  function reportCompileError(who: string, errors: { message: string; line?: number }[]): void {
    for (const e of errors) {
      appendLog([`[编译错误 ${who}]${e.line ? ` 第 ${e.line} 行` : ''}: ${e.message}`]);
    }
  }

  async function stepOnce(): Promise<void> {
    if (!controller || controller.over) {
      playing = false;
      return;
    }
    view.apply(await controller.step());
  }

  function scheduleNext(delay: number = TURN_INTERVALS_MS[speedIdx]): void {
    if (!playing) return;
    if (timer) clearTimeout(timer);
    // 先等当前回合 (含双方代码执行) 彻底结束后再进入下一回合, 防止回合重叠
    timer = setTimeout(async () => {
      const t0 = performance.now();
      await stepOnce();
      const dur = performance.now() - t0;
      if (playing && controller && !controller.over) {
        const interval = TURN_INTERVALS_MS[speedIdx];
        // ×8: 回合间延迟取 0.1s 与程序实际执行时间的最大值 (自本回合开始计时)
        const next = speedIdx >= 3 ? Math.max(interval - dur, 0) : interval;
        scheduleNext(next);
      }
    }, delay);
  }

  function handleEnd(result: GameResult): void {
    playing = false;
    // 游戏结束, 解锁代码编辑
    setEditorLocked(false);
    updateStartStop();
    updatePauseButton();
    if (result.type === 'finished') {
      const [s0, s1] = result.scores;
      const winner = s0.money > s1.money ? '我方' : s1.money > s0.money ? '对方' : '平局';
      statusText.textContent = `对局结束 · 胜者: ${winner}`;
      appendLog([`[系统] 对局结束: 我方 ${s0.money} vs 对方 ${s1.money}, 胜者: ${winner}`]);
      modal(
        '对局结束',
        el('div', {}, [
          el('p', { text: `我方 ${s0.money} vs 对方 ${s1.money}` }),
          el('p', { class: 'hint', text: `胜者: ${winner}` }),
        ])
      );
    } else {
      statusText.textContent = '对局中止';
      appendLog([`[错误] ${result.message}`]);
      modal('对局中止', el('p', { text: result.message }));
    }
  }

  const btnStartStop = button('开始', () => void onStartStop());
  const btnPause = button('暂停', () => togglePause());
  const btnStep = button('步进', () => void onStep());
  const btnSpeed = button('速度: 正常', () => {
    speedIdx = (speedIdx + 1) % SPEED_LABELS.length;
    btnSpeed.textContent = SPEED_LABELS[speedIdx];
  });
  layout.controlsHost.append(btnStartStop, btnPause, btnStep, btnSpeed);
  updatePauseButton();

  /** 步进: 没有对局时先编译并创建, 再运行 1 回合 (创建后为暂停模式) */
  async function onStep(): Promise<void> {
    playing = false;
    if (!controller) {
      await newGame(false);
    }
    await stepOnce();
    updatePauseButton();
  }
}
