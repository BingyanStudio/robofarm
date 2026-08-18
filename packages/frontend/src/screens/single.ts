// 单人模式: 本地执行玩家代码, 支持开始/步进/重启/调速, 可提交到服务器验证。
import { BrowserProgram } from '../browser-program';
import {
  GameController,
  compilePlayerCode,
  createSingleWorld,
  snapshotOf,
  DEFAULT_MAX_TURNS,
  TURN_INTERVALS_MS,
  GameResult,
} from '@robofarm/shared';
import { createGameLayout, DEFAULT_CODE, GameView } from '../game-layout';
import { createEditor } from '../editor';
import { Renderer } from '../renderer';
import { el, button, modal, toast, topBar, sleep } from '../ui';
import { api, fetchUser } from '../net';

const CODE_KEY = 'robofarm.single';

export function singleScreen(root: HTMLElement): void {
  root.replaceChildren();
  const layout = createGameLayout('单人模式 · 在限定回合内赚取最多金钱');
  const renderer = new Renderer(layout.canvas);
  const logBox = el('div', { class: 'log-box' });
  layout.logHost.append(logBox);

  let userBox = el('span', { class: 'user-chip', text: '…' });
  root.append(
    topBar([
      userBox,
      button('👑 排行榜', () => showLeaderboard(), { class: 'btn btn-gold' }),
      button('我的成绩', () => showHistory()),
    ]),
    layout.root
  );

  // 游戏进行中的代码锁定提示条 + 停止按钮
  const lockBar = el('div', { class: 'editor-lock-bar', style: 'display:none' }, [
    el('span', { text: '🔒 游戏进行中, 代码已锁定' }),
    button('停止游戏', () => stopForEdit(), { class: 'btn btn-small' }),
  ]);
  layout.editorHost.append(lockBar);

  const editor = createEditor(layout.editorHost, {
    initial: localStorage.getItem(CODE_KEY) ?? DEFAULT_CODE,
    onChange: (v) => localStorage.setItem(CODE_KEY, v),
  });

  let controller: GameController | null = null;
  let programs: BrowserProgram[] = [];
  let playing = false;
  let speedIdx = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // 速度档位标签, 与 TURN_INTERVALS_MS 对齐 (0 正常 / 1 两倍 / 2 四倍)
  const SPEED_LABELS = ['速度: 正常', '速度: ×2', '速度: ×4'];

  const view = new GameView({
    renderer,
    onStatus: (t) => (statusText.textContent = t),
    onLog: (lines) => appendLog(lines),
    onEnd: (result) => handleEnd(result),
    moneyEl: layout.moneyHost,
  });
  const statusText = el('span', { class: 'status-text', text: '回合 0 / 300' });
  layout.statusHost.append(statusText);

  // 未开始前也先展示地图 (初始状态: 无人机在出生点)
  view.apply([{ type: 'snapshot', state: snapshotOf(createSingleWorld(DEFAULT_MAX_TURNS)) }]);
  statusText.textContent = '回合 0 / 300';

  function appendLog(lines: string[]): void {
    for (const line of lines) {
      logBox.append(el('div', { class: 'log-line', text: line }));
    }
    while (logBox.children.length > 300) logBox.firstElementChild?.remove();
    logBox.scrollTop = logBox.scrollHeight;
  }

  function log(text: string): void {
    appendLog([text]);
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
    editor.setReadOnly(locked);
    lockBar.style.display = locked ? 'flex' : 'none';
  }

  /** 停止游戏并允许修改代码 (回到初始地图预览) */
  function stopForEdit(): void {
    stopGame();
    setEditorLocked(false);
    view.apply([{ type: 'snapshot', state: snapshotOf(createSingleWorld(DEFAULT_MAX_TURNS)) }]);
    statusText.textContent = '回合 0 / 300';
    log('[系统] 游戏已停止, 可以修改代码');
  }

  async function newGame(autoPlay: boolean): Promise<void> {
    stopGame();
    const code = editor.getValue();
    log('[系统] 正在编译代码…');
    const compiled = await compilePlayerCode(code);
    if (!compiled.ok) {
      setEditorLocked(false);
      for (const e of compiled.errors) {
        log(`[编译错误]${e.line ? ` 第 ${e.line} 行` : ''}: ${e.message}`);
      }
      return;
    }
    let program: BrowserProgram;
    try {
      program = await BrowserProgram.create(compiled.js);
    } catch (err) {
      setEditorLocked(false);
      log(`[错误] ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    programs = [program];
    controller = new GameController({
      mode: 'single',
      players: [{ name: '玩家', frame: 'normal', program }],
      maxTurns: DEFAULT_MAX_TURNS,
    });
    // 立即渲染初始地图 (重启/步进未播放时也能看到场景)
    view.apply([{ type: 'snapshot', state: snapshotOf(controller.world) }]);
    statusText.textContent = '回合 0 / 300';
    log('[系统] 新对局开始');
    setEditorLocked(true);
    updateStartStop();
    if (autoPlay) {
      playing = true;
      scheduleNext();
    }
    updatePauseButton();
  }

  async function stepOnce(): Promise<void> {
    if (!controller || controller.over) {
      playing = false;
      return;
    }
    const events = await controller.step();
    view.apply(events);
  }

  function scheduleNext(): void {
    if (!playing) return;
    if (timer) clearTimeout(timer);
    // 先等当前回合 (含玩家代码执行) 彻底结束后再进入下一回合, 防止回合重叠
    timer = setTimeout(async () => {
      await stepOnce();
      if (playing && controller && !controller.over) scheduleNext();
    }, TURN_INTERVALS_MS[speedIdx]);
  }

  function handleEnd(result: GameResult): void {
    playing = false;
    // 游戏结束, 解锁代码编辑
    setEditorLocked(false);
    updateStartStop();
    updatePauseButton();
    if (result.type === 'finished') {
      const money = result.scores[0]?.money ?? 0;
      statusText.textContent = `对局结束 · 金钱 ${money}`;
      log(`[系统] 对局结束, 最终金钱: ${money}`);
      const body = el('div', {}, [
        el('p', { text: `最终金钱: ${money}` }),
        el('p', { class: 'hint', text: '本地得分仅供参考, 提交后由服务器验证计分' }),
      ]);
      const m = modal('对局结束', body);
      const submitBtn = button('提交成绩', () => submitScore(m));
      body.append(el('div', { class: 'row' }, [submitBtn]));
    } else {
      statusText.textContent = '对局中止';
      log(`[错误] ${result.message}`);
      modal('对局中止', el('p', { text: result.message }));
    }
  }

  async function submitScore(m: { close: () => void }): Promise<void> {
    const user = await fetchUser();
    if (!user) {
      toast('请先登录 (右上角)');
      return;
    }
    const code = editor.getValue();
    const check = await api.get('/single/validate');
    if (check.data?.busy) {
      toast('已有程序正在服务器运行');
      return;
    }
    const res = await api.post('/single/validate', { code });
    if (res.status !== 200) {
      toast(res.data?.error ?? '提交失败');
      return;
    }
    m.close();
    toast('已提交, 服务器验证中…');
    void pollThenToast();
  }

  /** 轮询 /single/validate 直到 busy=false, 返回验证结果 (最多 120 秒) */
  async function pollValidationOnce(): Promise<{ score: number | null; error: string | null; timeout: boolean }> {
    for (let i = 0; i < 120; i++) {
      await sleep(1000);
      const { data } = await api.get('/single/validate');
      if (!data) continue;
      if (!data.busy) return { score: data.score ?? null, error: data.error ?? null, timeout: false };
    }
    return { score: null, error: null, timeout: true };
  }

  /** 轮询并把结果以 toast 展示 (无弹窗上下文时用) */
  async function pollThenToast(): Promise<void> {
    const r = await pollValidationOnce();
    if (r.timeout) toast('验证超时, 请稍后查询');
    else if (r.error) toast(`验证失败: ${r.error}`);
    else toast(`验证完成, 得分: ${r.score}`);
  }

  function showLeaderboard(): void {
    void (async () => {
      const { data } = await api.get('/single/leaderboard');
      const rows = (data?.entries ?? []) as { name: string; score: number; me?: boolean }[];
      const list = el('div', { class: 'list' });
      if (rows.length === 0) list.append(el('p', { class: 'hint', text: '暂无排行数据' }));
      rows.forEach((r, i) => {
        list.append(
          el('div', { class: 'list-row' + (r.me ? ' mine' : '') }, [
            el('span', { text: `${i + 1}. ${r.name}${r.me ? ' (我)' : ''}` }),
            el('span', { class: 'muted', text: `${r.score}` }),
          ])
        );
      });
      modal('排行榜', list);
    })();
  }

  function showHistory(): void {
    void (async () => {
      const { status, data } = await api.get('/single/history');
      if (status === 401) {
        toast('请先登录');
        return;
      }
      const rows = (data?.entries ?? []) as { id: number; score: number | null; error: string | null; created_at: number }[];
      const list = el('div', { class: 'list' });
      if (rows.length === 0) list.append(el('p', { class: 'hint', text: '暂无成绩记录' }));
      rows.forEach((r) => {
        list.append(
          el('div', { class: 'list-row' }, [
            el('span', { text: r.error ? `✗ ${r.error}` : `得分 ${r.score}` }),
            el('span', { class: 'muted', text: new Date(r.created_at).toLocaleString() }),
          ])
        );
      });
      modal('我的成绩', list);
    })();
  }

  const btnStartStop = button('开始', () => void onStartStop());
  const btnPause = button('暂停', () => togglePause());
  const btnStep = button('步进', () => void onStep());
  const btnSpeed = button('速度: 正常', () => {
    speedIdx = (speedIdx + 1) % SPEED_LABELS.length;
    btnSpeed.textContent = SPEED_LABELS[speedIdx];
  });
  const btnSubmit = button('提交', () => void submitFromButton(), { class: 'btn btn-submit' });
  layout.controlsHost.append(btnStartStop, btnPause, btnStep, btnSpeed, btnSubmit);
  updatePauseButton();

  // 主动查询验证状态: 后端有程序在运行时禁用提交按钮 (避免 409)
  const validatePoll = setInterval(async () => {
    if (!document.body.contains(btnSubmit)) {
      clearInterval(validatePoll);
      return;
    }
    try {
      const { data } = await api.get('/single/validate');
      const busy = !!data?.busy;
      btnSubmit.disabled = busy;
      btnSubmit.textContent = busy ? '验证中…' : '提交';
    } catch {
      // 网络异常时保持现状
    }
  }, 2000);

  /** 步进: 没有对局时先编译并创建, 再运行 1 回合 (创建后为暂停模式) */
  async function onStep(): Promise<void> {
    playing = false;
    if (!controller) {
      await newGame(false);
    }
    await stepOnce();
    updatePauseButton();
  }

  async function submitFromButton(): Promise<void> {
    const user = await fetchUser();
    if (!user) {
      toast('请先登录 (右上角)');
      return;
    }
    // 提交前先确认 (弹窗无右上角关闭按钮, 只能确认/取消)
    const confirmed = await new Promise<boolean>((resolve) => {
      const body = el('div', {}, [
        el('p', { text: '确认将代码提交到服务器验证?' }),
        el('p', { class: 'hint', text: '服务器将运行你的代码并记录成绩, 代码在提交后仍可继续修改。' }),
        el('div', { class: 'row' }, [
          button('确认提交', () => {
            m.close();
            resolve(true);
          }, { class: 'btn btn-submit' }),
          button('取消', () => {
            m.close();
            resolve(false);
          }),
        ]),
      ]);
      const m = modal('提交确认', body, { noClose: true });
    });
    if (!confirmed) return;
    const check = await api.get('/single/validate');
    if (check.data?.busy) {
      toast('已有程序正在服务器运行');
      return;
    }
    const code = editor.getValue();

    // 提交后: 弹窗变为圆圈加载条 + "隐藏"按钮
    let hidden = false;
    let progressModal: { close: () => void } | null = null;
    const progressBody = el('div', { class: 'submit-progress' }, [
      el('div', { class: 'spinner' }),
      el('p', { class: 'hint', text: '服务器验证中…' }),
      el('div', { class: 'row' }, [
        button('隐藏', () => {
          hidden = true;
          progressModal?.close();
        }),
      ]),
    ]);
    progressModal = modal('提交验证', progressBody, { noClose: true });

    const res = await api.post('/single/validate', { code });
    if (res.status !== 200) {
      progressModal.close();
      toast(res.data?.error ?? '提交失败');
      return;
    }
    // 轮询直到服务器执行完毕
    const r = await pollValidationOnce();
    if (!hidden) {
      progressModal.close();
      if (r.error) modal('验证失败', el('p', { text: r.error }));
      else if (r.timeout) toast('验证超时, 请稍后查询');
      else showLeaderboard(); // 弹窗未被隐藏: 立即弹出排行榜
    } else if (r.error) {
      toast(`验证失败: ${r.error}`);
    } else if (r.timeout) {
      toast('验证超时, 请稍后查询');
    } else {
      toast(`验证完成, 得分: ${r.score}`);
    }
  }

  // 登录状态
  void (async () => {
    const user = await fetchUser();
    userBox.textContent = user ? `👤 ${user.name}${user.dev ? ' (本地)' : ''}` : '未登录';
    userBox.className = 'user-chip' + (user ? ' user-on' : '');
    if (!user) userBox.onclick = () => (location.href = '/auth/github');
  })();
}
