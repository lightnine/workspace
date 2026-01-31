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
  MoreVertical,
  Code,
  Type,
  X,
  ArrowUpToLine,
  ArrowDownToLine,
  RotateCcw,
  Circle,
  XCircle,
  ChevronsDownUp,
  ChevronsUpDown,
  Link,
  Unlink,
  Save,
  Loader2,
  Star,
  Calendar,
  Share2,
  Settings,
  Check,
  Info,
  MessageSquare,
  History,
  Hash,
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
  metadata?: { 
    language?: string; 
    collapsed?: boolean; 
    scrolled?: boolean; 
    execution_time?: string; 
    executed_at?: string;
    title?: string;  // Databricks-style cell title
  };
  id?: string;
}

// Supported languages for code cells
type CellLanguage = 'python' | 'sql' | 'r' | 'scala' | 'markdown' | 'sh';

interface LanguageConfig {
  id: CellLanguage;
  name: string;
  monacoLanguage: string;
  icon: string;
  color: string;
  magicCommand: string;
}

const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { id: 'python', name: 'Python', monacoLanguage: 'python', icon: 'Py', color: 'bg-blue-500', magicCommand: '%python' },
  { id: 'sql', name: 'SQL', monacoLanguage: 'sql', icon: 'SQL', color: 'bg-orange-500', magicCommand: '%sql' },
  { id: 'r', name: 'R', monacoLanguage: 'r', icon: 'R', color: 'bg-sky-500', magicCommand: '%r' },
  { id: 'scala', name: 'Scala', monacoLanguage: 'scala', icon: 'Sc', color: 'bg-red-500', magicCommand: '%scala' },
  { id: 'sh', name: 'Shell', monacoLanguage: 'shell', icon: 'Sh', color: 'bg-green-600', magicCommand: '%sh' },
  { id: 'markdown', name: 'Markdown', monacoLanguage: 'markdown', icon: 'MD', color: 'bg-purple-500', magicCommand: '%md' },
];

const getLanguageConfig = (lang: string): LanguageConfig => {
  const normalizedLang = lang.toLowerCase();
  return SUPPORTED_LANGUAGES.find(l => l.id === normalizedLang || l.monacoLanguage === normalizedLang) 
    || SUPPORTED_LANGUAGES[0]; // default to Python
};

// Parse magic command from cell source
const parseMagicCommand = (source: string): { language: CellLanguage | null; cleanSource: string } => {
  const trimmed = source.trimStart();
  for (const lang of SUPPORTED_LANGUAGES) {
    if (trimmed.startsWith(lang.magicCommand)) {
      const cleanSource = trimmed.slice(lang.magicCommand.length).trimStart();
      return { language: lang.id, cleanSource };
    }
  }
  return { language: null, cleanSource: source };
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

// Format time ago for display
const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
};

const createEmptyCell = (type: 'code' | 'markdown' = 'code'): NotebookCell => ({
  cell_type: type,
  source: [],
  outputs: type === 'code' ? [] : undefined,
  execution_count: type === 'code' ? null : undefined,
  metadata: {},
  id: generateCellId()
});

