// Web version of API docs: all backend endpoints, shown in function-category tabs, human friendly.
// Data comes from shared/src/api-docs.ts (same source as /api-docs Markdown / llms.txt).
import { el } from '../ui/ui';
import { icon } from '../ui/icon';
import { API_DOC_GROUPS, API_DOC_CONVENTIONS } from '@robofarm/shared';
import { methodColor } from '../core/theme';

function codeBlock(code: string): HTMLElement {
  return el('pre', { class: 'manual-code', text: code });
}

export function apiDocsScreen(root: HTMLElement): void {
  root.replaceChildren();
  const host = el('div', { class: 'api-docs-page' });
  root.append(host);

  // Title + general conventions
  const head = el('div', { class: 'api-docs-head' }, [
    el('h2', { text: 'RoboFarm 后端 API 文档' }),
    el('p', { class: 'hint', text: '此处为游戏服务器后端 API (HTTP / WebSocket / MCP); 无人机 API (getSelf / getTile 等) 请参考右侧 API 手册边栏。' }),
    el('p', { class: 'hint', text: '后端当前暴露的全部 HTTP 接口与 WebSocket 通道。纯 Markdown 版本见 /api-docs。' }),
    el('div', { class: 'doc-list' }, [
      el('li', { text: `Base URL: ${location.origin}` }),
      ...API_DOC_CONVENTIONS.map((c) => el('li', { text: c })),
    ]),
  ]);
  host.append(head);

  // Tab categories
  const tabBar = el('div', { class: 'tabs' });
  const panels: HTMLElement[] = [];
  for (let i = 0; i < API_DOC_GROUPS.length; i++) {
    const g = API_DOC_GROUPS[i];
    const tab = el('button', { class: 'tab' + (i === 0 ? ' active' : ''), text: g.title });
    const idx = i;
    tab.addEventListener('click', () => {
      tabBar.querySelectorAll<HTMLButtonElement>('.tab').forEach((b, j) => {
        b.classList.toggle('active', j === idx);
      });
      panels.forEach((p, j) => {
        p.style.display = j === idx ? '' : 'none';
      });
    });
    tabBar.append(tab);
    const tabPanel = el('div', { class: 'api-docs-panel' }, []);
    if (g.description) tabPanel.append(el('p', { class: 'hint', text: g.description }));
    for (const e of g.endpoints) tabPanel.append(endpointCard(e));
    panels.push(tabPanel);
  }
  host.append(tabBar, ...panels);

  // Initially show the first category
  panels.forEach((p, i) => {
    p.style.display = i === 0 ? '' : 'none';
  });
}

function endpointCard(e: { method: string; path: string; auth?: boolean; title: string; description: string; headers?: string[]; request?: string; responses: { code: string; body: string; note?: string }[] }): HTMLElement {
  const methodBadge = el('span', {
    class: 'api-method',
    text: e.method,
    style: `background: ${methodColor(e.method)}`,
  });
  const pathEl = el('code', { class: 'api-path', text: e.path });
  const head = el('div', { class: 'api-card-head' }, [
    el('div', { class: 'api-card-title' }, [
      methodBadge,
      el('span', { class: 'api-endpoint-name', text: e.title }),
      e.auth ? el('span', { class: 'api-auth' }, [icon('lock', 12), document.createTextNode(' 需登录')]) : el('span'),
    ]),
    el('div', { class: 'api-path-row' }, [pathEl]),
  ]);
  const rows: HTMLElement[] = [head, el('p', { text: e.description })];
  if (e.headers?.length) {
    rows.push(el('p', {}, [el('b', { text: 'Headers: ' })]));
    rows.push(el('ul', { class: 'doc-list' }, e.headers.map((h) => el('li', { text: h }))));
  }
  if (e.request) {
    rows.push(el('p', {}, [el('b', { text: 'Request Schema: ' })]), codeBlock(e.request));
  }
  rows.push(el('p', {}, [el('b', { text: 'Responses: ' })]));
  const respList = el('ul', { class: 'doc-list' });
  for (const r of e.responses) {
    respList.append(
      el('li', {}, [
        el('code', { text: r.code }),
        el('span', { text: r.note ? ` — ${r.note}` : '' }),
        codeBlock(r.body),
      ])
    );
  }
  rows.push(respList);
  return el('div', { class: 'api-card' }, rows);
}
