// Replay: play back a match, with play/pause/step-forward/step-back/speed controls, rendering
// move animations and watering/harvest/intercept effects consistently with the game
// (via GameView.apply applying event streams turn by turn).
// Data sources:
//  - server history matches (GET /combat/replay/:id), compatible with both old and new formats:
//      * new format (ReplayFile): { mode, maxTurns, players, result, rounds } — re-simulated to generate the event stream
//      * old format: { config, events } — used directly
//  - locally imported replay files ("import replay"): read the JSON replay file and play it.
import { Renderer } from '../core/renderer';
import { el, button, toast } from '../ui/ui';
import { setTopActions } from '../ui/topbar-state';
import { api } from '../core/net';
import { GameView } from '../core/game-layout';
import { replayEvents, createSingleWorld, createCombatWorld, snapshotOf } from '@robofarm/shared';
import type { GameEvent, ReplayFile } from '@robofarm/shared';

interface ReplayData {
  config: { mode: string; players: { name: string }[]; maxTurns: number };
  events: GameEvent[];
}

/** Normalize data from any source into { config, events } (old/new formats + imported files handled uniformly) */
async function normalizeReplay(data: unknown): Promise<ReplayData | null> {
  const d = data as Partial<ReplayFile> & Partial<ReplayData>;
  if (Array.isArray(d?.events) && d.config) {
    return d as ReplayData;
  }
  if (Array.isArray(d?.rounds) && typeof d.maxTurns === 'number' && Array.isArray(d.players)) {
    const file = d as ReplayFile;
    const events = await replayEvents(file);
    return {
      config: { mode: file.mode, players: file.players.map((n) => ({ name: n })), maxTurns: file.maxTurns },
      events,
    };
  }
  return null;
}

/** Group events by turn: each group starts with `turn` and contains that turn's actions and snapshot */
function groupByTurn(events: GameEvent[]): GameEvent[][] {
  const groups: GameEvent[][] = [];
  let cur: GameEvent[] = [];
  for (const e of events) {
    if (e.type === 'turn') {
      if (cur.length) groups.push(cur);
      cur = [e];
    } else {
      cur.push(e);
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

export function replayScreen(root: HTMLElement, params: URLSearchParams): void {
  root.replaceChildren();
  const id = params.get('id');
  const host = el('div', { class: 'replay-page' }, [el('p', { class: 'hint', text: '加载回放中…' })]);
  setTopActions([button('导入回放记录', () => pickAndImport(), { class: 'btn btn-small' })]);
  root.append(host);

  // Local file import
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    void (async () => {
      try {
        const parsed = JSON.parse(await f.text());
        const data = await normalizeReplay(parsed);
        if (!data) {
          host.replaceChildren(el('p', { text: '无法识别的回放文件' }));
          return;
        }
        startPlayback(data, host);
      } catch (err) {
        toast(`回放文件解析失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  });
  root.append(fileInput);

  function pickAndImport(): void {
    fileInput.click();
  }

  if (!id) {
    // No replay selected: center the prominent "select replay" button; keep the top-right "import replay" unchanged
    host.replaceChildren(
      el('div', { class: 'replay-empty' }, [
        el('p', { text: '尚未选择回放' }),
        el('button', { class: 'btn btn-big', text: '选择回放', onClick: () => fileInput.click() }),
        el('p', { class: 'hint', text: '从本地导入回放文件 (JSON); 或从"多人竞技 → 历史记录"中点击某场对局播放。' }),
      ])
    );
    return;
  }

  void (async () => {
    const res = await api.get(`/combat/replay/${id}`);
    if (res.status !== 200) {
      host.replaceChildren(el('p', { text: res.data?.error ?? '回放加载失败' }));
      return;
    }
    const data = await normalizeReplay(res.data);
    if (!data) {
      host.replaceChildren(el('p', { text: '回放数据无法识别' }));
      return;
    }
    startPlayback(data, host);
  })();
}

function startPlayback(data: ReplayData, host: HTMLElement): void {
  const groups = groupByTurn(data.events);
  const endEvent = data.events.find((e) => e.type === 'end');
  buildPlayer(data, groups, endEvent, host);
}

function buildPlayer(
  data: ReplayData,
  groups: GameEvent[][],
  endEvent: GameEvent | undefined,
  host: HTMLElement
): void {
  const maxTurns = data.config.maxTurns;
  host.replaceChildren();

  const canvas = el('canvas', { class: 'replay-canvas' }) as HTMLCanvasElement;
  const renderer = new Renderer(canvas);
  const status = el('div', { class: 'status-text', text: '回合 0 / ' + maxTurns });
  const playersLine = el('div', { class: 'players-line', text: data.config.players.map((p) => p.name).join(' vs ') });

  // Reuse the in-game event applier: render snapshot + move animations + watering/harvest/intercept effects
  const view = new GameView({
    renderer,
    onStatus: () => undefined,
    onLog: () => undefined,
    onEnd: () => undefined,
  });

  // Turn 0 initial state: consistent with the game UI, showing the freshly created world (spawn points / terrain)
  const initialSnapshot = snapshotOf(
    data.config.mode === 'combat' ? createCombatWorld(maxTurns) : createSingleWorld(maxTurns)
  );

  let idx = 0; // Current turn being displayed (0 means not started)
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let speed = 1;

  const btnPlay = button('播放', togglePlay, { class: 'btn btn-start' });
  const btnBack = button('⏮', () => seek(0));
  const btnStepBack = button('◀', () => seek(Math.max(0, idx - 1)));
  const btnStep = button('▶', () => seek(Math.min(groups.length, idx + 1)));
  const btnSpeed = button('速度 ×1', () => {
    speed = speed === 1 ? 2 : speed === 2 ? 4 : speed === 4 ? 8 : 1;
    btnSpeed.textContent = `速度 ×${speed}`;
    if (playing) schedule();
  });

  const controls = el('div', { class: 'replay-controls' }, [btnBack, btnStepBack, btnPlay, btnStep, btnSpeed]);
  host.append(playersLine, status, canvas, controls);

  function render(): void {
    if (idx === 0) {
      // Turn 0: show the initial game state (spawn points / terrain)
      renderer.render(initialSnapshot);
      status.textContent = `回合 0 / ${maxTurns}`;
      return;
    }
    // Apply events turn by turn: move animations / effects / snapshot render
    view.apply(groups[idx - 1]);
    const snap = groups[idx - 1].find((e): e is Extract<GameEvent, { type: 'snapshot' }> => e.type === 'snapshot')?.state;
    if (!snap) return;
    const m0 = snap.players[0]?.money ?? 0;
    const m1 = snap.players[1]?.money ?? 0;
    status.textContent = `回合 ${snap.turn} / ${maxTurns} · ${data.config.players[0]?.name ?? ''} ${m0} vs ${data.config.players[1]?.name ?? ''} ${m1}`;
    if (idx >= groups.length && endEvent && endEvent.type === 'end') {
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
    idx = Math.max(0, Math.min(groups.length, next));
    render();
  }

  function togglePlay(): void {
    playing = !playing;
    btnPlay.textContent = playing ? '暂停' : '播放';
    // play (green accent) / pause (red accent)
    btnPlay.classList.toggle('btn-stop', playing);
    btnPlay.classList.toggle('btn-start', !playing);
    if (playing) schedule();
    else if (timer) clearTimeout(timer);
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (idx >= groups.length) {
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
