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
    host.replaceChildren(el('div', { class: 'game-title', text: '正在进行的对战' }));
    if (rooms.length === 0) {
      host.append(el('p', { class: 'hint', text: '当前没有进行中的对战' }));
      return;
    }
    // Grid layout: adapt the column count to window width, avoid cards stacking only on the left
    const list = el('div', { class: 'card-list' });
    for (const r of rooms) {
      const row = el('div', { class: 'card' }, [
        el('div', { class: 'card-name', text: r.players.join(' vs ') }),
        el('div', { class: 'card-meta', text: r.status === 'running' ? '对局中' : '准备中' }),
        button('观看', () => (location.hash = `#/battle?roomId=${r.id}&spectate=1`), { class: 'btn btn-small' }),
      ]);
      list.append(row);
    }
    host.append(list);
  })();
}
