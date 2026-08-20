// Generic UI helpers.
import gsap from 'gsap';

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
  gsap.set(box, { xPercent: -50 });
  gsap.fromTo(box, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.24, ease: 'power2.out' });
  gsap.to(box, { opacity: 0, y: -8, duration: 0.2, delay: 2.4, ease: 'power2.in', onComplete: () => box.remove() });
}

export function modal(
  title: string,
  body: HTMLElement,
  opts: { noClose?: boolean; modalClass?: string; titleRight?: Node[] } = {}
): { close: () => void } {
  const overlay = el('div', { class: 'modal-overlay' });
  const head = el('div', { class: 'modal-head' }, [
    el('div', { class: 'modal-head-left' }, [el('h3', { text: title }), ...(opts.titleRight ?? [])]),
    ...(opts.noClose ? [] : [button('关闭', () => closeModal(), { class: 'btn btn-small' })]),
  ]);
  const content = el('div', { class: 'modal-body' }, [body]);
  const dialog = el('div', { class: `modal${opts.modalClass ? ' ' + opts.modalClass : ''}` }, [head, content]);
  overlay.append(dialog);
  document.body.append(overlay);

  gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.16, ease: 'power1.out' });
  gsap.fromTo(dialog, { opacity: 0, scale: 0.94, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.26, ease: 'power3.out' });

  function closeModal(): void {
    gsap.to(overlay, { opacity: 0, duration: 0.15, ease: 'power1.in', onComplete: () => overlay.remove() });
    gsap.to(dialog, { opacity: 0, scale: 0.97, y: 6, duration: 0.18, ease: 'power2.in' });
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  return { close: () => closeModal() };
}

export function page(children: (Node | string)[]): HTMLElement {
  return el('div', { class: 'page' }, children);
}

export function topBar(right: Node[] = []): HTMLElement {
  // Back-to-menu icon button (rendered to the left of the logo).
  // Always present; the menu route hides it via the .topbar.hide-back class.
  const backBtn = el('button', {
    class: 'btn btn-small btn-icon topbar-back',
    title: '返回菜单',
    onClick: () => (location.hash = '#/menu'),
  }, [
    el('img', { class: 'icon-img', src: '/sprites/back.svg', alt: '返回菜单' }),
  ]);
  return el('div', { class: 'topbar' }, [
    el('div', { class: 'topbar-left' }, [
      backBtn,
      el('img', { class: 'logo-img', src: '/sprites/logo.svg', alt: 'RoboFarm', onClick: () => (location.hash = '#/menu') }),
    ]),
    // Login state / leaderboard / history always sit on the right side.
    el('div', { class: 'topbar-right' }, right),
  ]);
}
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Download JSON data as a local file. */
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
