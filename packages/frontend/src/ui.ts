// 通用 UI 辅助。
import { VERSION } from './version';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v !== undefined && v !== null && v !== false) {
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) node.append(c);
  return node;
}

export function button(label: string, onClick: () => void, opts: Record<string, unknown> = {}): HTMLButtonElement {
  return el('button', { class: 'btn', text: label, onClick, ...opts }) as HTMLButtonElement;
}

export function toast(message: string): void {
  const box = el('div', { class: 'toast', text: message });
  document.body.append(box);
  setTimeout(() => box.remove(), 2600);
}

export function modal(title: string, body: HTMLElement, opts: { noClose?: boolean } = {}): { close: () => void } {
  const overlay = el('div', { class: 'modal-overlay' });
  const head = el('div', { class: 'modal-head' }, [
    el('h3', { text: title }),
    ...(opts.noClose ? [] : [button('关闭', () => overlay.remove(), { class: 'btn btn-small' })]),
  ]);
  const content = el('div', { class: 'modal-body' }, [body]);
  overlay.append(el('div', { class: 'modal' }, [head, content]));
  document.body.append(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  return { close: () => overlay.remove() };
}

export function page(children: (Node | string)[]): HTMLElement {
  return el('div', { class: 'page' }, children);
}

export function topBar(right: Node[] = []): HTMLElement {
  return el('div', { class: 'topbar' }, [
    el('div', { class: 'topbar-left' }, [
      // 返回菜单: Icon 按钮 (放在 logo 左侧)
      el('button', {
        class: 'btn btn-small btn-icon',
        title: '返回菜单',
        onClick: () => (location.hash = '#/menu'),
      }, [
        el('img', { class: 'icon-img', src: '/sprites/back.svg', alt: '返回菜单' }),
      ]),
      el('img', { class: 'logo-img', src: '/sprites/logo.svg', alt: 'RoboFarm' }),
      // 版本号显示在标题旁边 (灰色小字)
      el('span', { class: 'version-badge', text: `v${VERSION}` }),
    ]),
    // 登录状态 / 排行榜 / 我的成绩等始终位于右侧
    el('div', { class: 'topbar-right' }, right),
  ]);
}
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 把 JSON 数据下载为本地文件 */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
