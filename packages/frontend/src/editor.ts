// CodeMirror 6 编辑器封装: 行号、语法高亮 (TS)、API 补全、Maple Mono 字体、
// Tokyo Night 主题。
//
// 注意: 不使用 basicSetup, 而是手动组合扩展 —— basicSetup 内置的
// highlightSelectionMatches 会把"选中的空白"高亮到全篇所有空白处。
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { javascript } from '@codemirror/lang-javascript';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import { CROPS } from '@robofarm/shared';

const API_KEYWORDS = [
  'run', 'getSelf', 'getGame', 'getMap', 'getTile', 'getCrop', 'getDrone',
  'CropType', 'CropState', 'TileType', 'DroneOperation',
  'DroneOperation', 'Move', 'Plant', 'CollectWater', 'Water', 'Harvest', 'Clear', 'Intercept',
  ...Object.keys(CROPS), // 作物代码名 (注册表驱动, 新增作物自动补全)
  'soil', 'water',
];

function roboFarmCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: API_KEYWORDS.map((label) => ({ label, type: 'keyword' })),
  };
}

/** 与 basicSetup 等价但去掉 highlightSelectionMatches (见文件头注释) */
const editorSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion({ activateOnTyping: true, override: [roboFarmCompletions] }),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];

/** 动态只读开关: 通过 dispatch({ effects: readOnlyEffect.of(true) }) 切换 */
const readOnlyEffect = StateEffect.define<boolean>();

export interface EditorHandle {
  getValue(): string;
  setValue(v: string): void;
  /** 切换只读 (游戏进行中锁定代码) */
  setReadOnly(readonly: boolean): void;
  /** CodeMirror 的根 DOM 节点 (切换 tab 时可重新挂载) */
  dom: HTMLElement;
}

export function createEditor(
  parent: HTMLElement,
  opts: { initial: string; readonly?: boolean; onChange?: (v: string) => void }
): EditorHandle {
  // 只读状态字段: 初始化取 opts.readonly, 之后由 setReadOnly 动态切换
  const readOnlyField = StateField.define<boolean>({
    create: () => !!opts.readonly,
    update(value, tr) {
      for (const e of tr.effects) {
        if (e.is(readOnlyEffect)) value = e.value;
      }
      return value;
    },
    provide: (field) => [
      EditorState.readOnly.from(field),
      EditorView.editable.from(field, (v) => !v),
    ],
  });

  const view = new EditorView({
    parent,
    doc: opts.initial,
    extensions: [
      editorSetup,
      javascript({ typescript: true }),
      tokyoNight,
      readOnlyField,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) opts.onChange?.(update.state.doc.toString());
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '14px' },
        '.cm-content': { fontFamily: "'Maple Mono', ui-monospace, Consolas, monospace" },
        '.cm-gutters': { fontFamily: "'Maple Mono', ui-monospace, Consolas, monospace" },
      }),
    ],
  });
  return {
    getValue: () => view.state.doc.toString(),
    setValue: (v: string) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }),
    setReadOnly: (ro: boolean) => view.dispatch({ effects: readOnlyEffect.of(ro) }),
    dom: view.dom,
  };
}
