// 模拟竞技: 本机同时运行敌我双方代码 (双方各自坐标系), 模拟对战。
// 回合循环 (编译/开始/暂停/步进/调速/结束) 由 GameRunner 提供, 这里只保留
// 双 Tab 编辑器与胜负展示等模拟竞技专属逻辑。
import { BrowserProgram } from '../browser-program';
import { GameController, compilePlayerCode, createCombatWorld, DEFAULT_MAX_TURNS, GameResult } from '@robofarm/shared';
import { DEFAULT_CODE } from '../game-layout';
import { createEditor } from '../editor';
import type { EditorHandle } from '../editor';
import { el, button, modal, topBar } from '../ui';
import { GameRunner } from '../game-runner';

const KEY_ME = 'robofarm.simulate.me';
const KEY_ENEMY = 'robofarm.simulate.enemy';

export function simulateScreen(root: HTMLElement): void {
  root.replaceChildren();

  const lockBar = el('div', { class: 'editor-lock-bar', style: 'display:none' }, [
    el('span', { text: '🔒 游戏进行中, 代码已锁定' }),
    button('停止游戏', () => runner.stopForEdit(), { class: 'btn btn-small' }),
  ]);

  const runner = new GameRunner({
    title: '模拟竞技 · 敌我双方代码在本机对战',
    previewWorld: () => createCombatWorld(DEFAULT_MAX_TURNS),
    buildGame: async (log) => {
      // 先确保两个编辑器都已创建 (用户可能从没切到"对方无人机" Tab)
      ensureEditor('me');
      ensureEditor('enemy');
      const codeA = editors.me!.getValue();
      const codeB = editors.enemy!.getValue();
      const [a, b] = await Promise.all([compilePlayerCode(codeA), compilePlayerCode(codeB)]);
      if (!a.ok) {
        reportCompileError('我方', a.errors, log);
        return null;
      }
      if (!b.ok) {
        reportCompileError('对方', b.errors, log);
        return null;
      }
      try {
        const programA = await BrowserProgram.create(a.js);
        const programB = await BrowserProgram.create(b.js);
        const controller = new GameController({
          mode: 'combat',
          players: [
            { name: '我方', frame: 'normal', program: programA },
            { name: '对方', frame: 'mirror', program: programB },
          ],
          maxTurns: DEFAULT_MAX_TURNS,
        });
        return { controller, programs: [programA, programB] };
      } catch (err) {
        log(`[错误] ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
    setEditorLocked: (locked) => {
      for (const key of ['me', 'enemy'] as const) {
        editors[key]?.setReadOnly(locked);
      }
      lockBar.style.display = locked ? 'flex' : 'none';
    },
    gameStartLog: '[系统] 新对局开始 (我方为左侧, 对方为镜像视角)',
    onEnd: (result) => handleEnd(result),
  });

  function reportCompileError(who: string, errors: { message: string; line?: number }[], log: (line: string) => void): void {
    for (const e of errors) {
      log(`[编译错误 ${who}]${e.line ? ` 第 ${e.line} 行` : ''}: ${e.message}`);
    }
  }

  function handleEnd(result: GameResult): void {
    if (result.type === 'finished') {
      const [s0, s1] = result.scores;
      const winner = s0.money > s1.money ? '我方' : s1.money > s0.money ? '对方' : '平局';
      runner.statusText.textContent = `对局结束 · 胜者: ${winner}`;
      runner.log(`[系统] 对局结束: 我方 ${s0.money} vs 对方 ${s1.money}, 胜者: ${winner}`);
      modal(
        '对局结束',
        el('div', {}, [
          el('p', { text: `我方 ${s0.money} vs 对方 ${s1.money}` }),
          el('p', { class: 'hint', text: `胜者: ${winner}` }),
        ])
      );
    } else {
      runner.statusText.textContent = '对局中止';
      runner.log(`[错误] ${result.message}`);
      modal('对局中止', el('p', { text: result.message }));
    }
  }

  // 双 Tab 编辑器 (挂到运行器布局的编辑区: Tab 条 + 锁定条在上, 编辑器在下)
  const tabs = el('div', { class: 'tabs' });
  const tabMe = el('button', { class: 'tab active', text: '我方无人机' });
  const tabEnemy = el('button', { class: 'tab', text: '对方无人机' });
  tabs.append(tabMe, tabEnemy);
  runner.layout.editorHost.append(tabs, lockBar);

  const editorHost = el('div', { class: 'editor-host' });
  runner.layout.editorHost.append(editorHost);
  const editors: Partial<Record<'me' | 'enemy', EditorHandle>> = {};

  function ensureEditor(tab: 'me' | 'enemy'): void {
    if (editors[tab]) return;
    const key = tab === 'me' ? KEY_ME : KEY_ENEMY;
    editors[tab] = createEditor(editorHost, {
      initial: localStorage.getItem(key) ?? DEFAULT_CODE,
      onChange: (v) => localStorage.setItem(key, v),
    });
  }
  function showTab(tab: 'me' | 'enemy'): void {
    tabMe.classList.toggle('active', tab === 'me');
    tabEnemy.classList.toggle('active', tab === 'enemy');
    editorHost.replaceChildren();
    ensureEditor(tab);
    editorHost.append(editors[tab]!.dom);
  }
  tabMe.onclick = () => showTab('me');
  tabEnemy.onclick = () => showTab('enemy');
  showTab('me');

  root.append(topBar(), runner.layout.root);
}
