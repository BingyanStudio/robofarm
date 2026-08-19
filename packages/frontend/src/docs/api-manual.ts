// Drone API manual: right-hand large sidebar, collapsed by default, toggled via right-edge icon.
// Content grouped into tabs: Operations / Functions / Data / Crops / Rules.
// Docs come from shared/src/docs.ts (single source of truth, shared with the backend MCP server).
// The main menu "API manual" modal reuses the same content (apiManualContent, fully expanded).
import { el, button } from '../ui/ui';
import { icon } from '../ui/icon';
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
import { loadSprites } from '../core/sprites';

function codeBlock(code: string): HTMLElement {
  return el('pre', { class: 'manual-code', text: code });
}

function section(title: string, ...children: (Node | string)[]): HTMLElement {
  return el('div', {}, [el('h3', { text: title }), ...children]);
}

/** Render text: backtick spans -> inline code, [text](#ref) -> in-doc hyperlink, **bold**, *italic* */
function fmt(text: string): HTMLElement {
  const tokens = text.split(/(`[^`]*`|\[[^\]]*\]\(#[^)]*\)|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  const out: (Node | string)[] = [];
  for (const tok of tokens) {
    if (tok.startsWith('`') && tok.endsWith('`')) {
      out.push(el('code', { text: tok.slice(1, -1) }));
    } else if (tok.startsWith('**') && tok.endsWith('**')) {
      out.push(el('strong', { text: tok.slice(2, -2) }));
    } else if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 1) {
      out.push(el('em', { text: tok.slice(1, -1) }));
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

/** Unordered list */
function list(items: string[]): HTMLElement {
  const ul = el('ul', { class: 'doc-list' });
  for (const item of items) ul.append(el('li', {}, [fmt(item)]));
  return ul;
}

/** In-doc hyperlink: click to jump to the entry/panel referenced by data-ref */
function refLink(text: string, ref: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'doc-link';
  a.textContent = text;
  a.setAttribute('data-ref', ref);
  a.href = `#${ref}`;
  return a;
}

/** Copy a URL to the clipboard and flash the button label with a check icon. */
function copyButton(url: string, btn: HTMLElement): HTMLElement {
  // Prepend a copy icon to the button label.
  btn.replaceChildren(icon('copy', 14), document.createTextNode(' ' + (btn.textContent ?? '')));
  btn.addEventListener('click', () => {
    void navigator.clipboard?.writeText(url).then(() => {
      const label = btn.lastChild;
      btn.replaceChildren(icon('check', 14), document.createTextNode(' 已复制'));
      setTimeout(() => {
        btn.replaceChildren(icon('copy', 14), label ?? document.createTextNode(''));
      }, 1400);
    });
  });
  return btn;
}

/** MCP onboarding note (reused at start screen / main menu / top of API manual). */
export function mcpGuide(): HTMLElement {
  // Same-origin priority: prefer VITE_MCP_BASE (env), otherwise default to current origin (dev via vite proxy)
  const envBase = (import.meta.env.VITE_MCP_BASE as string | undefined)?.trim();
  const origin = envBase ? new URL(envBase).origin : location.origin;
  const llmUrl = new URL('/llm.txt', origin).href;
  const httpUrl = new URL('/mcp', origin).href;

  const item = (title: string, desc: string, url: string, copyLabel: string): HTMLElement =>
    el('div', { class: 'mcp-method' }, [
      el('div', { class: 'mcp-method-head' }, [
        el('span', { class: 'mcp-method-title', text: title }),
        copyButton(url, button(copyLabel, () => {}, { class: 'btn btn-small' })),
      ]),
      el('p', { class: 'mcp-method-desc', text: desc }),
      codeBlock(url),
    ]);

  const nodes: HTMLElement[] = [
    el('p', { class: 'mcp-guide-lead', text: '不想亲自 Coding? 让 Agent 帮你!' }),
    item('llm.txt · 最简单', '把链接交给 AI, 它可直接获取游戏文档', llmUrl, '复制链接'),
    item('MCP · HTTP', '使用 MCP 接入, 获取文档并直接提交代码', httpUrl, '复制地址'),
  ];
  return el('div', { class: 'manual mcp-guide' }, nodes);
}

/** Collapsible MCP onboarding strip (<details>, collapsed by default). */
export function mcpCollapse(): HTMLElement {
  const strip = el('details', { class: 'mcp-strip' }, [
    el('summary', { text: 'MCP 接入' }),
  ]);
  const mcpBody = el('div', { class: 'mcp-collapse-body' }, [mcpGuide()]);
  strip.append(mcpBody);

  // Native <details> removes its content as soon as `open` becomes false, which
  // prevents a closing animation. Keep it open until the CSS grid collapse ends.
  let closing = false;
  function closeMcp(): void {
    if (!strip.open || closing) return;
    closing = true;
    strip.classList.add('is-closing');
  }
  mcpBody.addEventListener('transitionend', (event) => {
    if (event.propertyName !== 'grid-template-rows' || !closing) return;
    closing = false;
    strip.classList.remove('is-closing');
    strip.open = false;
  });
  // Browser <details> applies `open` before the first paint, so delay setting
  // it by one frame to give the collapsed grid state a rendered starting point.
  const summary = strip.querySelector('summary')!;
  summary.addEventListener('click', (event) => {
    if (strip.open) {
      event.preventDefault();
      closeMcp();
      return;
    }
    event.preventDefault();
    requestAnimationFrame(() => {
      strip.open = true;
    });
  });
  strip.addEventListener('toggle', () => {
    if (!strip.open) return;
    closing = false;
    strip.classList.remove('is-closing');
  });
  return strip;
}

/** Render a doc entry (content from shared docs) */
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

/** Render one rule paragraph. A leading short "label:" is split off into a badge so the dense rules tier into scannable term + description rows; backticked code keeps its chip styling. */
function ruleParagraph(text: string): HTMLElement {
  const m = text.match(/^([^:：]{1,12}?)\s*[:：]\s*(.+)$/s);
  const p = el('p', { class: 'rule-card-p' });
  if (m) {
    p.append(el('span', { class: 'rule-label', text: m[1].trim() }));
    p.append(fmt(m[2]));
  } else {
    p.append(fmt(text));
  }
  return p;
}

/** Rule section: each rendered as a card with an accent left border + heading, so the dense rules break into scannable blocks instead of a flat wall of text. */
function ruleSection(rs: { title: string; paragraphs: string[] }): HTMLElement {
  return el('div', { class: 'rule-card' }, [
    el('h3', { class: 'rule-card-title', text: rs.title }),
    ...rs.paragraphs.map(ruleParagraph),
  ]);
}

/** Content per tab (order matches tabs; panel ids used for hyperlink jumps) */
function buildSections(): HTMLElement[] {
  return [
    // ---- 1. Operations ----
    el('div', { class: 'api-panel', id: 'tab-ops' }, [
      section(
        '无人机操作',
        el('p', { class: 'hint', text: '`run(droneId)` 函数必须返回本章指定的类型，表示无人机执行特定操作; 或返回 null 表示本回合不动。' }),
        ...DOC_OPERATIONS.map(docEntry)
      ),
    ]),

    // ---- 2. Functions ----
    el('div', { class: 'api-panel', id: 'tab-fns' }, [
      section(
        'API 函数',
        el('p', { class: 'hint', text: '坐标均为 `[x, y]` 元组, x 向右, y 向下; 越界访问返回 `null`。' }),
        ...DOC_FUNCTIONS.map(docEntry)
      ),
    ]),

    // ---- 3. Data ----
    el('div', { class: 'api-panel', id: 'tab-data' }, [
      section('数据类型', ...DOC_TYPES.map(docEntry)),
    ]),

    // ---- 4. Crops ----
    el('div', { class: 'api-panel', id: 'tab-crops' }, [
      section('作物一览', cropsSection()),
    ]),

    // ---- 5. Rules ----
    el('div', { class: 'api-panel', id: 'tab-rules' }, [
      el('div', { class: 'rule-card rule-card-lead' }, [
        el('h3', { class: 'rule-card-title', text: DOC_OVERVIEW.title }),
        ...DOC_OVERVIEW.paragraphs.map(ruleParagraph),
      ]),
      el('div', { class: 'rule-cards' }, DOC_RULES.map(ruleSection)),
    ]),
  ];
}

/** Crop list: icon (mature sprite) + name/code header + compact stat tags + description. */
function cropsSection(): HTMLElement {
  const cropList = el('div', { class: 'crop-list' });
  for (const entry of cropDocEntries()) {
    const cfg = Object.values(CROPS).find((c) => c.name === entry.name);
    const icon = el('img', { class: 'crop-icon' });
    if (cfg) {
      void loadSprites().then((s) => {
        const stages = s.crops[cfg.type];
        if (stages && stages.length > 0) icon.src = stages[stages.length - 1].src; // mature sprite
      });
    }
    const codeName = entry.def.replace(/^代码名: `|`$/g, '');
    // Render each param ("label: value") as a compact stat tag instead of a bullet list.
    const tags = (entry.params ?? []).map((p) => {
      const m = p.match(/^([^:：]+?)\s*[:：]\s*(.+)$/);
      return el('span', { class: 'crop-tag' }, [
        el('span', { class: 'crop-tag-key', text: m ? m[1].trim() : p }),
        m ? el('span', { class: 'crop-tag-val', text: m[2].trim() }) : el('span'),
      ]);
    });
    const card = el('div', { class: 'crop-card' }, [
      icon,
      el('div', { class: 'crop-card-body' }, [
        el('div', { class: 'crop-card-head' }, [
          el('span', { class: 'crop-name', text: entry.name }),
          el('code', { class: 'crop-code', text: codeName }),
        ]),
        el('div', { class: 'crop-tags' }, tags),
        el('p', { class: 'crop-desc' }, [fmt(entry.desc)]),
      ]),
    ]);
    cropList.append(card);
  }
  return cropList;
}

/** Enable in-doc hyperlinks: activate the target tab first if its panel is hidden */
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

/** Full manual body (used by main menu modal, fully expanded) */
export function apiManualContent(): HTMLElement {
  const root = el('div', { class: 'manual' }, [mcpGuide(), ...buildSections()]);
  wireDocLinks(root, null, []);
  return root;
}

/** For the right sidebar: tab-grouped API manual (top MCP onboarding note, expandable) */
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
  const mcpStrip = mcpCollapse();
  const root = el('div', { class: 'api-tabs-root' }, [mcpStrip, tabBar, ...panels]);
  wireDocLinks(root, tabBar, panels);
  return root;
}

/** Mount right-hand API manual sidebar (collapsed by default, click icon to toggle) */
export function mountApiManual(): () => void {
  const sidebar = el('div', { class: 'api-sidebar' });
  const closeBtn = el('button', { class: 'btn btn-small', title: '关闭', onClick: () => setOpen(false) }, [icon('close', 14)]);
  const head = el('div', { class: 'api-sidebar-head' }, [el('h3', { text: '无人机 API 手册' }), closeBtn]);
  const body = el('div', { class: 'api-sidebar-body' }, [apiManualTabs()]);
  // Toggle icon is part of the sidebar (on its left edge): sticks to right screen edge when collapsed, moves with panel when open
  const toggle = el('button', { class: 'api-toggle', title: 'API 手册' }, [icon('book', 18)]);
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
  // Return control handle (for auto-expand on first visit)
  return () => setOpen(true);
}
