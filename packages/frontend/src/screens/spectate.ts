// 观战: 列出当前全部对战房间, 选择进入实时观战。
import { el, button, topBar } from '../ui';
import { api } from '../net';

export function spectateScreen(root: HTMLElement): void {
  root.replaceChildren();
  root.append(
    topBar(),
    el('div', { class: 'spectate-page' }, [el('p', { class: 'hint', text: '加载房间列表…' })])
  );

  void (async () => {
    const host = root.querySelector('.spectate-page') as HTMLElement;
    try {
      const { data } = await api.get('/combat/room');
      const rooms = (data?.rooms ?? []) as { id: string; players: string[]; status: string }[];
      host.replaceChildren(el('div', { class: 'game-title', text: '正在进行的对战' }));
      if (rooms.length === 0) {
        host.append(el('p', { class: 'hint', text: '当前没有进行中的对战' }));
        return;
      }
      // 网格布局: 随窗口宽度自适应列数, 避免卡片只堆在左侧
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
    } catch {
      // 网络异常: 避免"加载房间列表…"占位符永久停留
      host.replaceChildren(el('p', { class: 'hint', text: '房间列表加载失败, 请刷新重试' }));
    }
  })();
}
