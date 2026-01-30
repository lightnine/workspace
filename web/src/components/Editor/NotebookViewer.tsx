import React, { useMemo } from 'react';
import {
  Box,
  Divider,
  IconButton,
  Paper,
  Tooltip,
  Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import DOMPurify from 'dompurify';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';

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

const renderOutput = (output: NotebookOutput) => {
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
    <Box sx={{ mt: 1 }}>
      {html && (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            bgcolor: 'background.default',
            border: 1,
            borderColor: 'divider',
            overflowX: 'auto'
          }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
        />
      )}
      {text && (
        <Box
          component="pre"
          sx={{
            m: 0,
            mt: html ? 1 : 0,
            p: 1.5,
            borderRadius: 1,
            bgcolor: isError ? 'error.lighter' : 'background.default',
            border: 1,
            borderColor: isError ? 'error.light' : 'divider',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}
        >
          {text}
        </Box>
      )}
      {imageData && (
        <Box sx={{ mt: text || html ? 1 : 0 }}>
          <Box
            component="img"
            src={`data:${imageMime};base64,${imageData}`}
            alt="notebook-output"
            sx={{ maxWidth: '100%', borderRadius: 1, border: 1, borderColor: 'divider' }}
          />
        </Box>
      )}
    </Box>
  );
};

export const NotebookViewer: React.FC<NotebookViewerProps> = ({ content, height = '100%' }) => {
  const { t } = useTranslation();

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
      <Box
        sx={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary'
        }}
      >
        {t('notebook.empty')}
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ height, overflow: 'auto', p: 2 }}>
        <Typography color="error" sx={{ mb: 1 }}>
          {t('notebook.invalid')}：{error}
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            borderRadius: 1,
            bgcolor: 'action.hover',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}
        >
          {content}
        </Box>
      </Box>
    );
  }

  const cells = notebook?.cells ?? [];
  const defaultLanguage = notebook?.metadata?.language_info?.name || 'python';

  if (cells.length === 0) {
    return (
      <Box
        sx={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary'
        }}
      >
        {t('notebook.empty')}
      </Box>
    );
  }

  return (
    <Box sx={{ height, overflow: 'auto', p: 2, bgcolor: 'background.default' }}>
      {cells.map((cell, index) => {
        const source = normalizeText(cell.source);
        const outputs = cell.outputs ?? [];
        const isCodeCell = cell.cell_type === 'code';
        const language = cell.metadata?.language || defaultLanguage;
        const hasError = hasErrorOutput(outputs);
        const executionLabel = cell.execution_count ?? ' ';

        return (
          <Paper
            key={`${cell.cell_type}-${index}`}
            variant="outlined"
            sx={{
              p: 0,
              mb: 2,
              borderRadius: 2,
              borderColor: hasError ? 'error.light' : 'divider',
              bgcolor: 'background.paper',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)'
            }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: 1,
                borderColor: 'divider'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton size="small" disabled sx={{ bgcolor: 'action.hover' }}>
                  <PlayArrowIcon fontSize="small" />
                </IconButton>
                {isCodeCell && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                    {hasError ? (
                      <ErrorOutlineIcon fontSize="small" color="error" />
                    ) : (
                      <CheckCircleOutlineIcon fontSize="small" color="success" />
                    )}
                    <Typography variant="caption">{t('notebook.executed')}</Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {isCodeCell && (
                  <Typography
                    variant="caption"
                    sx={{
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                      bgcolor: 'background.default'
                    }}
                  >
                    {getLanguageLabel(language)}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {index + 1}
                </Typography>
                <Tooltip title={t('notebook.duplicate')}>
                  <span>
                    <IconButton size="small" disabled>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('notebook.delete')}>
                  <span>
                    <IconButton size="small" disabled>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <IconButton size="small" disabled>
                  <MoreHorizIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '64px 1fr', columnGap: 2, px: 2, py: 2 }}>
              <Box sx={{ textAlign: 'right', color: 'text.secondary', fontFamily: 'monospace' }}>
                {isCodeCell ? `In [${executionLabel}]` : ''}
              </Box>
              <Box>
                {source ? (
                  cell.cell_type === 'markdown' ? (
                    <Box
                      sx={{
                        '& > *:first-of-type': { mt: 0 },
                        '& > *:last-child': { mb: 0 },
                        '& pre': {
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: 'background.default',
                          border: 1,
                          borderColor: 'divider',
                          overflowX: 'auto'
                        },
                        '& code': {
                          fontFamily: 'monospace'
                        }
                      }}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema]]}
                      >
                        {source}
                      </ReactMarkdown>
                    </Box>
                  ) : (
                    <SyntaxHighlighter
                      language={language}
                      style={oneLight}
                      customStyle={{
                        margin: 0,
                        borderRadius: 8,
                        border: '1px solid rgba(0,0,0,0.12)',
                        background: 'var(--mui-palette-background-default, #fafafa)'
                      }}
                    >
                      {source}
                    </SyntaxHighlighter>
                  )
                ) : (
                  <Typography color="text.secondary">{t('notebook.emptyCell')}</Typography>
                )}
              </Box>
            </Box>

            {isCodeCell && outputs.length > 0 && (
              <>
                <Divider />
                <Box sx={{ display: 'grid', gridTemplateColumns: '64px 1fr', columnGap: 2, px: 2, py: 2 }}>
                  <Box sx={{ textAlign: 'right', color: 'text.secondary', fontFamily: 'monospace' }}>
                    Out [{executionLabel}]
                  </Box>
                  <Box>
                    {outputs.map((output, outputIndex) => (
                      <Box key={`output-${index}-${outputIndex}`}>{renderOutput(output)}</Box>
                    ))}
                  </Box>
                </Box>
              </>
            )}

            <Box
              sx={{
                px: 2,
                pb: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                color: 'text.secondary',
                fontSize: '0.75rem'
              }}
            >
              <KeyboardArrowRightIcon fontSize="small" />
              <Typography variant="caption">{t('notebook.addCellHint')}</Typography>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
};
