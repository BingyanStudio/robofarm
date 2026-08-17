// 回放: 按回合渲染历史对局, 支持播放/暂停/步进/步退/变速。
import { Renderer } from '../renderer';
import { el, button, topBar } from '../ui';
import { api } from '../net';
import type { GameEvent, SnapshotState } from '@robofarm/shared';

interface ReplayData {
  config: { mode: string; players: { name: string }[]; maxTurns: number };
  events: GameEvent[];
}

export function replayScreen(root: HTMLElement, params: URLSearchParams): void {
  root.replaceChildren();
  const id = params.get('id');
  root.append(
    topBar(),
    el('div', { class: 'replay-page' }, [el('p', { class: 'hint', text: '加载回放中…' })])
  );

  if (!id) {
    root.querySelector('.replay-page')?.replaceChildren(el('p', { text: '缺少回放 id' }));
    return;
  }

  void (async () => {
    const res = await api.get(`/combat/replay/${id}`);
    const host = root.querySelector('.replay-page') as HTMLElement;
    if (res.status !== 200) {
      host.replaceChildren(el('p', { text: res.data?.error ?? '回放加载失败' }));
      return;
    }
    const data = res.data as ReplayData;
    const snapshots = data.events.filter((e): e is Extract<GameEvent, { type: 'snapshot' }> => e.type === 'snapshot').map((e) => e.state);
    const endEvent = data.events.find((e) => e.type === 'end');
    buildPlayer(data, snapshots, endEvent, host);
  })();
}

function buildPlayer(
  data: ReplayData,
  snapshots: SnapshotState[],
  endEvent: GameEvent | undefined,
  host: HTMLElement
): void {
  const maxTurns = data.config.maxTurns;
  host.replaceChildren();

  const canvas = el('canvas', { class: 'replay-canvas' }) as HTMLCanvasElement;
  const renderer = new Renderer(canvas);
  const status = el('div', { class: 'status-text', text: '回合 0 / ' + maxTurns });
  const playersLine = el('div', { class: 'players-line', text: data.config.players.map((p) => p.name).join(' vs ') });

  let idx = 0; // 当前显示到第几个快照 (0 表示还没开始)
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let speed = 1;

  const btnPlay = button('播放', togglePlay);
  const btnBack = button('⏮', () => seek(0));
  const btnStepBack = button('◀', () => seek(Math.max(0, idx - 1)));
  const btnStep = button('▶', () => seek(Math.min(snapshots.length, idx + 1)));
  const btnSpeed = button('速度 ×1', () => {
    speed = speed === 1 ? 2 : speed === 2 ? 4 : speed === 4 ? 8 : 1;
    btnSpeed.textContent = `速度 ×${speed}`;
    if (playing) schedule();
  });

  const controls = el('div', { class: 'replay-controls' }, [btnBack, btnStepBack, btnPlay, btnStep, btnSpeed]);
  host.append(playersLine, status, canvas, controls);

  function render(): void {
    if (idx === 0) {
      renderer.clear();
      status.textContent = `回合 0 / ${maxTurns}`;
      return;
    }
    const snap = snapshots[idx - 1];
    renderer.render(snap);
    const m0 = snap.players[0]?.money ?? 0;
    const m1 = snap.players[1]?.money ?? 0;
    status.textContent = `回合 ${snap.turn} / ${maxTurns} · ${data.config.players[0]?.name ?? ''} ${m0} vs ${data.config.players[1]?.name ?? ''} ${m1}`;
    if (idx >= snapshots.length && endEvent && endEvent.type === 'end') {
      const r = endEvent.result;
      if (r.type === 'finished') {
        const [s0, s1] = r.scores;
        status.textContent += ` · 结束: ${s0.name} ${s0.money} vs ${s1.name} ${s1.money}`;
      } else {
        status.textContent += ` · 中止: ${r.message}`;
      }
    }
  }

  function seek(next: number): void {
    idx = Math.max(0, Math.min(snapshots.length, next));
    render();
  }

  function togglePlay(): void {
    playing = !playing;
    btnPlay.textContent = playing ? '暂停' : '播放';
    if (playing) schedule();
    else if (timer) clearTimeout(timer);
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (idx >= snapshots.length) {
        playing = false;
        btnPlay.textContent = '播放';
        return;
      }
      seek(idx + 1);
      if (playing) schedule();
    }, 800 / speed);
  }

  render();
}
