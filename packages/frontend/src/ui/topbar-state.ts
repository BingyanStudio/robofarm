// Global top-bar action slot state.
// Kept in its own module to avoid a circular import: main.ts dynamically imports
// each screen, and screens import setTopActions from here (not from main.ts).
import { el } from './ui';

const slot = el('div', { class: 'topbar-actions' });

/** The persistent action-slot element, mounted once into the top bar by main.ts. */
export function topActionsEl(): HTMLElement {
  return slot;
}

/** Replace the top-bar action slot contents (called by each screen).
 *  The slot is shown/hidden via display (not rebuilt) — empty hides it, content shows it. */
export function setTopActions(nodes: (Node | string)[] = []): void {
  slot.replaceChildren(...nodes);
  slot.style.display = nodes.length > 0 ? '' : 'none';
}
