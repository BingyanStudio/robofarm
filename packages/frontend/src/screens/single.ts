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
import { showGameStats, statsFromReplay, richestSnapshotFromReplay } from '../core/stats';
import { openSharePoster } from '../core/share-poster';
import gsap from 'gsap';

const CODE_KEY = 'robofarm.single';

/** 排行榜头像: 已确认 GitHub 拉取失败的用户名, 避免每次打开排行榜重复请求 */
const LB_AVATAR_FAILED = new Set<string>();

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
      recorder.seed = controller.world.rngSeed;
      return { controller, programs: [program] };
    },
    setEditorLocked: (locked) => {
      editor.setReadOnly(locked);
      lockBar.style.display = locked ? 'flex' : 'none';
    },
    gameStartLog: '[系统] 新对局开始',
    playerNames: ['玩家'],
    precompute: true,
    onTurn: (events, round) => recorder?.afterStep(events, round),
    onStats: (stats) => showGameStats(stats, '对局统计'),
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

  type LbEntry = { name: string; score: number; me?: boolean; rank?: number };

  function showLeaderboard(): void {
    void (async () => {
      const { data } = await api.get('/single/leaderboard');
      const tabs = (data?.tabs ?? []) as { version: string; entries: LbEntry[] }[];
      const body = el('div', { class: 'leaderboard' });
      if (tabs.length === 0) {
        body.append(el('p', { class: 'hint', text: '暂无排行数据' }));
        modal('排行榜', body);
        return;
      }
      const versionOf = (v: string): number[] => v.replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
      const versionLabel = (v: string): string => (v.startsWith('v') ? v : `v${v}`);
      const orderedTabs = tabs
        .map((t, i) => ({ index: i, version: t.version }))
        .sort((a, b) => {
          const va = versionOf(a.version);
          const vb = versionOf(b.version);
          for (let k = 0; k < Math.max(va.length, vb.length); k++) {
            const d = (vb[k] ?? 0) - (va[k] ?? 0);
            if (d !== 0) return d;
          }
          return 0;
        });
      let active = orderedTabs[0]?.index ?? 0;
      const podiumHost = el('div', { class: 'lb-podium' });
      const listHost = el('div', { class: 'list' });

      function avatarTile(name: string, size = 40): HTMLElement {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
        const letter = (): HTMLElement =>
          el('span', {
            class: 'lb-avatar',
            text: (name[0] ?? '?').toUpperCase(),
            style: `width:${size}px;height:${size}px;background:hsl(${h} 42% 38%)`,
          });
        // 优先 GitHub 头像 (按用户名拉取), 加载失败 (无账号/网络错误) 回退到字母块
        if (LB_AVATAR_FAILED.has(name)) return letter();
        const img = el('img', {
          class: 'lb-avatar lb-avatar-img',
          src: `https://github.com/${encodeURIComponent(name)}.png?size=${size * 2}`,
          alt: name,
          loading: 'lazy',
          referrerpolicy: 'no-referrer',
          style: `width:${size}px;height:${size}px`,
          onerror: () => {
            LB_AVATAR_FAILED.add(name);
            img.replaceWith(letter());
          },
        }) as HTMLImageElement;
        return img;
      }

      function buildVersionDropdown(): HTMLElement {
        const wrap = el('div', { class: 'lb-version' });
        const btn = el('button', { class: 'lb-version__btn', type: 'button' }, [
          el('span', { class: 'lb-version__label', text: versionLabel(tabs[active]?.version ?? '') }),
          el('span', { class: 'lb-version__caret', html: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>' }),
        ]);
        const menu = el('div', { class: 'lb-version__menu' });
        const itemNodes: HTMLButtonElement[] = [];
        orderedTabs.forEach((ot) => {
          const t = tabs[ot.index];
          const item = el('button', {
            class: 'lb-version__item' + (ot.index === active ? ' active' : ''),
            type: 'button',
            text: versionLabel(t.version),
            onClick: () => {
              active = ot.index;
              elBtnLabel.textContent = versionLabel(t.version);
              itemNodes.forEach((n) => n.classList.remove('active'));
              item.classList.add('active');
              closeMenu();
              render();
            },
          }) as HTMLButtonElement;
          itemNodes.push(item);
          menu.append(item);
        });
        const elBtnLabel = btn.querySelector('.lb-version__label') as HTMLElement;
        wrap.append(btn, menu);

        let open = false;
        function openMenu(): void {
          open = true;
          btn.classList.add('open');
          gsap.fromTo(menu, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.22, ease: 'power2.out' });
        }
        function closeMenu(): void {
          open = false;
          btn.classList.remove('open');
          gsap.to(menu, { height: 0, opacity: 0, duration: 0.16, ease: 'power2.in', onComplete: () => { menu.style.height = '0px'; } });
        }
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          open ? closeMenu() : openMenu();
        });
        document.addEventListener('click', (e) => {
          if (open && !wrap.contains(e.target as Node)) closeMenu();
        });
        return wrap;
      }

      function renderPodium(rows: LbEntry[]): void {
        podiumHost.replaceChildren();
        const top3 = rows.slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 }));
        const order = [top3[1], top3[0], top3[2]].filter(Boolean);
        const barHeights: Record<number, number> = { 1: 132, 2: 96, 3: 74 };
        order.forEach((r) => {
          const person = el('div', { class: 'lb-podium__person' }, [
            el('div', { class: 'lb-podium__head' }, [
              avatarTile(r.name, r.rank === 1 ? 52 : 44),
              el('div', { class: 'lb-podium__medal', text: ['🥇', '🥈', '🥉'][r.rank - 1] }),
            ]),
            el('div', { class: 'lb-podium__name', text: r.name }),
          ]);
          const bar = el('div', { class: `lb-podium__bar lb-podium__bar--${r.rank}` });
          const slot = el('div', { class: `lb-podium__slot lb-podium__slot--${r.rank}` }, [
            person,
            bar,
            el('div', { class: 'lb-podium__score', text: String(r.score) }),
          ]);
          podiumHost.append(slot);
          gsap.fromTo(bar, { height: 0 }, {
            height: barHeights[r.rank],
            duration: 0.9,
            delay: (r.rank - 1) * 0.15,
            ease: 'power3.out',
          });
        });
      }

      function renderList(): void {
        listHost.replaceChildren();
        const rows = tabs[active]?.entries ?? [];
        if (rows.length === 0) {
          listHost.append(el('p', { class: 'hint', text: '暂无排行数据' }));
          return;
        }
        let prevRank = 3;
        rows.forEach((r, i) => {
          const rank = r.rank ?? i + 1;
          if (rank <= 3) return;
          if (r.me && rank > prevRank + 1) {
            listHost.append(el('div', { class: 'lb-ellipsis', text: '···' }));
          }
          listHost.append(
            el('div', { class: 'list-row lb-row' + (r.me ? ' mine' : '') }, [
              el('span', {}, [document.createTextNode(`${rank}. `), document.createTextNode(r.name + (r.me ? ' (我)' : ''))]),
              el('span', { class: 'muted', text: `${r.score}` }),
            ])
          );
          prevRank = rank;
        });
      }

      function render(): void {
        renderPodium(tabs[active]?.entries ?? []);
        renderList();
        scrollToMe();
      }

      /** Locate the "me" row and scroll it into view with a decaying ease. */
      function scrollToMe(): void {
        const mine = listHost.querySelector<HTMLElement>('.list-row.mine');
        if (!mine) return;
        requestAnimationFrame(() => {
          const listRect = listHost.getBoundingClientRect();
          const mineRect = mine.getBoundingClientRect();
          const relative = mineRect.top - listRect.top;
          let target = listHost.scrollTop + relative - (listHost.clientHeight - mine.offsetHeight) / 2;
          target = Math.max(0, Math.min(target, listHost.scrollHeight - listHost.clientHeight));

          const distance = Math.abs(target - listHost.scrollTop);
          const duration = Math.min(1.8, Math.max(0.5, distance / 400));
          gsap.to(listHost, { scrollTop: target, duration, ease: 'power3.out' });
        });
      }

      /** Fade the list's top/bottom edges, dropping the cursor-side fade at either extreme. */
      function updateListMask(): void {
        const el = listHost;
        const scrollable = el.scrollHeight > el.clientHeight;
        const atTop = el.scrollTop <= 1;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        const top = !scrollable || atTop ? 'rgba(0,0,0,1) 0px' : 'rgba(0,0,0,0) 0px';
        const topMid = !scrollable || atTop ? '' : ', rgba(0,0,0,1) 14px';
        const bottomMid = !scrollable || atBottom ? '' : ', rgba(0,0,0,1) calc(100% - 14px)';
        const bottom = !scrollable || atBottom ? ', rgba(0,0,0,1) 100%' : ', rgba(0,0,0,0) 100%';
        const mask = `linear-gradient(to bottom, ${top}${topMid}${bottomMid}${bottom})`;
        el.style.webkitMaskImage = mask;
        el.style.maskImage = mask;
      }

      listHost.addEventListener('scroll', updateListMask);

      body.append(podiumHost, listHost);
      render();
      modal('排行榜', body, { titleRight: [buildVersionDropdown()] });
      requestAnimationFrame(updateListMask);
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
          const actions = el('div', { class: 'row-actions' }, [
            button('统计', () => {
              void (async () => {
                const res = await api.get(`/single/replay/${r.id}`);
                if (res.status === 200) {
                  const stats = await statsFromReplay(res.data);
                  if (stats) showGameStats(stats, '对局统计');
                  else toast('回放数据无法识别');
                } else toast(res.data?.error ?? '统计加载失败');
              })();
            }, { class: 'btn btn-small' }),
            button('下载回放', () => {
              void (async () => {
                const res = await api.get(`/single/replay/${r.id}`);
                if (res.status === 200) downloadJson(res.data, `robofarm-replay-single-${r.id}.json`);
                else toast(res.data?.error ?? '回放下载失败');
              })();
            }, { class: 'btn btn-small' }),
            button('分享', () => {
              void (async () => {
                if (r.score == null) {
                  toast('该次成绩无有效分数');
                  return;
                }
                const res = await api.get(`/single/replay/${r.id}`);
                if (res.status !== 200) {
                  toast(res.data?.error ?? '回放加载失败');
                  return;
                }
                const snapshot = await richestSnapshotFromReplay(res.data);
                const user = await fetchUser();
                await openSharePoster({
                  name: user?.name ?? '玩家',
                  avatar: user?.avatar ?? null,
                  score: r.score,
                  snapshot,
                });
              })();
            }, { class: 'btn btn-small btn-gold' }),
          ]);
          row.append(actions);
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
