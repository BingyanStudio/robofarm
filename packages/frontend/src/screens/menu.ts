// 主菜单。
import { el, button } from '../ui';
import { fetchUser } from '../net';
import { mcpGuide } from '../api-manual';
import { showUpdateLog, VERSION } from '../version';

export function menuScreen(root: HTMLElement): void {
  root.replaceChildren();
  const userBox = el('span', { class: 'user-chip', text: '…' });

  const hero = el('div', { class: 'menu-hero' }, [
    el('button', {
      class: 'btn-hero',
      onClick: () => (location.hash = '#/single'),
    }, [
      el('span', { class: 'hero-emoji', text: '🌱' }),
      el('span', { class: 'hero-label', text: '单人种植' }),
    ]),
    el('button', {
      class: 'btn-hero',
      onClick: () => (location.hash = '#/match'),
    }, [
      el('span', { class: 'hero-emoji', text: '⚔️' }),
      el('span', { class: 'hero-label', text: '多人竞技' }),
    ]),
  ]);

  // 其余入口平铺在两个大按钮下方 (模拟竞技已移入"多人竞技"页面)
  const grid = el('div', { class: 'menu-grid' }, [
    button('观战', () => (location.hash = '#/spectate'), { class: 'btn' }),
    button('回放', () => (location.hash = '#/replay'), { class: 'btn' }),
    button('API 文档', () => (location.hash = '#/api-docs'), { class: 'btn' }),
    button('更新日志', () => showUpdateLog(), { class: 'btn' }),
  ]);

  const box = el('div', { class: 'menu-box' }, [
    el('img', { class: 'menu-logo', src: '/sprites/logo.svg', alt: 'RoboFarm' }),
    el('div', { class: 'menu-version', text: `v${VERSION}` }),
    hero,
    grid,
    el('details', { class: 'mcp-card', style: 'width: 460px; max-width: 92vw' }, [
      el('summary', { text: '🎉 MCP 接入' }),
      mcpGuide(),
    ]),
    el('div', { class: 'menu-user' }, [userBox]),
  ]);
  root.append(box);

  void (async () => {
    const user = await fetchUser();
    userBox.textContent = user ? `👤 ${user.name}${user.dev ? ' (本地模式)' : ''}` : '未登录 (点击登录)';
    userBox.className = 'user-chip' + (user ? ' user-on' : '');
    if (!user) userBox.onclick = () => (location.href = '/auth/github');
  })();
}
