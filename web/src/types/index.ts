// 文件类型（匹配后端 ObjectType）
export type FileType = 'directory' | 'notebook' | 'python' | 'sql' | 'markdown' | 'config' | 'file';

// API 响应码常量
export const API_CODE = {
  SUCCESS: 'SUCCESS',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
} as const;

// 文件/文件夹项（匹配后端 ObjectResponse）
export interface FileItem {
  id: number; // 后端使用 int64 (JuiceFS inode)
  name: string;
  type: FileType;
  path: string;
  full_path: string; // Databricks-style path: /Workspace/Users/{email}/...
  parent_id?: number | null;
  size: number;
  description?: string;
  current_version: number;
  creator?: UserResponse;
  tags?: TagResponse[];
  created_at: string;
  updated_at: string;
  children?: FileItem[]; // 前端用于树形结构
  content?: string; // 前端缓存的文件内容
}

// 用户信息（匹配后端 UserResponse）
export interface UserResponse {
  id: string; // UUID
  app_id?: string;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  created_at: string;
}

// 用户信息（前端使用）
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

// 标签页
export interface Tab {
  id: string;
  fileId: number; // 匹配后端的 int64 ID
  fileName: string;
  filePath: string;
  fileType: FileType; // 文件类型，用于 URL 导航
  isDirty: boolean; // 未保存状态
  content?: string;
}

// 搜索建议（匹配后端 ObjectResponse）
export interface SearchSuggestion {
  id: number;
  name: string;
  type: FileType;
  path: string;
  full_path: string;
}

// 最近访问项（前端本地存储）
export interface RecentItem {
  id: string;
  fileId: number;
  fileName: string;
  filePath: string;
  type: FileType;
  lastAccessed: string;
}

// API 响应类型（匹配后端 Response）
export interface ApiResponse<T = any> {
  code: string;
  message: string;
  data?: T;
  requestId: string;
}

// 错误详情
export interface ErrorDetail {
  reason: string;
  metadata?: Record<string, string>;
}

// API 错误响应类型（匹配后端 ErrorResponse）
export interface ApiErrorResponse {
  code: string;
  httpCode: number;
  message: string;
  details?: ErrorDetail[];
  requestId: string;
}

// 分页响应（匹配后端 PaginatedData）
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

// 认证相关类型
export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  app_id: string;
  username: string;
  email: string;
  password: string;
  display_name?: string;
}

export interface AuthOutput {
  user: UserResponse;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// 标签响应
export interface TagResponse {
  id: number;
  name: string;
  color?: string;
  created_at: string;
}

// 导航模块类型
export type NavModule =
  | 'workspace'
  | 'recents'
  | 'search'
  | 'compute'
  | 'jobs'
  | 'pipelines'
  | 'sql'
  | 'dashboards'
  | 'experiments';
