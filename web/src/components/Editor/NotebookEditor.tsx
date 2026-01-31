import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import DOMPurify from 'dompurify';
import Editor from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useApp } from '../../context/AppContext';
import { useKernel } from '../../context/KernelContext';
import type { CellOutput } from '../../services/kernel';
import {
  Play,
  ListOrdered,
  Square,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Code,
  Type,
  ChevronRight,
  ChevronDownIcon,
  X,
  ArrowUpToLine,
  ArrowDownToLine,
  RotateCcw,
  Circle,
  CheckCircle2,
  XCircle,
  ChevronsDownUp,
  ChevronsUpDown,
  Link,
  Unlink,
  Save,
  RefreshCw,
  Cloud,
  Loader2,
} from 'lucide-react';
import { CellOperation } from '../../services/api';

export type { CellOperation };

interface NotebookEditorProps {
  content?: string;
  height?: string;
  onChange?: (content: string) => void;
  onSave?: () => Promise<void>;
  onPatchSave?: (operations: CellOperation[]) => Promise<void>;
  readOnly?: boolean;
  isDirty?: boolean;
  autoSaveEnabled?: boolean;
  onAutoSaveChange?: (enabled: boolean) => void;
}

interface NotebookData {
  cells: NotebookCell[];
  metadata?: {
    language_info?: { name?: string };
    kernelspec?: { display_name?: string; language?: string; name?: string };
  };
  nbformat?: number;
  nbformat_minor?: number;
}

interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  outputs?: NotebookOutput[];
  execution_count?: number | null;
  metadata?: { language?: string; collapsed?: boolean; scrolled?: boolean };
  id?: string;
}

// Supported languages for code cells
type CellLanguage = 'python' | 'sql' | 'r' | 'scala' | 'markdown';

interface LanguageConfig {
  id: CellLanguage;
  name: string;
  monacoLanguage: string;
  icon: string;
  color: string;
}

const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { id: 'python', name: 'Python', monacoLanguage: 'python', icon: 'Py', color: 'bg-blue-500' },
  { id: 'sql', name: 'SQL', monacoLanguage: 'sql', icon: 'SQL', color: 'bg-orange-500' },
  { id: 'r', name: 'R', monacoLanguage: 'r', icon: 'R', color: 'bg-sky-500' },
  { id: 'scala', name: 'Scala', monacoLanguage: 'scala', icon: 'Sc', color: 'bg-red-500' },
  { id: 'markdown', name: 'Markdown', monacoLanguage: 'markdown', icon: 'MD', color: 'bg-purple-500' },
];

const getLanguageConfig = (lang: string): LanguageConfig => {
  const normalizedLang = lang.toLowerCase();
  return SUPPORTED_LANGUAGES.find(l => l.id === normalizedLang || l.monacoLanguage === normalizedLang) 
    || SUPPORTED_LANGUAGES[0]; // default to Python
};

interface NotebookOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
  text?: string | string[];
  data?: Record<string, string | string[]>;
  traceback?: string[];
  ename?: string;
  evalue?: string;
  name?: string;
  execution_count?: number;
  metadata?: Record<string, unknown>;
}

// Utility functions
const normalizeText = (value?: string | string[]) => {
  if (!value) return '';
  return Array.isArray(value) ? value.join('') : value;
};

const textToArray = (text: string): string[] => {
  return text.split('\n').map((line, index, arr) => 
    index < arr.length - 1 ? line + '\n' : line
  ).filter((line, index, arr) => !(index === arr.length - 1 && line === ''));
};

const hasErrorOutput = (outputs?: NotebookOutput[]) =>
  outputs?.some(output => output.output_type === 'error') ?? false;

