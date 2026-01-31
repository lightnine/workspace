import React, { useRef, useEffect, useCallback, useState } from 'react';
import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { cn } from '@/lib/utils';

interface CodeMirrorEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: 'python' | 'markdown' | 'javascript' | 'json' | 'text';
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  lineWrapping?: boolean;
  showLineNumbers?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent, view: EditorView) => boolean;
  theme?: 'light' | 'dark';
}

const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

const getLanguageExtension = (lang: string) => {
  switch (lang) {
    case 'python':
      return python();
    case 'markdown':
      return markdown();
    case 'javascript':
      return javascript();
    case 'json':
      return json();
    default:
      return [];
  }
};

// Light theme
const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
  },
  '.cm-content': {
    caretColor: 'hsl(var(--primary))',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13px',
    lineHeight: '1.6',
    padding: '8px 0',
  },
  '.cm-cursor': {
    borderLeftColor: 'hsl(var(--primary))',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'hsl(var(--primary) / 0.15) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'hsl(var(--primary) / 0.2) !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'hsl(var(--muted) / 0.3)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'hsl(var(--muted) / 0.3)',
  },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--background))',
    borderRight: '1px solid hsl(var(--border))',
    color: 'hsl(var(--muted-foreground))',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 12px 0 8px',
    minWidth: '48px',
    fontSize: '12px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
  },
  '.cm-tooltip': {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '6px',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li': {
      padding: '4px 8px',
    },
    '& > ul > li[aria-selected]': {
      backgroundColor: 'hsl(var(--accent))',
    },
  },
}, { dark: false });

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  value,
  onChange,
  language = 'python',
  readOnly = false,
  placeholder: placeholderText,
  className,
  minHeight = '100px',
  maxHeight,
  lineWrapping = false,
  showLineNumbers = true,
  onFocus,
  onBlur,
  onKeyDown,
  theme = 'dark',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Create editor
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      history(),
      drawSelection(),
      rectangularSelection(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSelectionMatches(),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      autocompletion(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        ...completionKeymap,
        ...searchKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
      languageCompartment.of(getLanguageExtension(language)),
      themeCompartment.of(theme === 'dark' ? oneDark : lightTheme),
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChange) {
          onChange(update.state.doc.toString());
        }
        if (update.focusChanged) {
          setIsFocused(update.view.hasFocus);
          if (update.view.hasFocus) {
            onFocus?.();
          } else {
            onBlur?.();
          }
        }
      }),
    ];

    if (showLineNumbers) {
      extensions.push(lineNumbers());
      extensions.push(foldGutter());
    }

    if (lineWrapping) {
      extensions.push(EditorView.lineWrapping);
    }

    if (placeholderText) {
      extensions.push(placeholder(placeholderText));
    }

    if (onKeyDown) {
      extensions.push(
        keymap.of([{
          any: (view, event) => {
            return onKeyDown(event, view);
          },
        }])
      );
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only run once on mount

  // Update value when it changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  // Update language
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: languageCompartment.reconfigure(getLanguageExtension(language)),
    });
  }, [language]);

  // Update theme
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartment.reconfigure(theme === 'dark' ? oneDark : lightTheme),
    });
  }, [theme]);

  // Update readOnly
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  // Public method to focus
  const focus = useCallback(() => {
    viewRef.current?.focus();
  }, []);

  // Public method to get cursor position
  const getCursorPosition = useCallback(() => {
    const view = viewRef.current;
    if (!view) return null;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    return {
      line: line.number,
      column: pos - line.from,
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-md border transition-colors',
        isFocused ? 'border-primary ring-1 ring-primary/20' : 'border-border',
        readOnly && 'opacity-80',
        className
      )}
      style={{
        minHeight,
        maxHeight,
      }}
    />
  );
};

export default CodeMirrorEditor;