// Output renderer component - Databricks style with error actions
const CellOutputRenderer: React.FC<{ outputs: NotebookOutput[]; isDarkMode: boolean }> = ({ outputs, isDarkMode }) => {
  if (!outputs || outputs.length === 0) return null;

  return (
    <div className="font-mono text-[13px] leading-relaxed">
      {outputs.map((output, index) => {
        const outputType = output.output_type;
        
        if (outputType === 'stream') {
          const text = normalizeText(output.text);
          const isStderr = output.name === 'stderr';
          // Check for warning patterns
          const hasWarning = text.toLowerCase().includes('warning');
          return (
            <pre
              key={index}
              className={cn(
                'm-0 p-3 bg-transparent whitespace-pre-wrap break-words',
                isStderr ? 'text-red-500' : hasWarning ? 'text-amber-600' : isDarkMode ? 'text-zinc-300' : 'text-zinc-800'
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
            <div key={index}>
              <pre
                className={cn(
                  'm-0 p-3 whitespace-pre-wrap break-words text-red-500 rounded-t',
                  isDarkMode ? 'bg-red-500/10' : 'bg-red-50'
                )}
              >
                {errorMsg}
              </pre>
              {/* Databricks-style error action buttons */}
              <div className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-b',
                isDarkMode ? 'bg-red-500/5 border-t border-red-500/20' : 'bg-red-50 border-t border-red-200'
              )}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] border-red-300 text-red-600 hover:bg-red-100"
                >
                  Diagnose error
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] border-red-300 text-red-600 hover:bg-red-100"
                >
                  Debug
                </Button>
              </div>
            </div>
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
  cellNumber: number; // Display number (1-indexed)
  isActive: boolean;
  isRunning: boolean;
  executionStartTime?: Date;
  onActivate: () => void;
  onUpdate: (source: string) => void;
  onUpdateTitle: (title: string) => void;
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

// Databricks-style ChevronDown icon component
const ChevronDown: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 9 6 6 6-6"/>
  </svg>
);

// Sparkle icon for AI Assistant
const Sparkles: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/>
    <path d="M19 17v4"/>
    <path d="M3 5h4"/>
    <path d="M17 19h4"/>
  </svg>
);

// Cell component
const NotebookCellComponent: React.FC<CellProps> = ({
  cell,
  index: _index,
  cellNumber,
  isActive,
  isRunning,
  executionStartTime,
  onActivate,
  onUpdate,
  onUpdateTitle,
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
  const [elapsedTime, setElapsedTime] = useState<string>('');
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(cell.metadata?.title || '');
  const editorRef = useRef<any>(null);

  const source = normalizeText(cell.source);
  const outputs = cell.outputs ?? [];
  const isCodeCell = cell.cell_type === 'code';
  const isMarkdownCell = cell.cell_type === 'markdown';
  const hasError = hasErrorOutput(outputs);
  const hasOutput = outputs.length > 0;
  const executionCount = cell.execution_count;
  
  // Parse magic command from source
  const { language: magicLanguage, cleanSource } = parseMagicCommand(source);
  
  // Get cell-specific language (from magic command, metadata, or default notebook language)
  const cellLanguage = magicLanguage || cell.metadata?.language || language;
  const langConfig = getLanguageConfig(cellLanguage);
  
  // Determine if using magic command
  const hasMagicCommand = magicLanguage !== null;

  // Update elapsed time during execution
  useEffect(() => {
    if (isRunning && executionStartTime) {
      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - executionStartTime.getTime()) / 1000);
        setElapsedTime(`${elapsed}s`);
      }, 100);
      return () => clearInterval(timer);
    } else {
      setElapsedTime('');
    }
  }, [isRunning, executionStartTime]);

  // Format execution timestamp - Databricks style: "Jan 21, 2026 (<1s)"
  const formatExecutionTime = () => {
    if (cell.metadata?.executed_at) {
      const date = new Date(cell.metadata.executed_at);
      const execTime = cell.metadata.execution_time || '<1s';
      
      // Format date as "Jan 21, 2026"
      const dateStr = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      return { dateStr, execTime };
    }
    return null;
  };

  const executionTimeInfo = formatExecutionTime();

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      // If there was a magic command, preserve it
      if (hasMagicCommand) {
        onUpdate(`${langConfig.magicCommand} ${value}`);
      } else {
        onUpdate(value);
      }
    }
  };

  // Calculate editor height
  const editorHeight = useMemo(() => {
    const displaySource = hasMagicCommand ? cleanSource : source;
    const lines = displaySource.split('\n').length;
    return Math.max(38, Math.min(lines * 19 + 10, 400));
  }, [source, cleanSource, hasMagicCommand]);

  return (
    <div
      onClick={onActivate}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative px-12 mb-0.5"
    >
      {/* Databricks-style Cell container - minimal borders */}
      <div
        className={cn(
          'rounded-md border transition-all',
          isActive 
            ? 'border-primary/40 shadow-sm' 
            : 'border-transparent hover:border-border/50',
          hasError && 'border-red-500/40',
          isDarkMode ? 'bg-[#1e1e1e]' : 'bg-white'
        )}
      >
        {/* Cell header - Databricks style: compact and clean */}
        <div className={cn(
          'flex items-center gap-2 px-2 py-1 min-h-[32px]',
          isDarkMode ? 'bg-transparent' : 'bg-transparent'
        )}>
          {/* Left: Run button with dropdown */}
          <div className="flex items-center">
            {isCodeCell && (
              <DropdownMenu>
                <div className="flex items-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-6 w-6 rounded-l rounded-r-none',
                            isRunning && 'bg-primary/10'
                          )}
                          onClick={(e) => { e.stopPropagation(); onRun(); }}
                          disabled={readOnly || isRunning}
                        >
                          {isRunning ? (
                            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{t('notebook.runCell')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-4 rounded-l-none rounded-r px-0"
                      disabled={readOnly}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                </div>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => onRun()}>
                    <Play className="w-4 h-4 mr-2" />
                    Run cell
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <ListOrdered className="w-4 h-4 mr-2" />
                    Run cell and below
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {isMarkdownCell && (
              <div className="h-6 w-6 flex items-center justify-center">
                <Type className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Execution status indicator - Databricks style checkbox */}
          {isCodeCell && (
            <div className={cn(
              'flex items-center justify-center',
            )}>
              {isRunning ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : hasError ? (
                <XCircle className="w-4 h-4 text-red-500" />
              ) : executionCount !== null && executionCount !== undefined ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <div className="w-4 h-4" /> // placeholder
              )}
            </div>
          )}

          {/* Execution time/status - Databricks style */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {isCodeCell && (
              <>
                {isRunning ? (
                  <span className="text-[11px] text-muted-foreground">
                    Running... {elapsedTime}
                  </span>
                ) : hasError ? (
                  <span className="text-[11px] text-red-500 font-medium">
                    Last execution failed
                  </span>
                ) : executionTimeInfo ? (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {executionTimeInfo.dateStr} ({executionTimeInfo.execTime})
                  </span>
                ) : null}
              </>
            )}
          </div>

          {/* Right: Cell number + Language badge + Actions */}
          <div className="flex items-center gap-1.5">
            {/* Language badge - Databricks style */}
            {isCodeCell && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-5 px-1.5 text-[10px] font-semibold rounded',
                      'hover:bg-muted/80',
                      langConfig.id === 'sql' && 'text-orange-600',
                      langConfig.id === 'python' && 'text-blue-600',
                      langConfig.id === 'sh' && 'text-green-600',
                    )}
                    disabled={readOnly}
                  >
                    {langConfig.name.toUpperCase()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  {SUPPORTED_LANGUAGES.filter(l => l.id !== 'markdown').map((lang) => (
                    <DropdownMenuItem
                      key={lang.id}
                      onClick={() => onChangeLanguage(lang.id)}
                      className={cn(
                        'flex items-center gap-2 text-xs',
                        cellLanguage === lang.id && 'bg-accent'
                      )}
                    >
                      <span className={cn(
                        'w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center text-white',
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

            {/* Action buttons - icon row */}
            <div className={cn(
              'flex items-center gap-0 transition-opacity',
              (isHovered || isActive) ? 'opacity-100' : 'opacity-0'
            )}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                      disabled={readOnly}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('notebook.duplicate')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {/* Expand/collapse toggle for output */}
              {isCodeCell && hasOutput && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); setOutputCollapsed(!outputCollapsed); }}
                      >
                        {outputCollapsed ? (
                          <ChevronsUpDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronsDownUp className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{outputCollapsed ? 'Expand output' : 'Collapse output'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* More menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => onMoveUp()} disabled={!canMoveUp || readOnly}>
                    <ChevronUp className="w-4 h-4 mr-2" />
                    {t('notebook.moveUp')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMoveDown()} disabled={!canMoveDown || readOnly}>
                    <ChevronDown className="w-4 h-4 mr-2" />
                    {t('notebook.moveDown')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => onChangeType(isCodeCell ? 'markdown' : 'code')} 
                    disabled={readOnly}
                  >
                    {isCodeCell ? <Type className="w-4 h-4 mr-2" /> : <Code className="w-4 h-4 mr-2" />}
                    Convert to {isCodeCell ? 'Markdown' : 'Code'}
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

            {/* Cell number - right aligned */}
            <span className={cn(
              'text-[11px] font-mono w-5 text-right tabular-nums',
              hasError ? 'text-red-500' : 'text-muted-foreground/70'
            )}>
              {cellNumber}
            </span>
          </div>
        </div>

        {/* Cell content */}
        <div className="px-2 pb-1">
          {/* Databricks-style Cell title input - only show when active or has title */}
          {isCodeCell && (isActive || cell.metadata?.title) && (
            <div className={cn(
              'flex items-center gap-2 pb-1 mb-1',
              (isActive || isHovered) ? 'opacity-100' : 'opacity-60'
            )}>
              {isTitleEditing ? (
                <input
                  type="text"
                  className={cn(
                    'flex-1 h-6 px-2 text-[12px] rounded border bg-transparent',
                    'outline-none focus:border-primary/50',
                    isDarkMode ? 'border-white/10 text-zinc-300' : 'border-black/10 text-zinc-700'
                  )}
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={() => {
                    setIsTitleEditing(false);
                    if (titleValue !== cell.metadata?.title) {
                      onUpdateTitle(titleValue);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setIsTitleEditing(false);
                      if (titleValue !== cell.metadata?.title) {
                        onUpdateTitle(titleValue);
                      }
                    } else if (e.key === 'Escape') {
                      setIsTitleEditing(false);
                      setTitleValue(cell.metadata?.title || '');
                    }
                  }}
                  autoFocus
                  placeholder="Cell title"
                  disabled={readOnly}
                />
              ) : (
                <button
                  className={cn(
                    'flex-1 h-6 px-2 text-[12px] text-left rounded border border-transparent',
                    'hover:border-border/50 transition-colors',
                    cell.metadata?.title 
                      ? (isDarkMode ? 'text-zinc-300' : 'text-zinc-700')
                      : 'text-muted-foreground/60 italic'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!readOnly) {
                      setIsTitleEditing(true);
                    }
                  }}
                  disabled={readOnly}
                >
                  {cell.metadata?.title || 'Cell title'}
                </button>
              )}
              {!cell.metadata?.title && !isTitleEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); }}
                  disabled={readOnly}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Suggest a title
                </Button>
              )}
            </div>
          )}
          
          {isCodeCell ? (
            // Code editor with magic command prefix
            <div className="relative">
              {/* Magic command prefix display */}
              {hasMagicCommand && (
                <div className={cn(
                  'absolute left-0 top-2 z-10 px-2 text-[11px] font-mono',
                  isDarkMode ? 'text-zinc-500' : 'text-zinc-400'
                )}>
                  <span className={cn(
                    'px-1 py-0.5 rounded',
                    isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'
                  )}>
                    {langConfig.magicCommand}
                  </span>
                </div>
              )}
              <div className={cn(
                '[&_.monaco-editor]:pt-0.5 [&_.monaco-editor_.margin]:!bg-transparent',
                hasMagicCommand && 'pl-14' // offset for magic command
              )}>
                <Editor
                  height={editorHeight}
                  language={langConfig.monacoLanguage}
                  value={hasMagicCommand ? cleanSource : source}
                  onChange={handleEditorChange}
                  onMount={handleEditorDidMount}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: 'off',
                    lineNumbersMinChars: 2,
                    folding: false,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
                    readOnly: readOnly,
                    renderLineHighlight: 'none',
                    scrollbar: {
                      vertical: 'hidden',
                      horizontal: 'auto',
                      verticalScrollbarSize: 0,
                      horizontalScrollbarSize: 6
                    },
                    padding: { top: 6, bottom: 6 },
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    overviewRulerBorder: false,
                    contextmenu: true,
                    glyphMargin: false,
                    lineDecorationsWidth: 0,
                    renderWhitespace: 'none'
                  }}
                  theme={isDarkMode ? 'vs-dark' : 'light'}
                />
              </div>
              {/* Edit code with Assistant button - Databricks style */}
              {(isActive || isHovered) && !readOnly && (
                <div className={cn(
                  'flex items-center gap-2 mt-1 transition-opacity',
                  (isActive || isHovered) ? 'opacity-100' : 'opacity-0'
                )}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); }}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Edit code with Assistant
                  </Button>
                </div>
              )}
            </div>
          ) : isMarkdownCell ? (
            // Markdown edit/preview
            isMarkdownEditing || (isActive && !source) ? (
              <div className="py-1">
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
                className="py-2 px-1 cursor-text min-h-[40px] markdown-preview"
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
            <pre className="py-2 m-0 font-mono text-[13px]">
              {source || t('notebook.emptyCell')}
            </pre>
          )}
        </div>

        {/* Cell output - Databricks style: clean and minimal */}
        {isCodeCell && hasOutput && !outputCollapsed && (
          <div className={cn(
            'mx-2 mb-2 rounded overflow-hidden',
            hasError 
              ? (isDarkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200')
              : (isDarkMode ? 'bg-black/20' : 'bg-gray-50')
          )}>
            <div className="max-h-[400px] overflow-auto">
              <CellOutputRenderer outputs={outputs} isDarkMode={isDarkMode} />
            </div>
          </div>
        )}
        
        {/* Collapsed output indicator */}
        {isCodeCell && hasOutput && outputCollapsed && (
          <div 
            className={cn(
              'mx-2 mb-2 px-3 py-1.5 rounded cursor-pointer',
              'text-[11px] text-muted-foreground',
              isDarkMode ? 'bg-black/20 hover:bg-black/30' : 'bg-gray-50 hover:bg-gray-100'
            )}
            onClick={(e) => { e.stopPropagation(); setOutputCollapsed(false); }}
          >
            {hasError ? (
              <span className="text-red-500">⚠ Output hidden (error)</span>
            ) : (
              <span>▸ {outputs.length} output{outputs.length > 1 ? 's' : ''} hidden</span>
            )}
          </div>
        )}
      </div>

      {/* Insert button - show between cells on hover */}
      {(isActive || isHovered) && !readOnly && (
        <div className="flex items-center justify-center gap-1 py-1.5 opacity-0 hover:opacity-100 transition-opacity">
          <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/5' : 'bg-black/5')} />
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[10px] text-muted-foreground"
            onClick={(e) => { e.stopPropagation(); onInsertBelow('code'); }}
          >
            <Plus className="w-2.5 h-2.5 mr-0.5" />
            Code
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[10px] text-muted-foreground"
            onClick={(e) => { e.stopPropagation(); onInsertBelow('markdown'); }}
          >
            <Plus className="w-2.5 h-2.5 mr-0.5" />
            Text
          </Button>
          <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/5' : 'bg-black/5')} />
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
  const [executionStartTimes, setExecutionStartTimes] = useState<Map<number, Date>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [selectedKernelSpec, setSelectedKernelSpec] = useState<string>('python3');
  const [tabsOn, setTabsOn] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<'info' | 'comments' | 'history' | 'variables'>('info');
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
    
    // Record start time
    const startTime = new Date();
    setRunningCells(prev => new Set(prev).add(index));
    setExecutionStartTimes(prev => new Map(prev).set(index, startTime));
    
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
      (success: boolean, executionCount?: number) => {
        const endTime = new Date();
        const execStartTime = executionStartTimes.get(index);
        const executionDuration = execStartTime 
          ? `${((endTime.getTime() - execStartTime.getTime()) / 1000).toFixed(1)}s`
          : '';
        
        setCells(prevCells => {
          const updated = [...prevCells];
          updated[index] = {
            ...updated[index],
            execution_count: executionCount || null,
            metadata: {
              ...updated[index].metadata,
              executed_at: endTime.toISOString(),
              execution_time: executionDuration,
            }
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
        
        // Clear execution start time
        setExecutionStartTimes(prev => {
          const next = new Map(prev);
          next.delete(index);
          return next;
        });
      }
    );
  }, [cells, isConnected, connectKernel, selectedKernelSpec, executeCode, addPendingOperation, onChange, notebook, executionStartTimes]);

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

  const handleUpdateTitle = useCallback((index: number, title: string) => {
    const newCells = [...cells];
    const cell = newCells[index];
    newCells[index] = {
      ...cell,
      metadata: {
        ...cell.metadata,
        title: title || undefined  // Remove title if empty
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
      {/* Databricks-style Toolbar */}
      <div className={cn(
        'flex items-center gap-1 px-2 py-1.5 border-b flex-shrink-0 min-h-10',
        isDarkMode ? 'bg-[#252526] border-white/10' : 'bg-white border-black/10'
      )}>
        {/* Left side: Menu items */}
        <div className="flex items-center gap-1 mr-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-normal">
                File
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={handleSave} disabled={readOnly || !isDirty}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleClearAllOutputs} disabled={readOnly}>
                <X className="w-4 h-4 mr-2" />
                Clear all outputs
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-normal">
                Edit
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => handleInsertBelow(activeCellIndex, 'code')} disabled={readOnly}>
                <Plus className="w-4 h-4 mr-2" />
                Add code cell
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleInsertBelow(activeCellIndex, 'markdown')} disabled={readOnly}>
                <Type className="w-4 h-4 mr-2" />
                Add markdown cell
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-normal">
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setAllCollapsed(!allCollapsed)}>
                {allCollapsed ? <ChevronsUpDown className="w-4 h-4 mr-2" /> : <ChevronsDownUp className="w-4 h-4 mr-2" />}
                {allCollapsed ? 'Expand all cells' : 'Collapse all cells'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-normal">
                Run
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => handleRunCell(activeCellIndex)} disabled={readOnly || cells[activeCellIndex]?.cell_type !== 'code'}>
                <Play className="w-4 h-4 mr-2" />
                Run cell
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRunAll} disabled={readOnly}>
                <ListOrdered className="w-4 h-4 mr-2" />
                Run all
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleInterruptKernel} disabled={kernelStatus !== 'busy'}>
                <Square className="w-4 h-4 mr-2" />
                Interrupt
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRestartKernel} disabled={kernelStatus === 'disconnected'}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Restart kernel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-normal">
            Help
          </Button>
        </div>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Language selector */}
        <Select value={language} disabled>
          <SelectTrigger className="h-6 w-[70px] text-[11px] font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="python">Python</SelectItem>
            <SelectItem value="sql">SQL</SelectItem>
            <SelectItem value="r">R</SelectItem>
            <SelectItem value="scala">Scala</SelectItem>
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Tabs toggle */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 px-2 text-[11px]"
          onClick={() => setTabsOn(!tabsOn)}
        >
          Tabs: {tabsOn ? 'ON' : 'OFF'}
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>

        {/* Favorite button */}
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Star className="w-3.5 h-3.5" />
        </Button>

        {/* Last edit info */}
        <span className="text-[11px] text-muted-foreground ml-2">
          {lastSavedTime 
            ? `Last edit was ${formatTimeAgo(lastSavedTime)}`
            : isDirty 
              ? 'Unsaved changes'
              : ''}
        </span>

        <div className="flex-1" />

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Run all button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-xs gap-1"
            onClick={handleRunAll}
            disabled={readOnly || kernelStatus === 'connecting'}
          >
            <Play className="w-3.5 h-3.5" />
            Run all
          </Button>

          {/* Compute selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-3 text-xs gap-1">
                <Circle className={cn(
                  'w-2 h-2',
                  isConnected ? 'fill-green-500 text-green-500' : 'fill-gray-400 text-gray-400'
                )} />
                {isConnected ? (currentKernel?.display_name || 'Serverless') : 'Serverless'}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleConnectKernel}>
                {isConnected ? <Unlink className="w-4 h-4 mr-2" /> : <Link className="w-4 h-4 mr-2" />}
                {isConnected ? 'Disconnect' : 'Connect to compute'}
              </DropdownMenuItem>
              {!isConnected && Object.entries(kernelSpecs).map(([name, spec]) => (
                <DropdownMenuItem 
                  key={name} 
                  onClick={() => { setSelectedKernelSpec(name); connectKernel(name); }}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  {spec.display_name}
                </DropdownMenuItem>
              ))}
              {isConnected && (
                <DropdownMenuItem onClick={handleRestartKernel}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restart kernel
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Schedule button */}
          <Button variant="outline" size="sm" className="h-7 px-3 text-xs gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Schedule
          </Button>

          {/* Share button */}
          <Button variant="default" size="sm" className="h-7 px-3 text-xs gap-1">
            <Share2 className="w-3.5 h-3.5" />
            Share
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Databricks-style right sidebar toggle buttons */}
          <div className="flex items-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7',
                      rightSidebarOpen && rightSidebarTab === 'comments' && 'bg-accent'
                    )}
                    onClick={() => {
                      if (rightSidebarOpen && rightSidebarTab === 'comments') {
                        setRightSidebarOpen(false);
                      } else {
                        setRightSidebarOpen(true);
                        setRightSidebarTab('comments');
                      }
                    }}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Comments</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7',
                      rightSidebarOpen && rightSidebarTab === 'history' && 'bg-accent'
                    )}
                    onClick={() => {
                      if (rightSidebarOpen && rightSidebarTab === 'history') {
                        setRightSidebarOpen(false);
                      } else {
                        setRightSidebarOpen(true);
                        setRightSidebarTab('history');
                      }
                    }}
                  >
                    <History className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Version history</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7',
                      rightSidebarOpen && rightSidebarTab === 'variables' && 'bg-accent'
                    )}
                    onClick={() => {
                      if (rightSidebarOpen && rightSidebarTab === 'variables') {
                        setRightSidebarOpen(false);
                      } else {
                        setRightSidebarOpen(true);
                        setRightSidebarTab('variables');
                      }
                    }}
                  >
                    <Hash className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Variables</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7',
                      rightSidebarOpen && rightSidebarTab === 'info' && 'bg-accent'
                    )}
                    onClick={() => {
                      if (rightSidebarOpen && rightSidebarTab === 'info') {
                        setRightSidebarOpen(false);
                      } else {
                        setRightSidebarOpen(true);
                        setRightSidebarTab('info');
                      }
                    }}
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Notebook details</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Main content area with optional right sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Cells container */}
        <div className="flex-1 overflow-auto py-3 custom-scrollbar">
          {/* Cells */}
          {cells.map((cell, index) => (
            <NotebookCellComponent
              key={cell.id || index}
              cell={cell}
              index={index}
              cellNumber={index + 1}
              isActive={index === activeCellIndex}
              isRunning={runningCells.has(index)}
              executionStartTime={executionStartTimes.get(index)}
              onActivate={() => setActiveCellIndex(index)}
              onUpdate={(source) => handleUpdateCell(index, source)}
              onUpdateTitle={(title) => handleUpdateTitle(index, title)}
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

          {/* Bottom add cell button */}
          {!readOnly && (
            <div className="flex items-center justify-center gap-1 py-2 px-12 opacity-40 hover:opacity-100 transition-opacity">
              <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/10' : 'bg-black/10')} />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-3 text-[11px] text-muted-foreground"
                onClick={() => handleInsertBelow(cells.length - 1, 'code')}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add code cell
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-3 text-[11px] text-muted-foreground"
                onClick={() => handleInsertBelow(cells.length - 1, 'markdown')}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add text cell
              </Button>
              <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/10' : 'bg-black/10')} />
            </div>
          )}

          {/* Bottom spacer */}
          <div className="h-24" />
        </div>

        {/* Databricks-style Right Sidebar */}
        {rightSidebarOpen && (
          <div className={cn(
            'w-80 border-l flex flex-col flex-shrink-0',
            isDarkMode ? 'bg-[#252526] border-white/10' : 'bg-gray-50 border-black/10'
          )}>
            {/* Sidebar header */}
            <div className={cn(
              'flex items-center justify-between px-4 py-3 border-b',
              isDarkMode ? 'border-white/10' : 'border-black/10'
            )}>
              <span className="text-sm font-medium">
                {rightSidebarTab === 'info' && 'Notebook details'}
                {rightSidebarTab === 'comments' && 'Comments'}
                {rightSidebarTab === 'history' && 'Version history'}
                {rightSidebarTab === 'variables' && 'Variables'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setRightSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Sidebar content */}
            <div className="flex-1 overflow-auto p-4">
              {rightSidebarTab === 'info' && (
                <div className="space-y-4">
                  {/* About this notebook */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">About this notebook</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Language</span>
                        <span>{language === 'python' ? 'Python' : language.toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cells</span>
                        <span>{cells.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last saved</span>
                        <span>{lastSavedTime ? formatTimeAgo(lastSavedTime) : 'Not saved'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Kernel info */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Compute</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Status</span>
                        <span className={cn(
                          'flex items-center gap-1',
                          kernelStatus === 'idle' && 'text-green-500',
                          kernelStatus === 'busy' && 'text-amber-500',
                          kernelStatus === 'disconnected' && 'text-muted-foreground'
                        )}>
                          <Circle className={cn(
                            'w-2 h-2',
                            kernelStatus === 'idle' && 'fill-green-500',
                            kernelStatus === 'busy' && 'fill-amber-500'
                          )} />
                          {kernelStatus.charAt(0).toUpperCase() + kernelStatus.slice(1)}
                        </span>
                      </div>
                      {isConnected && currentKernel && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Kernel</span>
                          <span>{currentKernel.display_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {rightSidebarTab === 'comments' && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No comments yet
                </div>
              )}

              {rightSidebarTab === 'history' && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Version history not available
                </div>
              )}

              {rightSidebarTab === 'variables' && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  {isConnected ? 'Run cells to see variables' : 'Connect to compute to see variables'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotebookEditor;
