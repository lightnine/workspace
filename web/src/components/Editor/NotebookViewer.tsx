import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import DOMPurify from 'dompurify';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useApp } from '../../context/AppContext';
import {
  Play,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  Trash2,
  Copy,
  ChevronRight,
} from 'lucide-react';

interface NotebookViewerProps {
  content?: string;
  height?: string;
}

interface NotebookData {
  cells?: NotebookCell[];
  metadata?: {
    language_info?: {
      name?: string;
    };
  };
}

interface NotebookCell {
  cell_type: string;
  source?: string | string[];
  outputs?: NotebookOutput[];
  execution_count?: number | null;
  metadata?: {
    language?: string;
  };
}

interface NotebookOutput {
  output_type?: string;
  text?: string | string[];
  data?: Record<string, string | string[]>;
  traceback?: string[];
  ename?: string;
  evalue?: string;
}

const normalizeText = (value?: string | string[]) => {
  if (!value) return '';
  return Array.isArray(value) ? value.join('') : value;
};

const hasErrorOutput = (outputs: NotebookOutput[]) =>
  outputs.some(output => output.output_type === 'error');

const getLanguageLabel = (value?: string) => {
  if (!value) return 'Code';
  if (value.toLowerCase() === 'python') return 'Python';
  return value.toUpperCase();
};

const renderOutput = (output: NotebookOutput, isDarkMode: boolean) => {
  if (!output) return null;

  const outputType = output.output_type;
  const text =
    outputType === 'stream'
      ? normalizeText(output.text)
      : outputType === 'error'
        ? normalizeText(output.traceback) || `${output.ename || ''} ${output.evalue || ''}`.trim()
        : normalizeText(output.data?.['text/plain']) || normalizeText(output.data?.['text/html']);

  const html = normalizeText(output.data?.['text/html']);
  const imagePng = normalizeText(output.data?.['image/png']);
  const imageJpeg = normalizeText(output.data?.['image/jpeg']);
  const imageData = imagePng || imageJpeg;
  const imageMime = imagePng ? 'image/png' : imageJpeg ? 'image/jpeg' : '';
  const isError = outputType === 'error';

  if (!text && !imageData && !html) return null;

  return (
    <div className="mt-2">
      {html && (
        <div
          className={cn(
            'p-3 rounded-lg border overflow-x-auto',
            isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          )}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
        />
      )}
      {text && (
        <pre
          className={cn(
            'm-0 p-3 rounded-lg border text-sm font-mono whitespace-pre-wrap',
            html && 'mt-2',
            isError 
              ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400' 
              : isDarkMode 
                ? 'bg-zinc-900 border-zinc-800' 
                : 'bg-zinc-50 border-zinc-200'
          )}
        >
          {text}
        </pre>
      )}
      {imageData && (
        <div className={cn(text || html ? 'mt-2' : '')}>
          <img
            src={`data:${imageMime};base64,${imageData}`}
            alt="notebook-output"
            className="max-w-full rounded-lg border border-border"
          />
        </div>
      )}
    </div>
  );
};

export const NotebookViewer: React.FC<NotebookViewerProps> = ({ content, height = '100%' }) => {
  const { t } = useTranslation();
  const { theme: themeMode } = useApp();
  const isDarkMode = themeMode === 'dark';

  const { notebook, error } = useMemo(() => {
    if (!content) {
      return { notebook: null, error: null };
    }
    try {
      return { notebook: JSON.parse(content) as NotebookData, error: null };
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : t('notebook.invalid');
      return { notebook: null, error: message };
    }
  }, [content, t]);

  if (!content) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        {t('notebook.empty')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="overflow-auto p-4" style={{ height }}>
        <p className="text-destructive mb-2">
          {t('notebook.invalid')}：{error}
        </p>
        <pre className="m-0 p-4 rounded-lg bg-muted text-sm font-mono whitespace-pre-wrap">
          {content}
        </pre>
      </div>
    );
  }

  const cells = notebook?.cells ?? [];
  const defaultLanguage = notebook?.metadata?.language_info?.name || 'python';

  if (cells.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        {t('notebook.empty')}
      </div>
    );
  }

  return (
    <div className="overflow-auto p-4 bg-background" style={{ height }}>
      {cells.map((cell, index) => {
        const source = normalizeText(cell.source);
        const outputs = cell.outputs ?? [];
        const isCodeCell = cell.cell_type === 'code';
        const language = cell.metadata?.language || defaultLanguage;
        const hasError = hasErrorOutput(outputs);
        const executionLabel = cell.execution_count ?? ' ';

        return (
          <Card
            key={`${cell.cell_type}-${index}`}
            className={cn(
              'mb-4 shadow-sm',
              hasError && 'border-red-500/50'
            )}
          >
            {/* Header */}
            <CardHeader className="py-2 px-3 flex flex-row items-center justify-between border-b">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                  <Play className="h-4 w-4" />
                </Button>
                {isCodeCell && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {hasError ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    <span className="text-xs">{t('notebook.executed')}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isCodeCell && (
                  <span className="text-xs px-2 py-0.5 rounded border bg-muted">
                    {getLanguageLabel(language)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('notebook.duplicate')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('notebook.delete')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            {/* Content */}
            <CardContent className="p-0">
              <div className="grid grid-cols-[64px_1fr] gap-4 px-4 py-3">
                <div className="text-right text-muted-foreground font-mono text-sm">
                  {isCodeCell ? `In [${executionLabel}]` : ''}
                </div>
                <div>
                  {source ? (
                    cell.cell_type === 'markdown' ? (
                      <div className="markdown-preview">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema]]}
                        >
                          {source}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <SyntaxHighlighter
                        language={language}
                        style={isDarkMode ? oneDark : oneLight}
                        customStyle={{
                          margin: 0,
                          borderRadius: 8,
                          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}`,
                          background: isDarkMode ? '#1e1e1e' : '#fafafa'
                        }}
                      >
                        {source}
                      </SyntaxHighlighter>
                    )
                  ) : (
                    <span className="text-muted-foreground">{t('notebook.emptyCell')}</span>
                  )}
                </div>
              </div>

              {/* Outputs */}
              {isCodeCell && outputs.length > 0 && (
                <>
                  <Separator />
                  <div className="grid grid-cols-[64px_1fr] gap-4 px-4 py-3">
                    <div className="text-right text-muted-foreground font-mono text-sm">
                      Out [{executionLabel}]
                    </div>
                    <div>
                      {outputs.map((output, outputIndex) => (
                        <div key={`output-${index}-${outputIndex}`}>
                          {renderOutput(output, isDarkMode)}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Add cell hint */}
              <div className="px-4 pb-3 flex items-center gap-1 text-muted-foreground text-xs">
                <ChevronRight className="h-4 w-4" />
                <span>{t('notebook.addCellHint')}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
