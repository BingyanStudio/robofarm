// App entry + minimal hash router with lazy-loaded screens.
// Each screen is a dynamic import, so its code becomes a separate chunk that is
// only fetched when that route is first visited — keeping the initial bundle lean.
//
// Layout: a persistent top bar (logo + back button + user card + per-screen
// action slot) lives in #app permanently; only the #content area swaps per
// route, so the top bar never rebuilds on navigation (Astro-style shell).
import { setWasmUrl, prewarmCompiler } from '@robofarm/shared';
import { el, topBar, toast } from './ui/ui';
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

// Content area — swapped per route.
const content = el('div', { class: 'content' });
app.append(content);

// Global right-hand API manual sidebar (available on all screens, collapsed by default)
const openManual = mountApiManual();

// Version check: auto-expand API manual on first visit, show update log on upgrade/unrecognized version
checkVersionOnLoad(openManual);

// Runtime config: esbuild.wasm may be deployed elsewhere (ESBUILD_WASM_URL from backend .env).
// When set, browser compilation loads from that URL; otherwise keep same-origin /esbuild.wasm.
// 进入页面即后台预热编译器 (下载 esbuild.wasm), 首次编译直接 await 该下载, 不再临时等待。
void (async () => {
  try {
    const res = await fetch('/config');
    const cfg = (await res.json()) as { esbuildWasmUrl?: string | null };
    if (cfg?.esbuildWasmUrl) setWasmUrl(cfg.esbuildWasmUrl);
  } catch {
    // Keep default same-origin loading
  }
  prewarmCompiler();
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

/** GitHub OAuth 回调错误 → 用户可读提示 (后端跳转 /#/menu?login_error=<code>) */
const LOGIN_ERROR_MSG: Record<string, string> = {
  redirect_uri_mismatch:
    'GitHub 登录失败: 回调地址不匹配。请检查服务器 .env 的 GITHUB_REDIRECT_URI / BACKEND_ORIGIN 与 GitHub OAuth 应用的回调 URL 是否一致 (https)',
  access_denied: '已取消 GitHub 授权',
  state: '登录状态已失效, 请重新登录',
  exchange: 'GitHub 登录失败, 请重试',
};

function route(): void {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, queryStr] = hash.split('?');
  const params = new URLSearchParams(queryStr ?? '');
  const loginError = params.get('login_error');
  if (loginError) {
    toast(LOGIN_ERROR_MSG[loginError] ?? `GitHub 登录失败 (${loginError})`);
    // 清除错误标记, 避免刷新/返回时重复弹出
    history.replaceState(null, '', location.hash.replace(/[?&]login_error=[^&]*/, '') || '#/menu');
  }
  const key = path === '' ? 'menu' : path;
  // Keep the persistent navigation shell mounted and animate its menu state.
  bar.classList.toggle('menu-route', key === 'menu');
  // Clear the previous screen's top-bar actions before loading the next screen.
  setTopActions([]);
  content.replaceChildren();
  const loader = NAVIGATE[key] ?? NAVIGATE.menu;
  void loader(params);
}

window.addEventListener('hashchange', route);
route();