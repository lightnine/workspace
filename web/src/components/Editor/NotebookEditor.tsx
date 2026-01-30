import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  CircularProgress,
  Collapse,
  TextField,
  alpha,
  useTheme,
  Fade,
  ButtonGroup,
  Select,
  FormControl
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import DOMPurify from 'dompurify';
import Editor from '@monaco-editor/react';
import { useApp } from '../../context/AppContext';
import { useKernel } from '../../context/KernelContext';
import type { CellOutput } from '../../services/kernel';

// Icons
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import StopIcon from '@mui/icons-material/Stop';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CodeIcon from '@mui/icons-material/Code';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ClearIcon from '@mui/icons-material/Clear';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';

import SaveIcon from '@mui/icons-material/Save';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import { CellOperation } from '../../services/api';

// 导出 CellOperation 类型供其他组件使用
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
    language_info?: {
      name?: string;
    };
    kernelspec?: {
      display_name?: string;
      language?: string;
      name?: string;
    };
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
  };
  id?: string;
}

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

// 工具函数
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

// 渲染输出组件
const CellOutput: React.FC<{ outputs: NotebookOutput[]; isDarkMode: boolean }> = ({ outputs, isDarkMode }) => {
  if (!outputs || outputs.length === 0) return null;

  return (
    <Box sx={{ 
      fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
      fontSize: '13px',
      lineHeight: 1.5
    }}>
      {outputs.map((output, index) => {
        const outputType = output.output_type;
        
        if (outputType === 'stream') {
          const text = normalizeText(output.text);
          const isStderr = output.name === 'stderr';
          return (
            <Box
              key={index}
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                bgcolor: 'transparent',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: isStderr ? 'error.main' : (isDarkMode ? '#D4D4D4' : '#1e1e1e'),
              }}
            >
              {text}
            </Box>
          );
        }

        if (outputType === 'error') {
          const traceback = normalizeText(output.traceback);
          const errorMsg = traceback || `${output.ename || 'Error'}: ${output.evalue || ''}`;
          return (
            <Box
              key={index}
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                bgcolor: isDarkMode ? alpha('#ff1744', 0.08) : alpha('#ff1744', 0.05),
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'error.main',
                borderRadius: 1
              }}
            >
              {errorMsg}
            </Box>
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
            <Box key={index}>
              {html && (
                <Box
                  sx={{
                    p: 1.5,
                    overflowX: 'auto',
                    '& table': {
                      borderCollapse: 'collapse',
                      width: 'auto',
                      fontSize: '12px',
                      '& th, & td': {
                        border: '1px solid',
                        borderColor: isDarkMode ? alpha('#fff', 0.15) : alpha('#000', 0.12),
                        p: '6px 12px',
                        textAlign: 'left'
                      },
                      '& th': {
                        bgcolor: isDarkMode ? alpha('#fff', 0.05) : alpha('#000', 0.03),
                        fontWeight: 600
                      },
                      '& tr:hover td': {
                        bgcolor: isDarkMode ? alpha('#fff', 0.02) : alpha('#000', 0.02)
                      }
                    }
                  }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
                />
              )}
              {!html && text && (
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    whiteSpace: 'pre-wrap',
                    color: isDarkMode ? '#D4D4D4' : '#1e1e1e'
                  }}
                >
                  {text}
                </Box>
              )}
              {imageData && (
                <Box sx={{ p: 1.5 }}>
                  <Box
                    component="img"
                    src={`data:${imageMime};base64,${imageData}`}
                    alt="output"
                    sx={{ 
                      maxWidth: '100%',
                      borderRadius: 1,
                      boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                  />
                </Box>
              )}
            </Box>
          );
        }

        return null;
      })}
    </Box>
  );
};

// VS Code 风格的单元格组件
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
  onClearOutput: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  readOnly?: boolean;
  language: string;
  totalCells: number;
  isDarkMode: boolean;
}

