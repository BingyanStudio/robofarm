// Main menu.
import { el, button } from '../ui/ui';
import { showUpdateLog } from '../docs/version';

export function menuScreen(root: HTMLElement): void {
  root.replaceChildren();

  const hero = el('div', { class: 'menu-hero' }, [
    el('button', {
      class: 'btn-hero',
      onClick: () => (location.hash = '#/single'),
    }, [
      el('img', { class: 'hero-icon hero-icon-single', src: '/sprites/crop/strawberry_4.avif', alt: '' }),
      el('span', { class: 'hero-label', text: '单人种植' }),
    ]),
    el('button', {
      class: 'btn-hero',
      onClick: () => (location.hash = '#/match'),
    }, [
      el('img', { class: 'hero-icon hero-icon-match', src: '/sprites/drone_enemy.svg', alt: '' }),
      el('span', { class: 'hero-label', text: '多人竞技' }),
    ]),
  ]);

  // Remaining entries laid out below the two hero buttons (simulate has moved into the "multiplayer" page)
  const grid = el('div', { class: 'menu-grid' }, [
    button('观战', () => (location.hash = '#/spectate'), { class: 'btn' }),
    button('回放', () => (location.hash = '#/replay'), { class: 'btn' }),
    button('API 文档', () => (location.hash = '#/api-docs'), { class: 'btn' }),
    button('更新日志', () => showUpdateLog(), { class: 'btn' }),
  ]);

  const box = el('div', { class: 'menu-box' }, [
    el('img', { class: 'menu-logo', src: '/sprites/logo.svg', alt: 'RoboFarm' }),
    hero,
    grid,
    el('div', { class: 'menu-powered' }, [
      el('img', { class: 'bystudio-logo', src: '/img/bystudio-logo.webp', alt: 'Bingyan Studio' }),
      el('span', { text: '© Powered by Bingyan Studio' }),
    ]),
  ]);
  root.append(box);
}
