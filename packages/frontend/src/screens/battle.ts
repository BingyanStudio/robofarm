// 多人对战: 挑战者点击"开始"后, 服务器推演并向房间推送每回合事件。
// 观战模式 (spectate=1) 直接连接指定房间。
import { createGameLayout, GameView } from '../game-layout';
import { Renderer } from '../renderer';
import { createEditor } from '../editor';
import { el, button, modal, topBar } from '../ui';
import { api, openRoomWs } from '../net';
import { createCombatWorld, snapshotOf, DEFAULT_MAX_TURNS } from '@robofarm/shared';
import type { GameEvent, GameResult } from '@robofarm/shared';

export function battleScreen(root: HTMLElement, params: URLSearchParams): void {
  root.replaceChildren();
  const opponentId = params.get('opponentId');
  const roomId = params.get('roomId');
  const spectate = params.get('spectate') === '1';

  const layout = createGameLayout(spectate ? '观战 · 实时对战' : '多人对战 · 服务器推演');
  const renderer = new Renderer(layout.canvas);
  const logBox = el('div', { class: 'log-box' });
  layout.logHost.append(logBox);
  root.append(topBar(), layout.root);

  const statusText = el('span', { class: 'status-text', text: '等待开始…' });
  layout.statusHost.append(statusText);

  const playersLine = el('div', { class: 'players-line', text: '' });
  layout.statusHost.append(playersLine);

  let ws: WebSocket | null = null;
  let started = false;
  let btnStart: HTMLButtonElement | null = null;

  const view = new GameView({
    renderer,
    onStatus: (t) => (statusText.textContent = t),
    onLog: (lines) => {
      for (const line of lines) logBox.append(el('div', { class: 'log-line', text: line }));
      while (logBox.children.length > 300) logBox.firstElementChild?.remove();
      logBox.scrollTop = logBox.scrollHeight;
    },
    onEnd: () => undefined, // 结束由 match-end 消息处理
    moneyEl: layout.moneyHost,
  });

  // 等待开始时先展示竞技地图
  view.apply([{ type: 'snapshot', state: snapshotOf(createCombatWorld(DEFAULT_MAX_TURNS)) }]);
  statusText.textContent = '等待开始…';

  // 观战 / 已指定房间: 直接连接
  if (spectate && roomId) {
    connect(roomId);
  }

  if (!spectate) {
    // 只读显示自己的出战代码
    const codeHost = el('div', { class: 'editor-host' });
    layout.editorHost.append(
      el('div', { class: 'game-title', text: '我的出战代码 (只读)' }),
      codeHost,
      el('p', { class: 'hint', text: '对手代码不可见' })
    );
    void (async () => {
      const { data } = await api.get('/combat/state');
      if (data?.code) createEditor(codeHost, { initial: data.code, readonly: true });
    })();
    if (roomId && !spectate) connect(roomId);
    btnStart = button('开始', () => void startMatch());
    layout.controlsHost.append(btnStart);
  }

  async function startMatch(): Promise<void> {
    if (!opponentId) {
      modal('错误', el('p', { text: '缺少对手信息' }));
      return;
    }
    // 防止重复点击连开多个房间: 请求期间禁用按钮
    if (btnStart) {
      btnStart.disabled = true;
      btnStart.textContent = '开始中…';
    }
    const res = await api.post('/combat/start', { id: Number(opponentId) });
    if (res.status !== 200) {
      if (btnStart) {
        btnStart.disabled = false;
        btnStart.textContent = '开始';
      }
      modal('无法开始', el('p', { text: res.data?.error ?? '开始失败' }));
      return;
    }
    statusText.textContent = '房间已创建, 连接中…';
    connect(res.data.roomId as string);
  }

  function connect(rid: string): void {
    ws = openRoomWs(rid);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as
        | { type: 'match-start'; config: { players: { name: string }[] } }
        | { type: 'replay-buffer'; events: GameEvent[] }
        | { type: 'turn'; turn: number; events: GameEvent[] }
        | { type: 'match-end'; result: GameResult & { winner?: string; outcome?: string } }
        | { type: 'error'; message: string };
      switch (msg.type) {
        case 'match-start': {
          started = true;
          const names = msg.config.players.map((p) => p.name).join(' vs ');
          playersLine.textContent = names;
          statusText.textContent = '对局开始';
          break;
        }
        case 'replay-buffer':
          view.apply(msg.events);
          break;
        case 'turn':
          view.apply(msg.events);
          break;
        case 'match-end': {
          statusText.textContent = '对局结束';
          const r = msg.result;
          const detail = r.type === 'finished'
            ? `${r.scores[0].name} ${r.scores[0].money} vs ${r.scores[1].name} ${r.scores[1].money}`
            : `对局中止: ${r.message}`;
          modal('对局结束', el('div', {}, [
            el('p', { text: detail }),
            el('p', { class: 'hint', text: r.winner ? `胜者: ${r.winner}` : '' }),
          ]));
          break;
        }
        case 'error':
          modal('对局错误', el('p', { text: msg.message }));
          break;
      }
    };
    ws.onclose = () => {
      if (started) statusText.textContent = '连接已断开';
    };
  }
}
