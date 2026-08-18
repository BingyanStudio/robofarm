// 无人机 API 手册: 右侧大边栏, 默认收起, 点击右侧图标弹出/收起。
// 内容按 Tab 分组: 操作 / 函数 / 数据 / 作物 / 规则。
// 文档内容来自 shared/src/docs.ts (单一事实来源, 与后端 MCP 服务器共用)。
// 主菜单的"API 手册"弹窗复用同一份内容 (apiManualContent, 全部展开)。
import { el, button } from './ui';
import {
  CROPS,
  DOC_OPERATIONS,
  DOC_FUNCTIONS,
  DOC_TYPES,
  DOC_RULES,
  DOC_OVERVIEW,
  cropDocEntries,
  DocEntry,
} from '@robofarm/shared';
import { loadSprites } from './sprites';

function codeBlock(code: string): HTMLElement {
  return el('pre', { class: 'manual-code', text: code });
}

function section(title: string, ...children: (Node | string)[]): HTMLElement {
  return el('div', {}, [el('h3', { text: title }), ...children]);
}

/** 渲染文本: 反引号片段 → 行内代码, [text](#ref) → 文档内超链接 */
function fmt(text: string): HTMLElement {
  const tokens = text.split(/(`[^`]*`|\[[^\]]*\]\(#[^)]*\))/g).filter(Boolean);
  const out: (Node | string)[] = [];
  for (const tok of tokens) {
    if (tok.startsWith('`') && tok.endsWith('`')) {
      out.push(el('code', { text: tok.slice(1, -1) }));
    } else if (tok.startsWith('[')) {
      const m = tok.match(/^\[([^\]]*)\]\(#([^)]*)\)$/);
      if (m) out.push(refLink(m[1], m[2]));
      else out.push(document.createTextNode(tok));
    } else {
      out.push(document.createTextNode(tok));
    }
  }
  return el('span', {}, out);
}

/** 无序列表 */
function list(items: string[]): HTMLElement {
  const ul = el('ul', { class: 'doc-list' });
  for (const item of items) ul.append(el('li', {}, [fmt(item)]));
  return ul;
}

/** 文档内超链接: 点击跳转到 data-ref 指向的条目/面板 */
function refLink(text: string, ref: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'doc-link';
  a.textContent = text;
  a.setAttribute('data-ref', ref);
  a.href = `#${ref}`;
  return a;
}

/** MCP 接入说明 (开始界面 / 主菜单 / API 手册顶部复用) */
export function mcpGuide(): HTMLElement {
  // MCP 地址: 优先 VITE_MCP_BASE (env), 否则默认同源 /mcp (开发环境经 vite 代理转发)
  const envBase = (import.meta.env.VITE_MCP_BASE as string | undefined)?.trim();
  const httpUrl = envBase ? new URL('/mcp', envBase).href : new URL('/mcp', location.origin).href;
  const urlBlock = codeBlock(httpUrl);
  urlBlock.title = '点击复制';
  urlBlock.style.cursor = 'pointer';
  urlBlock.addEventListener('click', () => {
    void navigator.clipboard?.writeText(httpUrl);
  });
  return el('div', { class: 'manual mcp-guide' }, [
    el('p', { text: '让任意支持 MCP 的 Agent 直接读取本游戏的 API 文档, 帮你编写无人机代码。' }),
    el('p', {}, [el('b', { text: '接入地址:' })]),
    urlBlock,
  ]);
}

/** 渲染一个文档条目 (内容来自 shared docs) */
function docEntry(e: DocEntry): HTMLElement {
  const rows: HTMLElement[] = [
    el('h4', { text: e.name }),
    el('p', {}, [el('b', { text: '定义: ' }), el('code', { text: e.def })]),
    el('p', {}, [el('b', { text: '描述: ' }), fmt(e.desc)]),
  ];
  if (e.params) {
    rows.push(el('p', {}, [el('b', { text: '参数: ' })]), list(e.params));
  }
  if (e.returns) rows.push(el('p', {}, [el('b', { text: '返回: ' }), fmt(e.returns)]));
  if (e.example) {
    rows.push(el('p', {}, [el('b', { text: '示例: ' })]), codeBlock(e.example));
  }
  return el('div', { class: 'doc-entry', id: e.id }, rows);
}

/** 规则段落 */
function ruleSection(rs: { title: string; paragraphs: string[] }): HTMLElement {
  return section(rs.title, ...rs.paragraphs.map((p) => el('p', {}, [fmt(p)])));
}

/** 各 Tab 的内容 (顺序与 Tab 一致; 面板 id 供超链接跳转) */
function buildSections(): HTMLElement[] {
  return [
    // ---- 1. 操作 ----
    el('div', { class: 'api-panel', id: 'tab-ops' }, [
      section(
        '无人机操作',
        el('p', { class: 'hint', text: '`run(droneId)` 函数必须返回本章指定的类型，表示无人机执行特定操作; 或返回 null 表示本回合不动。' }),
        ...DOC_OPERATIONS.map(docEntry)
      ),
    ]),

    // ---- 2. 函数 ----
    el('div', { class: 'api-panel', id: 'tab-fns' }, [
      section(
        'API 函数',
        el('p', { class: 'hint', text: '坐标均为 `[x, y]` 元组, x 向右, y 向下; 越界访问返回 `null`。' }),
        ...DOC_FUNCTIONS.map(docEntry)
      ),
    ]),

    // ---- 3. 数据 ----
    el('div', { class: 'api-panel', id: 'tab-data' }, [
      section('数据类型', ...DOC_TYPES.map(docEntry)),
    ]),

    // ---- 4. 作物 ----
    el('div', { class: 'api-panel', id: 'tab-crops' }, [
      section('作物一览', cropsSection()),
    ]),

    // ---- 5. 规则 ----
    el('div', { class: 'api-panel', id: 'tab-rules' }, [
      section('游戏概览', ...DOC_OVERVIEW.paragraphs.map((p) => el('p', {}, [fmt(p)]))),
      ...DOC_RULES.map(ruleSection),
    ]),
  ];
}

/** 作物一览: 图标 (成熟贴图) + 代码名 + 名称 + 参数 (无序列表) + 描述 */
function cropsSection(): HTMLElement {
  const cropList = el('div', { class: 'crop-list' });
  for (const entry of cropDocEntries()) {
    const cfg = Object.values(CROPS).find((c) => c.name === entry.name);
    const icon = el('img', { class: 'crop-icon' });
    if (cfg) {
      void loadSprites().then((s) => {
        const stages = s.crops[cfg.type];
        if (stages && stages.length > 0) icon.src = stages[stages.length - 1].src; // 成熟贴图
      });
    }
    const codeName = entry.def.replace(/^代码名: `|`$/g, '');
    const card = el('div', { class: 'crop-card' }, [
      icon,
      el('div', { class: 'crop-card-body' }, [
        el('div', { class: 'crop-name', text: entry.name }),
        el('p', {}, [el('b', { text: '代码名: ' }), el('code', { text: codeName })]),
        el('p', {}, [el('b', { text: '参数: ' })]),
        list(entry.params ?? []),
        el('p', {}, [el('b', { text: '描述: ' }), fmt(entry.desc)]),
      ]),
    ]);
    cropList.append(card);
  }
  return cropList;
}

/** 让文档内超链接可跳转: 目标所在面板被隐藏时先激活对应 Tab */
function wireDocLinks(root: HTMLElement, tabBar: HTMLElement | null, panels: HTMLElement[]): void {
  root.querySelectorAll<HTMLAnchorElement>('a.doc-link[data-ref]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.ref ?? '');
      if (!target) return;
      if (tabBar && panels.length > 0) {
        const panel = target.closest('.api-panel') as HTMLElement | null;
        const idx = panel ? panels.indexOf(panel) : -1;
        if (idx >= 0) {
          tabBar.querySelectorAll<HTMLButtonElement>('.api-tab').forEach((b, j) => {
            b.classList.toggle('active', j === idx);
            panels[j].style.display = j === idx ? '' : 'none';
          });
        }
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/** 完整手册正文 (主菜单弹窗使用, 全部展开) */
export function apiManualContent(): HTMLElement {
  const root = el('div', { class: 'manual' }, [mcpGuide(), ...buildSections()]);
  wireDocLinks(root, null, []);
  return root;
}

/** 右侧边栏使用: Tab 分组的 API 手册 (顶部为 MCP 接入说明, 可展开) */
function apiManualTabs(): HTMLElement {
  const names = ['操作', '函数', '数据', '作物', '规则'];
  const panels = buildSections();
  const tabBar = el('div', { class: 'api-tabs' });
  const buttons: HTMLButtonElement[] = [];
  names.forEach((name, i) => {
    const b = el('button', { class: 'api-tab' + (i === 0 ? ' active' : ''), text: name });
    buttons.push(b);
    b.addEventListener('click', () => {
      buttons.forEach((x, j) => {
        x.classList.toggle('active', j === i);
        panels[j].style.display = j === i ? '' : 'none';
      });
    });
  });
  tabBar.append(...buttons);
  panels.forEach((p, i) => {
    if (i !== 0) p.style.display = 'none';
  });
  const mcpStrip = el('details', { class: 'mcp-strip' }, [
    el('summary', { text: '🎉 MCP 接入' }),
    mcpGuide(),
  ]);
  const root = el('div', { class: 'api-tabs-root' }, [mcpStrip, tabBar, ...panels]);
  wireDocLinks(root, tabBar, panels);
  return root;
}

/** 挂载右侧 API 手册边栏 (默认收起, 点击图标切换) */
export function mountApiManual(): void {
  const sidebar = el('div', { class: 'api-sidebar' });
  const closeBtn = button('✕', () => setOpen(false), { class: 'btn btn-small' });
  const head = el('div', { class: 'api-sidebar-head' }, [el('h3', { text: '无人机 API 手册' }), closeBtn]);
  const body = el('div', { class: 'api-sidebar-body' }, [apiManualTabs()]);
  // 切换图标作为边栏的一部分 (位于其左缘), 收起时贴靠屏幕右缘, 弹出时随面板移动
  const toggle = el('button', { class: 'api-toggle', text: '📖', title: 'API 手册' });
  sidebar.append(toggle, head, body);
  document.body.append(sidebar);

  let open = false;
  function setOpen(v: boolean): void {
    open = v;
    sidebar.classList.toggle('open', v);
    toggle.classList.toggle('active', v);
  }
  toggle.addEventListener('click', () => setOpen(!open));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });
}