const NotebookCell: React.FC<CellProps> = ({
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
  onClearOutput,
  canMoveUp,
  canMoveDown,
  readOnly,
  language,
  totalCells,
  isDarkMode
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
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

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      onUpdate(value);
    }
  };

  // 计算编辑器高度 - 更紧凑
  const editorHeight = useMemo(() => {
    const lines = source.split('\n').length;
    return Math.max(38, Math.min(lines * 19 + 10, 400));
  }, [source]);

  // 执行状态图标
  const StatusIcon = () => {
    if (isRunning) {
      return <CircularProgress size={14} thickness={5} sx={{ color: 'primary.main' }} />;
    }
    if (hasError) {
      return <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} />;
    }
    if (executionCount !== null && executionCount !== undefined) {
      return <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />;
    }
    return null;
  };

  return (
    <Box
      onClick={onActivate}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        position: 'relative',
        mb: 0,
        '&:hover .cell-toolbar': {
          opacity: 1
        }
      }}
    >
      {/* 单元格主容器 */}
      <Box
        sx={{
          display: 'flex',
          borderLeft: '2px solid',
          borderColor: isActive ? 'primary.main' : 'transparent',
          transition: 'border-color 0.1s ease',
          bgcolor: isActive 
            ? (isDarkMode ? alpha('#2563EB', 0.05) : alpha('#2563EB', 0.03))
            : 'transparent',
        }}
      >
        {/* 左侧执行区域 - VS Code 风格 */}
        <Box
          sx={{
            width: 48,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pt: 0.5,
            gap: 0.5
          }}
        >
          {/* 运行按钮 */}
          {isCodeCell && (
            <Tooltip title={t('notebook.runCell')} placement="left" arrow>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onRun(); }}
                disabled={readOnly || isRunning}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '6px',
                  bgcolor: isHovered || isActive 
                    ? (isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.05))
                    : 'transparent',
                  color: isRunning ? 'primary.main' : 'text.secondary',
                  '&:hover': { 
                    bgcolor: isDarkMode ? alpha('#fff', 0.12) : alpha('#000', 0.08),
                    color: 'primary.main'
                  }
                }}
              >
                {isRunning ? (
                  <CircularProgress size={14} thickness={5} sx={{ color: 'primary.main' }} />
                ) : (
                  <PlayArrowIcon sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Tooltip>
          )}

          {/* 执行计数 */}
          {isCodeCell && (
            <Typography
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '11px',
                color: hasError ? 'error.main' : 'text.disabled',
                fontWeight: 500,
                minHeight: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              [{executionCount ?? ' '}]
            </Typography>
          )}

          {/* Markdown 标识 */}
          {isMarkdownCell && (
            <Box
              sx={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <TextFieldsIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
            </Box>
          )}
        </Box>

        {/* 右侧内容区 */}
        <Box sx={{ flex: 1, minWidth: 0, py: 0.5, pr: 1 }}>
          {/* Cell 工具栏 - 悬停显示 */}
          <Fade in={isHovered || isActive}>
            <Box
              className="cell-toolbar"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 0.25,
                mb: 0.5,
                height: 24,
                opacity: 0,
                transition: 'opacity 0.15s'
              }}
            >
              {/* 类型切换 */}
              <ButtonGroup size="small" sx={{ mr: 0.5 }}>
                <Tooltip title="Code" arrow>
                  <Button
                    onClick={(e) => { e.stopPropagation(); onChangeType('code'); }}
                    disabled={readOnly}
                    sx={{
                      minWidth: 28,
                      height: 22,
                      p: 0,
                      bgcolor: isCodeCell 
                        ? (isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08))
                        : 'transparent',
                      color: isCodeCell ? 'text.primary' : 'text.secondary',
                      border: 'none',
                      '&:hover': { 
                        bgcolor: isDarkMode ? alpha('#fff', 0.12) : alpha('#000', 0.1),
                        border: 'none'
                      }
                    }}
                  >
                    <CodeIcon sx={{ fontSize: 14 }} />
                  </Button>
                </Tooltip>
                <Tooltip title="Markdown" arrow>
                  <Button
                    onClick={(e) => { e.stopPropagation(); onChangeType('markdown'); }}
                    disabled={readOnly}
                    sx={{
                      minWidth: 28,
                      height: 22,
                      p: 0,
                      bgcolor: isMarkdownCell 
                        ? (isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08))
                        : 'transparent',
                      color: isMarkdownCell ? 'text.primary' : 'text.secondary',
                      border: 'none',
                      '&:hover': { 
                        bgcolor: isDarkMode ? alpha('#fff', 0.12) : alpha('#000', 0.1),
                        border: 'none'
                      }
                    }}
                  >
                    <TextFieldsIcon sx={{ fontSize: 14 }} />
                  </Button>
                </Tooltip>
              </ButtonGroup>

              <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16, alignSelf: 'center' }} />

              {/* 移动按钮 */}
              <Tooltip title={t('notebook.moveUp')} arrow>
                <span>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                    disabled={!canMoveUp || readOnly}
                    sx={{ 
                      width: 22, 
                      height: 22,
                      color: 'text.secondary',
                      '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06) }
                    }}
                  >
                    <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={t('notebook.moveDown')} arrow>
                <span>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                    disabled={!canMoveDown || readOnly}
                    sx={{ 
                      width: 22, 
                      height: 22,
                      color: 'text.secondary',
                      '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06) }
                    }}
                  >
                    <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>

              <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16, alignSelf: 'center' }} />

              {/* 复制和删除 */}
              <Tooltip title={t('notebook.duplicate')} arrow>
                <span>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    disabled={readOnly}
                    sx={{ 
                      width: 22, 
                      height: 22,
                      color: 'text.secondary',
                      '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06) }
                    }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={t('notebook.deleteCell')} arrow>
                <span>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    disabled={readOnly || totalCells <= 1}
                    sx={{ 
                      width: 22, 
                      height: 22,
                      color: 'text.secondary',
                      '&:hover': { 
                        bgcolor: alpha(theme.palette.error.main, 0.1),
                        color: 'error.main'
                      }
                    }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {/* 更多菜单 */}
              <IconButton
                size="small"
                onClick={handleMenuOpen}
                sx={{ 
                  width: 22, 
                  height: 22,
                  color: 'text.secondary',
                  '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06) }
                }}
              >
                <MoreHorizIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Fade>

          {/* Cell Content */}
          <Box
            sx={{
              borderRadius: '4px',
              overflow: 'hidden',
              border: '1px solid',
              borderColor: isActive 
                ? (isDarkMode ? alpha('#fff', 0.15) : alpha('#000', 0.12))
                : (isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06)),
              bgcolor: isDarkMode ? '#1e1e1e' : '#ffffff',
              transition: 'border-color 0.1s ease'
            }}
          >
            {isCodeCell ? (
              // 代码编辑器
              <Box
                sx={{
                  '& .monaco-editor': {
                    paddingTop: '2px !important'
                  },
                  '& .monaco-editor .margin': {
                    bgcolor: 'transparent !important'
                  }
                }}
              >
                <Editor
                  height={editorHeight}
                  language={language}
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
              </Box>
            ) : isMarkdownCell ? (
              // Markdown 编辑/预览
              isMarkdownEditing || (isActive && !source) ? (
                <Box sx={{ p: 1 }}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    value={source}
                    onChange={(e) => onUpdate(e.target.value)}
                    onBlur={() => source && setIsMarkdownEditing(false)}
                    autoFocus={isMarkdownEditing}
                    disabled={readOnly}
                    placeholder={t('notebook.markdownPlaceholder')}
                    sx={{
                      '& .MuiInputBase-root': {
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: '13px',
                        p: 1,
                        bgcolor: 'transparent'
                      },
                      '& .MuiOutlinedInput-notchedOutline': {
                        border: 'none'
                      }
                    }}
                  />
                </Box>
              ) : (
                <Box
                  onClick={(e) => { e.stopPropagation(); setIsMarkdownEditing(true); }}
                  sx={{
                    p: 1.5,
                    cursor: 'text',
                    minHeight: 40,
                    '& > *:first-of-type': { mt: 0 },
                    '& > *:last-child': { mb: 0 },
                    '& h1': { fontSize: '1.5em', fontWeight: 600, mt: 1.5, mb: 0.75, borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 },
                    '& h2': { fontSize: '1.3em', fontWeight: 600, mt: 1.5, mb: 0.75, borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 },
                    '& h3': { fontSize: '1.15em', fontWeight: 600, mt: 1, mb: 0.5 },
                    '& h4, & h5, & h6': { fontWeight: 600, mt: 1, mb: 0.5 },
                    '& p': { my: 0.75, lineHeight: 1.6 },
                    '& pre': {
                      p: 1.5,
                      borderRadius: '4px',
                      bgcolor: isDarkMode ? alpha('#000', 0.3) : alpha('#000', 0.04),
                      overflowX: 'auto',
                      my: 1
                    },
                    '& code': {
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '12px',
                      bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.05),
                      px: 0.5,
                      py: 0.25,
                      borderRadius: '3px'
                    },
                    '& pre code': {
                      bgcolor: 'transparent',
                      p: 0
                    },
                    '& img': { maxWidth: '100%', borderRadius: '4px', my: 1 },
                    '& a': { color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
                    '& blockquote': {
                      borderLeft: '3px solid',
                      borderColor: isDarkMode ? alpha('#fff', 0.3) : alpha('#000', 0.2),
                      pl: 2,
                      ml: 0,
                      my: 1,
                      color: 'text.secondary',
                      fontStyle: 'italic'
                    },
                    '& ul, & ol': { pl: 2.5, my: 0.75 },
                    '& li': { my: 0.25 },
                    '& hr': { my: 2, borderColor: 'divider' },
                    '& table': {
                      borderCollapse: 'collapse',
                      my: 1,
                      '& th, & td': {
                        border: '1px solid',
                        borderColor: 'divider',
                        p: 0.75,
                        textAlign: 'left'
                      },
                      '& th': { fontWeight: 600, bgcolor: isDarkMode ? alpha('#fff', 0.03) : alpha('#000', 0.02) }
                    }
                  }}
                >
                  {source ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema]]}
                    >
                      {source}
                    </ReactMarkdown>
                  ) : (
                    <Typography color="text.disabled" fontSize="13px" fontStyle="italic">
                      {t('notebook.emptyMarkdown')}
                    </Typography>
                  )}
                </Box>
              )
            ) : (
              // Raw cell
              <Box 
                component="pre" 
                sx={{ 
                  p: 1.5, 
                  m: 0, 
                  fontFamily: '"JetBrains Mono", monospace', 
                  fontSize: '13px' 
                }}
              >
                {source || t('notebook.emptyCell')}
              </Box>
            )}
          </Box>

          {/* Cell Output - VS Code 风格 */}
          {isCodeCell && hasOutput && (
            <Box sx={{ mt: 0.5 }}>
              {/* Output 头部 */}
              <Box
                onClick={(e) => { e.stopPropagation(); setOutputCollapsed(!outputCollapsed); }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  cursor: 'pointer',
                  py: 0.25,
                  px: 0.5,
                  borderRadius: '4px',
                  '&:hover': {
                    bgcolor: isDarkMode ? alpha('#fff', 0.05) : alpha('#000', 0.03)
                  }
                }}
              >
                {outputCollapsed ? (
                  <ChevronRightIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                )}
                <StatusIcon />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '11px' }}>
                  {outputs.length} output{outputs.length > 1 ? 's' : ''}
                  {hasError && ' (error)'}
                </Typography>
                
                {/* 清除输出按钮 */}
                <Box sx={{ flex: 1 }} />
                <Fade in={isHovered || isActive}>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onClearOutput(); }}
                    disabled={readOnly}
                    sx={{ 
                      width: 20, 
                      height: 20,
                      color: 'text.disabled',
                      '&:hover': { 
                        bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06),
                        color: 'text.secondary'
                      }
                    }}
                  >
                    <ClearIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </Fade>
              </Box>

              {/* Output 内容 */}
              <Collapse in={!outputCollapsed}>
                <Box
                  sx={{
                    borderRadius: '4px',
                    border: '1px solid',
                    borderColor: hasError 
                      ? alpha(theme.palette.error.main, 0.3)
                      : (isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06)),
                    bgcolor: isDarkMode ? alpha('#000', 0.2) : alpha('#000', 0.02),
                    maxHeight: 400,
                    overflow: 'auto'
                  }}
                >
                  <CellOutput outputs={outputs} isDarkMode={isDarkMode} />
                </Box>
              </Collapse>
            </Box>
          )}
        </Box>
      </Box>

      {/* 更多菜单 */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            minWidth: 180,
            borderRadius: '8px',
            boxShadow: isDarkMode 
              ? '0 4px 20px rgba(0,0,0,0.4)' 
              : '0 4px 20px rgba(0,0,0,0.12)'
          }
        }}
      >
        <MenuItem onClick={() => { onInsertAbove('code'); handleMenuClose(); }} disabled={readOnly}>
          <ListItemIcon><VerticalAlignTopIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '13px' }}>{t('notebook.insertCodeAbove')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onInsertBelow('code'); handleMenuClose(); }} disabled={readOnly}>
          <ListItemIcon><VerticalAlignBottomIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '13px' }}>{t('notebook.insertCodeBelow')}</ListItemText>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => { onInsertAbove('markdown'); handleMenuClose(); }} disabled={readOnly}>
          <ListItemIcon><TextFieldsIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '13px' }}>{t('notebook.insertMarkdownAbove')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onInsertBelow('markdown'); handleMenuClose(); }} disabled={readOnly}>
          <ListItemIcon><TextFieldsIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '13px' }}>{t('notebook.insertMarkdownBelow')}</ListItemText>
        </MenuItem>
        {isCodeCell && hasOutput && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem onClick={() => { onClearOutput(); handleMenuClose(); }} disabled={readOnly}>
              <ListItemIcon><ClearIcon fontSize="small" /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: '13px' }}>{t('notebook.clearOutput')}</ListItemText>
            </MenuItem>
          </>
        )}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem 
          onClick={() => { onDelete(); handleMenuClose(); }} 
          disabled={readOnly || totalCells <= 1}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '13px', color: 'error.main' }}>{t('notebook.deleteCell')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* 插入按钮 - 在 cell 之间显示 */}
      {(isActive || isHovered) && !readOnly && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            py: 0.5,
            opacity: 0.6,
            transition: 'opacity 0.15s',
            '&:hover': { opacity: 1 }
          }}
        >
          <Box
            sx={{
              flex: 1,
              height: '1px',
              bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08)
            }}
          />
          <Button
            size="small"
            startIcon={<CodeIcon sx={{ fontSize: '12px !important' }} />}
            onClick={(e) => { e.stopPropagation(); onInsertBelow('code'); }}
            sx={{
              fontSize: '11px',
              textTransform: 'none',
              color: 'text.secondary',
              px: 1,
              py: 0.25,
              minHeight: 22,
              borderRadius: '4px',
              '&:hover': {
                bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.05),
                color: 'primary.main'
              }
            }}
          >
            Code
          </Button>
          <Button
            size="small"
            startIcon={<TextFieldsIcon sx={{ fontSize: '12px !important' }} />}
            onClick={(e) => { e.stopPropagation(); onInsertBelow('markdown'); }}
            sx={{
              fontSize: '11px',
              textTransform: 'none',
              color: 'text.secondary',
              px: 1,
              py: 0.25,
              minHeight: 22,
              borderRadius: '4px',
              '&:hover': {
                bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.05),
                color: 'primary.main'
              }
            }}
          >
            Markdown
          </Button>
          <Box
            sx={{
              flex: 1,
              height: '1px',
              bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08)
            }}
          />
        </Box>
      )}
    </Box>
  );
};

