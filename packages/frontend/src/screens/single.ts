// 单人种植: 本地执行玩家代码, 支持开始/步进/重启/调速, 可提交到服务器验证。
// 回合循环 (编译/开始/暂停/步进/调速/结束) 由 GameRunner 提供, 这里只保留
// 单人专属逻辑: 编辑器、提交成绩、排行榜、回放录制。
import { BrowserProgram } from '../browser-program';
import {
  GameController,
  compilePlayerCode,
  createSingleWorld,
  DEFAULT_MAX_TURNS,
  GameResult,
  ReplayRecorder,
  ReplayFile,
} from '@robofarm/shared';
import { DEFAULT_CODE } from '../game-layout';
import { createEditor } from '../editor';
import { el, button, modal, toast, topBar, sleep, downloadJson } from '../ui';
import { api, fetchUser } from '../net';
import { GameRunner } from '../game-runner';

const CODE_KEY = 'robofarm.single';

export function singleScreen(root: HTMLElement): void {
  root.replaceChildren();

  const lockBar = el('div', { class: 'editor-lock-bar', style: 'display:none' }, [
    el('span', { text: '🔒 游戏进行中, 代码已锁定' }),
    button('停止游戏', () => runner.stopForEdit(), { class: 'btn btn-small' }),
  ]);

  /** 回放录制器: 记录每回合操作与输出 (每次新对局重建) */
  let recorder: ReplayRecorder | null = null;
  let replayFile: ReplayFile | null = null;

  const runner = new GameRunner({
    title: '单人种植 · 在限定回合内赚取最多金钱',
    previewWorld: () => createSingleWorld(DEFAULT_MAX_TURNS),
    buildGame: async (log) => {
      const code = editor.getValue();
      const compiled = await compilePlayerCode(code);
      if (!compiled.ok) {
        for (const e of compiled.errors) {
          log(`[编译错误]${e.line ? ` 第 ${e.line} 行` : ''}: ${e.message}`);
        }
        return null;
      }
      let program: BrowserProgram;
      try {
        program = await BrowserProgram.create(compiled.js);
      } catch (err) {
        log(`[错误] ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
      // 录制回放: 包装程序捕获每回合操作
      recorder = new ReplayRecorder();
      replayFile = null;
      const controller = new GameController({
        mode: 'single',
        players: [{ name: '玩家', frame: 'normal', program: recorder.wrap(program) }],
        maxTurns: DEFAULT_MAX_TURNS,
      });
      return { controller, programs: [program] };
    },
    setEditorLocked: (locked) => {
      editor.setReadOnly(locked);
      lockBar.style.display = locked ? 'flex' : 'none';
    },
    gameStartLog: '[系统] 新对局开始',
    onEnd: (result) => handleEnd(result),
  });

  // 编辑器挂载到运行器布局的编辑区 (锁定条在上, 编辑器在下)
  runner.layout.editorHost.append(lockBar);
  const editor = createEditor(runner.layout.editorHost, {
    initial: localStorage.getItem(CODE_KEY) ?? DEFAULT_CODE,
    onChange: (v) => localStorage.setItem(CODE_KEY, v),
  });

  let userBox = el('span', { class: 'user-chip', text: '…' });
  root.append(
    topBar([
      userBox,
      button('排行榜', () => showLeaderboard(), { class: 'btn btn-gold' }),
      button('我的成绩', () => showHistory()),
    ]),
    runner.layout.root
  );

  function handleEnd(result: GameResult): void {
    if (result.type === 'finished') {
      const money = result.scores[0]?.money ?? 0;
      runner.statusText.textContent = `对局结束 · 金钱 ${money}`;
      runner.log(`[系统] 对局结束, 最终金钱: ${money}`);
      // 生成回放文件
      if (recorder) {
        replayFile = recorder.buildFile({
          mode: 'single',
          maxTurns: DEFAULT_MAX_TURNS,
          players: ['玩家'],
          result: { type: 'finished', money: [money] },
        });
      }
      const body = el('div', {}, [
        el('p', { text: `最终金钱: ${money}` }),
        el('p', { class: 'hint', text: '本地得分仅供参考, 提交后由服务器验证计分' }),
      ]);
      const m = modal('对局结束', body);
      const actions = [button('提交成绩', () => submitScore(m))];
      if (replayFile) {
        actions.push(
          button('保存回放', () => downloadJson(replayFile, `robofarm-replay-single.json`), {
            class: 'btn btn-gold',
          })
        );
      }
      body.append(el('div', { class: 'row' }, actions));
    } else {
      runner.statusText.textContent = '对局中止';
      runner.log(`[错误] ${result.message}`);
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
      const tabs = (data?.tabs ?? []) as {
        version: string;
        entries: { name: string; score: number; me?: boolean }[];
      }[];
      const body = el('div', { class: 'leaderboard' });
      if (tabs.length === 0) {
        body.append(el('p', { class: 'hint', text: '暂无排行数据' }));
        modal('排行榜', body);
        return;
      }
      let active = tabs.length - 1; // 默认展示当前版本的实时排行榜 (最后一个 Tab)
      const tabBar = el('div', { class: 'lb-tabs' });
      const listHost = el('div', { class: 'list' });
      const MEDALS = ['🥇', '🥈', '🥉'];

      function renderTabs(): void {
        tabBar.replaceChildren();
        tabs.forEach((t, i) => {
          tabBar.append(
            el('button', {
              class: 'lb-tab' + (i === active ? ' active' : ''),
              text: t.version,
              onClick: () => {
                active = i;
                renderTabs();
                renderList();
              },
            })
          );
        });
      }

      function renderList(): void {
        listHost.replaceChildren();
        const rows = tabs[active]?.entries ?? [];
        if (rows.length === 0) {
          listHost.append(el('p', { class: 'hint', text: '暂无排行数据' }));
          return;
        }
        rows.forEach((r, i) => {
          // 前三名使用奖牌 Emoji 标注
          const rank = MEDALS[i] ?? `${i + 1}.`;
          listHost.append(
            el('div', { class: 'list-row' + (r.me ? ' mine' : '') }, [
              el('span', { text: `${rank} ${r.name}${r.me ? ' (我)' : ''}` }),
              el('span', { class: 'muted', text: `${r.score}` }),
            ])
          );
        });
      }

      body.append(tabBar, listHost);
      renderTabs();
      renderList();
      modal('排行榜', body);
    })();
  }

  function showHistory(): void {
    void (async () => {
      const { status, data } = await api.get('/single/history');
      if (status === 401) {
        toast('请先登录');
        return;
      }
      const rows = (data?.entries ?? []) as { id: number; score: number | null; error: string | null; replay: string | null; created_at: number }[];
      const list = el('div', { class: 'list' });
      if (rows.length === 0) list.append(el('p', { class: 'hint', text: '暂无成绩记录' }));
      rows.forEach((r) => {
        const row = el('div', { class: 'list-row' }, [
          el('span', { text: r.error ? `✗ ${r.error}` : `得分 ${r.score}` }),
          el('span', { class: 'muted', text: new Date(r.created_at).toLocaleString() }),
        ]);
        if (r.replay) {
          row.append(
            button('下载回放', () => {
              void (async () => {
                const res = await api.get(`/single/replay/${r.id}`);
                if (res.status === 200) downloadJson(res.data, `robofarm-replay-single-${r.id}.json`);
                else toast(res.data?.error ?? '回放下载失败');
              })();
            }, { class: 'btn btn-small btn-gold' })
          );
        }
        list.append(row);
      });
      modal('我的成绩', list);
    })();
  }

  const btnSubmit = button('提交', () => void submitFromButton(), { class: 'btn btn-submit' });
  runner.addControl(btnSubmit);

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
        ]),
      ]);
      const m = modal('提交确认', body, { noClose: true });
    });
    if (!confirmed) return;
    const code = editor.getValue();
    const res = await api.post('/single/validate', { code });
    if (res.status === 200) {
      toast('已提交, 服务器验证中…');
      void pollThenToast();
    } else {
      toast(res.data?.error ?? '提交失败');
    }
  }
}
