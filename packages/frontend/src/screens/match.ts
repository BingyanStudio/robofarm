// Multiplayer match: upload combat code, view other players, challenge, view match history.
import { createEditor } from '../ui/editor';
import { el, button, modal, toast, fmtTime, downloadJson } from '../ui/ui';
import { setTopActions } from '../ui/topbar-state';
import { api, fetchUser } from '../core/net';
import { DEFAULT_CODE } from '../core/game-layout';

const KEY = 'robofarm.simulate.me'; // Synced with simulate's "my drone"

export function matchScreen(root: HTMLElement): void {
  root.replaceChildren();

  setTopActions([button('历史记录', () => showHistory())]);
  root.append(
    el('div', { class: 'match-layout' }, [])
  );
  const layout = root.querySelector('.match-layout') as HTMLElement;

  const left = el('div', { class: 'match-left' });
  const right = el('div', { class: 'match-right' });
  layout.append(left, right);

  // Left header bar: "combat code" + upload status (right-aligned); simulate/upload buttons also right-aligned here
  const stateLine = el('span', { class: 'state-line', text: '出战状态: 查询中…' });
  const headBar = el('div', { class: 'match-head' }, [
    el('span', { class: 'match-title-text', text: '出战代码' }),
    stateLine,
  ]);
  const actionsRow = el('div', { class: 'match-head-actions' }, [
    button('模拟竞技', () => (location.hash = '#/simulate')),
    button('上传代码', () => void upload(), { class: 'btn btn-start' }),
  ]);
  left.append(
    headBar,
    el('div', { class: 'match-head-sub' }, [
      actionsRow,
      el('p', { class: 'hint', text: '与模拟竞技的"我方无人机"代码同步; 上传后胜败记录清零' }),
    ])
  );
  const editorHost = el('div', { class: 'editor-host' });
  left.append(editorHost);
  const editor = createEditor(editorHost, {
    initial: localStorage.getItem(KEY) ?? DEFAULT_CODE,
    onChange: (v) => localStorage.setItem(KEY, v),
  });

  right.append(el('div', { class: 'game-title', text: '选择对手' }));
  const listHost = el('div', { class: 'card-list' });
  right.append(listHost);

  async function upload(): Promise<void> {
    const user = await fetchUser();
    if (!user) {
      toast('请先登录 (右上角)');
      return;
    }
    const res = await api.post('/combat/upload', { code: editor.getValue() });
    if (res.status === 200) {
      toast('出战代码已上传');
      refresh();
    } else {
      toast(res.data?.error ?? '上传失败');
    }
  }

  async function refresh(): Promise<void> {
    const user = await fetchUser();
    if (!user) {
      stateLine.textContent = '请先登录后上传代码与挑战';
      listHost.replaceChildren(el('p', { class: 'hint', text: '登录后查看可挑战的玩家' }));
      return;
    }
    try {
      const state = await api.get('/combat/state');
      if (state.data) {
        const { wins, losses } = state.data;
        stateLine.textContent = `出战状态: 已上传 · 胜 ${wins} / 负 ${losses}`;
      } else {
        stateLine.textContent = '出战状态: 尚未上传代码';
      }
      const list = await api.get('/combat/list');
      const entries = (list.data?.entries ?? []) as { id: number; name: string; wins: number; losses: number }[];
      listHost.replaceChildren();
      if (entries.length === 0) {
        listHost.append(el('p', { class: 'hint', text: '暂无其他玩家上传出战代码' }));
        return;
      }
      for (const e of entries) {
        const total = e.wins + e.losses;
        const rate = total > 0 ? Math.round((e.wins / total) * 100) : 0;
        const card = el('div', { class: 'card' }, [
          el('div', { class: 'card-name', text: e.name }),
          el('div', { class: 'card-meta', text: `胜 ${e.wins} / 负 ${e.losses} · 胜率 ${rate}%` }),
          button('挑战', () => (location.hash = `#/battle?opponentId=${e.id}`), { class: 'btn btn-small' }),
        ]);
        listHost.append(card);
      }
    } catch {
      // 网络异常: 避免占位符永久停留
      stateLine.textContent = '出战状态: 加载失败, 请刷新重试';
      listHost.replaceChildren(el('p', { class: 'hint', text: '网络异常, 无法加载玩家列表' }));
    }
  }

  function showHistory(): void {
    void (async () => {
      const { status, data } = await api.get('/combat/history');
      if (status === 401) {
        toast('请先登录');
        return;
      }
      const rows = (data?.entries ?? []) as {
        id: number;
        opponent: string;
        result: 'win' | 'loss' | 'draw' | 'error';
        created_at: number;
      }[];
      const list = el('div', { class: 'list' });
      if (rows.length === 0) list.append(el('p', { class: 'hint', text: '暂无历史对局' }));
      const label = { win: '胜', loss: '负', draw: '平', error: '中止' } as const;
      rows.forEach((r) => {
        const row = el('div', { class: 'list-row clickable' }, [
          el('span', { text: `vs ${r.opponent} · ${label[r.result]}` }),
          el('span', { class: 'muted', text: fmtTime(r.created_at) }),
        ]);
        const dlBtn = button('下载回放', () => {
          void (async () => {
            const res = await api.get(`/combat/replay/${r.id}`);
            if (res.status === 200) downloadJson(res.data, `robofarm-replay-combat-${r.id}.json`);
            else toast(res.data?.error ?? '回放下载失败');
          })();
        }, { class: 'btn btn-small btn-gold' });
        // Stop bubbling to the row click (jump to the replay page)
        dlBtn.addEventListener('click', (e) => e.stopPropagation());
        row.append(dlBtn);
        row.addEventListener('click', () => (location.hash = `#/replay?id=${r.id}`));
        list.append(row);
      });
      modal('历史对局', list);
    })();
  }

  void refresh();
}