const generateCellId = () => `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const createEmptyCell = (type: 'code' | 'markdown' = 'code'): NotebookCell => ({
  cell_type: type,
  source: [],
  outputs: type === 'code' ? [] : undefined,
  execution_count: type === 'code' ? null : undefined,
  metadata: {},
  id: generateCellId()
});

// Output renderer component
const CellOutputRenderer: React.FC<{ outputs: NotebookOutput[]; isDarkMode: boolean }> = ({ outputs, isDarkMode }) => {
  if (!outputs || outputs.length === 0) return null;

  return (
    <div className="font-mono text-[13px] leading-relaxed">
      {outputs.map((output, index) => {
        const outputType = output.output_type;
        
        if (outputType === 'stream') {
          const text = normalizeText(output.text);
          const isStderr = output.name === 'stderr';
          return (
            <pre
              key={index}
              className={cn(
                'm-0 p-3 bg-transparent whitespace-pre-wrap break-words',
                isStderr ? 'text-red-500' : isDarkMode ? 'text-zinc-300' : 'text-zinc-800'
              )}
            >
              {text}
            </pre>
          );
        }

        if (outputType === 'error') {
          const traceback = normalizeText(output.traceback);
          const errorMsg = traceback || `${output.ename || 'Error'}: ${output.evalue || ''}`;
          return (
            <pre
              key={index}
              className={cn(
                'm-0 p-3 whitespace-pre-wrap break-words text-red-500 rounded',
                isDarkMode ? 'bg-red-500/10' : 'bg-red-50'
              )}
            >
              {errorMsg}
            </pre>
          );
        }

        if (outputType === 'execute_result' || outputType === 'display_data') {
          const html = normalizeText(output.data?.['text/html']);
          const text = normalizeText(output.data?.['text/plain']);
          const imagePng = normalizeText(output.data?.['image/png']);
          const imageJpeg = normalizeText(output.data?.['image/jpeg']);
          const imageData = imagePng || imageJpeg;
          const imageMime = imagePng ? 'image/png' : 'image/jpeg';

          return (
            <div key={index}>
              {html && (
                <div
                  className={cn(
                    'p-3 overflow-x-auto',
                    '[&_table]:border-collapse [&_table]:w-auto [&_table]:text-xs',
                    '[&_th]:border [&_th]:border-border [&_th]:p-1.5 [&_th]:text-left [&_th]:font-semibold',
                    '[&_td]:border [&_td]:border-border [&_td]:p-1.5',
                    isDarkMode ? '[&_th]:bg-white/5' : '[&_th]:bg-black/5'
                  )}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
                />
              )}
              {!html && text && (
                <pre className={cn(
                  'm-0 p-3 whitespace-pre-wrap',
                  isDarkMode ? 'text-zinc-300' : 'text-zinc-800'
                )}>
                  {text}
                </pre>
              )}
              {imageData && (
                <div className="p-3">
                  <img
                    src={`data:${imageMime};base64,${imageData}`}
                    alt="output"
                    className={cn(
                      'max-w-full rounded',
                      isDarkMode ? 'shadow-lg shadow-black/40' : 'shadow-md shadow-black/10'
                    )}
                  />
                </div>
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

// Cell component props
interface CellProps {
  cell: NotebookCell;
  index: number;
  isActive: boolean;
  isRunning: boolean;
  onActivate: () => void;
  onUpdate: (source: string) => void;
  onRun: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertAbove: (type?: 'code' | 'markdown') => void;
  onInsertBelow: (type?: 'code' | 'markdown') => void;
  onChangeType: (type: 'code' | 'markdown') => void;
  onChangeLanguage: (language: CellLanguage) => void;
  onClearOutput: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  readOnly?: boolean;
  language: string;
  totalCells: number;
  isDarkMode: boolean;
}

// Cell component
const NotebookCellComponent: React.FC<CellProps> = ({
  cell,
  index: _index,
  isActive,
  isRunning,
  onActivate,
  onUpdate,
  onRun,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onInsertAbove,
  onInsertBelow,
  onChangeType,
  onChangeLanguage,
  onClearOutput,
  canMoveUp,
  canMoveDown,
  readOnly,
  language,
  totalCells,
  isDarkMode
}) => {
  const { t } = useTranslation();
  const [isMarkdownEditing, setIsMarkdownEditing] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const editorRef = useRef<any>(null);

  const source = normalizeText(cell.source);
  const outputs = cell.outputs ?? [];
  const isCodeCell = cell.cell_type === 'code';
  const isMarkdownCell = cell.cell_type === 'markdown';
  const hasError = hasErrorOutput(outputs);
  const hasOutput = outputs.length > 0;
  const executionCount = cell.execution_count;
  
  // Get cell-specific language (from metadata) or default notebook language
  const cellLanguage = cell.metadata?.language || language;
  const langConfig = getLanguageConfig(cellLanguage);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      onUpdate(value);
    }
  };

  // Calculate editor height
  const editorHeight = useMemo(() => {
    const lines = source.split('\n').length;
    return Math.max(38, Math.min(lines * 19 + 10, 400));
  }, [source]);

  // Status icon
  const StatusIcon = () => {
    if (isRunning) {
      return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
    }
    if (hasError) {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    if (executionCount !== null && executionCount !== undefined) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    return null;
  };

  return (
    <div
      onClick={onActivate}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative mb-0"
    >
      {/* Cell container */}
      <div
        className={cn(
          'flex border-l-2 transition-colors',
          isActive ? 'border-primary bg-primary/5' : 'border-transparent'
        )}
      >
        {/* Left side - execution area */}
        <div className="w-12 flex-shrink-0 flex flex-col items-center pt-1 gap-1">
          {/* Run button */}
          {isCodeCell && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7 rounded-md',
                      (isHovered || isActive) && 'bg-accent'
                    )}
                    onClick={(e) => { e.stopPropagation(); onRun(); }}
                    disabled={readOnly || isRunning}
                  >
                    {isRunning ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">{t('notebook.runCell')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Execution count */}
          {isCodeCell && (
            <span className={cn(
              'font-mono text-[11px] min-h-4 flex items-center justify-center',
              hasError ? 'text-red-500' : 'text-muted-foreground'
            )}>
              [{executionCount ?? ' '}]
            </span>
          )}

          {/* Markdown indicator */}
          {isMarkdownCell && (
            <div className="w-7 h-7 flex items-center justify-center">
              <Type className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Right side - content */}
        <div className="flex-1 min-w-0 py-1 pr-2">
          {/* Cell toolbar - show on hover */}
          <div
            className={cn(
              'flex items-center justify-end gap-0.5 mb-1 h-6 transition-opacity',
              (isHovered || isActive) ? 'opacity-100' : 'opacity-0'
            )}
          >
            {/* Language selector for code cells */}
            {isCodeCell && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-5.5 px-2 text-[11px] font-medium rounded mr-1',
                      langConfig.color,
                      'text-white hover:opacity-90'
                    )}
                    disabled={readOnly}
                  >
                    {langConfig.icon}
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-32">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <DropdownMenuItem
                      key={lang.id}
                      onClick={() => onChangeLanguage(lang.id)}
                      className={cn(
                        'flex items-center gap-2',
                        cellLanguage === lang.id && 'bg-accent'
                      )}
                    >
                      <span className={cn(
                        'w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white',
                        lang.color
                      )}>
                        {lang.icon}
                      </span>
                      {lang.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Type toggle */}
            <div className="flex mr-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-5.5 w-7 rounded-r-none',
                        isCodeCell && (isDarkMode ? 'bg-white/10' : 'bg-black/10')
                      )}
                      onClick={(e) => { e.stopPropagation(); onChangeType('code'); }}
                      disabled={readOnly}
                    >
                      <Code className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Code</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-5.5 w-7 rounded-l-none',
                        isMarkdownCell && (isDarkMode ? 'bg-white/10' : 'bg-black/10')
                      )}
                      onClick={(e) => { e.stopPropagation(); onChangeType('markdown'); }}
                      disabled={readOnly}
                    >
                      <Type className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Markdown</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <Separator orientation="vertical" className="h-4 mx-1" />

            {/* Move buttons */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5.5 w-5.5"
                    onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                    disabled={!canMoveUp || readOnly}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('notebook.moveUp')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5.5 w-5.5"
                    onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                    disabled={!canMoveDown || readOnly}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('notebook.moveDown')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Separator orientation="vertical" className="h-4 mx-1" />

            {/* Copy and delete */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5.5 w-5.5"
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    disabled={readOnly}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('notebook.duplicate')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5.5 w-5.5 hover:text-red-500 hover:bg-red-500/10"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    disabled={readOnly || totalCells <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('notebook.deleteCell')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5.5 w-5.5">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onInsertAbove('code')} disabled={readOnly}>
                  <ArrowUpToLine className="w-4 h-4 mr-2" />
                  {t('notebook.insertCodeAbove')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onInsertBelow('code')} disabled={readOnly}>
                  <ArrowDownToLine className="w-4 h-4 mr-2" />
                  {t('notebook.insertCodeBelow')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onInsertAbove('markdown')} disabled={readOnly}>
                  <Type className="w-4 h-4 mr-2" />
                  {t('notebook.insertMarkdownAbove')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onInsertBelow('markdown')} disabled={readOnly}>
                  <Type className="w-4 h-4 mr-2" />
                  {t('notebook.insertMarkdownBelow')}
                </DropdownMenuItem>
                {isCodeCell && hasOutput && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onClearOutput} disabled={readOnly}>
                      <X className="w-4 h-4 mr-2" />
                      {t('notebook.clearOutput')}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={onDelete} 
                  disabled={readOnly || totalCells <= 1}
                  className="text-red-500 focus:text-red-500"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('notebook.deleteCell')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Cell content */}
          <div
            className={cn(
              'rounded overflow-hidden border transition-colors',
              isActive 
                ? (isDarkMode ? 'border-white/15' : 'border-black/15')
                : (isDarkMode ? 'border-white/10' : 'border-black/10'),
              isDarkMode ? 'bg-[#1e1e1e]' : 'bg-white'
            )}
          >
            {isCodeCell ? (
              // Code editor
              <div className="[&_.monaco-editor]:pt-0.5 [&_.monaco-editor_.margin]:!bg-transparent">
                {/* Language indicator */}
                <div className={cn(
                  'flex items-center gap-1 px-2 py-0.5 border-b',
                  isDarkMode ? 'border-white/10 bg-black/20' : 'border-black/5 bg-black/5'
                )}>
                  <span className={cn(
                    'w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center text-white',
                    langConfig.color
                  )}>
                    {langConfig.icon}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{langConfig.name}</span>
                </div>
                <Editor
                  height={editorHeight}
                  language={langConfig.monacoLanguage}
                  value={source}
                  onChange={handleEditorChange}
                  onMount={handleEditorDidMount}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    lineNumbersMinChars: 3,
                    folding: true,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
                    readOnly: readOnly,
                    renderLineHighlight: isActive ? 'line' : 'none',
                    scrollbar: {
                      vertical: 'hidden',
                      horizontal: 'auto',
                      verticalScrollbarSize: 0,
                      horizontalScrollbarSize: 6
                    },
                    padding: { top: 4, bottom: 4 },
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    overviewRulerBorder: false,
                    contextmenu: true,
                    glyphMargin: false,
                    lineDecorationsWidth: 4,
                    renderWhitespace: 'selection'
                  }}
                  theme={isDarkMode ? 'vs-dark' : 'light'}
                />
              </div>
            ) : isMarkdownCell ? (
              // Markdown edit/preview
              isMarkdownEditing || (isActive && !source) ? (
                <div className="p-2">
                  <textarea
                    className={cn(
                      'w-full min-h-[60px] p-2 rounded bg-transparent resize-none',
                      'font-mono text-[13px] outline-none border-none',
                      'placeholder:text-muted-foreground'
                    )}
                    value={source}
                    onChange={(e) => onUpdate(e.target.value)}
                    onBlur={() => source && setIsMarkdownEditing(false)}
                    autoFocus={isMarkdownEditing}
                    disabled={readOnly}
                    placeholder={t('notebook.markdownPlaceholder')}
                  />
                </div>
              ) : (
                <div
                  onClick={(e) => { e.stopPropagation(); setIsMarkdownEditing(true); }}
                  className="p-3 cursor-text min-h-[40px] markdown-preview"
                >
                  {source ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema]]}
                    >
                      {source}
                    </ReactMarkdown>
                  ) : (
                    <span className="text-muted-foreground text-[13px] italic">
                      {t('notebook.emptyMarkdown')}
                    </span>
                  )}
                </div>
              )
            ) : (
              // Raw cell
              <pre className="p-3 m-0 font-mono text-[13px]">
                {source || t('notebook.emptyCell')}
              </pre>
            )}
          </div>

          {/* Cell output */}
          {isCodeCell && hasOutput && (
            <div className="mt-1">
              {/* Output header */}
              <Collapsible open={!outputCollapsed} onOpenChange={(open) => setOutputCollapsed(!open)}>
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      'flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer',
                      'hover:bg-accent transition-colors'
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {outputCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                    )}
                    <StatusIcon />
                    <span className="text-[11px] text-muted-foreground">
                      {outputs.length} output{outputs.length > 1 ? 's' : ''}
                      {hasError && ' (error)'}
                    </span>
                    
                    <div className="flex-1" />
                    {(isHovered || isActive) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); onClearOutput(); }}
                        disabled={readOnly}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </button>
                </CollapsibleTrigger>

                {/* Output content */}
                <CollapsibleContent>
                  <div
                    className={cn(
                      'rounded border max-h-[400px] overflow-auto',
                      hasError 
                        ? 'border-red-500/30' 
                        : (isDarkMode ? 'border-white/10' : 'border-black/10'),
                      isDarkMode ? 'bg-black/20' : 'bg-black/5'
                    )}
                  >
                    <CellOutputRenderer outputs={outputs} isDarkMode={isDarkMode} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      </div>

      {/* Insert button - show between cells */}
      {(isActive || isHovered) && !readOnly && (
        <div className="flex items-center justify-center gap-1 py-1 opacity-60 hover:opacity-100 transition-opacity">
          <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/10' : 'bg-black/10')} />
          <Button
            variant="ghost"
            size="sm"
            className="h-5.5 px-2 text-[11px]"
            onClick={(e) => { e.stopPropagation(); onInsertBelow('code'); }}
          >
            <Code className="w-3 h-3 mr-1" />
            Code
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5.5 px-2 text-[11px]"
            onClick={(e) => { e.stopPropagation(); onInsertBelow('markdown'); }}
          >
            <Type className="w-3 h-3 mr-1" />
            Markdown
          </Button>
          <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/10' : 'bg-black/10')} />
        </div>
      )}
    </div>
  );
};

// Main component
export const NotebookEditor: React.FC<NotebookEditorProps> = ({
  content,
  height = '100%',
  onChange,
  onSave,
  onPatchSave,
  readOnly = false,
  isDirty = false,
  autoSaveEnabled = true,
  onAutoSaveChange: _onAutoSaveChange
}) => {
  const { t } = useTranslation();
  const { theme: themeMode } = useApp();
  const isDarkMode = themeMode === 'dark';
  
  // Kernel context
  const {
    kernelSpecs,
    currentKernel,
    kernelStatus: realKernelStatus,
    isConnected,
    isConnecting,
    connectKernel,
    disconnectKernel,
    restartCurrentKernel,
    interruptCurrentKernel,
    executeCode,
  } = useKernel();
  
  const [activeCellIndex, setActiveCellIndex] = useState<number>(0);
  const [runningCells, setRunningCells] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [selectedKernelSpec, setSelectedKernelSpec] = useState<string>('python3');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Derive kernel status for UI
  const kernelStatus = useMemo((): 'disconnected' | 'connecting' | 'idle' | 'busy' => {
    if (isConnecting) return 'connecting';
    if (!isConnected) return 'disconnected';
    if (realKernelStatus === 'busy') return 'busy';
    return 'idle';
  }, [isConnected, isConnecting, realKernelStatus]);
  
  // Incremental update: track pending operations
  const pendingOperationsRef = useRef<CellOperation[]>([]);
  const savedCellsRef = useRef<NotebookCell[]>([]);

  // Parse notebook
  const { notebook, error } = useMemo(() => {
    if (!content) {
      return { 
        notebook: {
          cells: [createEmptyCell('code')],
          metadata: {
            kernelspec: {
              display_name: 'Python 3',
              language: 'python',
              name: 'python3'
            }
          },
          nbformat: 4,
          nbformat_minor: 5
        } as NotebookData, 
        error: null 
      };
    }
    try {
      const parsed = JSON.parse(content) as NotebookData;
      parsed.cells = parsed.cells.map(cell => ({
        ...cell,
        id: cell.id || generateCellId()
      }));
      if (parsed.cells.length === 0) {
        parsed.cells = [createEmptyCell('code')];
      }
      return { notebook: parsed, error: null };
    } catch (parseError) {
      return { notebook: null, error: parseError instanceof Error ? parseError.message : 'Parse error' };
    }
  }, [content]);

  const [cells, setCells] = useState<NotebookCell[]>(notebook?.cells ?? [createEmptyCell('code')]);
  
  useEffect(() => {
    if (notebook?.cells) {
      setCells(notebook.cells);
      savedCellsRef.current = JSON.parse(JSON.stringify(notebook.cells));
      pendingOperationsRef.current = [];
    }
  }, [notebook?.cells]);

  const language = notebook?.metadata?.kernelspec?.language || notebook?.metadata?.language_info?.name || 'python';

  const addPendingOperation = useCallback((op: CellOperation) => {
    const lastOp = pendingOperationsRef.current[pendingOperationsRef.current.length - 1];
    if (lastOp && lastOp.op === 'update' && op.op === 'update' && lastOp.cell_id === op.cell_id) {
      pendingOperationsRef.current[pendingOperationsRef.current.length - 1] = op;
    } else {
      pendingOperationsRef.current.push(op);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (readOnly || isSaving) return;
    
    setIsSaving(true);
    try {
      if (onPatchSave && pendingOperationsRef.current.length > 0) {
        await onPatchSave([...pendingOperationsRef.current]);
        pendingOperationsRef.current = [];
        savedCellsRef.current = JSON.parse(JSON.stringify(cells));
      } else if (onSave) {
        await onSave();
        pendingOperationsRef.current = [];
        savedCellsRef.current = JSON.parse(JSON.stringify(cells));
      }
      setLastSavedTime(new Date());
    } catch (error) {
      console.error('保存失败:', error);
    } finally {
      setIsSaving(false);
    }
  }, [onPatchSave, onSave, readOnly, isSaving, cells]);

  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || readOnly) return;
    if (!onPatchSave && !onSave) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      await handleSave();
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [autoSaveEnabled, isDirty, readOnly, onSave, onPatchSave, handleSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSave]);

  const updateNotebook = useCallback((newCells: NotebookCell[]) => {
    setCells(newCells);
    if (onChange && notebook) {
      const updatedNotebook: NotebookData = {
        ...notebook,
        cells: newCells.map(cell => ({
          ...cell,
          source: textToArray(normalizeText(cell.source))
        }))
      };
      onChange(JSON.stringify(updatedNotebook, null, 2));
    }
  }, [onChange, notebook]);

  // Cell operations
  const handleUpdateCell = useCallback((index: number, source: string) => {
    const newCells = [...cells];
    const cell = newCells[index];
    newCells[index] = { ...cell, source };
    
    if (cell.id) {
      addPendingOperation({
        op: 'update',
        cell_id: cell.id,
        cell: { ...newCells[index], source: textToArray(source) }
      });
    }
    
    updateNotebook(newCells);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleRunCell = useCallback(async (index: number) => {
    const cell = cells[index];
    if (cell.cell_type !== 'code') return;
    
    // If not connected, try to connect first
    if (!isConnected) {
      try {
        await connectKernel(selectedKernelSpec);
      } catch (error) {
        console.error('Failed to connect kernel:', error);
        return;
      }
    }
    
    setRunningCells(prev => new Set(prev).add(index));
    
    // Clear existing outputs
    const newCells = [...cells];
    newCells[index] = {
      ...cell,
      outputs: [],
      execution_count: null,
    };
    setCells(newCells);
    
    const code = normalizeText(cell.source);
    const cellId = cell.id || `cell_${index}`;
    
    const outputs: NotebookOutput[] = [];
    
    executeCode(
      cellId,
      code,
      // onOutput callback
      (output: CellOutput) => {
        let notebookOutput: NotebookOutput;
        
        if (output.output_type === 'stream') {
          notebookOutput = {
            output_type: 'stream',
            name: output.name || 'stdout',
            text: typeof output.text === 'string' ? output.text : (output.text || []).join(''),
          };
        } else if (output.output_type === 'execute_result') {
          notebookOutput = {
            output_type: 'execute_result',
            data: (output.data as Record<string, string>) || {},
            metadata: {},
            execution_count: output.execution_count,
          };
        } else if (output.output_type === 'error') {
          notebookOutput = {
            output_type: 'error',
            ename: output.ename || 'Error',
            evalue: output.evalue || '',
            traceback: output.traceback || [],
          };
        } else {
          notebookOutput = {
            output_type: 'display_data',
            data: (output.data as Record<string, string>) || {},
            metadata: {},
          };
        }
        
        outputs.push(notebookOutput);
        
        // Update cell with new output
        setCells(prevCells => {
          const updated = [...prevCells];
          updated[index] = {
            ...updated[index],
            outputs: [...outputs],
          };
          return updated;
        });
      },
      // onComplete callback
      (_success: boolean, executionCount?: number) => {
        setCells(prevCells => {
          const updated = [...prevCells];
          updated[index] = {
            ...updated[index],
            execution_count: executionCount || null,
          };
          
          // Trigger pending operation for save
          if (updated[index].id) {
            addPendingOperation({
              op: 'update',
              cell_id: updated[index].id,
              cell: { ...updated[index], source: textToArray(normalizeText(updated[index].source)) }
            });
          }
          
          // Use queueMicrotask to avoid updating parent state during render
          queueMicrotask(() => {
            if (onChange && notebook) {
              const updatedNotebook: NotebookData = {
                ...notebook,
                cells: updated.map(c => ({
                  ...c,
                  source: textToArray(normalizeText(c.source))
                }))
              };
              onChange(JSON.stringify(updatedNotebook, null, 2));
            }
          });
          
          return updated;
        });
        
        setRunningCells(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    );
  }, [cells, isConnected, connectKernel, selectedKernelSpec, executeCode, addPendingOperation, onChange, notebook]);

  const handleRunAll = useCallback(async () => {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].cell_type === 'code') {
        await handleRunCell(i);
      }
    }
  }, [cells, handleRunCell]);

  const handleDeleteCell = useCallback((index: number) => {
    if (cells.length <= 1) return;
    const deletedCell = cells[index];
    const newCells = cells.filter((_, i) => i !== index);
    
    if (deletedCell.id) {
      addPendingOperation({ op: 'delete', cell_id: deletedCell.id });
    }
    
    updateNotebook(newCells);
    if (activeCellIndex >= newCells.length) {
      setActiveCellIndex(newCells.length - 1);
    }
  }, [cells, updateNotebook, activeCellIndex, addPendingOperation]);

  const handleDuplicateCell = useCallback((index: number) => {
    const newCells = [...cells];
    const duplicated = { ...cells[index], id: generateCellId() };
    newCells.splice(index + 1, 0, duplicated);
    
    addPendingOperation({
      op: 'add',
      index: index + 1,
      cell: { ...duplicated, source: textToArray(normalizeText(duplicated.source)) }
    });
    
    updateNotebook(newCells);
    setActiveCellIndex(index + 1);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    const cell = cells[index];
    const newCells = [...cells];
    [newCells[index - 1], newCells[index]] = [newCells[index], newCells[index - 1]];
    
    if (cell.id) {
      addPendingOperation({ op: 'move', cell_id: cell.id, index: index - 1, old_index: index });
    }
    
    updateNotebook(newCells);
    setActiveCellIndex(index - 1);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleMoveDown = useCallback((index: number) => {
    if (index >= cells.length - 1) return;
    const cell = cells[index];
    const newCells = [...cells];
    [newCells[index], newCells[index + 1]] = [newCells[index + 1], newCells[index]];
    
    if (cell.id) {
      addPendingOperation({ op: 'move', cell_id: cell.id, index: index + 1, old_index: index });
    }
    
    updateNotebook(newCells);
    setActiveCellIndex(index + 1);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleInsertAbove = useCallback((index: number, type: 'code' | 'markdown' = 'code') => {
    const newCells = [...cells];
    const newCell = createEmptyCell(type);
    newCells.splice(index, 0, newCell);
    
    addPendingOperation({ op: 'add', index: index, cell: { ...newCell, source: [] } });
    
    updateNotebook(newCells);
    setActiveCellIndex(index);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleInsertBelow = useCallback((index: number, type: 'code' | 'markdown' = 'code') => {
    const newCells = [...cells];
    const newCell = createEmptyCell(type);
    newCells.splice(index + 1, 0, newCell);
    
    addPendingOperation({ op: 'add', index: index + 1, cell: { ...newCell, source: [] } });
    
    updateNotebook(newCells);
    setActiveCellIndex(index + 1);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleChangeType = useCallback((index: number, type: 'code' | 'markdown') => {
    const newCells = [...cells];
    const cell = newCells[index];
    newCells[index] = {
      ...cell,
      cell_type: type,
      outputs: type === 'code' ? [] : undefined,
      execution_count: type === 'code' ? null : undefined
    };
    
    if (cell.id) {
      addPendingOperation({
        op: 'update',
        cell_id: cell.id,
        cell: { ...newCells[index], source: textToArray(normalizeText(newCells[index].source)) }
      });
    }
    
    updateNotebook(newCells);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleChangeLanguage = useCallback((index: number, newLanguage: CellLanguage) => {
    const newCells = [...cells];
    const cell = newCells[index];
    newCells[index] = {
      ...cell,
      metadata: {
        ...cell.metadata,
        language: newLanguage
      }
    };
    
    if (cell.id) {
      addPendingOperation({
        op: 'update',
        cell_id: cell.id,
        cell: { ...newCells[index], source: textToArray(normalizeText(newCells[index].source)) }
      });
    }
    
    updateNotebook(newCells);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleClearOutput = useCallback((index: number) => {
    const newCells = [...cells];
    const cell = newCells[index];
    newCells[index] = { ...cell, outputs: [], execution_count: null };
    
    if (cell.id) {
      addPendingOperation({
        op: 'update',
        cell_id: cell.id,
        cell: { ...newCells[index], source: textToArray(normalizeText(newCells[index].source)) }
      });
    }
    
    updateNotebook(newCells);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleClearAllOutputs = useCallback(() => {
    const newCells = cells.map(cell => {
      const updatedCell = {
        ...cell,
        outputs: cell.cell_type === 'code' ? [] : cell.outputs,
        execution_count: cell.cell_type === 'code' ? null : cell.execution_count
      };
      
      if (cell.id && cell.cell_type === 'code') {
        addPendingOperation({
          op: 'update',
          cell_id: cell.id,
          cell: { ...updatedCell, source: textToArray(normalizeText(updatedCell.source)) }
        });
      }
      
      return updatedCell;
    });
    updateNotebook(newCells);
  }, [cells, updateNotebook, addPendingOperation]);

  const handleConnectKernel = useCallback(async () => {
    if (!isConnected) {
      try {
        await connectKernel(selectedKernelSpec);
      } catch (error) {
        console.error('Failed to connect kernel:', error);
      }
    } else {
      try {
        await disconnectKernel();
      } catch (error) {
        console.error('Failed to disconnect kernel:', error);
      }
    }
  }, [isConnected, connectKernel, disconnectKernel, selectedKernelSpec]);

  const handleRestartKernel = useCallback(async () => {
    try {
      await restartCurrentKernel();
    } catch (error) {
      console.error('Failed to restart kernel:', error);
    }
  }, [restartCurrentKernel]);
  
  const handleInterruptKernel = useCallback(async () => {
    try {
      await interruptCurrentKernel();
    } catch (error) {
      console.error('Failed to interrupt kernel:', error);
    }
  }, [interruptCurrentKernel]);

  // Kernel status config
  const getKernelStatusConfig = () => {
    switch (kernelStatus) {
      case 'disconnected':
        return { 
          color: isDarkMode ? 'text-zinc-500' : 'text-zinc-400',
          bgColor: isDarkMode ? 'bg-white/5' : 'bg-black/5',
          icon: <Circle className="w-2 h-2" />,
          label: 'Disconnected'
        };
      case 'connecting':
        return { 
          color: 'text-amber-500',
          bgColor: 'bg-amber-500/10',
          icon: <Loader2 className="w-2 h-2 animate-spin" />,
          label: 'Connecting...'
        };
      case 'busy':
        return { 
          color: 'text-amber-500',
          bgColor: 'bg-amber-500/10',
          icon: <Loader2 className="w-2 h-2 animate-spin" />,
          label: 'Busy'
        };
      case 'idle':
        return { 
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          icon: <Circle className="w-2 h-2 fill-green-500" />,
          label: 'Idle'
        };
    }
  };

  const kernelConfig = getKernelStatusConfig();

  if (error) {
    return (
      <div className="overflow-auto p-6" style={{ height }}>
        <div className={cn(
          'p-6 rounded-lg border border-red-500',
          isDarkMode ? 'bg-red-500/10' : 'bg-red-50'
        )}>
          <h3 className="text-red-500 font-semibold mb-4">
            Invalid Notebook Format
          </h3>
          <p className="text-red-500 text-sm mb-4">
            {error}
          </p>
          <pre className={cn(
            'm-0 p-4 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[300px]',
            isDarkMode ? 'bg-black/30' : 'bg-black/5'
          )}>
            {content}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      tabIndex={-1} 
      className={cn(
        'flex flex-col outline-none',
        isDarkMode ? 'bg-[#1e1e1e]' : 'bg-white'
      )}
      style={{ height }}
    >
      {/* Toolbar */}
      <div className={cn(
        'flex items-center gap-1 px-2 py-1 border-b flex-shrink-0 min-h-9',
        isDarkMode ? 'bg-[#252526] border-white/10' : 'bg-zinc-100 border-black/10'
      )}>
        {/* Run buttons */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleRunCell(activeCellIndex)}
                disabled={readOnly || cells[activeCellIndex]?.cell_type !== 'code' || kernelStatus === 'connecting'}
              >
                <Play className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('notebook.runCell')} (Shift+Enter)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleRunAll}
                disabled={readOnly || kernelStatus === 'connecting'}
              >
                <ListOrdered className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('notebook.runAll')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleInterruptKernel}
                disabled={kernelStatus !== 'busy'}
              >
                <Square className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('notebook.stopExecution')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleRestartKernel}
                disabled={kernelStatus === 'disconnected'}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('notebook.restartKernel')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Clear outputs */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleClearAllOutputs}
                disabled={readOnly}
              >
                <X className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('notebook.clearAllOutputs')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Collapse/expand all */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setAllCollapsed(!allCollapsed)}
              >
                {allCollapsed ? <ChevronsUpDown className="w-4 h-4" /> : <ChevronsDownUp className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{allCollapsed ? t('notebook.expandAll') : t('notebook.collapseAll')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex-1" />

        {/* Save status */}
        <div className="flex items-center gap-1 mr-2">
          {isSaving ? (
            <div className="flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
              <span className="text-[11px] text-muted-foreground">Saving...</span>
            </div>
          ) : isDirty ? (
            <div className="flex items-center gap-1">
              <Circle className="w-2 h-2 fill-amber-500 text-amber-500" />
              <span className="text-[11px] text-amber-500">Modified</span>
            </div>
          ) : lastSavedTime ? (
            <div className="flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5 text-green-500" />
              <span className="text-[11px] text-muted-foreground">Saved</span>
            </div>
          ) : null}
        </div>

        {/* Save button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', isDirty && 'text-primary')}
                onClick={handleSave}
                disabled={readOnly || isSaving || !isDirty}
              >
                <Save className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save ({navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+S)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Kernel selector */}
        {!isConnected && Object.keys(kernelSpecs).length > 0 && (
          <Select value={selectedKernelSpec} onValueChange={setSelectedKernelSpec}>
            <SelectTrigger className="h-6 w-[100px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(kernelSpecs).map(([name, spec]) => (
                <SelectItem key={name} value={name} className="text-xs">
                  {spec.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Kernel connect button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', isConnected && 'text-green-500')}
                onClick={handleConnectKernel}
                disabled={isConnecting}
              >
                {isConnected ? <Link className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isConnected ? 'Disconnect Kernel' : 'Connect Kernel'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Kernel status */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded cursor-default transition-colors',
                kernelConfig.bgColor
              )}>
                <span className={kernelConfig.color}>{kernelConfig.icon}</span>
                <span className={cn('text-[11px] font-medium', kernelConfig.color)}>
                  {kernelConfig.label}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Kernel: {kernelConfig.label}{currentKernel ? ` (${currentKernel.name})` : ''}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Language badge */}
        <span className={cn(
          'h-5 px-2 text-[11px] font-medium rounded flex items-center',
          isDarkMode ? 'bg-white/10 text-zinc-300' : 'bg-black/10 text-zinc-600'
        )}>
          {language.charAt(0).toUpperCase() + language.slice(1)}
        </span>
      </div>

      {/* Cells container */}
      <div className="flex-1 overflow-auto py-2 custom-scrollbar">
        {/* Top add button */}
        {!readOnly && (
          <div className="flex items-center justify-center gap-1 py-1 px-12 opacity-50 hover:opacity-100 transition-opacity">
            <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/10' : 'bg-black/10')} />
            <Button
              variant="ghost"
              size="sm"
              className="h-5.5 px-2 text-[11px]"
              onClick={() => handleInsertAbove(0, 'code')}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Cell
            </Button>
            <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/10' : 'bg-black/10')} />
          </div>
        )}

        {/* Cells */}
        {cells.map((cell, index) => (
          <NotebookCellComponent
            key={cell.id || index}
            cell={cell}
            index={index}
            isActive={index === activeCellIndex}
            isRunning={runningCells.has(index)}
            onActivate={() => setActiveCellIndex(index)}
            onUpdate={(source) => handleUpdateCell(index, source)}
            onRun={() => handleRunCell(index)}
            onDelete={() => handleDeleteCell(index)}
            onDuplicate={() => handleDuplicateCell(index)}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
            onInsertAbove={(type) => handleInsertAbove(index, type)}
            onInsertBelow={(type) => handleInsertBelow(index, type)}
            onChangeType={(type) => handleChangeType(index, type)}
            onChangeLanguage={(lang) => handleChangeLanguage(index, lang)}
            onClearOutput={() => handleClearOutput(index)}
            canMoveUp={index > 0}
            canMoveDown={index < cells.length - 1}
            readOnly={readOnly}
            language={language}
            totalCells={cells.length}
            isDarkMode={isDarkMode}
          />
        ))}

        {/* Bottom spacer */}
        <div className="h-24" />
      </div>
    </div>
  );
};

export default NotebookEditor;
