// API 文档网页版: 后端全部接口, 按功能分类 Tab 展示, 人类友好。
// 数据来自 shared/src/api-docs.ts (与 /api-docs Markdown / llm.txt 同一来源)。
import { el, topBar } from '../ui';
import { API_DOC_GROUPS, API_DOC_CONVENTIONS } from '@robofarm/shared';

const METHOD_COLOR: Record<string, string> = {
  GET: '#22c55e',
  POST: '#3b82f6',
  WS: '#a855f7',
  DELETE: '#ef4444',
  PUT: '#f59e0b',
};

function codeBlock(code: string): HTMLElement {
  return el('pre', { class: 'manual-code', text: code });
}

export function apiDocsScreen(root: HTMLElement): void {
  root.replaceChildren();
  const host = el('div', { class: 'api-docs-page' });
  root.append(
    topBar(),
    host
  );

  // 标题 + 通用约定
  const head = el('div', { class: 'api-docs-head' }, [
    el('h2', { text: 'RoboFarm 后端 API 文档' }),
    el('p', { class: 'hint', text: '后端当前暴露的全部 HTTP 接口与 WebSocket 通道。纯 Markdown 版本见 /api-docs。' }),
    el('div', { class: 'doc-list' }, [
      el('li', { text: `Base URL: ${location.origin}` }),
      ...API_DOC_CONVENTIONS.map((c) => el('li', { text: c })),
    ]),
  ]);
  host.append(head);

  // Tab 分类
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

  // 初始显示第一个分类
  panels.forEach((p, i) => {
    p.style.display = i === 0 ? '' : 'none';
  });
}

function endpointCard(e: { method: string; path: string; auth?: boolean; title: string; description: string; headers?: string[]; request?: string; responses: { code: string; body: string; note?: string }[] }): HTMLElement {
  const methodBadge = el('span', {
    class: 'api-method',
    text: e.method,
    style: `background: ${METHOD_COLOR[e.method] ?? '#64748b'}`,
  });
  const pathEl = el('code', { class: 'api-path', text: e.path });
  const titleRow = el('div', { class: 'api-card-title' }, [
    methodBadge,
    pathEl,
    e.auth ? el('span', { class: 'api-auth', text: '🔒 需登录' }) : el('span'),
  ]);
  const rows: HTMLElement[] = [titleRow, el('p', { text: e.description })];
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