// 主组件
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
  
  // 增量更新：跟踪待保存的操作
  const pendingOperationsRef = useRef<CellOperation[]>([]);
  const savedCellsRef = useRef<NotebookCell[]>([]);

  // 解析 notebook
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

  // 单元格操作
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
          
          return updated;
        });
        
        setRunningCells(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
        
        // Trigger onChange
        if (onChange && notebook) {
          setCells(currentCells => {
            const updatedNotebook: NotebookData = {
              ...notebook,
              cells: currentCells.map(c => ({
                ...c,
                source: textToArray(normalizeText(c.source))
              }))
            };
            onChange(JSON.stringify(updatedNotebook, null, 2));
            return currentCells;
          });
        }
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

  // Kernel 状态配置
  const getKernelStatusConfig = () => {
    switch (kernelStatus) {
      case 'disconnected':
        return { 
          color: isDarkMode ? '#6B7280' : '#9CA3AF',
          bgColor: isDarkMode ? alpha('#fff', 0.05) : alpha('#000', 0.04),
          icon: <FiberManualRecordIcon sx={{ fontSize: 8 }} />,
          label: 'Disconnected'
        };
      case 'connecting':
        return { 
          color: '#F59E0B',
          bgColor: alpha('#F59E0B', 0.1),
          icon: <CircularProgress size={8} sx={{ color: '#F59E0B' }} />,
          label: 'Connecting...'
        };
      case 'busy':
        return { 
          color: '#F59E0B',
          bgColor: alpha('#F59E0B', 0.1),
          icon: <CircularProgress size={8} sx={{ color: '#F59E0B' }} />,
          label: 'Busy'
        };
      case 'idle':
        return { 
          color: '#10B981',
          bgColor: alpha('#10B981', 0.1),
          icon: <FiberManualRecordIcon sx={{ fontSize: 8, color: '#10B981' }} />,
          label: 'Idle'
        };
    }
  };

  const kernelConfig = getKernelStatusConfig();

  if (error) {
    return (
      <Box sx={{ height, overflow: 'auto', p: 3 }}>
        <Box
          sx={{
            p: 3,
            borderRadius: '8px',
            border: '1px solid',
            borderColor: 'error.main',
            bgcolor: isDarkMode ? alpha('#ff1744', 0.1) : alpha('#ff1744', 0.05)
          }}
        >
          <Typography color="error" fontWeight={600} sx={{ mb: 2 }}>
            Invalid Notebook Format
          </Typography>
          <Typography color="error.main" fontSize="13px" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0, 
              p: 2, 
              borderRadius: '4px', 
              bgcolor: isDarkMode ? alpha('#000', 0.3) : alpha('#000', 0.04),
              fontSize: '12px', 
              fontFamily: '"JetBrains Mono", monospace', 
              whiteSpace: 'pre-wrap',
              overflowX: 'auto',
              maxHeight: 300
            }}
          >
            {content}
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box 
      ref={containerRef} 
      tabIndex={-1} 
      sx={{ 
        height, 
        display: 'flex', 
        flexDirection: 'column', 
        bgcolor: isDarkMode ? '#1e1e1e' : '#ffffff',
        outline: 'none'
      }}
    >
      {/* VS Code 风格顶部工具栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08),
          bgcolor: isDarkMode ? '#252526' : '#f3f3f3',
          flexShrink: 0,
          minHeight: 36
        }}
      >
        {/* 运行按钮组 */}
        <Tooltip title={`${t('notebook.runCell')} (Shift+Enter)`} arrow>
          <span>
            <IconButton
              size="small"
              onClick={() => handleRunCell(activeCellIndex)}
              disabled={readOnly || cells[activeCellIndex]?.cell_type !== 'code' || kernelStatus === 'connecting'}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '4px',
                color: isDarkMode ? '#cccccc' : '#424242',
                '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) },
                '&:disabled': { color: isDarkMode ? '#5a5a5a' : '#bdbdbd' }
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title={t('notebook.runAll')} arrow>
          <span>
            <IconButton
              size="small"
              onClick={handleRunAll}
              disabled={readOnly || kernelStatus === 'connecting'}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '4px',
                color: isDarkMode ? '#cccccc' : '#424242',
                '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) }
              }}
            >
              <PlaylistPlayIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

        <Tooltip title={t('notebook.stopExecution')} arrow>
          <span>
            <IconButton
              size="small"
              onClick={handleInterruptKernel}
              disabled={kernelStatus !== 'busy'}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '4px',
                color: isDarkMode ? '#cccccc' : '#424242',
                '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) },
                '&:disabled': { color: isDarkMode ? '#5a5a5a' : '#bdbdbd' }
              }}
            >
              <StopIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title={t('notebook.restartKernel')} arrow>
          <span>
            <IconButton
              size="small"
              onClick={handleRestartKernel}
              disabled={kernelStatus === 'disconnected'}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '4px',
                color: isDarkMode ? '#cccccc' : '#424242',
                '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) },
                '&:disabled': { color: isDarkMode ? '#5a5a5a' : '#bdbdbd' }
              }}
            >
              <RestartAltIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

        {/* 清除输出 */}
        <Tooltip title={t('notebook.clearAllOutputs')} arrow>
          <span>
            <IconButton
              size="small"
              onClick={handleClearAllOutputs}
              disabled={readOnly}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '4px',
                color: isDarkMode ? '#cccccc' : '#424242',
                '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) }
              }}
            >
              <ClearIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>

        {/* 折叠/展开所有 */}
        <Tooltip title={allCollapsed ? t('notebook.expandAll') : t('notebook.collapseAll')} arrow>
          <IconButton
            size="small"
            onClick={() => setAllCollapsed(!allCollapsed)}
            sx={{
              width: 28,
              height: 28,
              borderRadius: '4px',
              color: isDarkMode ? '#cccccc' : '#424242',
              '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) }
            }}
          >
            {allCollapsed ? <UnfoldMoreIcon sx={{ fontSize: 16 }} /> : <UnfoldLessIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        {/* 保存状态 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1 }}>
          {isSaving ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AutorenewIcon 
                sx={{ 
                  fontSize: 14, 
                  color: 'primary.main',
                  animation: 'spin 1s linear infinite',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' }
                  }
                }} 
              />
              <Typography variant="caption" sx={{ fontSize: '11px', color: 'text.secondary' }}>
                Saving...
              </Typography>
            </Box>
          ) : isDirty ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <FiberManualRecordIcon sx={{ fontSize: 8, color: 'warning.main' }} />
              <Typography variant="caption" sx={{ fontSize: '11px', color: 'warning.main' }}>
                Modified
              </Typography>
            </Box>
          ) : lastSavedTime ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CloudDoneIcon sx={{ fontSize: 14, color: 'success.main' }} />
              <Typography variant="caption" sx={{ fontSize: '11px', color: 'text.secondary' }}>
                Saved
              </Typography>
            </Box>
          ) : null}
        </Box>

        {/* 保存按钮 */}
        <Tooltip title={`Save (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+S)`} arrow>
          <span>
            <IconButton
              size="small"
              onClick={handleSave}
              disabled={readOnly || isSaving || !isDirty}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '4px',
                color: isDirty ? 'primary.main' : (isDarkMode ? '#5a5a5a' : '#bdbdbd'),
                '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) },
                '&:disabled': { color: isDarkMode ? '#5a5a5a' : '#bdbdbd' }
              }}
            >
              <SaveIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

        {/* Kernel 选择器 */}
        {!isConnected && Object.keys(kernelSpecs).length > 0 && (
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select
              value={selectedKernelSpec}
              onChange={(e) => setSelectedKernelSpec(e.target.value)}
              sx={{
                height: 24,
                fontSize: '11px',
                bgcolor: isDarkMode ? alpha('#fff', 0.05) : alpha('#000', 0.04),
                '& .MuiSelect-select': {
                  py: 0.25,
                  px: 1,
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.1),
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: isDarkMode ? alpha('#fff', 0.2) : alpha('#000', 0.2),
                }
              }}
            >
              {Object.entries(kernelSpecs).map(([name, spec]) => (
                <MenuItem key={name} value={name} sx={{ fontSize: '12px' }}>
                  {spec.display_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Kernel 连接按钮 */}
        <Tooltip title={isConnected ? 'Disconnect Kernel' : 'Connect Kernel'} arrow>
          <IconButton
            size="small"
            onClick={handleConnectKernel}
            disabled={isConnecting}
            sx={{
              width: 28,
              height: 28,
              borderRadius: '4px',
              color: isConnected ? '#10B981' : (isDarkMode ? '#cccccc' : '#424242'),
              '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) }
            }}
          >
            {isConnected ? <LinkIcon sx={{ fontSize: 16 }} /> : <LinkOffIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>

        {/* Kernel 状态 */}
        <Tooltip title={`Kernel: ${kernelConfig.label}${currentKernel ? ` (${currentKernel.name})` : ''}`} arrow>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: '4px',
              bgcolor: kernelConfig.bgColor,
              cursor: 'default',
              transition: 'all 0.15s',
            }}
          >
            {kernelConfig.icon}
            <Typography 
              sx={{ 
                fontSize: '11px',
                fontWeight: 500,
                color: kernelConfig.color
              }}
            >
              {kernelConfig.label}
            </Typography>
          </Box>
        </Tooltip>

        {/* 语言显示 */}
        <Chip
          label={language.charAt(0).toUpperCase() + language.slice(1)}
          size="small"
          sx={{
            height: 20,
            fontSize: '11px',
            fontWeight: 500,
            bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06),
            color: isDarkMode ? '#cccccc' : '#616161',
            border: 'none',
            '& .MuiChip-label': { px: 1 }
          }}
        />
      </Box>

      {/* Cells 容器 */}
      <Box 
        sx={{ 
          flex: 1, 
          overflow: 'auto', 
          py: 1,
          '&::-webkit-scrollbar': {
            width: 10
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: isDarkMode ? alpha('#fff', 0.15) : alpha('#000', 0.12),
            borderRadius: 5,
            border: '2px solid transparent',
            backgroundClip: 'content-box',
            '&:hover': {
              bgcolor: isDarkMode ? alpha('#fff', 0.25) : alpha('#000', 0.2)
            }
          }
        }}
      >
        {/* 顶部添加按钮 */}
        {!readOnly && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              py: 0.5,
              px: 6,
              opacity: 0.5,
              transition: 'opacity 0.15s',
              '&:hover': { opacity: 1 }
            }}
          >
            <Box sx={{ flex: 1, height: '1px', bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) }} />
            <Button
              size="small"
              startIcon={<AddIcon sx={{ fontSize: '12px !important' }} />}
              onClick={() => handleInsertAbove(0, 'code')}
              sx={{
                fontSize: '11px',
                textTransform: 'none',
                color: 'text.secondary',
                px: 1,
                py: 0.25,
                minHeight: 22,
                borderRadius: '4px',
                '&:hover': {
                  bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.05),
                  color: 'primary.main'
                }
              }}
            >
              Add Cell
            </Button>
            <Box sx={{ flex: 1, height: '1px', bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08) }} />
          </Box>
        )}

        {/* Cells */}
        {cells.map((cell, index) => (
          <NotebookCell
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
            onClearOutput={() => handleClearOutput(index)}
            canMoveUp={index > 0}
            canMoveDown={index < cells.length - 1}
            readOnly={readOnly}
            language={language}
            totalCells={cells.length}
            isDarkMode={isDarkMode}
          />
        ))}

        {/* 底部空白区域 */}
        <Box sx={{ height: 100 }} />
      </Box>
    </Box>
  );
};

export default NotebookEditor;
