// 主菜单。
import { el, button } from '../ui';
import { fetchUser } from '../net';
import { mcpGuide } from '../api-manual';

export function menuScreen(root: HTMLElement): void {
  root.replaceChildren();
  const userBox = el('span', { class: 'user-chip', text: '…' });

  const buttons = el('div', { class: 'menu-buttons' }, [
    button('单人模式', () => (location.hash = '#/single'), { class: 'btn btn-big' }),
    button('模拟竞技', () => (location.hash = '#/simulate'), { class: 'btn btn-big' }),
    button('多人竞技', () => (location.hash = '#/match'), { class: 'btn btn-big' }),
    button('观战', () => (location.hash = '#/spectate'), { class: 'btn btn-big' }),
  ]);

  const box = el('div', { class: 'menu-box' }, [
    el('h1', { class: 'start-title', text: '🤖 RoboFarm' }),
    buttons,
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
