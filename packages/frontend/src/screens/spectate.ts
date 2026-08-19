// Spectate: list all current battle rooms and enter one to watch live.
import { el, button } from '../ui/ui';
import { api } from '../core/net';

export function spectateScreen(root: HTMLElement): void {
  root.replaceChildren();
  root.append(
    el('div', { class: 'spectate-page' }, [el('p', { class: 'hint', text: '加载房间列表…' })])
  );

  void (async () => {
    const host = root.querySelector('.spectate-page') as HTMLElement;
    const { data } = await api.get('/combat/room');
    const rooms = (data?.rooms ?? []) as { id: string; players: string[]; status: string }[];
    host.replaceChildren();
    if (rooms.length === 0) {
      // Polished centered empty state, consistent with the replay page.
      host.replaceChildren(
        el('div', { class: 'spectate-empty' }, [
          el('img', { class: 'spectate-empty-icon', src: '/sprites/crop/melon_6.avif', alt: '' }),
          el('h2', { class: 'spectate-empty-title', text: '实时观战' }),
          el('p', { class: 'spectate-empty-sub', text: '当前没有进行中的对战' }),
          el('p', { class: 'spectate-empty-hint', text: '等待玩家创建房间后，对局将出现在此处。' }),
        ])
      );
      return;
    }
    // Section header above the room grid.
    host.append(el('div', { class: 'game-title', text: '正在进行的对战' }));
    // Grid layout: adapt the column count to window width, avoid cards stacking only on the left
    const list = el('div', { class: 'card-list' });
    for (const r of rooms) {
      const running = r.status === 'running';
      const row = el('div', { class: 'card spectate-card' + (running ? ' spectate-card-running' : '') }, [
        el('div', { class: 'spectate-card-status' }, [
          el('span', { class: 'spectate-status-dot' + (running ? ' is-running' : '') }),
          el('span', { class: 'card-meta', text: running ? '对局中' : '准备中' }),
        ]),
        el('div', { class: 'card-name', text: r.players.join(' vs ') }),
        button('观看', () => (location.hash = `#/battle?roomId=${r.id}&spectate=1`), { class: 'btn btn-small' }),
      ]);
      list.append(row);
    }
    host.append(list);
  })();
}
