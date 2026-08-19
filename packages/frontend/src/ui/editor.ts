// CodeMirror 6 editor wrapper: line numbers, syntax highlighting (TS), API completion, Maple Mono font,
// Tokyo Night theme.
//
// Note: we do not use basicSetup; instead we compose extensions manually — basicSetup's built-in
// highlightSelectionMatches highlights "selected whitespace" across every whitespace in the document.
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
  ...Object.keys(CROPS), // Crop code names (registry-driven, new crops auto-complete).
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

/** Equivalent to basicSetup but without highlightSelectionMatches (see file header comment). */
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

/** Dynamic read-only toggle: switch via dispatch({ effects: readOnlyEffect.of(true) }). */
const readOnlyEffect = StateEffect.define<boolean>();

export interface EditorHandle {
  getValue(): string;
  setValue(v: string): void;
  /** Toggle read-only (lock code while game is running). */
  setReadOnly(readonly: boolean): void;
  /** CodeMirror root DOM node (can be remounted when switching tabs). */
  dom: HTMLElement;
}

export function createEditor(
  parent: HTMLElement,
  opts: { initial: string; readonly?: boolean; onChange?: (v: string) => void }
): EditorHandle {
  // Read-only state field: initialized from opts.readonly, then switched dynamically via setReadOnly.
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
