// Main-menu gameplay showcase: plays the bundled public/showcase.json replay on a canvas
// (the right 70% of the menu) in an endless loop, wrapped by the scene enter/exit animations:
//   enter → play through every turn → 2s pause → exit → reset to turn 0 → enter → replay.
import { Renderer } from './renderer';
import { GameView } from './game-layout';
import { el, sleep } from '../ui/ui';
import { replayEvents, createSingleWorld, snapshotOf } from '@robofarm/shared';
import type { GameEvent, ReplayFile } from '@robofarm/shared';

/** Showcase playback speed (ms per turn). */
const SHOWCASE_TURN_MS = 70;
/** Pause after the replay finishes before looping back. */
const SHOWCASE_END_DELAY_MS = 2000;

interface ShowcaseData {
  groups: GameEvent[][];
  maxTurns: number;
  result: ReplayFile['result'];
}

let showcasePromise: Promise<ShowcaseData | null> | null = null;

/** Fetch + re-simulate the bundled showcase replay (module-level cache, shared across visits). */
function loadShowcase(): Promise<ShowcaseData | null> {
  if (!showcasePromise) {
    showcasePromise = (async () => {
      try {
        const res = await fetch('showcase.json');
        if (!res.ok) return null;
        const file = (await res.json()) as ReplayFile;
        if (!Array.isArray(file.rounds) || typeof file.maxTurns !== 'number') return null;
        const events = await replayEvents(file);
        // Group events by turn: each group starts with `turn`, contains that turn's actions + snapshot.
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
        return { groups, maxTurns: file.maxTurns, result: file.result };
      } catch {
        return null;
      }
    })();
  }
  return showcasePromise;
}

/** Mount the showcase canvas into `host` and start the loop (stops itself once the canvas detaches). */
export function mountMenuShowcase(host: HTMLElement): void {
  const canvas = el('canvas', { class: 'menu-showcase-canvas' }) as HTMLCanvasElement;
  const status = el('span', { class: 'menu-showcase-status', text: '' });
  host.append(canvas, status);

  const renderer = new Renderer(canvas);
  const view = new GameView({
    renderer,
    onStatus: () => undefined,
    onLog: () => undefined,
    onEnd: () => undefined,
  });

  // Turn 0 backdrop: the fresh single-player world (spawn points / terrain).
  const maxTurns = 500;
  const initial = snapshotOf(createSingleWorld(maxTurns));
  view.apply([{ type: 'snapshot', state: initial }]);

  const alive = (): boolean => canvas.isConnected;

  async function loop(): Promise<void> {
    // Wait until the canvas has a real layout size (layout resolves right after mount),
    // otherwise the scene enter animation would play on a 0×0 canvas and be invisible.
    const waitStart = performance.now();
    while (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      if (!alive()) return;
      if (performance.now() - waitStart > 5000) break;
      await sleep(16);
    }
    // 1. Scene enter animation, then start the replay.
    await renderer.playSceneEnter();
    if (!alive()) return;
    const data = await loadShowcase();
    if (!alive()) return;
    if (!data) {
      // Replay unavailable (e.g. network hiccup): hold the static map and retry later.
      await sleep(10_000);
      if (alive()) void loop();
      return;
    }
    // 2. Play through every recorded turn.
    for (let i = 0; i < data.groups.length; i++) {
      if (!alive()) return;
      view.apply(data.groups[i]);
      const snap = data.groups[i].find((e): e is Extract<GameEvent, { type: 'snapshot' }> => e.type === 'snapshot')?.state;
      const money = snap?.players[0]?.money ?? 0;
      status.textContent = `回合 ${i + 1} / ${data.groups.length} · 金钱 ${money}`;
      await sleep(SHOWCASE_TURN_MS);
    }
    // 3. Finished: pause, then exit → reset to turn 0 → enter → replay.
    status.textContent = '对局结束';
    await sleep(SHOWCASE_END_DELAY_MS);
    if (!alive()) return;
    await renderer.playSceneExit();
    if (!alive()) return;
    view.apply([{ type: 'snapshot', state: initial }]);
    status.textContent = '';
    void loop();
  }

  void loop();
}
