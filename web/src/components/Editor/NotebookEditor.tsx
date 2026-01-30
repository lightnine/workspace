import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Select,
  FormControl,
  Chip,
  CircularProgress,
  Collapse,
  TextField,
  alpha,
  useTheme
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import DOMPurify from 'dompurify';
import Editor from '@monaco-editor/react';
import { useApp } from '../../context/AppContext';

// Icons
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import StopIcon from '@mui/icons-material/Stop';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CodeIcon from '@mui/icons-material/Code';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ClearIcon from '@mui/icons-material/Clear';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import PowerOffIcon from '@mui/icons-material/PowerOff';
import TerminalIcon from '@mui/icons-material/Terminal';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

interface NotebookEditorProps {
  content?: string;
  height?: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
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

// 渲染输出
const CellOutput: React.FC<{ outputs: NotebookOutput[]; isDarkMode: boolean }> = ({ outputs, isDarkMode }) => {
  if (!outputs || outputs.length === 0) return null;

  return (
    <Box sx={{ mt: 0 }}>
      {outputs.map((output, index) => {
        const outputType = output.output_type;
        
        if (outputType === 'stream') {
          const text = normalizeText(output.text);
          return (
            <Box
              key={index}
              component="pre"
              sx={{
                m: 0,
                p: 2,
                bgcolor: isDarkMode ? alpha('#000', 0.2) : alpha('#000', 0.02),
                fontSize: '13px',
                fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6,
                color: output.name === 'stderr' ? 'error.main' : 'text.primary',
                borderLeft: '3px solid',
                borderLeftColor: output.name === 'stderr' ? 'error.main' : 'success.main'
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
                p: 2,
                bgcolor: isDarkMode ? alpha('#ff1744', 0.1) : alpha('#ff1744', 0.05),
                fontSize: '13px',
                fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'error.main',
                borderLeft: '3px solid',
                borderLeftColor: 'error.main'
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
                    p: 2,
                    bgcolor: isDarkMode ? alpha('#000', 0.2) : 'transparent',
                    overflowX: 'auto',
                    '& table': {
                      borderCollapse: 'collapse',
                      width: '100%',
                      fontSize: '13px',
                      '& th, & td': {
                        border: '1px solid',
                        borderColor: 'divider',
                        p: 1,
                        textAlign: 'left'
                      },
                      '& th': {
                        bgcolor: isDarkMode ? alpha('#fff', 0.05) : alpha('#000', 0.03),
                        fontWeight: 600
                      },
                      '& tr:hover': {
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
                    p: 2,
                    bgcolor: isDarkMode ? alpha('#000', 0.2) : alpha('#000', 0.02),
                    fontSize: '13px',
                    fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
                    whiteSpace: 'pre-wrap',
                    borderLeft: '3px solid',
                    borderLeftColor: 'info.main'
                  }}
                >
                  {text}
                </Box>
              )}
              {imageData && (
                <Box
                  sx={{
                    p: 2,
                    display: 'flex',
                    justifyContent: 'center'
                  }}
                >
                  <Box
                    component="img"
                    src={`data:${imageMime};base64,${imageData}`}
                    alt="output"
                    sx={{ 
                      maxWidth: '100%', 
                      borderRadius: 1,
                      boxShadow: 1
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

// 单元格组件
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
  const [isEditing, setIsEditing] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [codeHidden, setCodeHidden] = useState(false);
  const editorRef = useRef<any>(null);

  const source = normalizeText(cell.source);
  const outputs = cell.outputs ?? [];
  const isCodeCell = cell.cell_type === 'code';
  const isMarkdownCell = cell.cell_type === 'markdown';
  const hasError = hasErrorOutput(outputs);
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

  // 计算编辑器高度
  const editorHeight = useMemo(() => {
    const lines = source.split('\n').length;
    return Math.max(56, Math.min(lines * 20 + 16, 500));
  }, [source]);

  // 获取执行状态颜色
  const getStatusColor = () => {
    if (isRunning) return theme.palette.warning.main;
    if (hasError) return theme.palette.error.main;
    if (executionCount !== null && executionCount !== undefined) return theme.palette.success.main;
    return isDarkMode ? alpha('#fff', 0.2) : alpha('#000', 0.15);
  };

  return (
    <Box
      onClick={onActivate}
      sx={{
        position: 'relative',
        mb: 0.5,
        transition: 'all 0.15s ease',
        '&:hover .cell-actions': {
          opacity: 1
        }
      }}
    >
      {/* 单元格主体 */}
      <Box
        sx={{
          display: 'flex',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid',
          borderColor: isActive 
            ? 'primary.main' 
            : isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08),
          bgcolor: isDarkMode ? alpha('#fff', 0.02) : 'background.paper',
          boxShadow: isActive 
            ? `0 0 0 1px ${alpha(theme.palette.primary.main, 0.3)}` 
            : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        {/* 左侧状态栏 */}
        <Box
          sx={{
            width: 4,
            bgcolor: getStatusColor(),
            flexShrink: 0,
            transition: 'background-color 0.2s'
          }}
        />

        {/* 单元格内容区 */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Cell Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 1.5,
              py: 0.75,
              borderBottom: isActive ? '1px solid' : 'none',
              borderColor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.06),
              bgcolor: isActive 
                ? (isDarkMode ? alpha('#fff', 0.03) : alpha('#000', 0.02))
                : 'transparent',
              minHeight: 40,
              gap: 0.5
            }}
          >
            {/* 拖拽手柄 */}
            <Box 
              sx={{ 
                cursor: 'grab', 
                color: isDarkMode ? alpha('#fff', 0.3) : alpha('#000', 0.25), 
                display: 'flex',
                '&:hover': {
                  color: 'text.secondary'
                }
              }}
            >
              <DragIndicatorIcon sx={{ fontSize: 18 }} />
            </Box>

            {/* 运行按钮 */}
            <Tooltip title={isCodeCell ? t('notebook.runCell') : ''} arrow placement="top">
              <span>
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onRun(); }}
                  disabled={!isCodeCell || readOnly || isRunning}
                  sx={{
                    width: 28,
                    height: 28,
                    bgcolor: isCodeCell 
                      ? (isRunning ? 'warning.main' : 'primary.main')
                      : (isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.06)),
                    color: isCodeCell ? 'white' : 'text.disabled',
                    borderRadius: '6px',
                    '&:hover': { 
                      bgcolor: isCodeCell 
                        ? (isRunning ? 'warning.dark' : 'primary.dark')
                        : (isDarkMode ? alpha('#fff', 0.15) : alpha('#000', 0.1))
                    },
                    '&:disabled': { 
                      bgcolor: isDarkMode ? alpha('#fff', 0.05) : alpha('#000', 0.04), 
                      color: isDarkMode ? alpha('#fff', 0.2) : alpha('#000', 0.2)
                    }
                  }}
                >
                  {isRunning ? (
                    <CircularProgress size={14} sx={{ color: 'white' }} />
                  ) : (
                    <PlayArrowIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>

            {/* 执行计数 / 状态 */}
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              minWidth: 60,
              ml: 0.5
            }}>
              {isCodeCell && (
                <Typography 
                  variant="caption" 
                  sx={{ 
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '11px',
                    color: hasError ? 'error.main' : 'text.secondary',
                    fontWeight: 500
                  }}
                >
                  [{executionCount ?? ' '}]
                </Typography>
              )}
              {!isCodeCell && (
                <Chip
                  size="small"
                  label="MD"
                  sx={{
                    height: 20,
                    fontSize: '10px',
                    fontWeight: 600,
                    bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.06),
                    color: 'text.secondary'
                  }}
                />
              )}
            </Box>

            <Box sx={{ flex: 1 }} />

            {/* 单元格操作按钮组 */}
            <Box 
              className="cell-actions"
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.25,
                opacity: isActive ? 1 : 0,
                transition: 'opacity 0.15s'
              }}
            >
              {/* 单元类型选择 */}
              <FormControl size="small">
                <Select
                  value={cell.cell_type}
                  onChange={(e) => onChangeType(e.target.value as 'code' | 'markdown')}
                  disabled={readOnly}
                  sx={{
                    height: 26,
                    fontSize: '12px',
                    bgcolor: isDarkMode ? alpha('#fff', 0.05) : alpha('#000', 0.04),
                    borderRadius: '6px',
                    '& .MuiOutlinedInput-notchedOutline': {
                      border: 'none'
                    },
                    '& .MuiSelect-select': { 
                      py: 0.5, 
                      px: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5
                    }
                  }}
                >
                  <MenuItem value="code">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <CodeIcon sx={{ fontSize: 14 }} />
                      Code
                    </Box>
                  </MenuItem>
                  <MenuItem value="markdown">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <TextFieldsIcon sx={{ fontSize: 14 }} />
                      Markdown
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>

              <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

              <Tooltip title={t('notebook.moveUp')} arrow>
                <span>
                  <IconButton 
                    size="small" 
                    onClick={(e) => { e.stopPropagation(); onMoveUp(); }} 
                    disabled={!canMoveUp || readOnly}
                    sx={{ 
                      width: 26, 
                      height: 26,
                      borderRadius: '6px',
                      '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.06) }
                    }}
                  >
                    <KeyboardArrowUpIcon sx={{ fontSize: 18 }} />
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
                      width: 26, 
                      height: 26,
                      borderRadius: '6px',
                      '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.06) }
                    }}
                  >
                    <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>

              <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

              <Tooltip title={t('notebook.duplicate')} arrow>
                <span>
                  <IconButton 
                    size="small" 
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }} 
                    disabled={readOnly}
                    sx={{ 
                      width: 26, 
                      height: 26,
                      borderRadius: '6px',
                      '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.06) }
                    }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
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
                      width: 26, 
                      height: 26,
                      borderRadius: '6px',
                      color: 'error.main',
                      '&:hover': { 
                        bgcolor: alpha(theme.palette.error.main, 0.1)
                      }
                    }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {/* 更多菜单 */}
              <IconButton 
                size="small" 
                onClick={handleMenuOpen}
                sx={{ 
                  width: 26, 
                  height: 26,
                  borderRadius: '6px',
                  '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.06) }
                }}
              >
                <MoreVertIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Box>

          {/* Cell Content */}
          <Collapse in={!codeHidden}>
            <Box sx={{ position: 'relative' }}>
              {isCodeCell ? (
                // 代码编辑器
                <Box
                  sx={{
                    '& .monaco-editor': {
                      paddingTop: '4px !important'
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
                        vertical: 'auto',
                        horizontal: 'auto',
                        verticalScrollbarSize: 8,
                        horizontalScrollbarSize: 8
                      },
                      padding: { top: 8, bottom: 8 },
                      overviewRulerLanes: 0,
                      hideCursorInOverviewRuler: true,
                      overviewRulerBorder: false,
                      contextmenu: true,
                      glyphMargin: false,
                      lineDecorationsWidth: 8,
                      renderWhitespace: 'selection'
                    }}
                    theme={isDarkMode ? 'vs-dark' : 'light'}
                  />
                </Box>
              ) : isMarkdownCell ? (
                // Markdown 编辑/预览
                isEditing || isActive ? (
                  <Box sx={{ p: 2 }}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={3}
                      value={source}
                      onChange={(e) => onUpdate(e.target.value)}
                      onBlur={() => setIsEditing(false)}
                      disabled={readOnly}
                      placeholder={t('notebook.markdownPlaceholder')}
                      sx={{
                        '& .MuiInputBase-root': {
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: '13px',
                          bgcolor: isDarkMode ? alpha('#000', 0.2) : alpha('#000', 0.02),
                          borderRadius: '8px'
                        },
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.1)
                        }
                      }}
                    />
                  </Box>
                ) : (
                  <Box
                    onClick={() => setIsEditing(true)}
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                      minHeight: 60,
                      '& > *:first-of-type': { mt: 0 },
                      '& > *:last-child': { mb: 0 },
                      '& h1, & h2, & h3': { 
                        mt: 2, 
                        mb: 1,
                        fontWeight: 600
                      },
                      '& p': { my: 1, lineHeight: 1.7 },
                      '& pre': {
                        p: 2,
                        borderRadius: '8px',
                        bgcolor: isDarkMode ? alpha('#000', 0.3) : alpha('#000', 0.04),
                        overflowX: 'auto'
                      },
                      '& code': {
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: '13px',
                        bgcolor: isDarkMode ? alpha('#000', 0.3) : alpha('#000', 0.04),
                        px: 0.75,
                        py: 0.25,
                        borderRadius: '4px'
                      },
                      '& pre code': {
                        bgcolor: 'transparent',
                        p: 0
                      },
                      '& img': { maxWidth: '100%', borderRadius: '8px' },
                      '& a': { color: 'primary.main' },
                      '& blockquote': {
                        borderLeft: '3px solid',
                        borderColor: 'primary.main',
                        pl: 2,
                        ml: 0,
                        color: 'text.secondary'
                      },
                      '& ul, & ol': { pl: 3 },
                      '& li': { my: 0.5 }
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
                      <Typography color="text.secondary" fontStyle="italic" fontSize="13px">
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
                    p: 2, 
                    m: 0, 
                    fontFamily: '"JetBrains Mono", monospace', 
                    fontSize: '13px' 
                  }}
                >
                  {source || t('notebook.emptyCell')}
                </Box>
              )}
            </Box>
          </Collapse>

          {/* Cell Output */}
          {isCodeCell && outputs.length > 0 && (
            <Collapse in={!outputCollapsed}>
              <Box 
                sx={{ 
                  borderTop: '1px solid', 
                  borderColor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06)
                }}
              >
                <CellOutput outputs={outputs} isDarkMode={isDarkMode} />
              </Box>
            </Collapse>
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
            minWidth: 200,
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
          }
        }}
      >
        <MenuItem onClick={() => { onInsertAbove('code'); handleMenuClose(); }} disabled={readOnly}>
          <ListItemIcon><VerticalAlignTopIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('notebook.insertAbove')}</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>A</Typography>
        </MenuItem>
        <MenuItem onClick={() => { onInsertBelow('code'); handleMenuClose(); }} disabled={readOnly}>
          <ListItemIcon><VerticalAlignBottomIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('notebook.insertBelow')}</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>B</Typography>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => { setCodeHidden(!codeHidden); handleMenuClose(); }}>
          <ListItemIcon>{codeHidden ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>{codeHidden ? t('notebook.showCode') : t('notebook.hideCode')}</ListItemText>
        </MenuItem>
        {isCodeCell && (
          <MenuItem onClick={() => { setOutputCollapsed(!outputCollapsed); handleMenuClose(); }}>
            <ListItemIcon>{outputCollapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{outputCollapsed ? t('notebook.expandOutput') : t('notebook.collapseOutput')}</ListItemText>
          </MenuItem>
        )}
        {isCodeCell && (
          <MenuItem onClick={() => { onClearOutput(); handleMenuClose(); }} disabled={readOnly || outputs.length === 0}>
            <ListItemIcon><ClearIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('notebook.clearOutput')}</ListItemText>
          </MenuItem>
        )}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => { onDelete(); handleMenuClose(); }} disabled={readOnly || totalCells <= 1}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>{t('notebook.deleteCell')}</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>D,D</Typography>
        </MenuItem>
      </Menu>

      {/* Add Cell Buttons (显示在当前单元格下方) */}
      {isActive && !readOnly && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 1,
            py: 1,
            opacity: 0.8,
            transition: 'opacity 0.15s',
            '&:hover': {
              opacity: 1
            }
          }}
        >
          <Button
            size="small"
            variant="text"
            startIcon={<CodeIcon sx={{ fontSize: 14 }} />}
            onClick={(e) => { e.stopPropagation(); onInsertBelow('code'); }}
            sx={{ 
              fontSize: '12px',
              textTransform: 'none',
              color: 'text.secondary',
              px: 1.5,
              py: 0.5,
              borderRadius: '6px',
              '&:hover': {
                bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06),
                color: 'primary.main'
              }
            }}
          >
            {t('notebook.addCode')}
          </Button>
          <Button
            size="small"
            variant="text"
            startIcon={<TextFieldsIcon sx={{ fontSize: 14 }} />}
            onClick={(e) => { e.stopPropagation(); onInsertBelow('markdown'); }}
            sx={{ 
              fontSize: '12px',
              textTransform: 'none',
              color: 'text.secondary',
              px: 1.5,
              py: 0.5,
              borderRadius: '6px',
              '&:hover': {
                bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06),
                color: 'primary.main'
              }
            }}
          >
            {t('notebook.addMarkdown')}
          </Button>
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
  readOnly = false
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { theme: themeMode } = useApp();
  const isDarkMode = themeMode === 'dark';
  
  const [activeCellIndex, setActiveCellIndex] = useState<number>(0);
  const [runningCells, setRunningCells] = useState<Set<number>>(new Set());
  const [kernelStatus, setKernelStatus] = useState<'disconnected' | 'connecting' | 'idle' | 'busy'>('disconnected');

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
      // 确保每个 cell 有 id
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
  
  // 当 content 变化时更新 cells
  useEffect(() => {
    if (notebook?.cells) {
      setCells(notebook.cells);
    }
  }, [notebook?.cells]);

  const language = notebook?.metadata?.kernelspec?.language || notebook?.metadata?.language_info?.name || 'python';

  // 更新 notebook 并通知父组件
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
    newCells[index] = { ...newCells[index], source };
    updateNotebook(newCells);
  }, [cells, updateNotebook]);

  const handleRunCell = useCallback(async (index: number) => {
    if (kernelStatus === 'disconnected') {
      // 模拟连接
      setKernelStatus('connecting');
      await new Promise(r => setTimeout(r, 1000));
      setKernelStatus('idle');
    }
    
    setRunningCells(prev => new Set(prev).add(index));
    setKernelStatus('busy');
    
    // 模拟执行
    await new Promise(r => setTimeout(r, 1500));
    
    const newCells = [...cells];
    const cell = newCells[index];
    if (cell.cell_type === 'code') {
      const currentCount = Math.max(...cells.map(c => c.execution_count || 0), 0) + 1;
      newCells[index] = {
        ...cell,
        execution_count: currentCount,
        outputs: [{
          output_type: 'stream',
          name: 'stdout',
          text: `# Cell executed successfully\n# Execution count: ${currentCount}\n`
        }]
      };
      updateNotebook(newCells);
    }
    
    setRunningCells(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setKernelStatus('idle');
  }, [cells, updateNotebook, kernelStatus]);

  const handleRunAll = useCallback(async () => {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].cell_type === 'code') {
        await handleRunCell(i);
      }
    }
  }, [cells, handleRunCell]);

  const handleDeleteCell = useCallback((index: number) => {
    if (cells.length <= 1) return;
    const newCells = cells.filter((_, i) => i !== index);
    updateNotebook(newCells);
    if (activeCellIndex >= newCells.length) {
      setActiveCellIndex(newCells.length - 1);
    }
  }, [cells, updateNotebook, activeCellIndex]);

  const handleDuplicateCell = useCallback((index: number) => {
    const newCells = [...cells];
    const duplicated = { ...cells[index], id: generateCellId() };
    newCells.splice(index + 1, 0, duplicated);
    updateNotebook(newCells);
    setActiveCellIndex(index + 1);
  }, [cells, updateNotebook]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    const newCells = [...cells];
    [newCells[index - 1], newCells[index]] = [newCells[index], newCells[index - 1]];
    updateNotebook(newCells);
    setActiveCellIndex(index - 1);
  }, [cells, updateNotebook]);

  const handleMoveDown = useCallback((index: number) => {
    if (index >= cells.length - 1) return;
    const newCells = [...cells];
    [newCells[index], newCells[index + 1]] = [newCells[index + 1], newCells[index]];
    updateNotebook(newCells);
    setActiveCellIndex(index + 1);
  }, [cells, updateNotebook]);

  const handleInsertAbove = useCallback((index: number, type: 'code' | 'markdown' = 'code') => {
    const newCells = [...cells];
    newCells.splice(index, 0, createEmptyCell(type));
    updateNotebook(newCells);
    setActiveCellIndex(index);
  }, [cells, updateNotebook]);

  const handleInsertBelow = useCallback((index: number, type: 'code' | 'markdown' = 'code') => {
    const newCells = [...cells];
    newCells.splice(index + 1, 0, createEmptyCell(type));
    updateNotebook(newCells);
    setActiveCellIndex(index + 1);
  }, [cells, updateNotebook]);

  const handleChangeType = useCallback((index: number, type: 'code' | 'markdown') => {
    const newCells = [...cells];
    newCells[index] = {
      ...newCells[index],
      cell_type: type,
      outputs: type === 'code' ? [] : undefined,
      execution_count: type === 'code' ? null : undefined
    };
    updateNotebook(newCells);
  }, [cells, updateNotebook]);

  const handleClearOutput = useCallback((index: number) => {
    const newCells = [...cells];
    newCells[index] = { ...newCells[index], outputs: [], execution_count: null };
    updateNotebook(newCells);
  }, [cells, updateNotebook]);

  const handleClearAllOutputs = useCallback(() => {
    const newCells = cells.map(cell => ({
      ...cell,
      outputs: cell.cell_type === 'code' ? [] : cell.outputs,
      execution_count: cell.cell_type === 'code' ? null : cell.execution_count
    }));
    updateNotebook(newCells);
  }, [cells, updateNotebook]);

  const handleConnectKernel = useCallback(async () => {
    if (kernelStatus === 'disconnected') {
      setKernelStatus('connecting');
      await new Promise(r => setTimeout(r, 1500));
      setKernelStatus('idle');
    }
  }, [kernelStatus]);

  const handleDisconnectKernel = useCallback(() => {
    setKernelStatus('disconnected');
  }, []);

  // Kernel 状态配置
  const getKernelStatusConfig = () => {
    switch (kernelStatus) {
      case 'disconnected':
        return { 
          color: isDarkMode ? alpha('#fff', 0.5) : alpha('#000', 0.4),
          icon: <FiberManualRecordIcon sx={{ fontSize: 10 }} />,
          label: t('notebook.disconnected')
        };
      case 'connecting':
        return { 
          color: theme.palette.warning.main,
          icon: <CircularProgress size={10} sx={{ color: 'warning.main' }} />,
          label: t('notebook.connecting')
        };
      case 'busy':
        return { 
          color: theme.palette.warning.main,
          icon: <CircularProgress size={10} sx={{ color: 'warning.main' }} />,
          label: t('notebook.busy')
        };
      case 'idle':
        return { 
          color: theme.palette.success.main,
          icon: <FiberManualRecordIcon sx={{ fontSize: 10, color: 'success.main' }} />,
          label: t('notebook.idle')
        };
    }
  };

  const kernelConfig = getKernelStatusConfig();

  if (error) {
    return (
      <Box sx={{ height, overflow: 'auto', p: 3 }}>
        <Paper
          sx={{
            p: 3,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'error.main',
            bgcolor: isDarkMode ? alpha('#ff1744', 0.1) : alpha('#ff1744', 0.05)
          }}
        >
          <Typography color="error" fontWeight={600} sx={{ mb: 2 }}>
            {t('notebook.invalid')}: {error}
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0, 
              p: 2, 
              borderRadius: '8px', 
              bgcolor: isDarkMode ? alpha('#000', 0.3) : alpha('#000', 0.04),
              fontSize: '13px', 
              fontFamily: '"JetBrains Mono", monospace', 
              whiteSpace: 'pre-wrap',
              overflowX: 'auto'
            }}
          >
            {content}
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ height, display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08),
          bgcolor: isDarkMode ? alpha('#fff', 0.02) : 'background.paper',
          flexShrink: 0
        }}
      >
        {/* 运行按钮组 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={t('notebook.runCell')} arrow>
            <span>
              <IconButton
                size="small"
                onClick={() => handleRunCell(activeCellIndex)}
                disabled={readOnly || cells[activeCellIndex]?.cell_type !== 'code' || kernelStatus === 'connecting'}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  bgcolor: 'primary.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                  '&:disabled': { 
                    bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08),
                    color: isDarkMode ? alpha('#fff', 0.3) : alpha('#000', 0.3)
                  }
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
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06),
                  '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.12) : alpha('#000', 0.1) }
                }}
              >
                <PlaylistPlayIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={t('notebook.stopExecution')} arrow>
            <span>
              <IconButton
                size="small"
                disabled={kernelStatus !== 'busy'}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06),
                  '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.15) },
                  '&:disabled': { 
                    color: isDarkMode ? alpha('#fff', 0.2) : alpha('#000', 0.2)
                  }
                }}
              >
                <StopIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ mx: 1, height: 24, alignSelf: 'center' }} />

        {/* Kernel 状态 */}
        <Box
          onClick={kernelStatus === 'disconnected' ? handleConnectKernel : undefined}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.75,
            borderRadius: '8px',
            bgcolor: isDarkMode ? alpha('#fff', 0.05) : alpha('#000', 0.04),
            cursor: kernelStatus === 'disconnected' ? 'pointer' : 'default',
            transition: 'all 0.15s',
            '&:hover': kernelStatus === 'disconnected' ? {
              bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06)
            } : {}
          }}
        >
          <TerminalIcon sx={{ fontSize: 16, color: kernelConfig.color }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {kernelConfig.icon}
            <Typography 
              variant="caption" 
              sx={{ 
                fontWeight: 500,
                color: kernelConfig.color,
                fontSize: '12px'
              }}
            >
              {kernelConfig.label}
            </Typography>
          </Box>
        </Box>

        {kernelStatus !== 'disconnected' && (
          <Tooltip title={t('notebook.disconnectKernel')} arrow>
            <IconButton 
              size="small" 
              onClick={handleDisconnectKernel}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '6px',
                '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.06) }
              }}
            >
              <PowerOffIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}

        <Box sx={{ flex: 1 }} />

        {/* 清除输出 */}
        <Tooltip title={t('notebook.clearAllOutputs')} arrow>
          <span>
            <IconButton 
              size="small" 
              onClick={handleClearAllOutputs} 
              disabled={readOnly}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                '&:hover': { bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.06) }
              }}
            >
              <ClearIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        {/* 语言显示 */}
        <Chip
          label={language.charAt(0).toUpperCase() + language.slice(1)}
          size="small"
          sx={{
            height: 26,
            fontSize: '12px',
            fontWeight: 500,
            bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06),
            border: 'none',
            '& .MuiChip-label': { px: 1.5 }
          }}
        />
      </Box>

      {/* Cells */}
      <Box 
        sx={{ 
          flex: 1, 
          overflow: 'auto', 
          p: 2, 
          pb: 8,
          '&::-webkit-scrollbar': {
            width: 8
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: isDarkMode ? alpha('#fff', 0.2) : alpha('#000', 0.15),
            borderRadius: 4,
            '&:hover': {
              bgcolor: isDarkMode ? alpha('#fff', 0.3) : alpha('#000', 0.25)
            }
          }
        }}
      >
        {/* 顶部添加单元格按钮 */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 1,
            py: 1,
            mb: 1,
            opacity: 0.6,
            transition: 'opacity 0.15s',
            '&:hover': { opacity: 1 }
          }}
        >
          <Button
            size="small"
            variant="text"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => handleInsertAbove(0, 'code')}
            disabled={readOnly}
            sx={{ 
              fontSize: '12px',
              textTransform: 'none',
              color: 'text.secondary',
              px: 1.5,
              py: 0.5,
              borderRadius: '6px',
              '&:hover': {
                bgcolor: isDarkMode ? alpha('#fff', 0.08) : alpha('#000', 0.06),
                color: 'primary.main'
              }
            }}
          >
            {t('notebook.addCode')}
          </Button>
        </Box>

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
      </Box>
    </Box>
  );
};

export default NotebookEditor;
