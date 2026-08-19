// App entry + minimal hash router with lazy-loaded screens.
// Each screen is a dynamic import, so its code becomes a separate chunk that is
// only fetched when that route is first visited — keeping the initial bundle lean.
//
// Layout: a persistent top bar (logo + back button + user card + per-screen
// action slot) lives in #app permanently; only the #content area swaps per
// route, so the top bar never rebuilds on navigation (Astro-style shell).
import { setWasmUrl } from '@robofarm/shared';
import { el, topBar } from './ui/ui';
import { userCard } from './ui/user-card';
import { topActionsEl, setTopActions } from './ui/topbar-state';
import { menuScreen } from './screens/menu';
import { mountApiManual } from './docs/api-manual';
import { checkVersionOnLoad } from './docs/version';

const app = document.getElementById('app')!;

// Persistent top bar — rendered once, never rebuilt on route change.
// User card is global (always on the right); per-screen actions sit before it.
const bar = topBar([topActionsEl(), userCard()]);
app.append(bar);
const backBtn = bar.querySelector('.topbar-back') as HTMLElement;

// Content area — swapped per route.
const content = el('div', { class: 'content' });
app.append(content);

// Global right-hand API manual sidebar (available on all screens, collapsed by default)
const openManual = mountApiManual();

// Version check: auto-expand API manual on first visit, show update log on upgrade/unrecognized version
checkVersionOnLoad(openManual);

// Runtime config: esbuild.wasm may be deployed elsewhere (ESBUILD_WASM_URL from backend .env).
// When set, browser compilation loads from that URL; otherwise keep same-origin /esbuild.wasm
void (async () => {
  try {
    const res = await fetch('/config');
    const cfg = (await res.json()) as { esbuildWasmUrl?: string | null };
    if (cfg?.esbuildWasmUrl) setWasmUrl(cfg.esbuildWasmUrl);
  } catch {
    // Keep default same-origin loading
  }
})();

/** Lazy screen loaders — keyed by route name. `menu` is eager (landing screen). */
type ScreenLoader = (params: URLSearchParams) => void | Promise<void>;
const NAVIGATE: Record<string, ScreenLoader> = {
  menu: () => menuScreen(content),
  single: async () => (await import('./screens/single')).singleScreen(content),
  simulate: async () => (await import('./screens/simulate')).simulateScreen(content),
  match: async () => (await import('./screens/match')).matchScreen(content),
  battle: async (p) => (await import('./screens/battle')).battleScreen(content, p),
  replay: async (p) => (await import('./screens/replay')).replayScreen(content, p),
  spectate: async () => (await import('./screens/spectate')).spectateScreen(content),
  'api-docs': async () => (await import('./screens/api-docs')).apiDocsScreen(content),
};

function route(): void {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, queryStr] = hash.split('?');
  const params = new URLSearchParams(queryStr ?? '');
  const key = path === '' ? 'menu' : path;
  // Hide the back button on the menu itself (nowhere to go back to).
  backBtn.style.display = key === 'menu' ? 'none' : '';
  // Clear the previous screen's top-bar actions before loading the next screen.
  setTopActions([]);
  content.replaceChildren();
  const loader = NAVIGATE[key] ?? NAVIGATE.menu;
  void loader(params);
}

window.addEventListener('hashchange', route);
route();