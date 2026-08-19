// Single-player planting: run the player's code locally, with start/step/restart/speed controls, and submit to the server for validation.
// The turn loop (compile/start/pause/step/speed/end) is provided by GameRunner; here we keep only
// single-player logic: editor, score submission, leaderboard, replay recording.
import { BrowserProgram } from '../core/browser-program';
import {
  GameController,
  compilePlayerCode,
  createSingleWorld,
  DEFAULT_MAX_TURNS,
  GameResult,
  ReplayRecorder,
  ReplayFile,
} from '@robofarm/shared';
import { DEFAULT_CODE } from '../core/game-layout';
import { createEditor } from '../ui/editor';
import { el, button, modal, toast, sleep, downloadJson } from '../ui/ui';
import { icon } from '../ui/icon';
import { setTopActions } from '../ui/topbar-state';
import { api, fetchUser } from '../core/net';
import { GameRunner } from '../core/game-runner';

const CODE_KEY = 'robofarm.single';

export function singleScreen(root: HTMLElement): void {
  root.replaceChildren();

  const lockBar = el('div', { class: 'editor-lock-bar', style: 'display:none' }, [
    el('span', {}, [icon('lock', 14), document.createTextNode(' 游戏进行中, 代码已锁定')]),
    button('停止游戏', () => runner.stopForEdit(), { class: 'btn btn-small' }),
  ]);

  /** Replay recorder: records each turn's actions and outputs (recreated per new match) */
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
      // Record replay: wrap the program to capture each turn's actions
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

  // Mount the editor to the runner layout's editor area (lock bar on top, editor below)
  runner.layout.editorHost.append(lockBar);
  const editor = createEditor(runner.layout.editorHost, {
    initial: localStorage.getItem(CODE_KEY) ?? DEFAULT_CODE,
    onChange: (v) => localStorage.setItem(CODE_KEY, v),
  });

  setTopActions([
    button('排行榜', () => showLeaderboard(), { class: 'btn btn-gold' }),
    button('我的成绩', () => showHistory()),
  ]);
  root.append(runner.layout.root);

  function handleEnd(result: GameResult): void {
    if (result.type === 'finished') {
      const money = result.scores[0]?.money ?? 0;
      runner.statusText.textContent = `对局结束 · 金钱 ${money}`;
      runner.log(`[系统] 对局结束, 最终金钱: ${money}`);
      // Generate replay file
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

  /** Poll /single/validate until busy=false, returning the validation result (up to 120 seconds) */
  async function pollValidationOnce(): Promise<{ score: number | null; error: string | null; timeout: boolean }> {
    for (let i = 0; i < 120; i++) {
      await sleep(1000);
      const { data } = await api.get('/single/validate');
      if (!data) continue;
      if (!data.busy) return { score: data.score ?? null, error: data.error ?? null, timeout: false };
    }
    return { score: null, error: null, timeout: true };
  }

  /** Poll and show the result via toast (used when there is no modal context) */
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
      let active = tabs.length - 1; // Default to the current version's live leaderboard (last tab)
      const tabBar = el('div', { class: 'lb-tabs' });
      const listHost = el('div', { class: 'list' });

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
          // Top three use a trophy icon; the rest use a numeric rank.
          const rankNode = i < 3 ? icon('trophy', 14) : document.createTextNode(`${i + 1}.`);
          listHost.append(
            el('div', { class: 'list-row' + (r.me ? ' mine' : '') }, [
              el('span', {}, [rankNode, document.createTextNode(` ${r.name}${r.me ? ' (我)' : ''}`)]),
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
          el('span', {}, r.error
            ? [icon('x', 14), document.createTextNode(` ${r.error}`)]
            : [document.createTextNode(`得分 ${r.score}`)]),
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

  // Poll validation state: disable the submit button while the backend has a program running (avoid 409)
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
      // Keep current state on network errors
    }
  }, 2000);

  async function submitFromButton(): Promise<void> {
    const user = await fetchUser();
    if (!user) {
      toast('请先登录 (右上角)');
      return;
    }
    // Confirm before submit (modal has no top-right close button, only confirm/cancel)
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
