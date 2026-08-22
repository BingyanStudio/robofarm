// Main menu.
import { el, button } from '../ui/ui';
import { showUpdateLog } from '../docs/version';
// import { mcpCollapse } from '../docs/api-manual'; // MCP Card temporarily hidden (see agent/TODO.md)
import { mountMenuShowcase } from '../core/menu-showcase';
import gsap from 'gsap';

export function menuScreen(root: HTMLElement): void {
  root.replaceChildren();

  const hero = el('div', { class: 'menu-hero' }, [
    el('button', {
      class: 'btn-hero',
      onClick: () => (location.hash = '#/single'),
    }, [
      el('img', { class: 'hero-icon hero-icon-single', src: '/sprites/icon_single.svg', alt: '' }),
      el('span', { class: 'hero-label', text: '单人种植' }),
    ]),
    el('button', {
      class: 'btn-hero',
      onClick: () => (location.hash = '#/match'),
    }, [
      el('img', { class: 'hero-icon hero-icon-match', src: '/sprites/icon_match.svg', alt: '' }),
      el('span', { class: 'hero-label', text: '多人竞技' }),
    ]),
  ]);

  // Remaining entries stacked one per row below the hero buttons (simulate has moved into the "multiplayer" page)
  const grid = el('div', { class: 'menu-grid' }, [
    button('观战', () => (location.hash = '#/spectate'), { class: 'btn' }),
    button('回放', () => (location.hash = '#/replay'), { class: 'btn' }),
    button('API 文档', () => (location.hash = '#/api-docs'), { class: 'btn' }),
    button('更新日志', () => showUpdateLog(), { class: 'btn' }),
  ]);

  // Left column (30%): logo / tagline / hero / nav / MCP card; right column (70%): gameplay showcase canvas.
  const box = el('div', { class: 'menu-box' }, [
    el('div', { class: 'menu-logo-wrap' }, [
      el('img', { class: 'menu-logo', src: '/sprites/logo.svg', alt: 'RoboFarm' }),
      el('span', { class: 'menu-slogan', text: '一句话为我烧10亿Tokens' }),
    ]),
    el('div', { class: 'menu-tagline', text: '基于 TypeScript 编程的回合制农场经营游戏' }),
    hero,
    grid,
    // el('div', { class: 'menu-mcp' }, [mcpCollapse('Agent 接入')]), // MCP Card temporarily hidden (see agent/TODO.md)
    el('div', { class: 'menu-footer' }, [
      el('a', {
        class: 'menu-powered',
        href: 'https://www.bingyan.net/',
        target: '_blank',
        rel: 'noopener noreferrer',
      }, [
        el('img', { class: 'bystudio-logo', src: '/sprites/bystudio-logo.webp', alt: 'Bingyan Studio' }),
        el('span', { text: '© Powered by Bingyan Studio' }),
      ]),
      el('a', {
        class: 'menu-ghost',
        href: 'https://github.com/BingyanStudio/robofarm',
        target: '_blank',
        rel: 'noopener noreferrer',
      }, [
        el('img', { class: 'ghost-icon', src: '/sprites/github.svg', alt: 'GitHub' }),
      ]),
    ]),
  ]);

  const showcase = el('div', { class: 'menu-showcase' });
  const menuRoot = el('div', { class: 'menu-root' }, [box, showcase]);
  root.append(menuRoot);
  mountMenuShowcase(showcase);

  // Entrance animation: stagger the menu box children (logo, hero, grid, MCP strip) on first open.
  // The logo cluster (logo + its glow, and the gray tagline) ends 32px higher than the other rows.
  // The offset is applied here (not CSS) so it survives the gsap inline transform.
  const items = Array.from(box.children);
  const isLogoCluster = (el: Element): boolean =>
    el.classList.contains('menu-logo-wrap') || el.classList.contains('menu-tagline');
  gsap.fromTo(
    items,
    { opacity: 0, y: 18 },
    { opacity: 1, y: (_i: number, el: Element) => (isLogoCluster(el) ? -32 : 0), duration: 0.5, stagger: 0.08, ease: 'power3.out' }
  );
}
