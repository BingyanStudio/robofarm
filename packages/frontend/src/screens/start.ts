// 开始界面。
import { el, button } from '../ui';
import { mcpGuide } from '../api-manual';

export function startScreen(root: HTMLElement): void {
  root.replaceChildren();
  const box = el('div', { class: 'start-box' }, [
    el('h1', { class: 'start-title', text: '🤖 RoboFarm' }),
    el('p', { class: 'start-desc', text: '编写代码控制无人机, 种植、收获、偷菜, 在限定回合内赚取最多的金钱!' }),
    button('开始游戏', () => (location.hash = '#/menu'), { class: 'btn btn-big' }),
    el('p', { class: 'hint', text: '玩家使用 TypeScript 编程 · 前后端执行结果一致' }),
    el('details', { class: 'mcp-card' }, [
      el('summary', { text: '🤖 让 AI 帮你写代码 · MCP 接入' }),
      mcpGuide(),
    ]),
  ]);
  root.append(box);
}
